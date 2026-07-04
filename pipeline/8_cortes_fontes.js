// Canal de Cortes — detecção de episódios novos numa fonte parceira.
// Usa a YouTube Data API (chave simples, sem OAuth — só leitura de canal
// público) pra checar a playlist de uploads do parceiro. Baixar o vídeo em
// si (feito em 9_cortes_captacao.js) só é aceitável porque a fonte já
// autorizou formalmente o uso do conteúdo pra corte.
const { google } = require('googleapis');
const config = require('../config/config');

function extrairChannelId(input) {
  const s = (input || '').trim();
  const m = s.match(/(?:channel\/)([A-Za-z0-9_-]{20,})/);
  if (m) return m[1];
  if (/^UC[A-Za-z0-9_-]{20,}$/.test(s)) return s;
  return null; // @handle ou URL de /@handle precisa resolver via API abaixo
}

async function resolverChannelId(youtube, input) {
  const direto = extrairChannelId(input);
  if (direto) return direto;

  const handle = (input.match(/@([\w.-]+)/) || [])[1] || input.replace(/^@/, '').trim();
  const r = await youtube.channels.list({ part: ['id'], forHandle: handle });
  const id = r.data.items?.[0]?.id;
  if (!id) throw new Error(`Não foi possível resolver o canal a partir de "${input}"`);
  return id;
}

async function buscarNovosEpisodios(fonte, jaProcessados = []) {
  if (!config.apis.youtubeDataApi) {
    throw new Error('YOUTUBE_API_KEY não configurada no .env — necessária pra checar o canal parceiro');
  }
  const youtube = google.youtube({ version: 'v3', auth: config.apis.youtubeDataApi });

  const channelId = await resolverChannelId(youtube, fonte.youtube_channel);
  const canalInfo = await youtube.channels.list({ part: ['contentDetails', 'snippet'], id: [channelId] });
  const item = canalInfo.data.items?.[0];
  if (!item) throw new Error(`Canal não encontrado: ${fonte.youtube_channel}`);

  const uploadsPlaylistId = item.contentDetails.relatedPlaylists.uploads;
  const nomeCanal = item.snippet.title;

  const playlist = await youtube.playlistItems.list({
    part: ['snippet', 'contentDetails'],
    playlistId: uploadsPlaylistId,
    maxResults: 15,
  });

  const novos = (playlist.data.items || [])
    .map(v => ({
      videoId:     v.contentDetails.videoId,
      titulo:      v.snippet.title,
      publicadoEm: v.contentDetails.videoPublishedAt,
      thumbnail:   v.snippet.thumbnails?.medium?.url || null,
    }))
    .filter(v => !jaProcessados.includes(v.videoId))
    .sort((a, b) => new Date(a.publicadoEm) - new Date(b.publicadoEm));

  return { nomeCanal, channelId, novos };
}

// Extrai o ID de um vídeo a partir de URL (watch?v=, youtu.be/, shorts/) ou
// aceita o ID puro direto — usado pra corte manual de vídeo antigo, fora do
// fluxo automático de "episódios novos".
function extrairVideoId(input) {
  const s = (input || '').trim();
  const m = s.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  return null;
}

async function buscarInfoVideo(videoId) {
  if (!config.apis.youtubeDataApi) {
    throw new Error('YOUTUBE_API_KEY não configurada no .env — necessária pra buscar dados do vídeo');
  }
  const youtube = google.youtube({ version: 'v3', auth: config.apis.youtubeDataApi });
  const r = await youtube.videos.list({ part: ['snippet'], id: [videoId] });
  const item = r.data.items?.[0];
  if (!item) throw new Error(`Vídeo não encontrado: ${videoId} (conferir se é público e o ID está certo)`);
  return {
    videoId,
    titulo:      item.snippet.title,
    publicadoEm: item.snippet.publishedAt,
    thumbnail:   item.snippet.thumbnails?.medium?.url || null,
  };
}

module.exports = { buscarNovosEpisodios, resolverChannelId, extrairVideoId, buscarInfoVideo };
