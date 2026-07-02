const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { execSync } = require('child_process');

const THUMB_W = 1280;
const THUMB_H = 720;

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

// ── Geração automática da imagem (Pollinations.ai) ────────────────────────────
// IA não renderiza texto legível de forma confiável, então o fundo é gerado
// SEM texto (só a cena dramática) e o texto grande é "queimado" por cima via
// ffmpeg — mesma técnica já usada pro overlay de título em pipeline/7_video.js.

async function gerarImagemFundo(prompt, destino, tentativas = 3) {
  const encoded = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=${THUMB_W}&height=${THUMB_H}&nologo=true&seed=${Math.floor(Math.random() * 9999)}`;

  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(url, { timeout: 60000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.buffer();
      if (buf.length < 5000) throw new Error('Imagem muito pequena');
      fs.writeFileSync(destino, buf);
      return true;
    } catch (e) {
      if (i < tentativas - 1) await new Promise(r => setTimeout(r, 3000));
    }
  }
  return false;
}

// Retorna o path da miniatura final gerada, ou null se a geração falhar (ex:
// Pollinations fora do ar) — nesse caso o JSON/prompt manual continuam
// servindo de plano B, como já era o comportamento antes desta função existir.
async function gerarThumbnailReal(dirOutput, nomeBase, tema, textoThumbnail, corDestaque) {
  const bgPath  = path.join(dirOutput, `${nomeBase}_thumbnail_bg.jpg`);
  const txtPath = path.join(dirOutput, `${nomeBase}_thumbnail_texto.txt`);
  const outPath = path.join(dirOutput, `${nomeBase}_thumbnail.jpg`);

  const promptImagem =
    `YouTube thumbnail background, dark mystery documentary, ${tema}, ` +
    `shocked terrified person face close-up, dramatic cinematic lighting, ` +
    `high contrast, dark moody atmosphere, no text, no watermark, ` +
    `photorealistic, ultra detailed, 4k`;

  const ok = await gerarImagemFundo(promptImagem, bgPath);
  if (!ok) return null;

  fs.writeFileSync(txtPath, textoThumbnail.toUpperCase(), 'utf-8');
  const txtEsc = txtPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  const cor    = (corDestaque || '#e63946').replace(/[^#0-9a-fA-F]/g, '') || '#e63946';

  try {
    execSync(
      `ffmpeg -hide_banner -loglevel error -y -i "${bgPath}" ` +
      `-vf "scale=${THUMB_W}:${THUMB_H}:force_original_aspect_ratio=increase,crop=${THUMB_W}:${THUMB_H},` +
      `drawbox=x=0:y=ih*0.60:w=iw:h=ih*0.40:color=black@0.6:t=fill,` +
      `drawbox=x=0:y=ih*0.60:w=iw:h=6:color=${cor}@1.0:t=fill,` +
      `drawtext=textfile='${txtEsc}':fontsize=88:fontcolor=white:borderw=5:bordercolor=black:` +
      `x=(w-text_w)/2:y=h*0.80-(text_h/2):line_spacing=6" ` +
      `-frames:v 1 -q:v 2 "${outPath}"`,
      { stdio: 'pipe', timeout: 60000, maxBuffer: 1024 * 1024 * 10 }
    );
  } catch {
    return null; // fica só com o fundo sem texto? não — melhor cair pro plano B manual
  } finally {
    try { fs.unlinkSync(bgPath); } catch {}
    try { fs.unlinkSync(txtPath); } catch {}
  }

  return outPath;
}

async function processarThumbnail(tema, seo, storyboard, dirOutput, nomeBase) {
  const textoThumbnail = seo.thumbnail_texto || tema.split(' ').slice(0, 3).join(' ').toUpperCase();
  const paletaCores = storyboard?.paleta_cores;

  const resultado = gerarConceitoThumbnail(tema, textoThumbnail, paletaCores);

  const arq = path.join(dirOutput, `${nomeBase}_thumbnail.json`);
  fs.writeFileSync(arq, JSON.stringify(resultado, null, 2));

  // Salva também o prompt em .txt para facilitar copiar (plano B manual)
  const promptTxt =
    `=== PROMPT PARA DALL-E / BING IMAGE CREATOR ===\n\n` +
    `${resultado.prompt_bing}\n\n` +
    `=== INSTRUÇÕES ===\n\n` +
    resultado.instrucoes_manuais.join('\n');

  fs.writeFileSync(path.join(dirOutput, `${nomeBase}_thumbnail_prompt.txt`), promptTxt);

  const imagemPath = await gerarThumbnailReal(dirOutput, nomeBase, tema, textoThumbnail, resultado.cor_destaque);
  resultado.imagem_gerada = !!imagemPath;

  return resultado;
}

module.exports = { processarThumbnail };
