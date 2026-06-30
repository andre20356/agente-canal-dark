const temas = require('../templates/temas');
const { gerarPromptRoteiro } = require('../templates/prompts');
const memoria = require('../memory/gerenciador');

function sugerirTemas(quantidade = 5) {
  const mem = memoria.carregar();
  const usados = mem.temas_utilizados.map(t => t.tema.toLowerCase());

  const disponiveis = temas.filter(t =>
    !usados.some(u => u.includes(t.tema.toLowerCase().slice(0, 20)))
  );

  // Embaralha e pega os primeiros N
  const embaralhados = disponiveis.sort(() => Math.random() - 0.5);
  return embaralhados.slice(0, quantidade);
}

function gerarPromptParaUsuario(tema, duracaoMin = 12) {
  return gerarPromptRoteiro(tema, duracaoMin);
}

function listarCategorias() {
  const cats = [...new Set(temas.map(t => t.categoria))];
  return cats;
}

function temasPorCategoria(categoria) {
  return temas.filter(t => t.categoria === categoria);
}

module.exports = { sugerirTemas, gerarPromptParaUsuario, listarCategorias, temasPorCategoria };
