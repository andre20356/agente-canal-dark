const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const config = require('../config/config');

const VOICE_EDGE = 'pt-BR-ThalitaMultilingualNeural';

// ── Limpeza do texto para TTS ─────────────────────────────────────────────────

function prepararTextoNarracao(texto) {
  return texto
    // Remove linhas de cabeçalho markdown: ## Título, # Algo
    .replace(/^#{1,6}.*$/gm, '')
    // Remove linhas de metadados: **Título:**, **Duração Alvo:** etc
    .replace(/^\*\*[^*]+:\*\*.*$/gm, '')
    // Remove separadores --- e ===
    .replace(/^[-=]{2,}$/gm, '')
    // Remove labels de personagem: VOZ:, VOZ (...):, NARRADOR:, etc.
    .replace(/^[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ\s]+(\([^)]*\))?\s*:\s*$/gm, '')
    // Remove direções de cena entre colchetes: [MÚSICA INTENSA, ...]
    .replace(/\[([^\]]*)\]/g, '')
    // Remove direções de cena entre parênteses no início de linha ou linha inteira
    .replace(/^\s*\([^)]{5,}\)\s*$/gm, '')
    // Remove parênteses inline que são direções de cena (contêm verbos de ação)
    .replace(/\((?:som|cena|corte|fade|tela|câmera|música|imagem|voz|início|fim|pausa|fundo|ambiente)[^)]*\)/gi, '')
    // Remove marcação bold/italic
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    // Remove linhas que são puramente direções (ex: "Início do vídeo: ...")
    .replace(/^(início|fim|cena|som|corte|fade|tela|câmera|música|imagem|fundo|ambiente)[^.\n]*[.:][^\n]*$/gim, '')
    // Remove linhas em branco em excesso
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── VTT → SRT ───────────────────────────────────────────────────────────────
// O Edge TTS entrega uma unidade de timing por FRASE (não por palavra, apesar
// do nome "WordBoundary") — agrupar um número fixo delas (ex: 8) vira blocos
// de texto enormes parados na tela por 20s+ enquanto a fala já avançou muito
// além. Em vez disso, agrupamos por DURAÇÃO máxima de leitura confortável.

function vttTempoParaSegundos(t) {
  const [h, m, sMs] = t.split(':');
  const [s, ms] = sMs.split(/[.,]/);
  return (+h) * 3600 + (+m) * 60 + (+s) + (+ms) / 1000;
}

const MAX_SEGUNDOS_POR_LEGENDA = 6;

function vttParaSrt(vttContent) {
  const entries = [];
  const blocos  = vttContent.split('\n\n');

  for (const bloco of blocos) {
    const linhas = bloco.trim().split('\n');
    const timeLine = linhas.find(l => l.includes(' --> '));
    if (!timeLine) continue;
    const [start, end] = timeLine.split(' --> ');
    const texto = linhas[linhas.length - 1].trim();
    if (texto && texto !== 'WEBVTT') {
      entries.push({ start: start.trim(), end: end.trim(), texto });
    }
  }

  // Agrupa frases consecutivas até atingir ~6s de duração acumulada
  const chunks = [];
  let grupo       = [];
  let inicioGrupo = null;

  for (const e of entries) {
    if (!grupo.length) inicioGrupo = e.start;
    grupo.push(e);
    const duracaoAcumulada = vttTempoParaSegundos(e.end) - vttTempoParaSegundos(inicioGrupo);
    if (duracaoAcumulada >= MAX_SEGUNDOS_POR_LEGENDA) {
      chunks.push({ start: inicioGrupo, end: e.end, texto: grupo.map(g => g.texto).join(' ') });
      grupo = [];
    }
  }
  if (grupo.length) {
    chunks.push({ start: inicioGrupo, end: grupo[grupo.length - 1].end, texto: grupo.map(g => g.texto).join(' ') });
  }

  // Gera SRT
  return chunks.map((c, i) => {
    const s = c.start.replace('.', ',');
    const e = c.end.replace('.', ',');
    return `${i + 1}\n${s} --> ${e}\n${c.texto}`;
  }).join('\n\n') + '\n';
}

