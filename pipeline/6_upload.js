const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

function criarOAuth2() {
  const clientId     = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Credenciais YouTube não configuradas.\n' +
      'Execute: node scripts/autenticar_youtube.js'
    );
  }

  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

function encontrarArquivo(dirOutput, extensoes) {
  const arquivos = fs.readdirSync(dirOutput);
  for (const ext of extensoes) {
    const encontrado = arquivos.find(f => f.endsWith(ext));
    if (encontrado) return path.join(dirOutput, encontrado);
  }
  return null;
}

function carregarSEO(dirOutput) {
  const arquivos = fs.readdirSync(dirOutput);
  const seoFile = arquivos.find(f => f.endsWith('_seo.json'));
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

async function uploadYouTube(dirOutput, opcoes = {}) {
  const auth   = criarOAuth2();
  const yt     = google.youtube({ version: 'v3', auth });
  const seo    = carregarSEO(dirOutput);

  const videoPath = opcoes.videoPath || encontrarArquivo(dirOutput, ['.mp4', '.mkv', '.mov', '.avi']);
  if (!videoPath) {
    throw new Error(
      'Nenhum arquivo de vídeo encontrado em ' + dirOutput + '\n' +
      'Coloque o .mp4 finalizado na pasta do vídeo e tente novamente.'
    );
  }

  const thumbPath = opcoes.thumbPath || encontrarArquivo(dirOutput, ['.jpg', '.jpeg', '.png', '.webp']);
  const titulo    = opcoes.titulo || seo.titulo_recomendado;
  const descricao = opcoes.descricao || formatarDescricao(seo);
  const tags      = opcoes.tags || seo.tags || [];
  const privacidade = opcoes.privacidade || 'private'; // private / unlisted / public

  const tamanho = fs.statSync(videoPath).size;
  console.log(`  📁 Vídeo: ${path.basename(videoPath)} (${(tamanho / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`  🎯 Título: ${titulo}`);
  console.log(`  🔒 Privacidade: ${privacidade}\n`);
  console.log('  ⏳ Iniciando upload...\n');

  const resposta = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title:       titulo.slice(0, 100),
        description: descricao,
        tags:        tags.slice(0, 500),
        categoryId:  '24',       // 24 = Entertainment
        defaultLanguage: 'pt-BR',
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
    },
  });

  console.log('\n');

  const videoId  = resposta.data.id;
  const videoUrl = `https://youtube.com/watch?v=${videoId}`;

  // Upload da thumbnail (opcional)
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

  // Salvar resultado
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

  return resultado;
}

module.exports = { uploadYouTube };
