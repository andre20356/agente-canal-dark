const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/config');
const logger = require('../utils/logger');

const client = new Anthropic({ apiKey: config.apis.anthropic });

const CANAIS_REFERENCIA = [
  'Choque de Cultura Dark', 'Canal do Bem', 'Mundo Sombrio', 'Dark File',
  'Arquivo Criminal', 'Mistérios do Mundo', 'True Crime Brasil',
];

async function analisarConcorrencia(tema) {
  logger.info(`[Agente 2] Analisando concorrência para: ${tema}`);

  const prompt = `Você é um analista especializado em estratégia de conteúdo para YouTube, focado no nicho dark/mistérios brasileiro.

Tema a analisar: "${tema}"
Canais de referência no nicho: ${CANAIS_REFERENCIA.join(', ')}

Analise profundamente como os canais concorrentes abordam esse tema e identifique oportunidades de diferenciação.

Responda APENAS com JSON válido:
{
  "canais_analisados": ["canal1", "canal2"],
  "padroes_detectados": [
    {
      "padrao": "descrição do padrão",
      "frequencia": "muito comum|comum|raro",
      "efetividade": "alta|media|baixa"
    }
  ],
  "titulos_mais_eficazes": [
    {
      "estrutura": "estrutura do título",
      "exemplo": "exemplo real ou hipotético",
      "porque_funciona": "explicação"
    }
  ],
  "thumbnails_padrao": {
    "elementos_comuns": [],
    "cores_dominantes": [],
    "texto_thumbnail": "padrão de texto usado"
  },
  "oportunidades": [
    {
      "oportunidade": "descrição",
      "porque": "justificativa",
      "dificuldade": "facil|medio|dificil"
    }
  ],
  "erros_dos_concorrentes": [
    {
      "erro": "descrição do erro",
      "impacto": "como isso prejudica o canal",
      "como_evitar": "estratégia para não cometer"
    }
  ],
  "angulo_recomendado": "o melhor ângulo para abordar esse tema e se diferenciar"
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }],
  });

  const texto = response.content[0].text;
  const jsonMatch = texto.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Agente 2: resposta sem JSON válido');

  const resultado = JSON.parse(jsonMatch[0]);
  logger.info(`[Agente 2] Análise concluída: ${resultado.oportunidades.length} oportunidades detectadas`);
  return resultado;
}

module.exports = { analisarConcorrencia };
