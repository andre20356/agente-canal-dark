// Canal de Cortes — rotas próprias, separadas do server.js principal (que já
// cuida só do Arquivo Sombrio). Recebe bus/logBus/emitProgresso/uploaders do
// server.js pra reaproveitar o mesmo SSE e os mesmos publishers de
// YouTube/TikTok já prontos, sem duplicar nada.
const express = require('express');
const fs      = require('fs');
const path    = require('path');

const { buscarNovosEpisodios }        = require('./pipeline/8_cortes_fontes');
const { baixarEpisodio, extrairAudio } = require('./pipeline/9_cortes_captacao');
const { detectarCortes }              = require('./pipeline/10_cortes_deteccao');
const { processarCorte }              = require('./pipeline/11_cortes_edicao');

const CONFIG_PATH = path.join(__dirname, 'cortes_config.json');
const STATE_PATH  = path.join(__dirname, 'cortes_state.json');
const CORTES_DIR  = path.join(__dirname, 'cortes');

function lerJSON(p, padrao) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return padrao; }
}
function salvarJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}
function lerConfig() { return lerJSON(CONFIG_PATH, { fontes: [] }); }
function salvarConfig(cfg) { salvarJSON(CONFIG_PATH, cfg); }
function lerState()  { return lerJSON(STATE_PATH, { episodios: {} }); }
function salvarState(st) { salvarJSON(STATE_PATH, st); }

