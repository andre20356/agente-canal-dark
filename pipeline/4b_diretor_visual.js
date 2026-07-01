/**
 * Pipeline 4b — Diretor Visual
 * Sincroniza os prompts de imagem com o que está sendo narrado em cada
 * trecho do áudio, usando o timing real do SRT gerado pelo Edge TTS —
 * em vez do ciclo fixo de variações de câmera genéricas (desconectado
 * do conteúdo) usado anteriormente em 7_video.js.
 */
const fs   = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config/config');

const MODELOS = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
const SEGUNDOS_POR_CENA = 14;

// ── Parser de SRT ──────────────────────────────────────────────────────────────

function parseSrtTime(t) {
  const [h, m, sMs] = t.split(':');
  const [s, ms] = sMs.split(',');
  return (+h) * 3600 + (+m) * 60 + (+s) + (+ms) / 1000;
}

function parseSrt(conteudo) {
  const blocos = conteudo.trim().split(/\n\n+/);
  const cues = [];
  for (const bloco of blocos) {
    const linhas = bloco.split('\n');
    const timeLine = linhas.find(l => l.includes(' --> '));
    if (!timeLine) continue;
    const [ini, fim] = timeLine.split(' --> ').map(s => s.trim());
    const texto = linhas.slice(linhas.indexOf(timeLine) + 1).join(' ').trim();
    if (texto) cues.push({ start: parseSrtTime(ini), end: parseSrtTime(fim), texto });
  }
  return cues;
}

// Agrupa as legendas (timing real da fala) em janelas de ~SEGUNDOS_POR_CENA
function agruparEmCenas(cues, duracaoTotal) {
  if (!cues.length) return [];
  const cenas = [];
  let inicioJanela = 0;
  let textoAcumulado = [];

  for (const cue of cues) {
    textoAcumulado.push(cue.texto);
    if (cue.end - inicioJanela >= SEGUNDOS_POR_CENA) {
      cenas.push({ start: inicioJanela, end: cue.end, texto: textoAcumulado.join(' ') });
      inicioJanela = cue.end;
      textoAcumulado = [];
    }
  }
  if (textoAcumulado.length) {
    cenas.push({ start: inicioJanela, end: duracaoTotal, texto: textoAcumulado.join(' ') });
  }
  return cenas;
}

// ── Gemini — um prompt de imagem específico por cena ───────────────────────────

function extrairJson(texto) {
  const semFence = texto.replace(/```json|```/g, '').trim();
  const inicio = semFence.indexOf('[');
  const fim    = semFence.lastIndexOf(']');
  if (inicio === -1 || fim === -1) throw new Error('JSON não encontrado na resposta do Gemini');
  return JSON.parse(semFence.slice(inicio, fim + 1));
}

async function gerarPromptsComGemini(tema, cenas) {
  if (!config.apis.gemini) throw new Error('GEMINI_API_KEY não configurada');
  const genAI = new GoogleGenerativeAI(config.apis.gemini);

  const listaTrechos = cenas.map((c, i) => `${i + 1}. "${c.texto}"`).join('\n');

  const prompt = `Você é um diretor de fotografia de vídeos dark/mistérios para YouTube.

Tema geral do vídeo: "${tema}"

Abaixo estão ${cenas.length} trechos narrados, em ordem, cada um durando poucos segundos.
Para CADA trecho, gere duas coisas em INGLÊS que mostrem visualmente o que está sendo
narrado NAQUELE trecho específico — não o tema geral, o conteúdo exato dele:

1. "prompt": um prompt de geração de imagem por IA (detalhado, estilo cinematográfico)
2. "stock_query": um termo de busca curto (2 a 4 palavras) para encontrar um VÍDEO de
   banco de imagens (Pexels/Pixabay) que combine com a cena — termos genéricos e visuais
   que existem de verdade em bancos de vídeo (ex: "dark abandoned corridor", "old newspaper
   archive", "rainy city street night"), não termos abstratos ou muito específicos do caso
   (evite nomes próprios, datas, jargão técnico)

REGRAS:
- Cada item deve ser específico ao trecho, não genérico
- Estilo obrigatório no "prompt": dark cinematic atmosphere, dramatic lighting, photorealistic, no text, no watermark
- Não repita a mesma composição em trechos seguidos
- Responda APENAS com um array JSON de objetos {"prompt": "...", "stock_query": "..."},
  na mesma ordem e quantidade dos trechos, nada mais

TRECHOS:
${listaTrechos}

Responda agora com o array JSON de ${cenas.length} objetos:`;

  let ultimoErro;
  for (const nomeModelo of MODELOS) {
    try {
      const model  = genAI.getGenerativeModel({ model: nomeModelo });
      const result = await model.generateContent(prompt);
      const itens  = extrairJson(result.response.text());
      if (!Array.isArray(itens) || itens.length !== cenas.length) {
        throw new Error(`Esperado ${cenas.length} itens, recebido ${Array.isArray(itens) ? itens.length : typeof itens}`);
      }
      if (itens.some(it => !it || typeof it.prompt !== 'string' || typeof it.stock_query !== 'string')) {
        throw new Error('Itens retornados sem "prompt"/"stock_query" válidos');
      }
      return itens;
    } catch (e) {
      ultimoErro = e;
      const transitorio = /503|overloaded|high demand|quota/i.test(e.message);
      if (transitorio) { console.log(`  [Diretor Visual] ${nomeModelo} indisponível, tentando próximo modelo...`); continue; }
      throw e;
    }
  }
  throw new Error(`todos os modelos Gemini falharam: ${ultimoErro?.message}`);
}

// ── Principal ──────────────────────────────────────────────────────────────────

async function gerarPlanoVisual(tema, dirOutput, nomeBase) {
  const srtPath = path.join(dirOutput, `${nomeBase}_narracao.srt`);
  if (!fs.existsSync(srtPath)) {
    console.log('  [Diretor Visual] SRT não encontrado — vídeo usará modo genérico');
    return null;
  }

  const cues = parseSrt(fs.readFileSync(srtPath, 'utf-8'));
  if (!cues.length) {
    console.log('  [Diretor Visual] SRT vazio — vídeo usará modo genérico');
    return null;
  }

  const duracaoTotal = cues[cues.length - 1].end;
  const cenas = agruparEmCenas(cues, duracaoTotal);
  if (!cenas.length) return null;

  console.log(`  [Diretor Visual] ${cenas.length} cenas sincronizadas com a narração — gerando prompts com Gemini...`);

  try {
    const itens = await gerarPromptsComGemini(tema, cenas);
    const plano = cenas.map((c, i) => ({
      start: c.start, end: c.end, texto: c.texto,
      prompt: itens[i].prompt, stock_query: itens[i].stock_query,
    }));
    fs.writeFileSync(path.join(dirOutput, `${nomeBase}_plano_visual.json`), JSON.stringify(plano, null, 2), 'utf-8');
    console.log('  [Diretor Visual] ✓ Prompts sincronizados gerados');
    return plano;
  } catch (e) {
    console.warn(`  [Diretor Visual] Falhou (${e.message}) — vídeo usará modo genérico`);
    return null;
  }
}

module.exports = { gerarPlanoVisual, parseSrt, agruparEmCenas };
