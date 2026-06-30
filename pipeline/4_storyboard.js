const fs = require('fs');
const path = require('path');

// Templates visuais por tipo de seção — geram prompts prontos para DALL-E / Stable Diffusion / Bing
const TEMPLATES_VISUAIS = {
  'GANCHO': {
    estilo: 'extreme close-up, dramatic lighting, dark atmosphere, cinematic, 8k',
    elementos: 'mysterious shadow, foggy environment, abandoned place',
    cor: 'dark blue, black, cold tones',
  },
  'APRESENTAÇÃO': {
    estilo: 'wide shot, establishing scene, documentary style, dark atmosphere',
    elementos: 'historical setting, old photographs, newspaper clippings',
    cor: 'sepia tones, dark brown, aged look',
  },
  'DESENVOLVIMENTO': {
    estilo: 'medium shot, thriller atmosphere, suspenseful lighting, cinematic',
    elementos: 'evidence, crime scene, investigation board',
    cor: 'dark green, shadows, single light source',
  },
  'VIRADA': {
    estilo: 'dramatic angle, sudden reveal, high contrast lighting, cinematic',
    elementos: 'shocking discovery, unexpected element, reveal moment',
    cor: 'red accent, dark background, stark contrast',
  },
  'CLÍMAX': {
    estilo: 'intense close-up, maximum tension, dramatic lighting, cinematic thriller',
    elementos: 'climactic scene, peak of tension, most disturbing element',
    cor: 'deep red, pure black, intense contrast',
  },
  'RESOLUÇÃO': {
    estilo: 'wide shot, aftermath, haunting stillness, documentary',
    elementos: 'empty place, lingering question, unresolved mystery',
    cor: 'cold blue, grey, dark atmosphere',
  },
  'CTA': {
    estilo: 'branded look, dark channel aesthetic, clean composition',
    elementos: 'channel branding, subscribe button concept, dark theme',
    cor: 'dark purple, channel colors',
  },
};

function gerarPromptCena(nomesecao, descricaoCena, tema) {
  const template = TEMPLATES_VISUAIS[nomesecao.toUpperCase()] || TEMPLATES_VISUAIS['DESENVOLVIMENTO'];
  return `${descricaoCena}, ${template.elementos}, ${template.estilo}, ${template.cor}, --ar 16:9, no text, no watermark`;
}

function extrairSecoes(textoRoteiro) {
  const secoes = [];
  const regex = /##\s+([^\n]+)\s*\(([^)]+)\)([\s\S]*?)(?=##|\s*$)/g;
  let match;

  while ((match = regex.exec(textoRoteiro)) !== null) {
    const nome = match[1].trim();
    const tempo = match[2].trim();
    const texto = match[3].trim().slice(0, 200);
    secoes.push({ nome, tempo, texto });
  }

  // Fallback se não encontrar marcações
  if (!secoes.length) {
    const blocos = textoRoteiro.split(/\n{2,}/).filter(b => b.trim().length > 50);
    blocos.slice(0, 7).forEach((bloco, i) => {
      const nomes = ['GANCHO', 'APRESENTAÇÃO', 'DESENVOLVIMENTO', 'VIRADA', 'DESENVOLVIMENTO', 'CLÍMAX', 'RESOLUÇÃO'];
      secoes.push({ nome: nomes[i] || 'CENA', tempo: `${i * 2}:00`, texto: bloco.trim().slice(0, 200) });
    });
  }

  return secoes;
}

function processarStoryboard(textoRoteiro, tema, dirOutput, nomeBase) {
  const secoes = extrairSecoes(textoRoteiro);

  const cenas = secoes.map((secao, idx) => ({
    numero: idx + 1,
    secao: secao.nome,
    tempo: secao.tempo,
    descricao_pt: secao.texto.slice(0, 150),
    prompt_imagem: gerarPromptCena(secao.nome, tema, tema),
    tipo_visual: idx === 0 ? 'imagem_cinematica' : idx % 3 === 0 ? 'video_stock' : 'imagem_cinematica',
    instrucao_video: gerarInstrucaoVideo(secao.nome, idx),
    efeito_sonoro: gerarEfeitoSonoro(secao.nome),
  }));

  const storyboard = {
    tema,
    total_cenas: cenas.length,
    paleta_cores: ['#0a0a1a', '#1a0a2e', '#2d1b69', '#e63946'],
    estilo_visual: 'sombrio, cinematográfico, alta tensão, paleta fria com vermelho de destaque',
    cenas,
    notas_edicao: [
      'Usar cortes rápidos nos momentos de revelação',
      'Zoom lento durante o desenvolvimento para criar tensão',
      'Fade to black antes de cada revelação importante',
      'Texto na tela para datas e nomes de pessoas reais',
      'Música de fundo baixa durante narração, sobe nos momentos de pausa',
    ],
    fontes_imagem_gratuitas: [
      'Pexels.com — vídeos stock gratuitos',
      'Unsplash.com — fotos de alta qualidade',
      'Pixabay.com — imagens e vídeos livres',
      'Archive.org — imagens históricas de domínio público',
      'DALL-E (bing.com/create) — geração gratuita de imagens',
    ],
  };

  const arq = path.join(dirOutput, `${nomeBase}_storyboard.json`);
  fs.writeFileSync(arq, JSON.stringify(storyboard, null, 2));

  // Salva também versão legível
  const textoLegivel = cenas.map(c =>
    `CENA ${c.numero} — ${c.secao} (${c.tempo})\n` +
    `Descrição: ${c.descricao_pt}\n` +
    `Prompt IA: ${c.prompt_imagem}\n` +
    `Instrução: ${c.instrucao_video}\n` +
    `Som: ${c.efeito_sonoro}\n`
  ).join('\n' + '-'.repeat(50) + '\n');

  fs.writeFileSync(path.join(dirOutput, `${nomeBase}_storyboard.txt`), textoLegivel);

  return storyboard;
}

function gerarInstrucaoVideo(nomesecao, idx) {
  const instrucoes = {
    'GANCHO': 'Zoom in lento, câmera tremida levemente, 3-4 segundos por imagem',
    'APRESENTAÇÃO': 'Pan da esquerda para direita, ritmo tranquilo, 4-5 segundos por imagem',
    'DESENVOLVIMENTO': 'Cortes médios, 3 segundos por imagem, fade entre cenas',
    'VIRADA': 'Corte rápido, flash breve, zoom dramático',
    'CLÍMAX': 'Cortes rápidos alternados, 1-2 segundos por imagem, câmera instável',
    'RESOLUÇÃO': 'Fade out lento, imagem estática, 5-6 segundos',
    'CTA': 'Animação simples, 3 segundos',
  };
  return instrucoes[nomesecao.toUpperCase()] || 'Corte padrão, 3 segundos por imagem';
}

function gerarEfeitoSonoro(nomesecao) {
  const efeitos = {
    'GANCHO': 'batida de coração acelerada, vento assustador',
    'APRESENTAÇÃO': 'música de suspense baixa, ambiente silencioso',
    'DESENVOLVIMENTO': 'música de tensão crescente, sons ambientes sombrios',
    'VIRADA': 'som de impacto súbito, silêncio dramático',
    'CLÍMAX': 'música intensa, batidas aceleradas, som perturbador',
    'RESOLUÇÃO': 'música melancólica, fade out gradual',
    'CTA': 'música de encerramento do canal',
  };
  return efeitos[nomesecao.toUpperCase()] || 'música de suspense';
}

module.exports = { processarStoryboard, extrairSecoes };
