const { GoogleGenerativeAI } = require('@google/generative-ai');
const { gerarPromptRoteiro } = require('../templates/prompts');
const config = require('../config/config');

async function gerarRoteiro(tema, duracaoMin = 12) {
  if (!config.apis.gemini) {
    throw new Error('GEMINI_API_KEY não configurada no .env');
  }

  const genAI = new GoogleGenerativeAI(config.apis.gemini);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = gerarPromptRoteiro(tema, duracaoMin);

  console.log(`  🤖 Gemini gerando roteiro para: "${tema}"...`);

  const result = await model.generateContent(prompt);
  const roteiro = result.response.text();

  if (!roteiro || roteiro.length < 500) {
    throw new Error('Roteiro gerado muito curto — tente novamente');
  }

  const palavras = roteiro.split(/\s+/).length;
  const duracaoEstimada = Math.round(palavras / 130);
  console.log(`  ✓ Roteiro gerado: ${palavras} palavras (~${duracaoEstimada}min)`);

  return roteiro;
}

module.exports = { gerarRoteiro };
