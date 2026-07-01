/**
 * Pipeline 7 — Montagem de vídeo final
 * Imagens: Pollinations.ai (gratuito, sem API key) por cena do storyboard
 * Vídeo:   slideshow de imagens + áudio + legendas SRT + título overlay
 */

require('dotenv').config({ override: true, path: require('path').join(__dirname, '..', '.env') });

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const fetch = require('node-fetch');

const RESOLUCAO = '1920x1080';
const FPS       = 25;
const IMG_W     = 1920;
const IMG_H     = 1080;

// ── Duração do áudio via ffprobe ──────────────────────────────────────────────

function getDuracao(audioPath) {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration ` +
    `-of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
  ).toString().trim();
  return parseFloat(out);
}

// ── Pollinations.ai — gerar imagem por cena ───────────────────────────────────

async function gerarImagemPollinations(prompt, destino, tentativas = 3) {
  // Prepara o prompt: dark, cinematográfico, sem texto
  const promptFinal = `${prompt}, dark cinematic atmosphere, dramatic lighting, high contrast, ` +
    `mysterious, horror aesthetic, no text, no watermark, photorealistic, ultra detailed, 4k`;

  const encoded = encodeURIComponent(promptFinal);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=${IMG_W}&height=${IMG_H}&nologo=true&seed=${Math.floor(Math.random() * 9999)}`;

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

// ── Variações de prompt por cena (mais imagens = mais dinamismo) ──────────────

const VARIACOES_VISUAIS = [
  'extreme close-up shot, dramatic shadows',
  'wide establishing shot, dark atmosphere',
  'low angle shot, ominous lighting',
  'aerial view, mysterious landscape',
  'interior shot, dim light, shadows',
  'silhouette against dark background',
  'rain and fog, cinematic mood',
  'abandoned place, decay, mystery',
];

function expandirPrompts(cenas, temaGeral, totalNecessario) {
  const base = cenas.length >= 3 ? cenas.map(c => c.descricao_visual || c.cena || temaGeral) : [
    `dark mysterious ${temaGeral}, underground setting`,
    `secret government facility, ${temaGeral}`,
    `ancient ruins, hidden passage, ${temaGeral}`,
    `classified documents, dark room, ${temaGeral}`,
    `dramatic revelation, ${temaGeral}`,
    `conspiracy, shadows, ${temaGeral}`,
  ];

  const prompts = [];
  for (let i = 0; i < totalNecessario; i++) {
    const promptBase = base[i % base.length];
    const variacao   = VARIACOES_VISUAIS[i % VARIACOES_VISUAIS.length];
    prompts.push(`${promptBase}, ${variacao}`);
  }
  return prompts;
}

// ── Gerar imagens por cena do storyboard ──────────────────────────────────────

const SEGUNDOS_POR_IMAGEM = 15; // 1 imagem a cada 15s (modo genérico, sem plano visual)

async function gerarImagemOuFallback(prompt, imgPath, label, total, i) {
  process.stdout.write(`  [Imagens] ${i + 1}/${total}...`);
  const ok = await gerarImagemPollinations(prompt, imgPath);
  if (ok) {
    console.log(' ✓');
  } else {
    console.log(' ⚠ fallback escuro');
    execSync(
      `ffmpeg -y -f lavfi -i "color=c=#050510:s=${IMG_W}x${IMG_H}" ` +
      `-frames:v 1 "${imgPath}"`,
      { stdio: 'pipe' }
    );
  }
}

// Modo genérico (sem Diretor Visual): ciclo fixo de variações de câmera
async function gerarImagensCenas(dirOutput, nomeBase, storyboard, temaGeral, duracaoTotal) {
  const cenas      = storyboard?.cenas || [];
  const dirImg     = path.join(dirOutput, 'imagens');
  fs.mkdirSync(dirImg, { recursive: true });

  const totalImagens  = Math.max(8, Math.ceil(duracaoTotal / SEGUNDOS_POR_IMAGEM));
  const prompts       = expandirPrompts(cenas, temaGeral, totalImagens);
  const duracaoPorImg = duracaoTotal / totalImagens;

  console.log(`  [Imagens] Gerando ${totalImagens} imagens (1 a cada ${SEGUNDOS_POR_IMAGEM}s)...`);

  const imagens = [];
  for (let i = 0; i < totalImagens; i++) {
    const imgPath = path.join(dirImg, `cena_${String(i + 1).padStart(3, '0')}.jpg`);

    // Reutiliza imagem já gerada (útil em re-execuções)
    if (fs.existsSync(imgPath) && fs.statSync(imgPath).size > 5000) {
      process.stdout.write(`  [Imagens] ${i + 1}/${totalImagens} (cache) ✓\n`);
      imagens.push({ path: imgPath, duracao: duracaoPorImg });
      continue;
    }

    await gerarImagemOuFallback(prompts[i], imgPath, 'Imagens', totalImagens, i);
    imagens.push({ path: imgPath, duracao: duracaoPorImg });
  }

  return imagens;
}

// Modo sincronizado: usa as cenas do Diretor Visual (prompt + duração real por trecho narrado)
async function gerarImagensDoPlanoVisual(dirOutput, plano) {
  const dirImg = path.join(dirOutput, 'imagens');
  fs.mkdirSync(dirImg, { recursive: true });

  console.log(`  [Imagens] Gerando ${plano.length} imagens sincronizadas com a narração...`);

  const imagens = [];
  for (let i = 0; i < plano.length; i++) {
    const cena    = plano[i];
    const imgPath = path.join(dirImg, `cena_${String(i + 1).padStart(3, '0')}.jpg`);
    const duracao = Math.max(1, cena.end - cena.start);

    if (fs.existsSync(imgPath) && fs.statSync(imgPath).size > 5000) {
      process.stdout.write(`  [Imagens] ${i + 1}/${plano.length} (cache) ✓\n`);
      imagens.push({ path: imgPath, duracao });
      continue;
    }

    await gerarImagemOuFallback(cena.prompt, imgPath, 'Imagens', plano.length, i);
    imagens.push({ path: imgPath, duracao });
  }

  return imagens;
}

// ── Slideshow ffmpeg com crossfade entre imagens ──────────────────────────────

// `imagens`: array de { path, duracao } — duração pode variar por imagem
// (sincronizada com o trecho narrado quando vem do Diretor Visual).
function montarSlideshow(imagens, bgPath) {
  const total        = imagens.length;
  const duracaoTotal = imagens.reduce((acc, img) => acc + img.duracao, 0);
  const FADE         = 0.5; // segundos de crossfade

  // Arquivo de lista para concat
  const listaPath = bgPath.replace('.mp4', '_lista.txt');
  const linhas    = imagens.map(img =>
    `file '${img.path}'\nduration ${img.duracao.toFixed(3)}`
  );
  linhas.push(`file '${imagens[total - 1].path}'`);
  fs.writeFileSync(listaPath, linhas.join('\n'), 'utf-8');

  // Crossfade via xfade filter em cadeia
  // Para N imagens: N-1 transições
  if (total === 1) {
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${listaPath}" ` +
      `-vf "scale=${IMG_W}:${IMG_H}:force_original_aspect_ratio=increase,crop=${IMG_W}:${IMG_H},fps=${FPS}" ` +
      `-c:v libx264 -preset fast -an -t ${duracaoTotal + 2} "${bgPath}"`,
      { stdio: 'pipe', timeout: 600000 }
    );
  } else {
    // Monta cada imagem como input separado com duração + crossfade
    const inputs   = imagens.map(img => `-loop 1 -t ${(img.duracao + FADE).toFixed(3)} -i "${img.path}"`).join(' ');
    const filtros  = [];
    filtros.push(`[0:v]scale=${IMG_W}:${IMG_H}:force_original_aspect_ratio=increase,crop=${IMG_W}:${IMG_H},fps=${FPS},setsar=1[v0]`);

    for (let i = 1; i < total; i++) {
      filtros.push(`[${i}:v]scale=${IMG_W}:${IMG_H}:force_original_aspect_ratio=increase,crop=${IMG_W}:${IMG_H},fps=${FPS},setsar=1[v${i}]`);
    }

    let ultimoLabel     = '[v0]';
    let offsetAcumulado = 0;
    for (let i = 1; i < total; i++) {
      offsetAcumulado += imagens[i - 1].duracao;
      const offset    = (offsetAcumulado - FADE).toFixed(3);
      const outLabel  = i < total - 1 ? `[xf${i}]` : '[vout]';
      filtros.push(`${ultimoLabel}[v${i}]xfade=transition=fade:duration=${FADE}:offset=${offset}${outLabel}`);
      ultimoLabel = outLabel;
    }

    execSync(
      `ffmpeg -y ${inputs} ` +
      `-filter_complex "${filtros.join(';')}" ` +
      `-map "[vout]" -c:v libx264 -preset fast -an -t ${duracaoTotal + 2} "${bgPath}"`,
      { stdio: 'pipe', timeout: 600000 }
    );
  }

  try { fs.unlinkSync(listaPath); } catch {}
}

