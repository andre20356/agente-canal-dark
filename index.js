#!/usr/bin/env node
require('dotenv').config();
const config = require('./config/config');
const logger = require('./utils/logger');
const { executarCiclo } = require('./agents/agent10_gerente');
const { gerarRelatorioDiario, gerarRelatorioSemanal } = require('./utils/relatorios');

function exibirPainel() {
  const linhas = [
    '',
    '╔══════════════════════════════════════════════════════════╗',
    `║         ${config.canal.nome.toUpperCase().padEnd(48)}║`,
    '║         SISTEMA AUTÔNOMO DE PRODUÇÃO — DARK/MISTÉRIOS   ║',
    '╠══════════════════════════════════════════════════════════╣',
    `║  Agente 1  │ Pesquisador de Tendências        │ ATIVO   ║`,
    `║  Agente 2  │ Analista de Concorrência         │ ATIVO   ║`,
    `║  Agente 3  │ Estrategista de Conteúdo         │ ATIVO   ║`,
    `║  Agente 4  │ Roteirista                       │ ATIVO   ║`,
    `║  Agente 5  │ Diretor Visual / Storyboard      │ ATIVO   ║`,
    `║  Agente 6  │ Gerador de Narração              │ ATIVO   ║`,
    `║  Agente 7  │ Especialista SEO                 │ ATIVO   ║`,
    `║  Agente 8  │ Especialista em Thumbnail        │ ATIVO   ║`,
    `║  Agente 9  │ Controle de Qualidade            │ ATIVO   ║`,
    `║  Agente 10 │ Gerente Geral                    │ ATIVO   ║`,
    '╠══════════════════════════════════════════════════════════╣',
    `║  Claude API   │ ${config.apis.anthropic ? '✓ Configurado' : '✗ Não configurado'}${''.padEnd(config.apis.anthropic ? 27 : 22)}║`,
    `║  ElevenLabs   │ ${config.apis.elevenlabs ? '✓ Configurado' : '✗ Não configurado — voz desativada'}${''.padEnd(config.apis.elevenlabs ? 27 : 10)}║`,
    `║  OpenAI/DALL-E│ ${config.apis.openai ? '✓ Configurado' : '✗ Não configurado — thumbnail manual'}${''.padEnd(config.apis.openai ? 27 : 9)}║`,
    '╠══════════════════════════════════════════════════════════╣',
    `║  Nota mínima  │ ${config.producao.notaQualidadeMinima}/100                                    ║`,
    `║  Meta CTR     │ ${config.producao.ctrMeta}%                                       ║`,
    `║  Meta retenção│ ${config.producao.retencaoMeta}%                                       ║`,
    '╚══════════════════════════════════════════════════════════╝',
    '',
  ];
  linhas.forEach(l => console.log(l));
}

async function iniciar() {
  exibirPainel();

  if (!config.apis.anthropic) {
    logger.error('ANTHROPIC_API_KEY não configurada. Adicione ao arquivo .env');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const modo = args[0] || 'ciclo';

  if (modo === 'relatorio-diario') {
    await gerarRelatorioDiario();
    return;
  }

  if (modo === 'relatorio-semanal') {
    await gerarRelatorioSemanal();
    return;
  }

  if (modo === 'ciclo') {
    logger.info('[Sistema] Iniciando ciclo único de produção...');
    const resultado = await executarCiclo();
    if (resultado.aprovado) {
      logger.info(`\n[Sistema] ✓ Vídeo pronto: "${resultado.tema}"`);
      logger.info('[Sistema] Arquivos gerados em: ./output/');
    }
    return;
  }

  if (modo === 'continuo') {
    logger.info('[Sistema] Modo contínuo ativado — produzindo vídeos em loop...');
    const intervaloHoras = parseFloat(args[1]) || 4;
    const intervaloMs = intervaloHoras * 60 * 60 * 1000;

    let ciclosHoje = 0;
    const inicioDia = new Date().toDateString();

    const rodar = async () => {
      const diaAtual = new Date().toDateString();
      if (diaAtual !== inicioDia) {
        if (ciclosHoje > 0) await gerarRelatorioDiario();
        ciclosHoje = 0;
      }
      await executarCiclo();
      ciclosHoje++;
      if (ciclosHoje % 7 === 0) await gerarRelatorioSemanal();
      logger.info(`[Sistema] Próximo ciclo em ${intervaloHoras}h`);
    };

    await rodar();
    setInterval(rodar, intervaloMs);
    return;
  }

  logger.error(`Modo inválido: ${modo}. Use: ciclo | continuo [intervalo_horas] | relatorio-diario | relatorio-semanal`);
  process.exit(1);
}

iniciar().catch(err => {
  logger.error(`Erro fatal: ${err.message}`);
  process.exit(1);
});
