const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/config');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: config.apis.anthropic });

async function otimizarSEO(ideia, roteiro, analise_concorrencia) {
  logger.info(`[Agente 7] Otimizando SEO para: ${ideia.tema}`);

  const prompt = `Você é um especialista em SEO para YouTube, especializado no nicho dark/mistérios Brasil.

TEMA: ${ideia.tema}
PALAVRAS-CHAVE BASE: ${ideia.palavras_chave.join(', ')}
CANAL: ${config.canal.nome}
CTR META: ${config.producao.ctrMeta}%
PADRÕES DE TÍTULOS EFICAZES: ${JSON.stringify(analise_concorrencia?.titulos_mais_eficazes || [])}

Regras para títulos dark/mistérios que funcionam:
- Gerar curiosidade imediata ("O que aconteceu com...", "Ninguém sabe por que...", "A verdade sobre...")
- Usar números quando possível ("7 segredos", "A história de 3 mortes")
- Criar urgência ou exclusividade ("Nunca revelado", "Proibido", "Descoberto")
- Máximo 60 caracteres para não cortar no YouTube
- Evitar clickbait exagerado (prejudica retenção)

Responda APENAS com JSON válido:
{
  "titulos": [
    {
      "titulo": "título completo",
      "caracteres": 0,
      "tecnica": "técnica de copywriting usada",
      "ctr_estimado": "baixo|medio|alto|muito_alto",
      "porque_funciona": "explicação"
    }
  ],
  "titulo_recomendado": "o melhor título da lista",
  "descricoes": [
    {
      "versao": 1,
      "texto": "descrição completa com keywords naturais, máximo 500 palavras",
      "keywords_incluidas": []
    }
  ],
  "descricao_recomendada": "versão 1 ou 2 ou 3...",
  "tags": ["tag1", "tag2"],
  "hashtags": ["#hashtag1", "#hashtag2"],
  "capitulos_sugeridos": [
    {
      "tempo": "0:00",
      "titulo_capitulo": "nome do capítulo"
    }
  ],
  "thumbnail_texto": "texto curto e impactante para thumbnail (máximo 4 palavras)",
  "cards_sugeridos": ["sugestão de card 1", "sugestão de card 2"],
  "categoria_youtube": "Entretenimento",
  "publico_restrito": false,
  "idioma": "pt-BR"
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const texto = response.content[0].text;
  const jsonMatch = texto.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Agente 7: resposta sem JSON válido');

  const resultado = JSON.parse(jsonMatch[0]);

  const nomeArquivo = `seo_${Date.now()}_${ideia.tema.replace(/[^a-z0-9]/gi, '_').slice(0, 30)}.json`;
  fs.writeFileSync(path.join(__dirname, '../output/seo', nomeArquivo), JSON.stringify(resultado, null, 2));

  logger.info(`[Agente 7] SEO gerado: ${resultado.titulos.length} títulos, ${resultado.tags.length} tags`);
  return resultado;
}

module.exports = { otimizarSEO };
