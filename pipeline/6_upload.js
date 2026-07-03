const path = require('path');
require('dotenv').config({ override: true, path: path.join(__dirname, '..', '.env') });

const { google } = require('googleapis');
const fs         = require('fs');
const { execFileSync } = require('child_process');

const ENV_PATH = path.join(__dirname, '..', '.env');

// ─── .env helper ──────────────────────────────────────────────────────────────

function salvarNoEnv(chave, valor) {
  try {
    let conteudo = fs.readFileSync(ENV_PATH, 'utf8');
    const regex  = new RegExp(`^${chave}=.*$`, 'm');
    if (regex.test(conteudo)) {
      conteudo = conteudo.replace(regex, `${chave}=${valor}`);
    } else {
      conteudo = conteudo.trimEnd() + `\n${chave}=${valor}\n`;
    }
    fs.writeFileSync(ENV_PATH, conteudo, 'utf8');
  } catch { /* ignora erros de I/O */ }
}

// ─── OAuth2 ───────────────────────────────────────────────────────────────────

function criarOAuth2() {
  const clientId     = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Credenciais YouTube não configuradas.\n' +
      '  Execute: node scripts/autenticar_youtube.js'
    );
  }

  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'http://localhost:4006/oauth2callback'
  );

  oauth2.setCredentials({ refresh_token: refreshToken });

  // Persiste automaticamente quando o access_token é renovado
  oauth2.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      salvarNoEnv('YOUTUBE_REFRESH_TOKEN', tokens.refresh_token);
      process.env.YOUTUBE_REFRESH_TOKEN = tokens.refresh_token;
    }
    if (tokens.access_token) {
      salvarNoEnv('YOUTUBE_ACCESS_TOKEN', tokens.access_token);
    }
  });

  return oauth2;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function encontrarArquivo(dirOutput, extensoes, sufixoPreferido = null, opcoes = {}) {
  const arquivos = fs.readdirSync(dirOutput);
  for (const ext of extensoes) {
    // Prefere arquivo com sufixo específico (ex: _video.mp4)
    if (sufixoPreferido) {
      const preferido = arquivos.find(f => f.toLowerCase().endsWith(sufixoPreferido + ext));
      if (preferido) return path.join(dirOutput, preferido);
    }
    // exigirSufixo: nunca aceita outro arquivo com a mesma extensão como
    // substituto — usado pro vídeo final, onde qualquer outro .mp4 da pasta
    // (ex: _bg.mp4, um leftover de montagem que falhou) seria o arquivo errado.
    if (sufixoPreferido && opcoes.exigirSufixo) continue;
    const encontrado = arquivos.find(f => f.toLowerCase().endsWith(ext));
    if (encontrado) return path.join(dirOutput, encontrado);
  }
  return null;
}

function carregarSEO(dirOutput) {
  const arquivos = fs.readdirSync(dirOutput);
  const seoFile  = arquivos.find(f => f.endsWith('_seo.json'));
  if (!seoFile) throw new Error('Arquivo _seo.json não encontrado em ' + dirOutput);
  return JSON.parse(fs.readFileSync(path.join(dirOutput, seoFile), 'utf8'));
}

function formatarDescricao(seo) {
  let desc = seo.descricao || '';
  if (seo.capitulos?.length) {
    desc += '\n\n━━━━━━━━━━━━━━━━━━━━━━━\n📌 CAPÍTULOS\n';
    seo.capitulos.forEach(c => { desc += `${c.tempo} ${c.titulo}\n`; });
  }
  return desc.slice(0, 5000);
}

function isAuthError(e) {
  const msg  = (e.message || '').toLowerCase();
  const code = e.code || e.status || e.response?.status;
  return (
    code === 401 ||
    msg.includes('invalid_grant') ||
    msg.includes('invalid credentials') ||
    msg.includes('token has been expired') ||
    msg.includes('token has been revoked')
  );
}

// ─── Validação do arquivo de vídeo ─────────────────────────────────────────────

// Confere que o arquivo é um vídeo completo e válido (não um .mp4 corrompido
// ou ainda sendo escrito pelo ffmpeg) antes de gastar upload com ele — sem
// isso, o YouTube aceita o upload e só falha depois no processamento dele
// ("processamento interrompido, não foi possível processar o vídeo").
function validarVideo(videoPath) {
  let duracao;
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', videoPath,
    ], { encoding: 'utf8', timeout: 15000 });
    duracao = parseFloat(out.trim());
  } catch (e) {
    throw new Error(
      `Vídeo inválido/corrompido em ${videoPath} — provavelmente ainda estava sendo ` +
      `gerado quando o upload foi iniciado, ou uma geração anterior falhou no meio. ` +
      `Gere o vídeo novamente antes de subir. (ffprobe: ${e.message.split('\n')[0]})`
    );
  }
  if (!duracao || duracao < 5) {
    throw new Error(`Vídeo com duração inválida (${duracao || 0}s) em ${videoPath} — gere novamente antes de subir.`);
  }

  // Confere que existe faixa de áudio — um _bg.mp4 (slideshow sem áudio/legenda,
  // que vaza quando a montagem final falha) tem vídeo válido mas SEM áudio, e
  // passaria pela checagem de duração acima sem isso.
  let temAudio = false;
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type',
      '-of', 'default=noprint_wrappers=1:nokey=1', videoPath,
    ], { encoding: 'utf8', timeout: 15000 });
    temAudio = out.trim().includes('audio');
  } catch { /* trata como sem áudio abaixo */ }
  if (!temAudio) {
    throw new Error(
      `Vídeo sem faixa de áudio em ${videoPath} — provavelmente é um _bg.mp4 (slideshow ` +
      `bruto) que sobrou de uma montagem final que falhou (sem narração nem legenda). ` +
      `Gere o vídeo novamente antes de subir.`
    );
  }

  return duracao;
}

