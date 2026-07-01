/**
 * Busca de vídeo de banco (B-roll) royalty-free — Pexels primeiro, Pixabay como
 * fallback. Sem chave configurada, simplesmente não retorna nada e quem chamar
 * cai no modo de imagem gerada por IA (Pollinations).
 */
const fs = require('fs');
const fetch = require('node-fetch');

async function buscarPexels(query, apiKey) {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: apiKey }, timeout: 15000 });
  if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`);
  const data = await res.json();
  const video = (data.videos || [])[0];
  if (!video) return null;

  const candidatos = (video.video_files || []).filter(f => f.file_type === 'video/mp4' && f.width >= 1280);
  const arquivo = candidatos.sort((a, b) => Math.abs(a.width - 1920) - Math.abs(b.width - 1920))[0]
    || (video.video_files || [])[0];
  if (!arquivo) return null;

  return { url: arquivo.link, duracao: video.duration };
}

async function buscarPixabay(query, apiKey) {
  const url = `https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=5`;
  const res = await fetch(url, { timeout: 15000 });
  if (!res.ok) throw new Error(`Pixabay HTTP ${res.status}`);
  const data = await res.json();
  const hit = (data.hits || [])[0];
  if (!hit) return null;

  const v = hit.videos?.large?.url ? hit.videos.large : hit.videos?.medium;
  if (!v?.url) return null;

  return { url: v.url, duracao: hit.duration };
}

// Retorna { url, duracao } do primeiro banco que encontrar algo, ou null.
async function buscarClipeStock(query) {
  const pexelsKey  = process.env.PEXELS_API_KEY;
  const pixabayKey = process.env.PIXABAY_API_KEY;

  if (pexelsKey) {
    try {
      const r = await buscarPexels(query, pexelsKey);
      if (r) return r;
    } catch (e) { console.warn(`  [Stock] Pexels falhou ("${query}"): ${e.message}`); }
  }
  if (pixabayKey) {
    try {
      const r = await buscarPixabay(query, pixabayKey);
      if (r) return r;
    } catch (e) { console.warn(`  [Stock] Pixabay falhou ("${query}"): ${e.message}`); }
  }
  return null;
}

async function baixarClipe(url, destino) {
  const res = await fetch(url, { timeout: 30000 });
  if (!res.ok) throw new Error(`Download falhou: HTTP ${res.status}`);
  const buf = await res.buffer();
  if (buf.length < 10000) throw new Error('Arquivo baixado suspeito de pequeno');
  fs.writeFileSync(destino, buf);
}

module.exports = { buscarClipeStock, baixarClipe };
