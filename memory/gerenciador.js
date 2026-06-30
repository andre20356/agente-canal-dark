const fs = require('fs');
const path = require('path');

const ARQUIVO = path.join(__dirname, 'memoria.json');

function carregar() {
  if (!fs.existsSync(ARQUIVO)) {
    const vazio = {
      temas_utilizados: [], videos_produzidos: [],
      metricas_globais: { total_videos: 0, ctr_medio: 0, retencao_media: 0, inscritosAtual: 0, viewsTotais: 0 },
      erros_detectados: [], acertos_detectados: [],
      prompts_otimizados: {},
      estrategia_atual: { versao: 1, atualizado_em: null, foco_atual: 'crescimento inicial', evitar: [], priorizar: [] },
      resumos_diarios: [], resumos_semanais: [], resumos_mensais: [],
    };
    fs.writeFileSync(ARQUIVO, JSON.stringify(vazio, null, 2));
    return vazio;
  }
  return JSON.parse(fs.readFileSync(ARQUIVO, 'utf-8'));
}

function salvar(dados) {
  fs.writeFileSync(ARQUIVO, JSON.stringify(dados, null, 2));
}

function registrarMetrica(tema, metricas) {
  const mem = carregar();
  const entrada = mem.temas_utilizados.find(t => t.tema === tema);
  if (entrada) {
    entrada.metricas_reais = metricas;
    entrada.status = 'publicado';
    // Atualiza médias globais
    const publicados = mem.temas_utilizados.filter(t => t.metricas_reais);
    if (publicados.length > 0) {
      mem.metricas_globais.ctr_medio = publicados.reduce((s, t) => s + (t.metricas_reais.ctr || 0), 0) / publicados.length;
      mem.metricas_globais.retencao_media = publicados.reduce((s, t) => s + (t.metricas_reais.retencao || 0), 0) / publicados.length;
    }
    salvar(mem);
  }
}

module.exports = { carregar, salvar, registrarMetrica };