// ─── Upload principal ─────────────────────────────────────────────────────────

async function uploadYouTube(dirOutput, opcoes = {}) {
  const auth = criarOAuth2();
  const yt   = google.youtube({ version: 'v3', auth });
  const seo  = carregarSEO(dirOutput);

  // NÃO cai para "qualquer .mp4 da pasta": um _bg.mp4 (slideshow sem áudio/legenda)
  // sobra ali quando a montagem final falha, e um fallback genérico já subiu esse
  // arquivo errado (mudo, sem legenda) por engano no passado.
  const videoPath = opcoes.videoPath || encontrarArquivo(dirOutput, ['.mp4', '.mkv', '.mov', '.avi'], '_video', { exigirSufixo: true });
  if (!videoPath) {
    throw new Error(
      'Vídeo final (_video.mp4) não encontrado em ' + dirOutput + '\n' +
      '  A montagem pode ter falhado antes de gerar o arquivo final — verifique os logs ' +
      '  de produção e gere o vídeo novamente antes de subir.'
    );
  }
  validarVideo(videoPath);

  const thumbPath   = opcoes.thumbPath   || encontrarArquivo(dirOutput, ['.jpg', '.jpeg', '.png', '.webp'], '_thumbnail');
  const titulo      = opcoes.titulo      || seo.titulo_recomendado;
  const descricao   = opcoes.descricao   || formatarDescricao(seo);
  const tags        = opcoes.tags        || seo.tags || [];
  const privacidade = opcoes.privacidade || 'public';
  const onProgress  = opcoes.onProgress  || (() => {});

  const tamanho = fs.statSync(videoPath).size;
  console.log(`  📁 Vídeo: ${path.basename(videoPath)} (${(tamanho / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`  🎯 Título: ${titulo}`);
  console.log(`  🔒 Privacidade: ${privacidade}\n`);
  console.log('  ⏳ Iniciando upload...\n');

  let resposta;
  try {
    resposta = await yt.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title:                titulo.slice(0, 100),
          description:          descricao,
          tags:                 tags.slice(0, 500),
          categoryId:           '24',
          defaultLanguage:      'pt-BR',
          defaultAudioLanguage: 'pt',
        },
        status: {
          privacyStatus:           privacidade,
          selfDeclaredMadeForKids: false,
          madeForKids:             false,
        },
      },
      media: {
        mimeType: 'video/mp4',
        body:     fs.createReadStream(videoPath),
      },
    }, {
      onUploadProgress: (evt) => {
        const pct = Math.round((evt.bytesRead / tamanho) * 100);
        process.stdout.write(`\r  📤 Enviando: ${pct}% (${(evt.bytesRead / 1024 / 1024).toFixed(1)} MB)`);
        onProgress(pct);
      },
    });
  } catch (e) {
    if (isAuthError(e)) {
      throw new Error(
        'Token do YouTube expirado ou revogado.\n' +
        '  Execute: node scripts/autenticar_youtube.js'
      );
    }
    throw e;
  }

  console.log('\n');

  const videoId  = resposta.data.id;
  const videoUrl = `https://youtube.com/watch?v=${videoId}`;

  // Thumbnail (opcional)
  if (thumbPath) {
    try {
      process.stdout.write('  🖼️  Enviando thumbnail...');
      await yt.thumbnails.set({
        videoId,
        media: {
          mimeType: thumbPath.endsWith('.png') ? 'image/png' : 'image/jpeg',
          body:     fs.createReadStream(thumbPath),
        },
      });
      console.log(' ✓');
    } catch (e) {
      console.log(` ⚠️  Thumbnail ignorada: ${e.message}`);
    }
  }

  const resultado = {
    video_id:   videoId,
    url:        videoUrl,
    titulo,
    privacidade,
    uploadedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(dirOutput, 'youtube_upload.json'),
    JSON.stringify(resultado, null, 2)
  );

  return { ...resultado, videoPath };
}

module.exports = { uploadYouTube, encontrarArquivo, carregarSEO, validarVideo, salvarNoEnv };
