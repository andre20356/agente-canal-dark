#!/usr/bin/env node
require('dotenv').config();

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const { sugerirTemas, gerarPromptParaUsuario } = require('./pipeline/1_temas');
const { processarSEO } = require('./pipeline/2_seo');
const { processarNarracao } = require('./pipeline/3_narracao');
const { processarStoryboard } = require('./pipeline/4_storyboard');
const { processarThumbnail } = require('./pipeline/5_thumbnail');
const memoria = require('./memory/gerenciador');
const config = require('./config/config');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pergunta = (txt) => new Promise(res => rl.question(txt, res));

function cabecalho() {
  console.log('\n' + '═'.repeat(55));
  console.log('  📁  ARQUIVO SOMBRIO — PRODUTOR DE CONTEÚDO');
  console.log('  🎬  Dark/Mistérios | YouTube Brasil');
  console.log('═'.repeat(55));
  const mem = memoria.carregar();
  console.log(`  📊  Vídeos produzidos: ${mem.metricas_globais.total_videos}`);
  const apis = [];
  if (config.apis.elevenlabs) apis.push('🎙️ ElevenLabs');
  if (config.apis.youtubeDataApi) apis.push('📺 YouTube API');
  if (!apis.length) apis.push('✏️  Modo manual (sem APIs extras)');
  console.log(`  🔌  ${apis.join(' | ')}`);
  console.log('═'.repeat(55) + '\n');
}

async function menuPrincipal() {
  console.log('O que deseja fazer?\n');
  console.log('  1. Produzir novo vídeo');
  console.log('  2. Ver temas sugeridos');
  console.log('  3. Ver histórico de produção');
  console.log('  4. Sair\n');
  return pergunta('Escolha: ');
}

