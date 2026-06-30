const fs = require('fs');
const path = require('path');
const memoria = require('../memory/gerenciador');
const logger = require('./logger');

async function gerarRelatorioDiario() {
  const mem = memoria.carregar();
  const hoje = new Date().toISOString().split('T')[0];
  const videosDia = mem.temas_utilizados.filter(t => t.data?.startsWith(hoje));

  const relatorio = {
    data: hoje,
    videos_produzidos: videosDia.length,
    temas: videosDia.map(t => t.tema),
    nota_media_qualidade: videosDia.length
      ? videosDia.reduce((s, t) => s + (t.nota_qualidade || 0), 0) / videosDia.length
      : 0,
    erros_do_dia: mem.erros_detectados.filter(e => e.data?.startsWith(hoje)),
    estrategia_versao: mem.estrategia_atual.versao,
  };

  const nomeArq = path.join(__dirname, `../reports/diario_${hoje}.json`);
  fs.writeFileSync(nomeArq, JSON.stringify(relatorio, null, 2));
  logger.info(`[Relatório] Diário gerado: ${nomeArq}`);
  return relatorio;
}

async function gerarRelatorioSemanal() {
  const mem = memoria.carregar();
  const semanaAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const videosSemana = mem.temas_utilizados.filter(t => t.data >= semanaAtras);

  const relatorio = {
    semana_inicio: semanaAtras.split('T')[0],
    semana_fim: new Date().toISOString().split('T')[0],
    total_videos: videosSemana.length,
    media_qualidade: videosSemana.length
      ? videosSemana.reduce((s, t) => s + (t.nota_qualidade || 0), 0) / videosSemana.length
      : 0,
    top_temas: videosSemana.sort((a, b) => (b.nota_qualidade || 0) - (a.nota_qualidade || 0)).slice(0, 5),
    total_acumulado: mem.metricas_globais.total_videos,
    erros_recorrentes: detectarErrosRecorrentes(mem.erros_detectados),
  };

  const nomeArq = path.join(__dirname, `../reports/semanal_${relatorio.semana_fim}.json`);
  fs.writeFileSync(nomeArq, JSON.stringify(relatorio, null, 2));
  logger.info(`[Relatório] Semanal gerado: ${nomeArq}`);
  return relatorio;
}

function detectarErrosRecorrentes(erros) {
  const contagem = {};
  erros.forEach(e => {
    const chave = (e.motivo || '').slice(0, 50);
    contagem[chave] = (contagem[chave] || 0) + 1;
  });
  return Object.entries(contagem)
    .filter(([, n]) => n > 1)
    .map(([motivo, ocorrencias]) => ({ motivo, ocorrencias }));
}

module.exports = { gerarRelatorioDiario, gerarRelatorioSemanal };
