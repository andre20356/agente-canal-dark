// Canal de Cortes — detecção de momentos cortáveis via Gemini.
// Sobe o ÁUDIO do episódio (não o vídeo, mais leve) pela File API do Gemini
// e pede pra ele mesmo transcrever + apontar os melhores trechos pra corte,
// com timestamp em segundos — um único passo, sem precisar de Whisper
// separado. Modelos de áudio do Gemini aguentam episódios de várias horas
// numa chamada só, então não precisa fatiar o áudio em pedaços.
const fs   = require('fs');
const path = require('path');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const { GoogleAIFileManager, FileState } = require('@google/generative-ai/server');
const config = require('../config/config');

// Mesma lista de fallback usada no roteirista — gemini-1.5-* descontinuados.
const MODELOS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'];

const SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    candidatos: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          inicio_seg:      { type: SchemaType.NUMBER, description: 'Timestamp de início do trecho, em segundos' },
          fim_seg:         { type: SchemaType.NUMBER, description: 'Timestamp de fim do trecho, em segundos' },
          motivo:          { type: SchemaType.STRING, description: 'Por que esse trecho tem potencial de corte (polêmica, piada, virada emocional, dado surpreendente, etc)' },
          titulo_sugerido: { type: SchemaType.STRING, description: 'Título curto e chamativo pro corte' },
          score:           { type: SchemaType.NUMBER, description: 'Nota de 0 a 100 de potencial viral' },
        },
        required: ['inicio_seg', 'fim_seg', 'motivo', 'titulo_sugerido', 'score'],
      },
    },
  },
  required: ['candidatos'],
};

const PROMPT = `Você é um editor especialista em cortes virais de podcast pra redes sociais (TikTok, Reels, YouTube Shorts).

Ouça este episódio de podcast completo e identifique os melhores trechos pra virar cortes/shorts independentes.

Critérios de um bom corte:
- Faz sentido sozinho, sem precisar do contexto do resto do episódio
- Tem gancho nos primeiros 3 segundos (frase de impacto, pergunta polêmica, revelação)
- Duração entre 30 segundos e 4 minutos
- Prioriza: polêmica/opinião forte, piada/momento engraçado, virada emocional, dado ou história surpreendente, conselho prático memorável

Retorne entre 5 e 15 candidatos, cada um com timestamp exato de início e fim em segundos, ordenados por score decrescente.`;

async function uploadEAguardar(fileManager, audioPath, mimeType) {
  const upload = await fileManager.uploadFile(audioPath, { mimeType, displayName: path.basename(audioPath) });
  let file = upload.file;

  const inicio = Date.now();
  while (file.state === FileState.PROCESSING) {
    if (Date.now() - inicio > 5 * 60 * 1000) throw new Error('Timeout esperando o Gemini processar o áudio (5min)');
    await new Promise(r => setTimeout(r, 3000));
    file = await fileManager.getFile(file.name);
  }
  if (file.state === FileState.FAILED) {
    throw new Error(`Gemini falhou ao processar o áudio: ${file.error?.message || 'motivo desconhecido'}`);
  }
  return file;
}

async function detectarCortes(audioPath, dirOutput) {
  if (!config.apis.gemini) throw new Error('GEMINI_API_KEY não configurada no .env');

  const candidatosPath = path.join(dirOutput, 'candidatos.json');
  if (fs.existsSync(candidatosPath)) {
    return JSON.parse(fs.readFileSync(candidatosPath, 'utf8'));
  }

  const fileManager = new GoogleAIFileManager(config.apis.gemini);
  console.log('  ⬆️  Enviando áudio pro Gemini...');
  const arquivo = await uploadEAguardar(fileManager, audioPath, 'audio/mp4');
  console.log('  ✓ Áudio processado, analisando...');

  const genAI = new GoogleGenerativeAI(config.apis.gemini);
  let ultimoErro;

  for (const nomeModelo of MODELOS) {
    try {
      console.log(`  🤖 Gemini (${nomeModelo}) detectando cortes...`);
      const model = genAI.getGenerativeModel({
        model: nomeModelo,
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA },
      });
      const result = await model.generateContent([
        { fileData: { mimeType: arquivo.mimeType, fileUri: arquivo.uri } },
        { text: PROMPT },
      ]);

      const parsed = JSON.parse(result.response.text());
      const candidatos = (parsed.candidatos || []).filter(c => c.fim_seg > c.inicio_seg);
      if (!candidatos.length) throw new Error('Gemini não retornou nenhum candidato válido');

      candidatos.sort((a, b) => b.score - a.score);
      fs.writeFileSync(candidatosPath, JSON.stringify(candidatos, null, 2));
      console.log(`  ✓ ${candidatos.length} candidato(s) de corte encontrados`);
      return candidatos;
    } catch (e) {
      ultimoErro = e;
      const transitorio = e.message.includes('503') || e.message.includes('overloaded') ||
        e.message.includes('high demand') || e.message.includes('quota') ||
        e.message.includes('404') || e.message.includes('Not Found');
      if (transitorio) {
        console.log(`  ⚠ ${nomeModelo} indisponível, tentando próximo modelo...`);
        continue;
      }
      throw e;
    }
  }

  throw new Error(`Todos os modelos Gemini falharam na detecção de cortes: ${ultimoErro?.message}`);
}

module.exports = { detectarCortes };
