const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/config');
const logger = require('../utils/logger');

const client = new Anthropic({ apiKey: config.apis.anthropic });

async function avaliarQualidade(pacote) {
  const { ideia, estrategia, roteiro, seo, thumbnail, narracao } = pacote;
  logger.info(`[Agente 9] Avaliando qualidade: ${ideia.tema}`);

  const prompt = `Você é um analista de qualidade de conteúdo sênior especializado em YouTube dark/mistérios.

Avalie rigorosamente o pacote de conteúdo abaixo com nota de 0 a 100. A nota mínima para aprovação é ${config.producao.notaQualidadeMinima}.

TEMA: ${ideia.tema}
TÍTULO: ${seo?.titulo_recomendado}
GANCHO: ${estrategia?.gancho_inicial?.texto}
ESTIMATIVA RETENÇÃO: ${estrategia?.estimativa_retencao}%
DURAÇÃO ROTEIRO: ${roteiro?.duracao_estimada_minutos}min
TOTAL TÍTULOS SEO: ${seo?.titulos?.length}
THUMBNAIL TEXTO: ${thumbnail?.conceitos?.[0]?.texto_thumbnail}

PRIMEIROS 300 PALAVRAS DO ROTEIRO:
${roteiro?.secoes?.[0]?.texto?.slice(0, 300)}

Critérios de avaliação (peso de cada um):
- Clareza e compreensão (15 pts): o conteúdo é claro e fácil de entender?
- Engajamento (25 pts): o gancho é forte? a narrativa prende?
- SEO (20 pts): título, tags e descrição estão otimizados?
- Originalidade (20 pts): traz perspectiva única ou é mais do mesmo?
- Potencial de monetização (10 pts): segue diretrizes do AdSense?
- Retenção estimada (10 pts): a estrutura favorece alta retenção?

Responda APENAS com JSON válido:
{
  "nota_final": 0,
  "aprovado": false,
  "avaliacoes": {
    "clareza": { "nota": 0, "comentario": "", "melhorias": [] },
    "engajamento": { "nota": 0, "comentario": "", "melhorias": [] },
    "seo": { "nota": 0, "comentario": "", "melhorias": [] },
    "originalidade": { "nota": 0, "comentario": "", "melhorias": [] },
    "monetizacao": { "nota": 0, "comentario": "", "melhorias": [] },
    "retencao": { "nota": 0, "comentario": "", "melhorias": [] }
  },
  "pontos_fortes": ["ponto1", "ponto2"],
  "pontos_fracos": ["ponto1", "ponto2"],
  "instrucoes_correcao": "instruções detalhadas para melhorar se nota < ${config.producao.notaQualidadeMinima}",
  "agentes_para_refazer": [],
  "estimativa_performance": {
    "ctr_estimado_pct": 0,
    "retencao_estimada_pct": 0,
    "views_primeiras_24h": "baixo|medio|alto|viral"
  }
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const texto = response.content[0].text;
  const jsonMatch = texto.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Agente 9: resposta sem JSON válido');

  const resultado = JSON.parse(jsonMatch[0]);
  resultado.aprovado = resultado.nota_final >= config.producao.notaQualidadeMinima;

  logger.info(`[Agente 9] Nota: ${resultado.nota_final}/100 — ${resultado.aprovado ? 'APROVADO ✓' : 'REPROVADO ✗'}`);
  return resultado;
}

module.exports = { avaliarQualidade };
