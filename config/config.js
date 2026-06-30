require('dotenv').config();

module.exports = {
  canal: {
    nome: 'Arquivo Sombrio',
    nicho: 'dark/misterios',
    idioma: 'pt-BR',
    publicoAlvo: 'jovens adultos 18-35 interessados em mistérios, crimes reais, conspirações e fenômenos inexplicados',
    tomVoz: 'sombrio, envolvente, cinematográfico, com senso de urgência',
    metaInscritosAno: 100000,
  },

  producao: {
    videosporSemana: 5,
    duracaoMediaMinutos: 12,
    retencaoMeta: 55,
    ctrMeta: 8,
    notaQualidadeMinima: 90,
    maxTentativasQualidade: 3,
  },

  apis: {
    anthropic: process.env.ANTHROPIC_API_KEY,
    elevenlabs: process.env.ELEVENLABS_API_KEY,
    youtubeDataApi: process.env.YOUTUBE_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  },

  elevenlabs: {
    voiceId: process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB',
    model: 'eleven_multilingual_v2',
    stability: 0.45,
    similarityBoost: 0.75,
    style: 0.5,
    speakerBoost: true,
  },

  memoria: {
    arquivo: './memory/memoria.json',
    maxTemasArmazenados: 500,
    ciclosParaReaproveitarTema: 90,
  },

  logs: {
    nivel: 'info',
    diretorio: './logs',
  },
};
