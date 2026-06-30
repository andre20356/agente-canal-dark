#!/usr/bin/env node
require('dotenv').config();

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const { gerarRoteiro }        = require('./pipeline/0_roteirista');
const { sugerirTemas, gerarPromptParaUsuario } = require('./pipeline/1_temas');
const { processarSEO }        = require('./pipeline/2_seo');
const { processarNarracao }   = require('./pipeline/3_narracao');
const { processarStoryboard } = require('./pipeline/4_storyboard');
const { processarThumbnail }  = require('./pipeline/5_thumbnail');
const { uploadYouTube }       = require('./pipeline/6_upload');
const memoria                 = require('./memory/gerenciador');
const config                  = require('./config/config');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pergunta = (txt) => new Promise(res => rl.question(txt, res));

function cabecalho() {
  console.log('\n' + '═'.repeat(55));
  console.log('  📁  ARQUIVO SOMBRIO — PRODUTOR AUTÔNOMO');
  console.log('  🎬  Dark/Mistérios | YouTube Brasil');
  console.log('═'.repeat(55));
  const mem = memoria.carregar();
  console.log(`  📊  Vídeos produzidos: ${mem.metricas_globais.total_videos}`);
  const apis = [];
  if (config.apis.gemini)            apis.push('🤖 Gemini');
  if (config.apis.elevenlabs)        apis.push('🎙️ ElevenLabs');
  if (process.env.YOUTUBE_REFRESH_TOKEN) apis.push('📺 YouTube');
  if (!apis.length) apis.push('⚠️  Sem APIs configuradas');
  console.log(`  🔌  ${apis.join(' | ')}`);
  console.log('═'.repeat(55) + '\n');
}

async function menuPrincipal() {
  console.log('O que deseja fazer?\n');
  console.log('  1. Produzir novo vídeo  (autônomo — Gemini gera o roteiro)');
  console.log('  2. Produzir com roteiro manual (sem API)');
  console.log('  3. Fazer upload no YouTube');
  console.log('  4. Ver temas sugeridos');
  console.log('  5. Ver histórico');
  console.log('  6. Sair\n');
  return pergunta('Escolha: ');
}

async function escolherTema() {
  const sugestoes = sugerirTemas(6);
  console.log('\n📌 Temas sugeridos:\n');
  sugestoes.forEach((t, i) => console.log(`  ${i + 1}. [${t.categoria.toUpperCase()}] ${t.tema}`));
  console.log('\n  0. Digitar meu próprio tema\n');

  const escolha = await pergunta('Escolha: ');

  if (escolha === '0') {
    const tema = await pergunta('\nDigite o tema: ');
    return { tema, categoria: 'misterio' };
  }

  const idx = parseInt(escolha) - 1;
  if (idx < 0 || idx >= sugestoes.length) throw new Error('Opção inválida');
  return sugestoes[idx];
}

async function processarPipeline(tema, categoria, roteiro) {
  const nomeBase = `${new Date().toISOString().split('T')[0]}_${tema.replace(/[^a-z0-9]/gi, '_').slice(0, 30).toLowerCase()}`;
  const dirOutput = path.join(__dirname, 'output', nomeBase);
  fs.mkdirSync(dirOutput, { recursive: true });

  fs.writeFileSync(path.join(dirOutput, `${nomeBase}_roteiro.txt`), roteiro);

  process.stdout.write('  🔍 Gerando SEO...');
  const seo = processarSEO(tema, categoria);
  fs.writeFileSync(path.join(dirOutput, `${nomeBase}_seo.json`), JSON.stringify(seo, null, 2));
  console.log(' ✓');

  process.stdout.write('  🎙️  Preparando narração...');
  const narracao = await processarNarracao(roteiro, dirOutput, nomeBase);
  console.log(` ✓  (~${narracao.duracao_estimada_min}min)`);

  process.stdout.write('  🎬 Criando storyboard...');
  const storyboard = processarStoryboard(roteiro, tema, dirOutput, nomeBase);
  console.log(` ✓  (${storyboard.total_cenas} cenas)`);

  process.stdout.write('  🖼️  Gerando thumbnail...');
  const thumbnail = processarThumbnail(tema, seo, storyboard, dirOutput, nomeBase);
  console.log(' ✓');

  memoria.registrarVideo(tema, seo.titulo_recomendado);

  return { nomeBase, dirOutput, seo, narracao, storyboard, thumbnail };
}

