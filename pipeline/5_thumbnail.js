const fs = require('fs');
const path = require('path');

const CONCEITOS = [
  {
    nome: 'ROSTO + TEXTO',
    descricao: 'Rosto com expressão de choque/medo à esquerda, texto grande à direita',
    eficacia: 'muito_alta',
    elementos: 'face_expressiva, texto_grande, fundo_escuro',
  },
  {
    nome: 'LUGAR SOMBRIO',
    descricao: 'Local perturbador em destaque, texto sobreposto com sombra forte',
    eficacia: 'alta',
    elementos: 'lugar_assustador, iluminacao_dramatica, texto_sobreposto',
  },
  {
    nome: 'EVIDÊNCIA',
    descricao: 'Documento/foto/objeto misterioso em destaque com seta ou círculo vermelho',
    eficacia: 'alta',
    elementos: 'evidencia_destacada, seta_vermelha, fundo_escuro',
  },
];

function gerarConceitoThumbnail(tema, textoThumbnail, paletaCores) {
  const conceito = CONCEITOS[0]; // Rosto + texto tem maior CTR

  const cores = paletaCores || ['#0a0a1a', '#e63946'];
  const corFundo = cores[0];
  const corDestaque = cores[1];

  const promptDallE = `YouTube thumbnail, dark mystery theme, ${tema}, dramatic cinematic lighting, ` +
    `shocked terrified person face on left side, bold white text "${textoThumbnail}" on right side, ` +
    `dark background ${corFundo}, red accent ${corDestaque}, high contrast, ` +
    `professional design, 16:9 ratio, photorealistic, ultra detailed, --ar 16:9`;

  const promptBing = `Create a YouTube thumbnail for a dark mystery video about "${tema}". ` +
    `Style: cinematic, dark, dramatic lighting. Include: a shocked person's face on the left, ` +
    `bold text "${textoThumbnail}" on the right. Colors: dark blue/black background with red accents. ` +
    `High contrast, professional, no watermarks.`;

  return {
    conceito: conceito.nome,
    texto_thumbnail: textoThumbnail,
    cor_texto: '#FFFFFF',
    cor_fundo: corFundo,
    cor_destaque: corDestaque,
    emocao: 'choque + curiosidade',
    ctr_estimado: 'alto',
    prompt_dalle: promptDallE,
    prompt_bing: promptBing,
    checklist: {
      texto_curto: textoThumbnail.split(' ').length <= 4,
      contraste_alto: true,
      elemento_focal: 'rosto expressivo',
      legivel_miniatura: textoThumbnail.length <= 20,
    },
    instrucoes_manuais: [
      `1. Acesse bing.com/create (gratuito) ou DALL-E`,
      `2. Cole o prompt abaixo e gere a imagem`,
      `3. Baixe em alta resolução (1280x720 mínimo)`,
      `4. Adicione o texto "${textoThumbnail}" em fonte bold no Canva se necessário`,
      `5. Salve como JPG, máximo 2MB para upload no YouTube`,
    ],
  };
}

function processarThumbnail(tema, seo, storyboard, dirOutput, nomeBase) {
  const textoThumbnail = seo.thumbnail_texto || tema.split(' ').slice(0, 3).join(' ').toUpperCase();
  const paletaCores = storyboard?.paleta_cores;

  const resultado = gerarConceitoThumbnail(tema, textoThumbnail, paletaCores);

  const arq = path.join(dirOutput, `${nomeBase}_thumbnail.json`);
  fs.writeFileSync(arq, JSON.stringify(resultado, null, 2));

  // Salva também o prompt em .txt para facilitar copiar
  const promptTxt =
    `=== PROMPT PARA DALL-E / BING IMAGE CREATOR ===\n\n` +
    `${resultado.prompt_bing}\n\n` +
    `=== INSTRUÇÕES ===\n\n` +
    resultado.instrucoes_manuais.join('\n');

  fs.writeFileSync(path.join(dirOutput, `${nomeBase}_thumbnail_prompt.txt`), promptTxt);

  return resultado;
}

module.exports = { processarThumbnail };
