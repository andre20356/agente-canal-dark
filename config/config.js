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
    youtubeDataApi: process.env.YOUTUBE_API_KEY || null,
    openai: process.env.OPENAI_API_KEY || null,
  },

  memoria: {
    arquivo: './memory/memoria.json',
  },
};