// ── Filtro de legendas ────────────────────────────────────────────────────────

function filtroLegendas(srtPath) {
  const safe = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  return (
    `subtitles='${safe}':` +
    `force_style='FontName=Arial,FontSize=30,Bold=1,` +
    `PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,` +
    `Outline=2,Shadow=1,Alignment=2,MarginV=50'`
  );
}

// ── Filtro de título (fade nos primeiros 6s) ──────────────────────────────────

function filtroTitulo(tituloPath) {
  const safe = tituloPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  return (
    `drawtext=textfile='${safe}':` +
    `fontsize=54:fontcolor=white:` +
    `x=(w-text_w)/2:y=(h-text_h)/2-60:` +
    `borderw=3:bordercolor=black:` +
    `enable='between(t,0.5,5.5)':` +
    `alpha='if(lt(t,1.5),t-0.5,if(gt(t,4.5),5.5-t,1))'`
  );
}

// ── Montagem final ────────────────────────────────────────────────────────────

async function montarVideo(dirOutput, nomeBase, seo, storyboard, tema, planoVisual = null) {
  const audioPath = path.join(dirOutput, `${nomeBase}_narracao.mp3`);
  const srtPath   = path.join(dirOutput, `${nomeBase}_narracao.srt`);
  const bgPath    = path.join(dirOutput, `${nomeBase}_bg.mp4`);
  const tituloTxt = path.join(dirOutput, `${nomeBase}_titulo.txt`);
  const videoOut  = path.join(dirOutput, `${nomeBase}_video.mp4`);

  if (!fs.existsSync(audioPath)) {
    throw new Error('Áudio não encontrado. Gere a narração primeiro.');
  }

  const duracao = getDuracao(audioPath);
  console.log(`  [Vídeo] Duração: ${duracao.toFixed(0)}s`);

  // Gera imagens: sincronizadas com a narração (Diretor Visual) quando disponível,
  // senão cai no modo genérico (ciclo de variações de câmera).
  const imagens = (planoVisual && planoVisual.length)
    ? await gerarImagensDoPlanoVisual(dirOutput, planoVisual)
    : await gerarImagensCenas(dirOutput, nomeBase, storyboard, tema || nomeBase, duracao);

  // Monta slideshow
  console.log('  [Vídeo] Montando slideshow de imagens...');
  montarSlideshow(imagens, bgPath);

  // Arquivo de título
  const titulo = (seo?.titulo_recomendado || nomeBase).slice(0, 70);
  fs.writeFileSync(tituloTxt, titulo, 'utf-8');

  // Filtros
  const filtros = [];
  if (fs.existsSync(srtPath)) filtros.push(filtroLegendas(srtPath));
  filtros.push(filtroTitulo(tituloTxt));

  // Montagem final com áudio
  console.log('  [Vídeo] Combinando vídeo + áudio + legendas...');
  execSync(
    `ffmpeg -y -i "${bgPath}" -i "${audioPath}" ` +
    `-vf "${filtros.join(',')}" ` +
    `-c:v libx264 -preset fast -crf 22 ` +
    `-c:a aac -b:a 128k -shortest ` +
    `"${videoOut}"`,
    { stdio: 'pipe', timeout: 600000 }
  );

  // Limpeza
  try { fs.unlinkSync(bgPath); } catch {}
  try { fs.unlinkSync(tituloTxt); } catch {}

  const tamanho = (fs.statSync(videoOut).size / 1024 / 1024).toFixed(1);
  console.log(`  [Vídeo] Pronto: ${path.basename(videoOut)} (${tamanho} MB)`);

  return videoOut;
}

module.exports = { montarVideo };
