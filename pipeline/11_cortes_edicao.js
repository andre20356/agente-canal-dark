// Canal de Cortes — edição do trecho aprovado: corta o segmento e gera as
// duas versões de saída (vertical pra Shorts/TikTok, horizontal pro corte
// longo), com legenda queimada nas duas.
const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager, FileState } = require('@google/generative-ai/server');
const config = require('../config/config');

const MODELOS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'];

// ── 1. Corta o segmento bruto ─────────────────────────────────────────────────
// Re-codifica (não usa -c copy) pra garantir corte exato no timestamp pedido —
// cortar só por keyframe deixaria a borda do clipe alguns segundos errada.
function cortarSegmento(videoPath, inicioSeg, fimSeg, dirSaida) {
  const clipPath = path.join(dirSaida, 'clip_bruto.mp4');
  const duracao  = fimSeg - inicioSeg;
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', String(inicioSeg), '-i', videoPath, '-t', String(duracao),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k',
    clipPath,
  ], { timeout: 5 * 60 * 1000 });
  return clipPath;
}

// ── 2. Legenda do trecho (chamada separada e mais leve que a detecção) ───────
async function gerarLegendaSRT(clipPath, dirSaida) {
  const srtPath = path.join(dirSaida, 'legenda.srt');
  if (fs.existsSync(srtPath)) return srtPath;
  if (!config.apis.gemini) throw new Error('GEMINI_API_KEY não configurada no .env');

  const audioPath = path.join(dirSaida, 'clip_audio.m4a');
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', clipPath, '-vn', '-acodec', 'aac', '-b:a', '96k', audioPath,
  ], { timeout: 60_000 });

  const fileManager = new GoogleAIFileManager(config.apis.gemini);
  const upload = await fileManager.uploadFile(audioPath, { mimeType: 'audio/mp4' });
  let arquivo = upload.file;
  const inicio = Date.now();
  while (arquivo.state === FileState.PROCESSING) {
    if (Date.now() - inicio > 2 * 60 * 1000) throw new Error('Timeout processando áudio do clipe no Gemini');
    await new Promise(r => setTimeout(r, 2000));
    arquivo = await fileManager.getFile(arquivo.name);
  }
  if (arquivo.state === FileState.FAILED) throw new Error('Gemini falhou ao processar áudio do clipe');

  const prompt = 'Transcreva este áudio em português e devolva no formato de legenda SRT ' +
    'padrão (numeração, timestamps HH:MM:SS,mmm --> HH:MM:SS,mmm, texto), com linhas curtas ' +
    '(máx ~8 palavras por bloco) pra ficar legível como legenda de vídeo vertical. ' +
    'Responda SOMENTE o conteúdo do arquivo .srt, sem markdown, sem explicação.';

  const genAI = new GoogleGenerativeAI(config.apis.gemini);
  let ultimoErro;
  for (const nomeModelo of MODELOS) {
    try {
      const model  = genAI.getGenerativeModel({ model: nomeModelo });
      const result = await model.generateContent([
        { fileData: { mimeType: arquivo.mimeType, fileUri: arquivo.uri } },
        { text: prompt },
      ]);
      let srt = result.response.text().trim();
      srt = srt.replace(/^```(srt)?\n?/i, '').replace(/```$/, '').trim();
      if (!srt.includes('-->')) throw new Error('Resposta não parece um SRT válido');
      fs.writeFileSync(srtPath, srt + '\n');
      return srtPath;
    } catch (e) {
      ultimoErro = e;
      const transitorio = e.message.includes('503') || e.message.includes('overloaded') ||
        e.message.includes('high demand') || e.message.includes('quota') ||
        e.message.includes('404') || e.message.includes('Not Found');
      if (transitorio) continue;
      throw e;
    }
  }
  throw new Error(`Todos os modelos Gemini falharam gerando legenda: ${ultimoErro?.message}`);
}

// ── Filtro de legenda (mesmo estilo usado no 7_video.js) ──────────────────────
function filtroLegendas(srtPath) {
  const safe = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  return (
    `subtitles='${safe}':` +
    `force_style='FontName=Arial,FontSize=20,Bold=1,` +
    `PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,` +
    `Outline=2,Shadow=1,Alignment=2,MarginV=80'`
  );
}

// ── 3. Versão vertical (9:16) — fundo desfocado + vídeo original centralizado
// Preserva o enquadramento original inteiro (sem cortar quem fala nas bordas),
// só preenche as laterais com o próprio vídeo borrado e ampliado — técnica
// padrão de canal de corte de podcast.
function gerarVertical(clipPath, srtPath, dirSaida) {
  const outPath = path.join(dirSaida, 'corte_vertical.mp4');
  const filtroComplexo =
    `[0:v]split=2[bg][fg];` +
    `[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=20[bgblur];` +
    `[fg]scale=1080:-2[fgscaled];` +
    `[bgblur][fgscaled]overlay=(W-w)/2:(H-h)/2,${filtroLegendas(srtPath)}[vout]`;

  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', clipPath,
    '-filter_complex', filtroComplexo,
    '-map', '[vout]', '-map', '0:a',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k',
    outPath,
  ], { timeout: 10 * 60 * 1000 });
  return outPath;
}

// ── 4. Versão horizontal — mantém 16:9 original, só com legenda + título ──────
// Bumper de intro/outro de marca fica pra depois (precisa de um vídeo pronto
// pra concatenar); por ora entra um título com fade nos primeiros segundos,
// igual ao usado no 7_video.js, mais barato de manter.
function gerarHorizontal(clipPath, srtPath, titulo, dirSaida) {
  const outPath   = path.join(dirSaida, 'corte_horizontal.mp4');
  const tituloTxt = path.join(dirSaida, 'titulo.txt');
  fs.writeFileSync(tituloTxt, titulo);
  const safeTitulo = tituloTxt.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

  const filtroTitulo =
    `drawtext=textfile='${safeTitulo}':fontsize=42:fontcolor=white:` +
    `x=(w-text_w)/2:y=60:borderw=3:bordercolor=black:` +
    `enable='between(t,0.3,4)':alpha='if(lt(t,1),t-0.3,if(gt(t,3.3),4-t,1))'`;

  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', clipPath,
    '-vf', `${filtroTitulo},${filtroLegendas(srtPath)}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k',
    outPath,
  ], { timeout: 10 * 60 * 1000 });
  return outPath;
}

// ── Orquestração ───────────────────────────────────────────────────────────────
async function processarCorte(videoPath, candidato, dirSaida) {
  fs.mkdirSync(dirSaida, { recursive: true });

  console.log(`  ✂️  Cortando segmento ${candidato.inicio_seg}s–${candidato.fim_seg}s...`);
  const clipPath = cortarSegmento(videoPath, candidato.inicio_seg, candidato.fim_seg, dirSaida);

  console.log('  📝 Gerando legenda do trecho...');
  const srtPath = await gerarLegendaSRT(clipPath, dirSaida);

  console.log('  📱 Gerando versão vertical...');
  const verticalPath = gerarVertical(clipPath, srtPath, dirSaida);

  console.log('  🖥️  Gerando versão horizontal...');
  const horizontalPath = gerarHorizontal(clipPath, srtPath, candidato.titulo_sugerido, dirSaida);

  console.log('  ✓ Corte processado');
  return { clipPath, srtPath, verticalPath, horizontalPath };
}

module.exports = { processarCorte, cortarSegmento, gerarLegendaSRT, gerarVertical, gerarHorizontal };
