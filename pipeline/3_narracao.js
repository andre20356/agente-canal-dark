const fs = require('fs');
const path = require('path');
const config = require('../config/config');

// Prepara o texto do roteiro para narração TTS
function prepararTextoNarracao(textoRoteiro) {
  return textoRoteiro
    .replace(/##.*\n/g, '')                      // remove headers
    .replace(/\[MÚSICA INTENSA\]/gi, '...')
    .replace(/\[MÚSICA SUAVE\]/gi, '...')
    .replace(/\[PAUSA\]/gi, '... ...')
    .replace(/\*\*(.*?)\*\*/g, '$1')             // remove markdown bold
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Salva texto de narração em arquivo .txt
function salvarTexto(textoPreparado, dirOutput, nomeBase) {
  const arq = path.join(dirOutput, `${nomeBase}_narracao.txt`);
  fs.writeFileSync(arq, textoPreparado, 'utf-8');
  return arq;
}

// Gera áudio via ElevenLabs (opcional — só se a chave estiver configurada)
async function gerarAudioElevenLabs(texto, dirOutput, nomeBase) {
  if (!config.apis.elevenlabs) return null;

  try {
    const fetch = require('node-fetch');
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${config.elevenlabs.voiceId}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': config.apis.elevenlabs, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: texto.slice(0, 4900),
          model_id: config.elevenlabs.model,
          voice_settings: {
            stability: config.elevenlabs.stability,
            similarity_boost: config.elevenlabs.similarityBoost,
            style: config.elevenlabs.style,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!res.ok) {
      console.warn(`[Narração] ElevenLabs erro ${res.status}`);
      return null;
    }

    const buffer = await res.buffer();
    const arq = path.join(dirOutput, `${nomeBase}_narracao.mp3`);
    fs.writeFileSync(arq, buffer);
    console.log(`[Narração] Áudio gerado: ${arq}`);
    return arq;
  } catch (e) {
    console.warn(`[Narração] Falha ElevenLabs: ${e.message}`);
    return null;
  }
}

async function processarNarracao(textoRoteiro, dirOutput, nomeBase) {
  const textoPreparado = prepararTextoNarracao(textoRoteiro);
  const arquivoTxt = salvarTexto(textoPreparado, dirOutput, nomeBase);

  const totalPalavras = textoPreparado.split(/\s+/).length;
  const duracaoEstimadaMin = Math.round(totalPalavras / 130);

  let arquivoAudio = null;
  if (config.apis.elevenlabs) {
    arquivoAudio = await gerarAudioElevenLabs(textoPreparado, dirOutput, nomeBase);
  }

  return {
    arquivo_texto: arquivoTxt,
    arquivo_audio: arquivoAudio,
    total_palavras: totalPalavras,
    duracao_estimada_min: duracaoEstimadaMin,
    tts_gerado: !!arquivoAudio,
    instrucao: arquivoAudio
      ? 'Áudio gerado automaticamente pelo ElevenLabs.'
      : `Texto salvo em ${arquivoTxt}. Use o ElevenLabs, Murf.ai ou qualquer TTS para gerar o áudio.`,
  };
}

module.exports = { processarNarracao, prepararTextoNarracao };
