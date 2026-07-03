const { GoogleGenerativeAI } = require('@google/generative-ai');
const { gerarPromptRoteiro } = require('../templates/prompts');
const config = require('../config/config');

// gemini-1.5-flash/pro foram descontinuados pelo Google (retornam 404) — lista
// atualizada 2026-07-03 com modelos confirmados via /v1beta/models?key=...
const MODELOS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'];

async function gerarRoteiro(tema, duracaoMin = 12) {
  if (!config.apis.gemini) {
    throw new Error('GEMINI_API_KEY não configurada no .env');
  }

  const genAI  = new GoogleGenerativeAI(config.apis.gemini);
  const prompt = gerarPromptRoteiro(tema, duracaoMin);
  let ultimoErro;

  for (const nomeModelo of MODELOS) {
    try {
      console.log(`  🤖 Gemini (${nomeModelo}) gerando roteiro para: "${tema}"...`);
      const model  = genAI.getGenerativeModel({ model: nomeModelo });
      const result = await model.generateContent(prompt);
      const roteiro = result.response.text();

      if (!roteiro || roteiro.length < 500) {
        throw new Error('Roteiro muito curto');
      }

      const palavras = roteiro.split(/\s+/).length;
      const duracaoEstimada = Math.round(palavras / 130);
      console.log(`  ✓ Roteiro gerado: ${palavras} palavras (~${duracaoEstimada}min)`);
      return roteiro;
    } catch (e) {
      ultimoErro = e;
      // "404 Not Found" também precisa cair pro próximo modelo: significa que
      // ESSE nome de modelo específico não existe mais (ex: gemini-1.5-flash
      // descontinuado), não que a API do Gemini como um todo está fora do ar —
      // continuar tentando os outros da lista é o comportamento certo.
      const transitorio = e.message.includes('503') || e.message.includes('overloaded') ||
        e.message.includes('high demand') || e.message.includes('quota') ||
        e.message.includes('404') || e.message.includes('Not Found');
      if (transitorio) {
        console.log(`  ⚠ ${nomeModelo} indisponível, tentando próximo modelo...`);
        continue;
      }
      throw e; // Erro não transitório — interrompe imediatamente
    }
  }

  throw new Error(`Todos os modelos Gemini falharam: ${ultimoErro?.message}`);
}

module.exports = { gerarRoteiro };