function criarCortesRouter({ logBus, emitProgresso, capturarLogs, uploadYouTube, uploadTikTok }) {
  const router = express.Router();
  let emBusca = false;

  // ── Config das fontes (canais parceiros) ────────────────────────────────────

  router.get('/config', (req, res) => res.json(lerConfig()));

  router.post('/config', (req, res) => {
    const { nome, youtube_channel, nota_parceria } = req.body;
    if (!nome?.trim() || !youtube_channel?.trim()) {
      return res.status(400).json({ error: 'nome e youtube_channel são obrigatórios' });
    }
    const cfg = lerConfig();
    const id  = nome.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const existente = cfg.fontes.findIndex(f => f.id === id);
    const fonte = { id, nome: nome.trim(), youtube_channel: youtube_channel.trim(), nota_parceria: nota_parceria || '', ativo: true };
    if (existente >= 0) cfg.fontes[existente] = fonte; else cfg.fontes.push(fonte);
    salvarConfig(cfg);
    res.json({ ok: true, fonte });
  });

  router.delete('/config/:id', (req, res) => {
    const cfg = lerConfig();
    cfg.fontes = cfg.fontes.filter(f => f.id !== req.params.id);
    salvarConfig(cfg);
    res.json({ ok: true });
  });

  // ── Buscar episódios novos + captação + detecção ────────────────────────────
  // Roda em background (como a produção do Arquivo Sombrio) — a resposta HTTP
  // volta na hora, o progresso real vai pelo mesmo SSE (/api/stream).

  router.post('/buscar', async (req, res) => {
    if (emBusca) return res.status(409).json({ error: 'Já há uma busca em andamento' });
    const cfg = lerConfig();
    const ativas = cfg.fontes.filter(f => f.ativo);
    if (!ativas.length) return res.status(400).json({ error: 'Nenhuma fonte ativa configurada' });

    res.json({ ok: true });
    emBusca = true;

    capturarLogs(async () => {
      const state = lerState();
      for (const fonte of ativas) {
        try {
          logBus(`[Cortes] Checando novos episódios de "${fonte.nome}"...`);
          const jaProcessados = Object.values(state.episodios)
            .filter(e => e.fonteId === fonte.id)
            .map(e => e.videoId);

          const { novos } = await buscarNovosEpisodios(fonte, jaProcessados);
          if (!novos.length) { logBus(`[Cortes] "${fonte.nome}": nenhum episódio novo`); continue; }
          logBus(`[Cortes] "${fonte.nome}": ${novos.length} episódio(s) novo(s)`);

          for (const ep of novos) {
            const episodioId = `${fonte.id}__${ep.videoId}`;
            const dirOutput   = path.join(CORTES_DIR, fonte.id, ep.videoId);
            state.episodios[episodioId] = {
              fonteId: fonte.id, videoId: ep.videoId, titulo: ep.titulo,
              thumbnail: ep.thumbnail, dir: dirOutput, status: 'baixando', erro: null,
            };
            salvarState(state);
            emitProgresso('cortes', 5);

            try {
              logBus(`[Cortes] Baixando: ${ep.titulo}`);
              const videoPath = await baixarEpisodio(ep.videoId, dirOutput);
              emitProgresso('cortes', 40);

              state.episodios[episodioId].status = 'detectando';
              salvarState(state);
              logBus(`[Cortes] Extraindo áudio e detectando momentos de corte: ${ep.titulo}`);
              const audioPath = extrairAudio(videoPath, dirOutput);
              await detectarCortes(audioPath, dirOutput);
              emitProgresso('cortes', 100);

              state.episodios[episodioId].status = 'pronto';
              salvarState(state);
              logBus(`✓ [Cortes] "${ep.titulo}" pronto pra revisão`);
            } catch (e) {
              state.episodios[episodioId].status = 'erro';
              state.episodios[episodioId].erro   = e.message;
              salvarState(state);
              logBus(`⚠ [Cortes] Falha em "${ep.titulo}": ${e.message}`);
            }
          }
        } catch (e) {
          logBus(`⚠ [Cortes] Falha checando "${fonte.nome}": ${e.message}`);
        }
      }
      logBus('[Cortes] Busca concluída');
    })().catch(e => logBus(`⚠ [Cortes] Erro inesperado: ${e.message}`)).finally(() => { emBusca = false; });
  });

  // ── Episódios e candidatos ───────────────────────────────────────────────────

  router.get('/episodios', (req, res) => {
    const state = lerState();
    res.json(Object.entries(state.episodios).map(([id, ep]) => ({ id, ...ep })));
  });

  router.get('/episodios/:episodioId/candidatos', (req, res) => {
    const state = lerState();
    const ep = state.episodios[req.params.episodioId];
    if (!ep) return res.status(404).json({ error: 'Episódio não encontrado' });
    const candidatos = lerJSON(path.join(ep.dir, 'candidatos.json'), []);
    res.json(candidatos.map((c, idx) => ({ idx, ...c })));
  });

  // ── Aprovar / rejeitar / publicar candidato ─────────────────────────────────

  router.post('/candidatos/:episodioId/:idx/rejeitar', (req, res) => {
    const { episodioId, idx } = req.params;
    const state = lerState();
    const ep = state.episodios[episodioId];
    if (!ep) return res.status(404).json({ error: 'Episódio não encontrado' });
    const candidatosPath = path.join(ep.dir, 'candidatos.json');
    const candidatos = lerJSON(candidatosPath, []);
    if (!candidatos[idx]) return res.status(404).json({ error: 'Candidato não encontrado' });
    candidatos[idx].status = 'rejeitado';
    salvarJSON(candidatosPath, candidatos);
    res.json({ ok: true });
  });

  router.post('/candidatos/:episodioId/:idx/aprovar', async (req, res) => {
    const { episodioId, idx } = req.params;
    const state = lerState();
    const ep = state.episodios[episodioId];
    if (!ep) return res.status(404).json({ error: 'Episódio não encontrado' });
    const candidatosPath = path.join(ep.dir, 'candidatos.json');
    const candidatos = lerJSON(candidatosPath, []);
    const candidato = candidatos[idx];
    if (!candidato) return res.status(404).json({ error: 'Candidato não encontrado' });

    candidato.status = 'processando';
    salvarJSON(candidatosPath, candidatos);
    res.json({ ok: true });

    const videoPath = path.join(ep.dir, 'episodio.mp4');
    const dirSaida   = path.join(ep.dir, `corte_${idx}`);

    capturarLogs(async () => {
      logBus(`[Cortes] Processando corte aprovado: "${candidato.titulo_sugerido}"`);
      const resultado = await processarCorte(videoPath, candidato, dirSaida);
      candidato.status  = 'processado';
      candidato.arquivos = resultado;
      salvarJSON(candidatosPath, candidatos);
      logBus(`✓ [Cortes] Corte pronto: "${candidato.titulo_sugerido}"`);
    })().catch(e => {
      candidato.status = 'erro';
      candidato.erro    = e.message;
      salvarJSON(candidatosPath, candidatos);
      logBus(`⚠ [Cortes] Falha processando corte: ${e.message}`);
    });
  });

  router.post('/candidatos/:episodioId/:idx/publicar', async (req, res) => {
    const { episodioId, idx } = req.params;
    // Padrão "private": Canal de Cortes ainda está em teste, muita gente vai
    // rodar isso no MESMO canal principal do Arquivo Sombrio antes de migrar
    // pra um canal dedicado — nunca assumir 'public' por padrão aqui.
    const { formato = 'vertical', plataformas = ['youtube'], privacidade = 'private' } = req.body;
    const state = lerState();
    const ep = state.episodios[episodioId];
    if (!ep) return res.status(404).json({ error: 'Episódio não encontrado' });
    const candidatosPath = path.join(ep.dir, 'candidatos.json');
    const candidatos = lerJSON(candidatosPath, []);
    const candidato = candidatos[idx];
    if (!candidato?.arquivos) return res.status(400).json({ error: 'Corte ainda não foi processado — aprove primeiro' });

    const videoPath = formato === 'horizontal' ? candidato.arquivos.horizontalPath : candidato.arquivos.verticalPath;
    if (!fs.existsSync(videoPath)) return res.status(404).json({ error: 'Arquivo do corte não encontrado' });

    res.json({ ok: true });

    capturarLogs(async () => {
      const resultados = {};
      if (plataformas.includes('youtube')) {
        if (!process.env.YOUTUBE_REFRESH_TOKEN) {
          logBus('⚠ [Cortes] YouTube não autenticado — pulando publicação');
        } else {
          logBus(`[Cortes] Publicando "${candidato.titulo_sugerido}" no YouTube...`);
          const r = await uploadYouTube(ep.dir, {
            videoPath, titulo: candidato.titulo_sugerido,
            descricao: `Corte de: ${ep.titulo}\n\n${candidato.motivo}`,
            privacidade,
          });
          resultados.youtube = r.url;
          logBus(`✓ [Cortes] Publicado no YouTube (${privacidade}): ${r.url}`);
        }
      }
      if (plataformas.includes('tiktok')) {
        if (!process.env.TIKTOK_REFRESH_TOKEN) {
          logBus('⚠ [Cortes] TikTok não autenticado — pulando publicação');
        } else {
          logBus(`[Cortes] Publicando "${candidato.titulo_sugerido}" no TikTok...`);
          const r = await uploadTikTok(ep.dir, { videoPath, titulo: candidato.titulo_sugerido });
          resultados.tiktok = r.privacidade;
          logBus(`✓ [Cortes] Publicado no TikTok (${r.privacidade})`);
        }
      }
      candidato.status = 'publicado';
      candidato.publicacoes = resultados;
      salvarJSON(candidatosPath, candidatos);
    })().catch(e => logBus(`⚠ [Cortes] Falha ao publicar: ${e.message}`));
  });

  return router;
}

module.exports = { criarCortesRouter };
