const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/config');
const logger = require('../utils/logger');

const client = new Anthropic({ apiKey: config.apis.anthropic });

async function criarEstrategia(ideia, analise_concorrencia) {
  logger.info(`[Agente 3] Criando estratégia para: ${ideia.tema}`);

  const prompt = `Você é um estrategista de conteúdo de elite especializado em vídeos dark/mistérios para YouTube Brasil.

TEMA: ${ideia.tema}
PÚBLICO: ${ideia.publico_alvo}
GANCHO SUGERIDO: ${ideia.gancho_sugerido}
ÂNGULO DIFERENCIADO: ${ideia.angulo_diferenciado}
ANÁLISE DE CONCORRÊNCIA: ${JSON.stringify(analise_concorrencia?.angulo_recomendado || '')}
META DE RETENÇÃO: ${config.producao.retencaoMeta}%
DURAÇÃO IDEAL: ${ideia.duracao_ideal_minutos || config.producao.duracaoMediaMinutos} minutos

Crie uma estratégia completa de conteúdo para maximizar retenção e engajamento.

Responda APENAS com JSON válido:
{
  "gancho_inicial": {
    "texto": "primeiras 15 segundos do vídeo — deve ser impactante e gerar curiosidade imediata",
    "tecnica_utilizada": "nome da técnica de gancho",
    "por_que_funciona": "explicação"
  },
  "estrutura_narrativa": [
    {
      "parte": "nome da parte",
      "duracao_segundos": 0,
      "objetivo": "o que essa parte deve fazer pelo espectador",
      "tecnica": "técnica narrativa usada",
      "ponto_retencao": "como mantém o espectador assistindo"
    }
  ],
  "curvas_curiosidade": [
    {
      "momento_minuto": 0,
      "tecnica": "técnica usada para manter curiosidade",
      "exemplo": "exemplo concreto de como aplicar"
    }
  ],
  "momentos_criticos": {
    "abandono_30s": "o que fazer nos primeiros 30s para não perder o espectador",
    "abandono_2min": "gancho para manter no minuto 2",
    "abandono_metade": "ponto de virada no meio do vídeo",
    "final_forte": "como terminar para gerar comentários e compartilhamentos"
  },
  "ctas": [
    {
      "momento": "quando usar",
      "texto": "texto da CTA",
      "objetivo": "inscrição|like|comentário|compartilhamento"
    }
  ],
  "palavras_proibidas": ["lista de palavras que prejudicam retenção nesse nicho"],
  "elementos_obrigatorios": ["elementos que DEVEM estar no vídeo"],
  "estimativa_retencao": 0
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });

  const texto = response.content[0].text;
  const jsonMatch = texto.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Agente 3: resposta sem JSON válido');

  const resultado = JSON.parse(jsonMatch[0]);
  logger.info(`[Agente 3] Estratégia criada — retenção estimada: ${resultado.estimativa_retencao}%`);
  return resultado;
}

module.exports = { criarEstrategia };
