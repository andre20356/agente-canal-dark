#!/usr/bin/env node
/**
 * Autenticação OAuth2 TikTok para VPS.
 * Usa http://localhost:4006/oauth2callback como redirect URI (mesmo domínio
 * já cadastrado pro YouTube — o TikTok precisa desse mesmo redirect cadastrado
 * separadamente no TikTok for Developers).
 */

require('dotenv').config();

const urlModule = require('url');
const fs        = require('fs');
const path      = require('path');
const readline  = require('readline');
const crypto    = require('crypto');

const ENV_PATH     = path.join(__dirname, '..', '.env');
const REDIRECT_URI = 'http://localhost:4006/oauth2callback';
const API_BASE      = 'https://open.tiktokapis.com/v2';

function lerEnv() {
  try { return fs.readFileSync(ENV_PATH, 'utf8'); } catch { return ''; }
}

function salvarNoEnv(chave, valor) {
  let conteudo = lerEnv();
  const regex  = new RegExp(`^${chave}=.*$`, 'm');
  if (regex.test(conteudo)) {
    conteudo = conteudo.replace(regex, `${chave}=${valor}`);
  } else {
    conteudo = conteudo.trimEnd() + `\n${chave}=${valor}\n`;
  }
  fs.writeFileSync(ENV_PATH, conteudo, 'utf8');
}

function perguntar(txt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(txt, ans => { rl.close(); res(ans.trim()); }));
}

async function main() {
  console.log('\n' + '═'.repeat(57));
  console.log('  🎵  AUTENTICAÇÃO TIKTOK — ARQUIVO SOMBRIO');
  console.log('═'.repeat(57));

  const clientKey    = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

  if (!clientKey || !clientSecret) {
    console.log('\n❌ TIKTOK_CLIENT_KEY ou TIKTOK_CLIENT_SECRET não configurados no .env\n');
    console.log('   Crie um app em developers.tiktok.com, ative a Content Posting API');
    console.log('   e cole as chaves geradas lá no .env antes de rodar este script.\n');
    process.exit(1);
  }

  if (process.env.TIKTOK_REFRESH_TOKEN) {
    console.log('\n✅ TikTok já está autenticado.\n');
    const resp = await perguntar('  Deseja reautenticar? (s/N): ');
    if (resp.toLowerCase() !== 's') { console.log(''); process.exit(0); }
  }

  const state    = crypto.randomBytes(16).toString('hex');
  const authUrl  = 'https://www.tiktok.com/v2/auth/authorize/?' + new URLSearchParams({
    client_key:    clientKey,
    scope:         'user.info.basic,video.publish',
    response_type: 'code',
    redirect_uri:  REDIRECT_URI,
    state,
  });

  console.log('\n' + '─'.repeat(57));
  console.log('\n  PASSO 1 — No TikTok for Developers:\n');
  console.log('  Seu app → Login Kit → Redirect URIs\n');
  console.log('  Adicione exatamente:\n');
  console.log('     http://localhost:4006/oauth2callback\n');
  console.log('─'.repeat(57));
  console.log('\n  PASSO 2 — Abra este link no seu celular ou computador:\n');
  console.log('  ' + authUrl);
  console.log('\n─'.repeat(57));
  console.log('\n  PASSO 3 — Após autorizar:');
  console.log('  O navegador vai tentar abrir localhost e mostrar erro de conexão.');
  console.log('  Isso é NORMAL. Copie a URL COMPLETA da barra do navegador.\n');
  console.log('  Ela começa assim:');
  console.log('  http://localhost:4006/oauth2callback?code=...&state=...\n');
  console.log('─'.repeat(57) + '\n');

  const input = await perguntar('  Cole a URL completa aqui: ');
  if (!input) { console.log('\n❌ Nenhuma URL informada.\n'); process.exit(1); }

  let code;
  try {
    const parsed = new urlModule.URL(input);
    code = parsed.searchParams.get('code');
    const error = parsed.searchParams.get('error');
    if (error) throw new Error(`Acesso negado: ${error}`);
  } catch (e) {
    if (e.message.startsWith('Acesso negado')) throw e;
    const match = input.match(/[?&]code=([^&]+)/);
    code = match ? decodeURIComponent(match[1]) : null;
  }

  if (!code) {
    console.log('\n❌ Código não encontrado na URL. Verifique se colou a URL completa.\n');
    process.exit(1);
  }

  console.log('\n  ✓ Código extraído com sucesso');
  console.log('  ⏳ Obtendo tokens...');

  const r = await fetch(`${API_BASE}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key:    clientKey,
      client_secret: clientSecret,
      code,
      grant_type:    'authorization_code',
      redirect_uri:  REDIRECT_URI,
    }),
  });
  const data = await r.json();
  if (!r.ok || data.error) {
    throw new Error(data.error_description || data.error || `HTTP ${r.status}`);
  }

  salvarNoEnv('TIKTOK_ACCESS_TOKEN', data.access_token);
  salvarNoEnv('TIKTOK_REFRESH_TOKEN', data.refresh_token);
  salvarNoEnv('TIKTOK_TOKEN_EXPIRES_AT', String(Date.now() + data.expires_in * 1000));
  salvarNoEnv('TIKTOK_OPEN_ID', data.open_id);

  console.log('  ✓ Tokens salvos no .env');

  console.log('\n' + '═'.repeat(57));
  console.log('  ✅  AUTENTICAÇÃO CONCLUÍDA!');
  console.log('═'.repeat(57));
  console.log(`\n  🆔 Open ID: ${data.open_id}`);
  console.log('  🔑 Access + Refresh Token salvos com sucesso');
  console.log('\n  ⚠️  Enquanto o app não passar pela auditoria do TikTok, todo');
  console.log('     vídeo publicado por essa API sai como privado (SELF_ONLY),');
  console.log('     mesmo pedindo público. Isso é forçado pelo TikTok, não tem');
  console.log('     workaround — só muda depois da auditoria do app aprovada.\n');
  console.log('═'.repeat(57) + '\n');
}

main().catch(e => {
  console.error('\n❌ Erro:', e.message);
  process.exit(1);
});
