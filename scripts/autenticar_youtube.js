#!/usr/bin/env node
/**
 * Autenticação OAuth2 do YouTube — executa UMA VEZ.
 * Salva o refresh_token no .env automaticamente.
 *
 * Como usar:
 *   node scripts/autenticar_youtube.js
 */

require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '.env');

function lerEnv() {
  try { return fs.readFileSync(ENV_PATH, 'utf8'); } catch { return ''; }
}

function salvarNoEnv(chave, valor) {
  let conteudo = lerEnv();
  const regex = new RegExp(`^${chave}=.*$`, 'm');
  if (regex.test(conteudo)) {
    conteudo = conteudo.replace(regex, `${chave}=${valor}`);
  } else {
    conteudo += `\n${chave}=${valor}`;
  }
  fs.writeFileSync(ENV_PATH, conteudo);
}

const pergunta = (txt) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(txt, ans => { rl.close(); res(ans.trim()); }));
};

async function main() {
  console.log('\n' + '═'.repeat(55));
  console.log('  📺  AUTENTICAÇÃO YOUTUBE — ARQUIVO SOMBRIO');
  console.log('═'.repeat(55));
  console.log('\nEste script precisa ser executado UMA VEZ para vincular');
  console.log('sua conta do YouTube ao sistema.\n');

  // Verificar se já tem credenciais OAuth no .env
  const clientId     = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log('⚠️  YOUTUBE_CLIENT_ID e YOUTUBE_CLIENT_SECRET não encontrados no .env\n');
    console.log('COMO OBTER AS CREDENCIAIS:\n');
    console.log('  1. Acesse: console.cloud.google.com');
    console.log('  2. Selecione o mesmo projeto onde criou a chave Gemini');
    console.log('  3. Menu → APIs e Serviços → Biblioteca');
    console.log('  4. Busque "YouTube Data API v3" → Ativar');
    console.log('  5. Menu → APIs e Serviços → Credenciais');
    console.log('  6. + Criar credencial → ID do cliente OAuth 2.0');
    console.log('  7. Tipo: Aplicativo para computador');
    console.log('  8. Copie o Client ID e Client Secret');
    console.log('  9. Adicione no .env:\n');
    console.log('     YOUTUBE_CLIENT_ID=seu_client_id');
    console.log('     YOUTUBE_CLIENT_SECRET=seu_client_secret\n');
    console.log('Depois rode novamente: node scripts/autenticar_youtube.js\n');
    process.exit(1);
  }

  // Verificar se já tem refresh token
  if (process.env.YOUTUBE_REFRESH_TOKEN) {
    console.log('✅ YouTube já está autenticado!\n');
    const resposta = await pergunta('Deseja reautenticar? (s/N): ');
    if (resposta.toLowerCase() !== 's') { process.exit(0); }
  }

  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'urn:ietf:wg:oauth:2.0:oob'  // modo desktop: usuário cola o código
  );

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
    ],
    prompt: 'consent',  // força geração de refresh_token
  });

  console.log('─'.repeat(55));
  console.log('\n1. Abra este link no navegador:\n');
  console.log('   ' + authUrl);
  console.log('\n2. Faça login com a conta do YouTube que receberá os vídeos');
  console.log('3. Autorize o acesso');
  console.log('4. Copie o código que aparecer na tela\n');
  console.log('─'.repeat(55) + '\n');

  const codigo = await pergunta('Cole o código aqui: ');
  if (!codigo) { console.log('\n❌ Nenhum código informado.\n'); process.exit(1); }

  console.log('\n⏳ Validando...');

  try {
    const { tokens } = await oauth2.getToken(codigo);
    oauth2.setCredentials(tokens);

    if (!tokens.refresh_token) {
      console.log('\n⚠️  Refresh token não recebido. Tente novamente com ?prompt=consent');
      process.exit(1);
    }

    // Salvar tokens no .env
    salvarNoEnv('YOUTUBE_REFRESH_TOKEN', tokens.refresh_token);
    if (tokens.access_token)  salvarNoEnv('YOUTUBE_ACCESS_TOKEN', tokens.access_token);

    // Buscar nome do canal para confirmar
    const yt = google.youtube({ version: 'v3', auth: oauth2 });
    const canal = await yt.channels.list({ part: ['snippet'], mine: true });
    const nomeCanal = canal.data.items?.[0]?.snippet?.title || '(desconhecido)';

    console.log('\n' + '═'.repeat(55));
    console.log('  ✅  YOUTUBE AUTENTICADO COM SUCESSO!');
    console.log('═'.repeat(55));
    console.log(`\n  📺 Canal: ${nomeCanal}`);
    console.log('  🔑 Refresh token salvo no .env');
    console.log('\n  Agora use a opção 5 no menu principal para fazer upload.\n');
    console.log('═'.repeat(55) + '\n');

  } catch (e) {
    console.error('\n❌ Erro na autenticação:', e.message);
    if (e.message.includes('invalid_grant')) {
      console.log('\n  O código expirou ou já foi usado. Rode novamente e use um código novo.\n');
    }
    process.exit(1);
  }
}

main();