function exibirResultado(tema, nomeBase, seo, narracao) {
  console.log('\n' + '═'.repeat(55));
  console.log('  ✅  VÍDEO PRONTO PARA PRODUÇÃO!');
  console.log('═'.repeat(55));
  console.log(`\n  📂 output/${nomeBase}/\n`);
  console.log(`  🎯 Título: ${seo.titulo_recomendado}`);
  console.log(`  ⏱️  Duração estimada: ~${narracao.duracao_estimada_min}min`);
  console.log(`  🏷️  Tags: ${seo.tags.slice(0, 4).join(', ')}...\n`);
  console.log('  Arquivos gerados:');
  console.log(`    📄 _roteiro.txt       → roteiro completo`);
  console.log(`    📊 _seo.json          → título, descrição, tags`);
  console.log(`    🎙️  _narracao.txt      → texto pronto para TTS`);
  if (narracao.arquivo_audio) console.log(`    🔊 _narracao.mp3      → áudio gerado`);
  console.log(`    🎬 _storyboard.txt    → prompts visuais por cena`);
  console.log(`    🖼️  _thumbnail_prompt  → prompt para Bing/DALL-E`);
  console.log('\n' + '─'.repeat(55));
  console.log('  PRÓXIMOS PASSOS:');
  console.log('─'.repeat(55));
  if (!narracao.arquivo_audio) {
    console.log('\n  🎙️  Narração: cole o _narracao.txt no ElevenLabs ou Murf.ai');
  }
  console.log('\n  🖼️  Thumbnail: abra _thumbnail_prompt.txt → cole no bing.com/create');
  console.log('\n  🎬 Montagem: use CapCut ou DaVinci (gratuitos) + storyboard');
  console.log(`\n  📺 Upload YouTube:\n     Título → ${seo.titulo_recomendado}`);
  console.log('═'.repeat(55) + '\n');
}

// ─── Modo autônomo (Gemini) ───────────────────────────────────────────────────
async function produzirAutonomo() {
  if (!config.apis.gemini) {
    console.log('\n⚠️  GEMINI_API_KEY não configurada.\n');
    console.log('  1. Acesse: studio.google.com');
    console.log('  2. Clique em "Get API Key"');
    console.log('  3. Copie a chave e adicione no arquivo .env:\n');
    console.log('     GEMINI_API_KEY=sua_chave_aqui\n');
    return;
  }

  const { tema, categoria } = await escolherTema();
  console.log(`\n✅ Tema: "${tema}"\n`);
  console.log('─'.repeat(55));
  console.log('  GERANDO CONTEÚDO AUTOMATICAMENTE...');
  console.log('─'.repeat(55) + '\n');

  const roteiro = await gerarRoteiro(tema, config.canal.duracaoMediaMinutos);
  const { nomeBase, seo, narracao } = await processarPipeline(tema, categoria, roteiro);
  exibirResultado(tema, nomeBase, seo, narracao);
}

// ─── Modo manual (sem API) ────────────────────────────────────────────────────
async function produzirManual() {
  const { tema, categoria } = await escolherTema();
  console.log(`\n✅ Tema: "${tema}"\n`);

  console.log('─'.repeat(55));
  console.log('  PROMPT PARA CLAUDE.AI / CHATGPT / GEMINI.GOOGLE.COM');
  console.log('─'.repeat(55));
  console.log('\n' + gerarPromptParaUsuario(tema));
  console.log('\n' + '─'.repeat(55));
  console.log('\nCopie o prompt acima, gere o roteiro e cole abaixo.');
  console.log('Pressione ENTER duas vezes para finalizar.\n');

  await pergunta('Pressione ENTER quando tiver o roteiro pronto...');
  console.log('\nCole o roteiro:\n');

  const linhas = [];
  let vazias = 0;
  const rlIn = readline.createInterface({ input: process.stdin });
  const roteiro = await new Promise(resolve => {
    rlIn.on('line', l => {
      if (l === '') { vazias++; if (vazias >= 2) { rlIn.close(); resolve(linhas.join('\n')); } else linhas.push(l); }
      else { vazias = 0; linhas.push(l); }
    });
    rlIn.on('close', () => resolve(linhas.join('\n')));
  });

  if (!roteiro.trim()) { console.log('\n❌ Nenhum roteiro recebido.\n'); return; }

  console.log(`\n✅ ${roteiro.split(/\s+/).length} palavras recebidas\n`);
  console.log('─'.repeat(55));
  console.log('  PROCESSANDO...');
  console.log('─'.repeat(55) + '\n');

  const { nomeBase, seo, narracao } = await processarPipeline(tema, categoria, roteiro);
  exibirResultado(tema, nomeBase, seo, narracao);
}

