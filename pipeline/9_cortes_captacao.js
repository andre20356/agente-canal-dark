// Canal de Cortes — download do episódio autorizado via yt-dlp.
// Só é usado depois que a fonte confirma parceria formal (config em
// cortes_config.json) — baixar vídeo de terceiro sem autorização violaria
// os Termos de Serviço do YouTube.
const path = require('path');
const fs   = require('fs');
const { execFileSync } = require('child_process');

async function baixarEpisodio(videoId, dirOutput) {
  fs.mkdirSync(dirOutput, { recursive: true });
  const videoPath = path.join(dirOutput, 'episodio.mp4');

  if (fs.existsSync(videoPath)) {
    return videoPath; // já baixado numa tentativa anterior
  }

  console.log(`  ⬇️  Baixando episódio ${videoId} via yt-dlp...`);
  try {
    execFileSync('yt-dlp', [
      '-f', 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]',
      '--merge-output-format', 'mp4',
      '-o', videoPath,
      `https://www.youtube.com/watch?v=${videoId}`,
    ], { stdio: 'inherit', timeout: 30 * 60 * 1000 });
  } catch (e) {
    throw new Error(`yt-dlp falhou pro vídeo ${videoId}: ${e.message}`);
  }

  if (!fs.existsSync(videoPath)) {
    throw new Error(`yt-dlp terminou mas o arquivo não apareceu em ${videoPath}`);
  }
  console.log(`  ✓ Episódio baixado: ${(fs.statSync(videoPath).size / 1024 / 1024).toFixed(1)} MB`);
  return videoPath;
}

// Extrai só o áudio (m4a) — usado pra mandar pro Gemini na detecção de
// cortes, bem mais leve que subir o vídeo inteiro.
function extrairAudio(videoPath, dirOutput) {
  const audioPath = path.join(dirOutput, 'episodio_audio.m4a');
  if (fs.existsSync(audioPath)) return audioPath;

  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', videoPath, '-vn', '-acodec', 'aac', '-b:a', '64k',
    audioPath,
  ], { timeout: 10 * 60 * 1000 });

  return audioPath;
}

module.exports = { baixarEpisodio, extrairAudio };
