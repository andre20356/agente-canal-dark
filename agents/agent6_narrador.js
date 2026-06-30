const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/config');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: config.apis.anthropic });

async function prepararNarracao(ideia, roteiro) {
  logger.info(`[Agente 6] Preparando narração para: ${ideia.tema}`);

  const textoCompleto = roteiro.secoes.map(s => s.texto).join('\n\n');

  const prompt = `Você é um especialista em preparação de texto para síntese de voz (TTS) para vídeos dark/mistérios.

TEMA: ${ideia.tema}
TOM: ${config.canal.tomVoz}

TEXTO ORIGINAL DO ROTEIRO:
${textoCompleto}

Sua tarefa: otimizar este texto para narração por IA (ElevenLabs), garantindo:
1. Pausas dramáticas nos momentos certos (use ... para pausa curta, ... ... para pausa média, [pausa] para pausa longa)
2. Ênfase em palavras-chave (use MAIÚSCULAS para palavras que devem ser enfatizadas)
3. Ritmo variado (frases curtas para tensão, frases médias para desenvolvimento)
4. Remover marcações de produção ([MÚSICA INTENSIFICA], etc.) — apenas texto falado
5. Adicionar marcações de entonação onde necessário

Responda APENAS com JSON válido:
{
  "texto_narrado_completo": "texto completo pronto para TTS, com todas as marcações",
  "secoes_narracao": [
    {
      "secao": "nome da seção",
      "texto": "texto desta seção pronto para TTS",
      "duracao_estimada_segundos": 0,
      "ritmo": "lento|normal|acelerado",
      "entonacao_dominante": "suspense|revelacao|urgencia|calmo|intrigante"
    }
  ],
  "total_caracteres": 0,
  "duracao_total_estimada_minutos": 0,
  "configuracoes_tts_recomendadas": {
    "stability": 0.45,
    "similarity_boost": 0.75,
    "style": 0.5,
    "speaking_rate": 1.0
  }
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 6000,
    messages: [{ role: 'user', content: prompt }],
  });

  const texto = response.content[0].text;
  const jsonMatch = texto.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Agente 6: resposta sem JSON válido');

  const resultado = JSON.parse(jsonMatch[0]);

  // Salva texto de narração
  const nomeBase = `narracao_${Date.now()}_${ideia.tema.replace(/[^a-z0-9]/gi, '_').slice(0, 30)}`;
  fs.writeFileSync(
    path.join(__dirname, '../output/narracoes', `${nomeBase}.json`),
    JSON.stringify(resultado, null, 2)
  );
  fs.writeFileSync(
    path.join(__dirname, '../output/narracoes', `${nomeBase}.txt`),
    resultado.texto_narrado_completo
  );

  // Gera áudio se ElevenLabs configurado
  if (config.apis.elevenlabs) {
    await gerarAudio(resultado.texto_narrado_completo, nomeBase, resultado.configuracoes_tts_recomendadas);
  }

  logger.info(`[Agente 6] Narração preparada: ~${resultado.duracao_total_estimada_minutos}min`);
  return resultado;
}

async function gerarAudio(texto, nomeBase, configTTS) {
  try {
    const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${config.elevenlabs.voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': config.apis.elevenlabs,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: texto.slice(0, 5000), // limite de segurança
          model_id: config.elevenlabs.model,
          voice_settings: {
            stability: configTTS.stability || config.elevenlabs.stability,
            similarity_boost: configTTS.similarity_boost || config.elevenlabs.similarityBoost,
            style: configTTS.style || config.elevenlabs.style,
            use_speaker_boost: config.elevenlabs.speakerBoost,
          },
        }),
      }
    );

    if (response.ok) {
      const buffer = await response.buffer();
      const audioPath = path.join(__dirname, '../output/narracoes', `${nomeBase}.mp3`);
      fs.writeFileSync(audioPath, buffer);
      logger.info(`[Agente 6] Áudio gerado: ${audioPath}`);
    } else {
      logger.warn(`[Agente 6] ElevenLabs erro: ${response.status}`);
    }
  } catch (e) {
    logger.warn(`[Agente 6] Falha ao gerar áudio: ${e.message}`);
  }
}

module.exports = { prepararNarracao };