// ─── Upload YouTube ───────────────────────────────────────────────────────────
async function fazerUpload() {
  if (!process.env.YOUTUBE_REFRESH_TOKEN) {
    console.log('\n⚠️  YouTube não autenticado.\n');
    console.log('  Execute primeiro: node scripts/autenticar_youtube.js\n');
    return;
  }

  const outputDir = path.join(__dirname, 'output');
  const pastas = fs.readdirSync(outputDir)
    .filter(f => fs.statSync(path.join(outputDir, f)).isDirectory())
    .sort()
    .reverse();

  if (!pastas.length) { console.log('\n  Nenhum vídeo produzido ainda.\n'); return; }

  console.log('\n📂 Vídeos disponíveis:\n');
  pastas.slice(0, 10).forEach((p, i) => {
    const temVideo = fs.readdirSync(path.join(outputDir, p)).some(f => /\.(mp4|mkv|mov|avi)$/i.test(f));
    const temUpload = fs.existsSync(path.join(outputDir, p, 'youtube_upload.json'));
    const status = temUpload ? '✅ já enviado' : temVideo ? '🎬 pronto' : '⏳ sem vídeo';
    console.log(`  ${i + 1}. [${status}] ${p}`);
  });
  console.log('');

  const escolha = parseInt(await pergunta('Escolha o vídeo: ')) - 1;
  if (isNaN(escolha) || escolha < 0 || escolha >= pastas.slice(0, 10).length) {
    console.log('\n❌ Opção inválida.\n'); return;
  }

  const dirOutput = path.join(outputDir, pastas[escolha]);
  const arquivos = fs.readdirSync(dirOutput);
  const temVideo = arquivos.some(f => /\.(mp4|mkv|mov|avi)$/i.test(f));

  if (!temVideo) {
    console.log('\n⚠️  Nenhum arquivo de vídeo (.mp4) encontrado nesta pasta.\n');
    console.log('  Após editar o vídeo no CapCut/DaVinci, salve o .mp4 em:');
    console.log(`  ${dirOutput}\n`);
    return;
  }

  console.log('\n  Privacidade do vídeo:');
  console.log('  1. Privado    (só você vê — recomendado para revisar)');
  console.log('  2. Não listado (link direto, não aparece na busca)');
  console.log('  3. Público    (visível para todos)\n');
  const priv = await pergunta('Escolha: ');
  const privacidade = priv === '2' ? 'unlisted' : priv === '3' ? 'public' : 'private';

  console.log('\n─'.repeat(55));
  console.log('  FAZENDO UPLOAD...');
  console.log('─'.repeat(55) + '\n');

  try {
    const resultado = await uploadYouTube(dirOutput, { privacidade });

    console.log('═'.repeat(55));
    console.log('  ✅  UPLOAD CONCLUÍDO!');
    console.log('═'.repeat(55));
    console.log(`\n  🔗 URL: ${resultado.url}`);
    console.log(`  🔒 Status: ${resultado.privacidade}`);
    console.log(`  🎬 Video ID: ${resultado.video_id}\n`);
    console.log('  Resultado salvo em youtube_upload.json\n');
  } catch (e) {
    console.error('\n❌ Erro no upload:', e.message, '\n');
  }
}

// ─── Loop contínuo (24/7) ─────────────────────────────────────────────────────
async function modoContinuo(intervaloHoras = 4) {
  console.log(`\n🔄 Modo contínuo ativado — produzindo a cada ${intervaloHoras}h\n`);

  if (!config.apis.gemini) {
    console.log('❌ GEMINI_API_KEY necessária para modo contínuo. Configure o .env.\n');
    process.exit(1);
  }

  const rodar = async () => {
    console.log('\n' + '═'.repeat(55));
    console.log(`  🔄 NOVO CICLO — ${new Date().toLocaleString('pt-BR')}`);
    console.log('═'.repeat(55));
    try {
      const sugestoes = sugerirTemas(1);
      if (!sugestoes.length) { console.log('  ⚠️  Todos os temas utilizados. Reiniciando lista...'); return; }
      const { tema, categoria } = sugestoes[0];
      console.log(`  📌 Tema: "${tema}"\n`);
      const roteiro = await gerarRoteiro(tema, config.canal.duracaoMediaMinutos);
      const { nomeBase, seo, narracao } = await processarPipeline(tema, categoria, roteiro);
      console.log(`\n  ✅ Pronto: output/${nomeBase}/`);
      console.log(`  🎯 Título: ${seo.titulo_recomendado}\n`);
    } catch (e) {
      console.error(`  ❌ Erro no ciclo: ${e.message}`);
    }
    console.log(`  ⏳ Próximo ciclo em ${intervaloHoras}h\n`);
  };

  await rodar();
  setInterval(rodar, intervaloHoras * 60 * 60 * 1000);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  // Modo contínuo via linha de comando: node cli.js continuo [horas]
  if (args[0] === 'continuo') {
    cabecalho();
    await modoContinuo(parseFloat(args[1]) || 4);
    return;
  }

  cabecalho();

  while (true) {
    const opcao = await menuPrincipal();
    if (opcao === '1') await produzirAutonomo();
    else if (opcao === '2') await produzirManual();
    else if (opcao === '3') await fazerUpload();
    else if (opcao === '4') {
      const s = sugerirTemas(10);
      console.log('\n💡 Temas disponíveis:\n');
      s.forEach((t, i) => console.log(`  ${i+1}. [${t.categoria.toUpperCase()}] ${t.tema}`));
      console.log('');
    }
    else if (opcao === '5') {
      const mem = memoria.carregar();
      if (!mem.temas_utilizados.length) { console.log('\n  Nenhum vídeo produzido ainda.\n'); continue; }
      console.log('\n📺 Histórico:\n');
      mem.temas_utilizados.slice(-10).reverse().forEach(v => {
        const status = v.status === 'publicado' ? '✅' : '⏳';
        console.log(`  ${status} ${v.data?.split('T')[0]} — ${v.tema}`);
      });
      console.log('');
    }
    else if (opcao === '6') { console.log('\nAté logo! 👋\n'); rl.close(); process.exit(0); }
    else console.log('\nOpção inválida.\n');
  }
}

main().catch(err => { console.error('Erro fatal:', err.message); process.exit(1); });