async function fluxoNovoVideo() {
  console.log('\n' + '─'.repeat(55));
  console.log('  NOVO VÍDEO');
  console.log('─'.repeat(55));

  // Passo 1 — Escolha do tema
  const sugestoes = sugerirTemas(5);
  console.log('\n📌 Temas sugeridos:\n');
  sugestoes.forEach((t, i) => console.log(`  ${i + 1}. ${t.tema}`));
  console.log('\n  0. Digitar meu próprio tema\n');

  const escolha = await pergunta('Escolha um número ou 0 para tema próprio: ');
  let temaSelecionado, categoriaSelec;

  if (escolha === '0') {
    temaSelecionado = await pergunta('\nDigite o tema do vídeo: ');
    categoriaSelec = 'misterio';
  } else {
    const idx = parseInt(escolha) - 1;
    if (idx < 0 || idx >= sugestoes.length) {
      console.log('Opção inválida.');
      return;
    }
    temaSelecionado = sugestoes[idx].tema;
    categoriaSelec = sugestoes[idx].categoria;
  }

  console.log(`\n✅ Tema escolhido: "${temaSelecionado}"\n`);

  // Passo 2 — Gerar prompt e aguardar roteiro
  console.log('─'.repeat(55));
  console.log('  PASSO 1 DE 2 — GERAR O ROTEIRO');
  console.log('─'.repeat(55));
  console.log('\nCopie o prompt abaixo e cole no Claude.ai (claude.ai):');
  console.log('\n' + '▼'.repeat(55));
  console.log('\n' + gerarPromptParaUsuario(temaSelecionado));
  console.log('\n' + '▲'.repeat(55));

  console.log('\n🔗 Acesse: https://claude.ai');
  console.log('   → Cole o prompt acima');
  console.log('   → Copie o roteiro gerado');
  console.log('   → Volte aqui e cole abaixo\n');

  await pergunta('Pressione ENTER quando tiver o roteiro pronto...');

  // Coleta o roteiro (múltiplas linhas até linha vazia dupla)
  console.log('\nCole o roteiro abaixo (pressione ENTER duas vezes para finalizar):\n');
  const linhasRoteiro = [];
  let linhasVazias = 0;

  const rlRoteiro = readline.createInterface({ input: process.stdin });
  const roteiro = await new Promise(resolve => {
    rlRoteiro.on('line', linha => {
      if (linha === '') {
        linhasVazias++;
        if (linhasVazias >= 2) {
          rlRoteiro.close();
          resolve(linhasRoteiro.join('\n'));
        } else {
          linhasRoteiro.push(linha);
        }
      } else {
        linhasVazias = 0;
        linhasRoteiro.push(linha);
      }
    });
    rlRoteiro.on('close', () => resolve(linhasRoteiro.join('\n')));
  });

  if (!roteiro.trim()) {
    console.log('\n❌ Nenhum roteiro detectado. Operação cancelada.');
    return;
  }

  console.log(`\n✅ Roteiro recebido: ${roteiro.split(/\s+/).length} palavras\n`);

  // Passo 3 — Processar tudo automaticamente
  console.log('─'.repeat(55));
  console.log('  PASSO 2 DE 2 — PROCESSANDO AUTOMATICAMENTE');
  console.log('─'.repeat(55));

  // Cria pasta de output
  const nomeBase = `${new Date().toISOString().split('T')[0]}_${temaSelecionado.replace(/[^a-z0-9]/gi, '_').slice(0, 30).toLowerCase()}`;
  const dirOutput = path.join(__dirname, 'output', nomeBase);
  fs.mkdirSync(dirOutput, { recursive: true });

  // Salva roteiro original
  fs.writeFileSync(path.join(dirOutput, `${nomeBase}_roteiro.txt`), roteiro);

  // SEO
  process.stdout.write('  🔍 Gerando SEO e títulos...');
  const seo = processarSEO(temaSelecionado, categoriaSelec);
  fs.writeFileSync(path.join(dirOutput, `${nomeBase}_seo.json`), JSON.stringify(seo, null, 2));
  console.log(' ✓');

  // Narração
  process.stdout.write('  🎙️  Preparando narração...');
  const narracao = await processarNarracao(roteiro, dirOutput, nomeBase);
  console.log(` ✓ ${narracao.duracao_estimada_min}min estimados`);

  // Storyboard
  process.stdout.write('  🎬 Criando storyboard e prompts visuais...');
  const storyboard = processarStoryboard(roteiro, temaSelecionado, dirOutput, nomeBase);
  console.log(` ✓ ${storyboard.total_cenas} cenas`);

  // Thumbnail
  process.stdout.write('  🖼️  Gerando conceito de thumbnail...');
  const thumbnail = processarThumbnail(temaSelecionado, seo, storyboard, dirOutput, nomeBase);
  console.log(' ✓');

  // Registra na memória
  memoria.registrarVideo(temaSelecionado, seo.titulo_recomendado);

  // Relatório final
  console.log('\n' + '═'.repeat(55));
  console.log('  ✅  VÍDEO PRONTO PARA PRODUÇÃO!');
  console.log('═'.repeat(55));
  console.log(`\n  📂 Pasta: output/${nomeBase}/\n`);
  console.log('  Arquivos gerados:');
  console.log(`    📄 Roteiro      → ${nomeBase}_roteiro.txt`);
  console.log(`    📊 SEO          → ${nomeBase}_seo.json`);
  console.log(`    🎙️  Narração     → ${nomeBase}_narracao.txt`);
  if (narracao.arquivo_audio) console.log(`    🔊 Áudio        → ${nomeBase}_narracao.mp3`);
  console.log(`    🎬 Storyboard   → ${nomeBase}_storyboard.txt`);
  console.log(`    🖼️  Thumbnail    → ${nomeBase}_thumbnail_prompt.txt`);

  console.log('\n' + '─'.repeat(55));
  console.log('  PRÓXIMOS PASSOS:');
  console.log('─'.repeat(55));
  console.log('\n  1. 🎙️  Grave a narração com o texto salvo');
  if (!narracao.arquivo_audio) console.log('     → Use ElevenLabs, Murf.ai ou qualquer TTS gratuito');
  console.log('\n  2. 🖼️  Crie a thumbnail');
  console.log(`     → Abra ${nomeBase}_thumbnail_prompt.txt`);
  console.log('     → Cole o prompt no bing.com/create (gratuito)');
  console.log('\n  3. 🎬 Monte o vídeo');
  console.log('     → Use CapCut, DaVinci Resolve ou Kdenlive (gratuitos)');
  console.log('     → Siga o storyboard para as imagens/vídeos de cada cena');
  console.log('\n  4. 📺 Faça o upload no YouTube com:');
  console.log(`     → Título: ${seo.titulo_recomendado}`);
  console.log(`     → Tags: ${seo.tags.slice(0, 5).join(', ')}...`);
  console.log('\n' + '═'.repeat(55) + '\n');
}

async function verHistorico() {
  const mem = memoria.carregar();
  if (!mem.temas_utilizados.length) {
    console.log('\n  Nenhum vídeo produzido ainda.\n');
    return;
  }
  console.log('\n📺 Histórico de produção:\n');
  mem.temas_utilizados.slice(-10).reverse().forEach((v, i) => {
    const data = v.data ? v.data.split('T')[0] : '—';
    const status = v.status === 'publicado' ? '✅' : '⏳';
    console.log(`  ${status} ${data} — ${v.tema}`);
    if (v.titulo) console.log(`         → "${v.titulo}"`);
  });
  console.log('');
}

async function verSugestoes() {
  const sugestoes = sugerirTemas(10);
  console.log('\n💡 Temas disponíveis:\n');
  sugestoes.forEach((t, i) => {
    console.log(`  ${i + 1}. [${t.categoria.toUpperCase()}] ${t.tema}`);
  });
  console.log('');
}

async function main() {
  cabecalho();

  while (true) {
    const opcao = await menuPrincipal();

    if (opcao === '1') {
      await fluxoNovoVideo();
    } else if (opcao === '2') {
      await verSugestoes();
    } else if (opcao === '3') {
      await verHistorico();
    } else if (opcao === '4') {
      console.log('\nAté logo! 👋\n');
      rl.close();
      process.exit(0);
    } else {
      console.log('\nOpção inválida.\n');
    }
  }
}

main().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
