const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/config');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: config.apis.anthropic });

async function criarThumbnail(ideia, seo, storyboard) {
  logger.info(`[Agente 8] Criando conceito de thumbnail para: ${ideia.tema}`);

  const prompt = `Você é um especialista em thumbnails virais para YouTube, especializado no nicho dark/mistérios.

TEMA: ${ideia.tema}
TÍTULO DO VÍDEO: ${seo.titulo_recomendado}
TEXTO THUMBNAIL SUGERIDO: ${seo.thumbnail_texto}
PALETA DE CORES DO VÍDEO: ${JSON.stringify(storyboard?.paleta_cores || ['#1a1a2e', '#16213e', '#0f3460'])}

Princípios de thumbnail dark/mistérios que funcionam:
- Contraste extremo (texto claro em fundo escuro)
- Rosto humano com expressão de choque/medo gera +35% CTR
- Elemento misterioso/perturbador no centro
- Texto em no máximo 4 palavras, tamanho gigante
- Cores: vermelho+preto, azul escuro+branco, roxo+amarelo
- Seta ou círculo destacando o elemento principal

Responda APENAS com JSON válido:
{
  "conceitos": [
    {
      "conceito": "A — nome do conceito",
      "descricao": "descrição detalhada em português",
      "texto_thumbnail": "texto exato que aparece na thumbnail",
      "posicao_texto": "topo|centro|base|esquerda|direita",
      "cor_texto": "#ffffff",
      "cor_fundo_texto": "#cc0000",
      "elemento_principal": "o que deve estar no centro da thumbnail",
      "emocao_explorada": "curiosidade|medo|choque|intriga|urgencia",
      "estimativa_ctr": "baixo|medio|alto|muito_alto",
      "prompt_imagem": "ultra detailed cinematic thumbnail, dark atmosphere, [describe main element], dramatic lighting, [colors], high contrast, professional photography, 16:9 ratio, YouTube thumbnail style",
      "prompt_negativo": "blurry, low quality, text, watermark, signature"
    }
  ],
  "conceito_recomendado": "A",
  "variacao_split_test": {
    "variacao_b_diferenca": "o que muda na variação B para split test",
    "prompt_variacao_b": "prompt alternativo para teste"
  },
  "checklist_qualidade": {
    "legivel_em_miniatura": true,
    "contraste_adequado": true,
    "elemento_focal_claro": true,
    "texto_curto": true,
    "emocao_imediata": true
  }
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }],
  });

  const texto = response.content[0].text;
  const jsonMatch = texto.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Agente 8: resposta sem JSON válido');

  const resultado = JSON.parse(jsonMatch[0]);

  // Gera imagem se OpenAI configurado
  if (config.apis.openai) {
    await gerarImagemThumbnail(resultado, ideia);
  }

  const nomeArquivo = `thumbnail_${Date.now()}_${ideia.tema.replace(/[^a-z0-9]/gi, '_').slice(0, 30)}.json`;
  fs.writeFileSync(path.join(__dirname, '../output/thumbnails', nomeArquivo), JSON.stringify(resultado, null, 2));

  logger.info(`[Agente 8] Thumbnail criada: ${resultado.conceitos.length} conceitos`);
  return resultado;
}

async function gerarImagemThumbnail(resultado, ideia) {
  try {
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: config.apis.openai });
    const conceitoRecomendado = resultado.conceitos.find(c => c.conceito.startsWith(resultado.conceito_recomendado));
    if (!conceitoRecomendado) return;

    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: conceitoRecomendado.prompt_imagem,
      size: '1792x1024',
      quality: 'hd',
      n: 1,
    });

    const imageUrl = response.data[0].url;
    const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
    const imgResponse = await fetch(imageUrl);
    const buffer = await imgResponse.buffer();
    const nomeImg = `thumbnail_${Date.now()}_${ideia.tema.replace(/[^a-z0-9]/gi, '_').slice(0, 20)}.png`;
    fs.writeFileSync(path.join(__dirname, '../output/thumbnails', nomeImg), buffer);
    logger.info(`[Agente 8] Imagem gerada: ${nomeImg}`);
  } catch (e) {
    logger.warn(`[Agente 8] Falha ao gerar imagem: ${e.message}`);
  }
}

module.exports = { criarThumbnail };
