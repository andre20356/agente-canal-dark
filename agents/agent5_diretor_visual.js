const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/config');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: config.apis.anthropic });

async function criarStoryboard(ideia, roteiro) {
  logger.info(`[Agente 5] Criando storyboard para: ${ideia.tema}`);

  const secoes = roteiro.secoes.map(s => `${s.nome} (${s.inicio}-${s.fim}): ${s.texto.slice(0, 200)}...`).join('\n');

  const prompt = `Você é um diretor visual cinematográfico especializado em conteúdo dark/mistérios para YouTube.

TEMA: ${ideia.tema}
TOM VISUAL: sombrio, atmosférico, cinematográfico, paleta de cores frias (azul escuro, roxo, cinza, preto)

ROTEIRO (resumo por seção):
${secoes}

Para cada seção do roteiro, crie direção visual detalhada. Os prompts devem ser em INGLÊS (para usar com DALL-E/Stable Diffusion).

Responda APENAS com JSON válido:
{
  "paleta_cores": ["#cor1", "#cor2", "#cor3"],
  "estilo_visual": "descrição do estilo visual geral",
  "cenas": [
    {
      "secao": "nome da seção",
      "cena_numero": 1,
      "duracao_segundos": 0,
      "descricao_pt": "descrição da cena em português",
      "tipo_visual": "imagem_estatica|video_stock|animacao|transicao",
      "prompt_imagem": "detailed cinematic prompt in English for image generation, dark atmosphere, --ar 16:9",
      "prompt_video": "motion description for video: slow zoom in/out, pan left/right, fade, etc.",
      "elementos_texto_tela": "texto que aparece na tela durante essa cena, se houver",
      "efeito_sonoro": "descrição do efeito sonoro sugerido",
      "transicao_saida": "como transicionar para a próxima cena"
    }
  ],
  "vinheta_abertura": {
    "duracao_segundos": 5,
    "descricao": "descrição da vinheta de abertura do canal",
    "prompt_imagem": "prompt in English for channel intro visual"
  },
  "notas_edicao": ["nota1", "nota2"]
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 5000,
    messages: [{ role: 'user', content: prompt }],
  });

  const texto = response.content[0].text;
  const jsonMatch = texto.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Agente 5: resposta sem JSON válido');

  const resultado = JSON.parse(jsonMatch[0]);

  const nomeArquivo = `storyboard_${Date.now()}_${ideia.tema.replace(/[^a-z0-9]/gi, '_').slice(0, 30)}.json`;
  fs.writeFileSync(path.join(__dirname, '../output/storyboards', nomeArquivo), JSON.stringify(resultado, null, 2));

  logger.info(`[Agente 5] Storyboard criado: ${resultado.cenas.length} cenas`);
  return resultado;
}

module.exports = { criarStoryboard };