// ── Edge TTS (gratuito, sem API key) ─────────────────────────────────────────

async function gerarAudioEdgeTTS(texto, dirOutput, nomeBase) {
  const txtPath = path.join(dirOutput, `${nomeBase}_narracao_input.txt`);
  const mp3Path = path.join(dirOutput, `${nomeBase}_narracao.mp3`);
  const vttPath = path.join(dirOutput, `${nomeBase}_narracao.vtt`);
  const srtPath = path.join(dirOutput, `${nomeBase}_narracao.srt`);

  fs.writeFileSync(txtPath, texto, 'utf-8');

  try {
    // Rate mais lento (-12%) tira o ar apressado/mecânico do TTS padrão e
    // aproxima de um tom de narrador contando uma história, não lendo um
    // texto correndo. Pitch levemente mais grave (-3Hz) dá mais gravidade.
    execSync(
      `edge-tts --file "${txtPath}" --voice ${VOICE_EDGE} ` +
      `--rate=-12% --pitch=-3Hz ` +
      `--write-media "${mp3Path}" --write-subtitles "${vttPath}"`,
      { timeout: 120000 }
    );

    // Gera SRT a partir do VTT
    if (fs.existsSync(vttPath)) {
      const vttContent = fs.readFileSync(vttPath, 'utf-8');
      fs.writeFileSync(srtPath, vttParaSrt(vttContent), 'utf-8');
    }

    return { mp3: mp3Path, srt: fs.existsSync(srtPath) ? srtPath : null };
  } catch (e) {
    console.warn(`[Narração] Edge TTS falhou: ${e.message}`);
    return null;
  }
}

// ── ElevenLabs (opcional, se tiver chave) ─────────────────────────────────────

async function gerarAudioElevenLabs(texto, dirOutput, nomeBase) {
  if (!config.apis.elevenlabs) return null;
  try {
    const fetch  = require('node-fetch');
    const res    = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${config.elevenlabs.voiceId}`,
      {
        method:  'POST',
        headers: { 'xi-api-key': config.apis.elevenlabs, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          text: texto.slice(0, 4900),
          model_id: config.elevenlabs.model,
          voice_settings: {
            stability:        config.elevenlabs.stability,
            similarity_boost: config.elevenlabs.similarityBoost,
            style:            config.elevenlabs.style,
            use_speaker_boost: true,
          },
        }),
      }
    );
    if (!res.ok) return null;
    const mp3Path = path.join(dirOutput, `${nomeBase}_narracao.mp3`);
    fs.writeFileSync(mp3Path, await res.buffer());
    return { mp3: mp3Path, srt: null };
  } catch { return null; }
}

// ── Principal ─────────────────────────────────────────────────────────────────

async function processarNarracao(textoRoteiro, dirOutput, nomeBase) {
  const texto   = prepararTextoNarracao(textoRoteiro);
  const txtPath = path.join(dirOutput, `${nomeBase}_narracao.txt`);
  fs.writeFileSync(txtPath, texto, 'utf-8');

  const totalPalavras      = texto.split(/\s+/).length;
  const duracaoEstimadaMin = Math.round(totalPalavras / 130);

  // 1. Edge TTS (gratuito, padrão)
  let audio = await gerarAudioEdgeTTS(texto, dirOutput, nomeBase);

  // 2. Fallback ElevenLabs (se Edge TTS falhar e a chave estiver configurada)
  if (!audio && config.apis.elevenlabs) {
    console.log('  [Narração] Edge TTS falhou, tentando ElevenLabs...');
    audio = await gerarAudioElevenLabs(texto, dirOutput, nomeBase);
  }

  return {
    arquivo_texto: txtPath,
    arquivo_audio: audio?.mp3 || null,
    arquivo_srt:   audio?.srt || null,
    total_palavras:       totalPalavras,
    duracao_estimada_min: duracaoEstimadaMin,
    tts_gerado:           !!audio?.mp3,
  };
}

module.exports = { processarNarracao, prepararTextoNarracao };
