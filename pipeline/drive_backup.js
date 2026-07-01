/**
 * Backup do vídeo final no Google Drive — usa o mesmo OAuth2 do YouTube
 * (precisa do escopo drive.file, adicionado à reautenticação). Serve como
 * cópia fora da VPS para permitir apagar a pasta local com segurança depois.
 */
const fs   = require('fs');
const path = require('path');
const { google } = require('googleapis');

const REDIRECT_URI    = 'http://localhost:4006/oauth2callback';
const NOME_PASTA_DRIVE = 'Arquivo Sombrio — Backups';

function criarOAuth2() {
  const clientId     = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Credenciais Google não configuradas.');
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

let pastaIdCache = null;

async function obterOuCriarPasta(drive) {
  if (pastaIdCache) return pastaIdCache;

  const busca = await drive.files.list({
    q: `name='${NOME_PASTA_DRIVE}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });
  if (busca.data.files?.length) {
    pastaIdCache = busca.data.files[0].id;
    return pastaIdCache;
  }

  const nova = await drive.files.create({
    requestBody: { name: NOME_PASTA_DRIVE, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  pastaIdCache = nova.data.id;
  return pastaIdCache;
}

function isDriveScopeError(e) {
  const msg = (e.message || '').toLowerCase();
  return msg.includes('insufficient') || msg.includes('scope') || e.code === 403;
}

async function backupParaDrive(dirOutput, videoPath, nomeArquivo) {
  const auth  = criarOAuth2();
  const drive = google.drive({ version: 'v3', auth });

  let pastaId;
  try {
    pastaId = await obterOuCriarPasta(drive);
  } catch (e) {
    if (isDriveScopeError(e)) {
      throw new Error(
        'Sem permissão de Google Drive na conta autenticada — reautentique pelo painel ' +
        '(o escopo drive.file foi adicionado, precisa autorizar de novo).'
      );
    }
    throw e;
  }

  const tamanho = fs.statSync(videoPath).size;
  console.log(`  ☁️  Enviando backup pro Drive: ${nomeArquivo} (${(tamanho / 1024 / 1024).toFixed(1)} MB)`);

  const resposta = await drive.files.create({
    requestBody: { name: nomeArquivo, parents: [pastaId] },
    media: { mimeType: 'video/mp4', body: fs.createReadStream(videoPath) },
    fields: 'id, webViewLink',
  });

  const resultado = {
    file_id: resposta.data.id,
    url: resposta.data.webViewLink,
    backed_up_at: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(dirOutput, `${path.basename(dirOutput)}_drive_backup.json`),
    JSON.stringify(resultado, null, 2)
  );
  console.log(`  ☁️  Backup no Drive: ${resultado.url}`);
  return resultado;
}

module.exports = { backupParaDrive };
