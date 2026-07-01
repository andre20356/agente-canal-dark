#!/usr/bin/env node
/**
 * Autenticação OAuth2 YouTube para VPS.
 * Usa http://localhost:4006/oauth2callback como redirect URI.
 * O usuário cola a URL completa que aparece no navegador após autorizar.
 */

require('dotenv').config();

const urlModule  = require('url');
const { google } = require('googleapis');
const fs         = require('fs');
const path       = require('path');
const readline   = require('readline');

const ENV_PATH     = path.join(__dirname, '..', '.env');
const REDIRECT_URI = 'http://localhost:4006/oauth2callback';

// ─── .env helpers ─────────────────────────────────────────────────────────────

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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(57));
  console.log('  📺  AUTENTICAÇÃO YOUTUBE — ARQUIVO SOMBRIO');
  console.log('═'.repeat(57));

  const clientId     = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log('\n❌ YOUTUBE_CLIENT_ID ou YOUTUBE_CLIENT_SECRET não configurados no .env\n');
    process.exit(1);
  }

  if (process.env.YOUTUBE_REFRESH_TOKEN) {
    console.log('\n✅ YouTube já está autenticado.\n');
    const resp = await perguntar('  Deseja reautenticar? (s/N): ');
    if (resp.toLowerCase() !== 's') { console.log(''); process.exit(0); }
    salvarNoEnv('YOUTUBE_REFRESH_TOKEN', '');
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt:      'consent',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
    ],
  });

  console.log('\n' + '─'.repeat(57));
  console.log('\n  PASSO 1 — No Google Cloud Console:\n');
  console.log('  Credenciais → seu OAuth Client ID → Redirect URIs\n');
  console.log('  Adicione exatamente:\n');
  console.log('     http://localhost:4006/oauth2callback\n');
  console.log('─'.repeat(57));
  console.log('\n  PASSO 2 — Abra este link no seu celular ou computador:\n');
  console.log('  ' + authUrl);
  console.log('\n─'.repeat(57));
  console.log('\n  PASSO 3 — Após clicar em "Permitir":');
  console.log('  O navegador vai tentar abrir localhost e mostrar erro de conexão.');
  console.log('  Isso é NORMAL. Copie a URL COMPLETA da barra do navegador.\n');
  console.log('  Ela começa assim:');
  console.log('  http://localhost:4006/oauth2callback?code=4/0A...\n');
  console.log('─'.repeat(57) + '\n');

  const input = await perguntar('  Cole a URL completa aqui: ');

  if (!input) {
    console.log('\n❌ Nenhuma URL informada.\n');
    process.exit(1);
  }

  // Extrai o code da URL colada
  let code;
  try {
    const parsed = new urlModule.URL(input);
    code = parsed.searchParams.get('code');
    const error = parsed.searchParams.get('error');
    if (error) throw new Error(`Acesso negado: ${error}`);
  } catch (e) {
    if (e.message.startsWith('Acesso negado')) throw e;
    // Tenta extrair manualmente se a URL não for válida
    const match = input.match(/[?&]code=([^&]+)/);
    code = match ? decodeURIComponent(match[1]) : null;
  }

  if (!code) {
    console.log('\n❌ Código não encontrado na URL. Verifique se colou a URL completa.\n');
    process.exit(1);
  }

  console.log('\n  ✓ Código extraído com sucesso');
  console.log('  ⏳ Obtendo tokens...');

  const { tokens } = await oauth2.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      'Refresh token não recebido.\n' +
      '  Acesse myaccount.google.com/permissions, revogue o app e rode novamente.'
    );
  }

  salvarNoEnv('YOUTUBE_REFRESH_TOKEN', tokens.refresh_token);
  if (tokens.access_token) salvarNoEnv('YOUTUBE_ACCESS_TOKEN', tokens.access_token);

  console.log('  ✓ Refresh Token salvo no .env');

  oauth2.setCredentials(tokens);
  const yt    = google.youtube({ version: 'v3', auth: oauth2 });
  const canal = await yt.channels.list({ part: ['snippet'], mine: true });
  const nomeCanal = canal.data.items?.[0]?.snippet?.title || '(desconhecido)';

  console.log('\n' + '═'.repeat(57));
  console.log('  ✅  AUTENTICAÇÃO CONCLUÍDA!');
  console.log('═'.repeat(57));
  console.log(`\n  📺 Canal: ${nomeCanal}`);
  console.log('  🔑 Refresh Token salvo com sucesso');
  console.log('\n  Upload automático pronto. Use a opção 3 no menu.\n');
  console.log('═'.repeat(57) + '\n');
}

main().catch(e => {
  console.error('\n❌ Erro:', e.message);

  if (e.message.includes('redirect_uri_mismatch')) {
    console.log('\n  Adicione no Google Cloud Console → Redirect URIs:\n');
    console.log('     http://localhost:4006/oauth2callback\n');
  } else if (e.message.includes('invalid_grant')) {
    console.log('\n  Código expirado. Rode novamente e cole a URL mais rápido.\n');
  } else if (e.message.includes('invalid_client')) {
    console.log('\n  Client ID ou Secret inválidos. Verifique o .env.\n');
  }

  process.exit(1);
});
