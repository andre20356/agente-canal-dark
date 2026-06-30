// SEO por templates — sem necessidade de API

const ESTRUTURAS_TITULO = [
  'A verdade sobre {tema} que ninguém te conta',
  'O mistério de {tema} finalmente revelado',
  '{tema}: o que realmente aconteceu',
  'Por que {tema} ainda assusta até hoje',
  'A história perturbadora de {tema}',
  '{tema} — o caso que o governo tentou esconder',
  'Você não vai acreditar no que aconteceu com {tema}',
  'O segredo sombrio por trás de {tema}',
  '{tema}: a verdade que foi apagada da história',
  'O que ninguém sabe sobre {tema}',
];

const HASHTAGS_BASE = [
  '#misterios', '#crimesreais', '#truecrime', '#conspiracao',
  '#historiasnegras', '#arquivosombrio', '#misteriobrasil',
  '#fenomenosinexplicaveis', '#casosreais', '#darkweb',
  '#historiareal', '#investigacao', '#desaparecimentos',
  '#criminalidade', '#fenomenos',
];

const TAGS_BASE = [
  'mistérios', 'crimes reais', 'true crime brasil', 'conspirações',
  'fenômenos inexplicáveis', 'casos não resolvidos', 'história sombria',
  'arquivo sombrio', 'investigação', 'desaparecimentos misteriosos',
];

function gerarTitulos(tema) {
  return ESTRUTURAS_TITULO.map(estrutura => {
    const titulo = estrutura.replace(/{tema}/g, tema);
    return {
      titulo: titulo.slice(0, 60),
      caracteres: titulo.length,
      truncado: titulo.length > 60,
    };
  });
}

function selecionarMelhorTitulo(tema) {
  const titulos = gerarTitulos(tema);
  // Prioriza títulos que cabem em 60 chars e usam "verdade" ou "mistério"
  const candidatos = titulos.filter(t => !t.truncado);
  return candidatos[0]?.titulo || titulos[0].titulo.slice(0, 60);
}

function gerarDescricao(tema, tituloEscolhido, palavrasChave = []) {
  const kws = [...TAGS_BASE.slice(0, 5), ...palavrasChave].join(', ');
  return `${tituloEscolhido}

Neste vídeo do Arquivo Sombrio, mergulhamos fundo em uma das histórias mais perturbadoras já documentadas: ${tema}.

Uma história real. Fatos verificados. E muitas perguntas sem resposta.

🔔 Inscreva-se e ative o sininho para não perder nenhum mistério.
👍 Deixe seu like se esse conteúdo te impactou.
💬 Comenta o que você acha que realmente aconteceu.

━━━━━━━━━━━━━━━━━━━━━━━
📌 Conteúdo baseado em fatos reais e documentados.
━━━━━━━━━━━━━━━━━━━━━━━

Palavras-chave: ${kws}

#ArquivoSombrio #MistériosBrasil #TrueCrime`;
}

function gerarTags(tema) {
  const palavrasTema = tema.toLowerCase()
    .replace(/[^a-záéíóúâêîôûãõç\s]/g, '')
    .split(' ')
    .filter(p => p.length > 3);

  return [...new Set([...TAGS_BASE, ...palavrasTema])].slice(0, 30);
}

function gerarHashtags(categoria = '') {
  const extras = {
    crime: ['#criminalidade', '#assassinato', '#policia'],
    conspiracao: ['#conspiracao', '#governosecreta', '#verdadeoculta'],
    desaparecimento: ['#desaparecidos', '#casomisterioso'],
    inexplicavel: ['#paranormal', '#fenomenos', '#inexplicavel'],
    lugar: ['#lugaresabandonados', '#lugaresproibidos'],
    historia: ['#historiareal', '#historianegra'],
    moderno: ['#darkweb', '#hackers', '#tecnologia'],
  };
  return [...HASHTAGS_BASE, ...(extras[categoria] || [])].slice(0, 15);
}

function gerarCapitulos(secoes) {
  if (!secoes || !secoes.length) return [];
  return secoes.map(s => ({ tempo: s.inicio || '0:00', titulo: s.nome }));
}

function processarSEO(tema, categoria = '', secoes = [], palavrasChaveExtras = []) {
  const titulos = gerarTitulos(tema);
  const tituloRecomendado = selecionarMelhorTitulo(tema);
  const descricao = gerarDescricao(tema, tituloRecomendado, palavrasChaveExtras);
  const tags = gerarTags(tema);
  const hashtags = gerarHashtags(categoria);
  const capitulos = gerarCapitulos(secoes);

  return {
    titulo_recomendado: tituloRecomendado,
    todos_titulos: titulos,
    descricao,
    tags,
    hashtags,
    capitulos,
    thumbnail_texto: extrairTextoCurto(tema),
    categoria_youtube: 'Entretenimento',
    idioma: 'pt-BR',
  };
}

function extrairTextoCurto(tema) {
  // Pega as 2-3 palavras mais impactantes do tema
  const stopwords = ['que', 'com', 'para', 'uma', 'por', 'não', 'foi', 'são', 'mas', 'ele', 'ela', 'seu', 'sua'];
  const palavras = tema.split(' ').filter(p => !stopwords.includes(p.toLowerCase()) && p.length > 3);
  return palavras.slice(0, 3).join(' ').toUpperCase().slice(0, 25);
}

module.exports = { processarSEO, gerarTitulos, selecionarMelhorTitulo };
