const path = require('path');
require('dotenv').config({ override: true, path: path.join(__dirname, '..', '.env') });

const fs = require('fs');
const { encontrarArquivo, carregarSEO, validarVideo, salvarNoEnv } = require('./6_upload');

// ─── TikTok Content Posting API (Direct Post) ─────────────────────────────────
// Docs: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
//
// IMPORTANTE — igual documentado ao usuário: enquanto o app de developer não
// passar pela auditoria do TikTok, TODO vídeo publicado por essa API sai como
// privado (SELF_ONLY), não importa o que a gente peça em privacy_level. Isso
// é forçado pelo lado do TikTok, não tem workaround — só passa a publicar
// público de verdade depois que a Content Posting API do app for auditada.

const API_BASE      = 'https://open.tiktokapis.com/v2';
const CHUNK_SIZE    = 10 * 1024 * 1024; // 10MB — dentro da faixa 5-64MB exigida pela API

function tokenExpirado() {
  const exp = parseInt(process.env.TIKTOK_TOKEN_EXPIRES_AT || '0', 10);
  return !exp || Date.now() >= exp - 60_000; // 60s de folga
}

async function renovarToken() {
  const clientKey    = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const refreshToken = process.env.TIKTOK_REFRESH_TOKEN;
  if (!clientKey || !clientSecret || !refreshToken) {
    throw new Error(
      'Credenciais TikTok não configuradas.\n' +
      '  Execute: node scripts/autenticar_tiktok.js'
    );
  }

  const r = await fetch(`${API_BASE}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key:    clientKey,
      client_secret: clientSecret,
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const data = await r.json();
  if (!r.ok || data.error) {
    throw new Error(`Falha ao renovar token TikTok: ${data.error_description || data.error || r.status}`);
  }

  salvarNoEnv('TIKTOK_ACCESS_TOKEN', data.access_token);
  salvarNoEnv('TIKTOK_TOKEN_EXPIRES_AT', String(Date.now() + data.expires_in * 1000));
  if (data.refresh_token) salvarNoEnv('TIKTOK_REFRESH_TOKEN', data.refresh_token);
  process.env.TIKTOK_ACCESS_TOKEN      = data.access_token;
  process.env.TIKTOK_TOKEN_EXPIRES_AT  = String(Date.now() + data.expires_in * 1000);
  if (data.refresh_token) process.env.TIKTOK_REFRESH_TOKEN = data.refresh_token;

  return data.access_token;
}

async function tokenValido() {
  if (!process.env.TIKTOK_REFRESH_TOKEN) {
    throw new Error(
      'TikTok não autenticado.\n' +
      '  Execute: node scripts/autenticar_tiktok.js'
    );
  }
  if (tokenExpirado()) return renovarToken();
  return process.env.TIKTOK_ACCESS_TOKEN;
}

function isAuthError(status, body) {
  const code = body?.error?.code || '';
  return status === 401 || code === 'access_token_invalid' || code === 'token_expired';
}

// ─── Init do post (abre a sessão de upload) ───────────────────────────────────

async function initPublish(accessToken, { titulo, privacyLevel, tamanho, totalChunks, chunkSize }) {
  const r = await fetch(`${API_BASE}/post/publish/video/init/`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title:                    titulo.slice(0, 150),
        privacy_level:            privacyLevel,
        disable_duet:             false,
        disable_comment:          false,
        disable_stitch:           false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source:            'FILE_UPLOAD',
        video_size:         tamanho,
        chunk_size:         chunkSize,
        total_chunk_count:  totalChunks,
      },
    }),
  });
  const data = await r.json();
  if (!r.ok || data.error?.code !== 'ok') {
    throw { status: r.status, body: data, message: `Falha ao iniciar publicação TikTok: ${data.error?.message || r.status}` };
  }
  return data.data; // { publish_id, upload_url }
}

// ─── Envio dos chunks pro upload_url retornado pelo init ──────────────────────

async function enviarChunks(uploadUrl, videoPath, tamanho, chunkSize, onProgress) {
  const fd = fs.openSync(videoPath, 'r');
  try {
    let enviado = 0;
    let offset  = 0;
    while (offset < tamanho) {
      const fim    = Math.min(offset + chunkSize, tamanho) - 1;
      const tamChunk = fim - offset + 1;
      const buf    = Buffer.alloc(tamChunk);
      fs.readSync(fd, buf, 0, tamChunk, offset);

      const r = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type':  'video/mp4',
          'Content-Range': `bytes ${offset}-${fim}/${tamanho}`,
        },
        body: buf,
      });
      if (!r.ok && r.status !== 201 && r.status !== 206) {
        const texto = await r.text().catch(() => '');
        throw new Error(`Falha no upload do chunk ${offset}-${fim}: ${r.status} ${texto}`);
      }

      enviado += tamChunk;
      offset  = fim + 1;
      onProgress(Math.round((enviado / tamanho) * 100));
    }
  } finally {
    fs.closeSync(fd);
  }
}

// ─── Poll de status até publicar ou falhar ────────────────────────────────────

async function aguardarPublicacao(accessToken, publishId, { timeoutMs = 5 * 60 * 1000, intervalMs = 3000 } = {}) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const r = await fetch(`${API_BASE}/post/publish/status/fetch/`, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const data = await r.json();
    const status = data.data?.status;

    if (status === 'PUBLISH_COMPLETE') return data.data;
    if (status === 'FAILED') {
      throw new Error(`Publicação TikTok falhou: ${data.data?.fail_reason || 'motivo não informado'}`);
    }
    // PROCESSING_DOWNLOAD / PROCESSING_UPLOAD / SEND_TO_USER_INBOX → continua esperando
    await new Promise(res => setTimeout(res, intervalMs));
  }
  throw new Error('Timeout aguardando o TikTok processar a publicação (5min) — pode ainda completar sozinho, confira no app depois.');
}

// ─── Upload principal ─────────────────────────────────────────────────────────

async function uploadTikTok(dirOutput, opcoes = {}) {
  let accessToken = await tokenValido();
  const seo = carregarSEO(dirOutput);

  const videoPath = opcoes.videoPath || encontrarArquivo(dirOutput, ['.mp4', '.mkv', '.mov', '.avi'], '_video', { exigirSufixo: true });
  if (!videoPath) {
    throw new Error('Vídeo final (_video.mp4) não encontrado em ' + dirOutput);
  }
  validarVideo(videoPath);

  const tamanho    = fs.statSync(videoPath).size;
  const titulo     = opcoes.titulo || seo.titulo_recomendado;
  const onProgress = opcoes.onProgress || (() => {});
  // Enquanto o app não for auditado pelo TikTok, PUBLIC_TO_EVERYONE é
  // rejeitado ou silenciosamente rebaixado pra SELF_ONLY do lado deles.
  const privacyLevel = opcoes.privacyLevel || process.env.TIKTOK_PRIVACY_LEVEL || 'SELF_ONLY';

  const totalChunks = Math.max(1, Math.ceil(tamanho / CHUNK_SIZE));
  const chunkSize    = totalChunks === 1 ? tamanho : CHUNK_SIZE;

  console.log(`  📁 Vídeo: ${path.basename(videoPath)} (${(tamanho / 1024 / 1024).toFixed(1)} MB, ${totalChunks} chunk(s))`);
  console.log(`  🎯 Título: ${titulo}`);
  console.log(`  🔒 Privacidade: ${privacyLevel}${privacyLevel !== 'PUBLIC_TO_EVERYONE' ? ' (app ainda não auditado)' : ''}\n`);

  let init;
  try {
    init = await initPublish(accessToken, { titulo, privacyLevel, tamanho, totalChunks, chunkSize });
  } catch (e) {
    if (isAuthError(e.status, e.body)) {
      accessToken = await renovarToken();
      init = await initPublish(accessToken, { titulo, privacyLevel, tamanho, totalChunks, chunkSize });
    } else {
      throw e;
    }
  }

  console.log('  ⏳ Enviando vídeo...\n');
  await enviarChunks(init.upload_url, videoPath, tamanho, chunkSize, (pct) => {
    process.stdout.write(`\r  📤 Enviando: ${pct}%`);
    onProgress(pct);
  });
  console.log('\n  ⏳ Aguardando TikTok processar e publicar...');

  const resultadoFinal = await aguardarPublicacao(accessToken, init.publish_id);

  const resultado = {
    publish_id:  init.publish_id,
    post_id:     resultadoFinal.publicaly_available_post_id?.[0] || null,
    titulo,
    privacidade: privacyLevel,
    uploadedAt:  new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(dirOutput, 'tiktok_upload.json'),
    JSON.stringify(resultado, null, 2)
  );

  return resultado;
}

module.exports = { uploadTikTok };
