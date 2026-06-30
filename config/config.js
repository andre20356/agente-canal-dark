require('dotenv').config();

module.exports = {
  canal: {
    nome: 'Arquivo Sombrio',
    nicho: 'dark/misterios',
    idioma: 'pt-BR',
    duracaoMediaMinutos: 12,
  },

  apis: {
    gemini: process.env.GEMINI_API_KEY || null,
    elevenlabs: process.env.ELEVENLABS_API_KEY || null,
    youtubeDataApi: process.env.YOUTUBE_API_KEY || null,
    openai: process.env.OPENAI_API_KEY || null,
  },

  elevenlabs: {
    voiceId: process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB',
    model: 'eleven_multilingual_v2',
    stability: 0.45,
    similarityBoost: 0.75,
    style: 0.5,
  },

  memoria: {
    arquivo: './memory/memoria.json',
  },
};
