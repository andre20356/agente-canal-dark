const fs = require('fs');
const path = require('path');

const ARQUIVO = path.join(__dirname, 'memoria.json');

function carregar() {
  if (!fs.existsSync(ARQUIVO)) return _vazio();
  try {
    return JSON.parse(fs.readFileSync(ARQUIVO, 'utf-8'));
  } catch {
    return _vazio();
  }
}

function salvar(dados) {
  fs.writeFileSync(ARQUIVO, JSON.stringify(dados, null, 2));
}

function registrarVideo(tema, titulo, notaQualidade = null) {
  const mem = carregar();
  mem.temas_utilizados.push({
    tema,
    titulo,
    data: new Date().toISOString(),
    nota_qualidade: notaQualidade,
    status: 'produzido',
    metricas_reais: null,
  });
  mem.metricas_globais.total_videos++;
  salvar(mem);
}

function atualizarMetricas(tema, metricas) {
  const mem = carregar();
  const entrada = mem.temas_utilizados.find(t => t.tema === tema);
  if (entrada) {
    entrada.metricas_reais = metricas;
    entrada.status = 'publicado';
    salvar(mem);
  }
}

function _vazio() {
  return {
    temas_utilizados: [],
    metricas_globais: { total_videos: 0, views_totais: 0, inscritosAtual: 0 },
    estrategia: { priorizar: [], evitar: [] },
  };
}

module.exports = { carregar, salvar, registrarVideo, atualizarMetricas };
