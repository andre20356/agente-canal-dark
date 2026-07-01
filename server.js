const path = require('path');
require('dotenv').config({ override: true, path: path.join(__dirname, '.env') });

const express    = require('express');
const fs         = require('fs');
const { EventEmitter } = require('events');
const { google } = require('googleapis');
const cron        = require('node-cron');

const { gerarRoteiro }        = require('./pipeline/0_roteirista');
const { sugerirTemas }        = require('./pipeline/1_temas');
const { processarSEO }        = require('./pipeline/2_seo');
const { processarNarracao }   = require('./pipeline/3_narracao');
const { processarStoryboard } = require('./pipeline/4_storyboard');
const { gerarPlanoVisual }    = require('./pipeline/4b_diretor_visual');
const { processarThumbnail }  = require('./pipeline/5_thumbnail');
const { uploadYouTube }       = require('./pipeline/6_upload');
const { backupParaDrive }     = require('./pipeline/drive_backup');
const { montarVideo }         = require('./pipeline/7_video');
const memoria                 = require('./memory/gerenciador');

const app      = express();
const PORT     = 4005;
const ENV_PATH = path.join(__dirname, '.env');
const REDIRECT = 'http://localhost:4006/oauth2callback';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Bus de eventos SSE ────────────────────────────────────────────────────────

const bus = new EventEmitter();
bus.setMaxListeners(30);

let emProducao = false;
let emUpload   = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripAnsi(str) {
  return String(str).replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '').trim();
}

function salvarEnv(chave, valor) {
  let c = '';
  try { c = fs.readFileSync(ENV_PATH, 'utf8'); } catch {}
  const re = new RegExp(`^${chave}=.*$`, 'm');
  c = re.test(c) ? c.replace(re, `${chave}=${valor}`) : c.trimEnd() + `\n${chave}=${valor}\n`;
  fs.writeFileSync(ENV_PATH, c, 'utf8');
  process.env[chave] = valor;
}

function capturarLogs(fn) {
  return async (...args) => {
    const origLog   = console.log;
    const origWrite = process.stdout.write.bind(process.stdout);
    const emit = (raw) => { const m = stripAnsi(raw); if (m) bus.emit('log', m); };
    console.log = (...a) => { origLog(...a); emit(a.map(String).join(' ')); };
    process.stdout.write = (c) => { origWrite(c); emit(c.toString()); return true; };
    try { return await fn(...args); }
    finally { console.log = origLog; process.stdout.write = origWrite; }
  };
}

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    REDIRECT
  );
}

// ── SSE ───────────────────────────────────────────────────────────────────────

app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const send  = (d) => res.write(`data: ${JSON.stringify(d)}\n\n`);
  const onLog   = (msg)  => send({ type: 'log',   msg });
  const onDone  = (data) => send({ type: 'done',  ...data });
  const onError = (msg)  => send({ type: 'error', msg });

  send({ type: 'ping' });
  bus.on('log', onLog); bus.on('done', onDone); bus.on('error', onError);
  req.on('close', () => { bus.off('log', onLog); bus.off('done', onDone); bus.off('error', onError); });
});

// ── Stats ─────────────────────────────────────────────────────────────────────

app.get('/api/stats', (req, res) => {
  const mem = memoria.carregar();
  res.json({
    totalVideos:      mem.metricas_globais?.total_videos || 0,
    temasDisponiveis: sugerirTemas(200).length,
    geminiOk:         !!process.env.GEMINI_API_KEY,
    youtubeOk:        !!process.env.YOUTUBE_REFRESH_TOKEN,
    emProducao,
    emUpload,
    agendamentoAtivo:    AGENDAMENTO_ATIVO,
    horariosAgendados:   HORARIOS_AGENDADOS,
    limpezaAtiva:        LIMPEZA_ATIVA,
    limpezaDiasAposBackup: LIMPEZA_DIAS,
  });
});

// ── Temas ─────────────────────────────────────────────────────────────────────

app.get('/api/temas', (req, res) => res.json(sugerirTemas(12)));

// ── Histórico ─────────────────────────────────────────────────────────────────

app.get('/api/historico', (req, res) => {
  const dir = path.join(__dirname, 'output');
  try {
    const items = fs.readdirSync(dir)
      .filter(f => fs.statSync(path.join(dir, f)).isDirectory())
      .sort().reverse().slice(0, 30)
      .map(nome => {
        const pasta = path.join(dir, nome);
        const arqs  = fs.readdirSync(pasta);
        const temMp4 = arqs.some(f => /\.(mp4|mkv|mov|avi)$/i.test(f));
        const upPath = path.join(pasta, 'youtube_upload.json');
        let upload = null;
        try { if (fs.existsSync(upPath)) upload = JSON.parse(fs.readFileSync(upPath, 'utf8')); } catch {}
        let titulo = nome;
        const seoF = arqs.find(f => f.endsWith('_seo.json'));
        try { if (seoF) titulo = JSON.parse(fs.readFileSync(path.join(pasta, seoF), 'utf8')).titulo_recomendado || nome; } catch {}
        return { nome, titulo, temMp4, uploadado: !!upload, url: upload?.url || null };
      });
    res.json(items);
  } catch { res.json([]); }
});

// ── Produzir ──────────────────────────────────────────────────────────────────

// Lógica central de produção — usada tanto pela rota manual quanto pelo agendador.
// NÃO faz upload: o upload pro YouTube continua sendo um passo manual separado.
const produzirVideo = capturarLogs(async (tema, categoria = 'misterio') => {
  bus.emit('log', `Tema: "${tema}"`);
  const nomeBase  = `${new Date().toISOString().split('T')[0]}_${tema.replace(/[^a-z0-9]/gi, '_').slice(0, 30).toLowerCase()}`;
  const dirOutput = path.join(__dirname, 'output', nomeBase);
  fs.mkdirSync(dirOutput, { recursive: true });

  bus.emit('log', 'Gerando roteiro com Gemini...');
  const roteiro = await gerarRoteiro(tema, 12);
  fs.writeFileSync(path.join(dirOutput, `${nomeBase}_roteiro.txt`), roteiro);
  bus.emit('log', '✓ Roteiro gerado');

  bus.emit('log', 'Gerando SEO...');
  const seo = processarSEO(tema, categoria);
  fs.writeFileSync(path.join(dirOutput, `${nomeBase}_seo.json`), JSON.stringify(seo, null, 2));
  bus.emit('log', '✓ SEO gerado');

  bus.emit('log', 'Preparando narração...');
  const narracao = await processarNarracao(roteiro, dirOutput, nomeBase);
  bus.emit('log', `✓ Narração pronta (~${narracao.duracao_estimada_min} min)`);

  bus.emit('log', 'Criando storyboard...');
  const storyboard = processarStoryboard(roteiro, tema, dirOutput, nomeBase);
  bus.emit('log', `✓ Storyboard criado (${storyboard.total_cenas} cenas)`);

  bus.emit('log', 'Gerando dados da thumbnail...');
  processarThumbnail(tema, seo, storyboard, dirOutput, nomeBase);
  bus.emit('log', '✓ Thumbnail preparada');

  if (narracao.tts_gerado && narracao.arquivo_audio) {
    bus.emit('log', 'Diretor Visual: sincronizando cenas com a narração...');
    const planoVisual = await gerarPlanoVisual(tema, dirOutput, nomeBase);
    bus.emit('log', planoVisual
      ? `✓ ${planoVisual.length} cenas sincronizadas com o áudio`
      : '⚠ Diretor Visual indisponível — vídeo usará modo genérico');

    bus.emit('log', 'Gerando imagens com IA (Pollinations)...');
    try {
      const videoPath = await montarVideo(dirOutput, nomeBase, seo, storyboard, tema, planoVisual);
      bus.emit('log', `✓ Vídeo pronto: ${path.basename(videoPath)}`);
    } catch (e) {
      bus.emit('log', `⚠ Montagem de vídeo falhou: ${e.message}`);
    }
  } else {
    bus.emit('log', '⚠ Áudio não gerado — vídeo pulado');
  }

  memoria.registrarVideo(tema, seo.titulo_recomendado);
  bus.emit('done', { nomeBase, titulo: seo.titulo_recomendado, duracao: narracao.duracao_estimada_min });
});

// Dispara a produção com trava de concorrência (usada pela rota e pelo agendador).
function dispararProducao(tema, categoria, origem = 'manual') {
  if (emProducao) {
    bus.emit('log', `⚠ Produção "${tema}" (${origem}) ignorada — já há uma produção em andamento`);
    return false;
  }
  emProducao = true;
  produzirVideo(tema, categoria)
    .catch(e => { console.error('[Produzir] Erro:', e.message); bus.emit('error', e.message); })
    .finally(() => { emProducao = false; });
  return true;
}

app.post('/api/produzir', async (req, res) => {
  if (emProducao)  return res.status(409).json({ error: 'Produção já em andamento' });
  if (!process.env.GEMINI_API_KEY) return res.status(400).json({ error: 'GEMINI_API_KEY não configurada' });
  const { tema, categoria = 'misterio' } = req.body;
  if (!tema?.trim()) return res.status(400).json({ error: 'Informe um tema' });
  res.json({ ok: true });
  dispararProducao(tema, categoria, 'manual');
});

// ── YouTube auth URL ──────────────────────────────────────────────────────────

app.get('/api/youtube/auth-url', (req, res) => {
  const url = oauthClient().generateAuthUrl({
    access_type: 'offline', prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/drive.file',
    ],
  });
  res.json({ url });
});

// ── YouTube trocar código ─────────────────────────────────────────────────────

app.post('/api/youtube/auth', async (req, res) => {
  try {
    const { redirectUrl } = req.body;
    if (!redirectUrl) return res.status(400).json({ error: 'redirectUrl obrigatório' });

    let code;
    try {
      const p = new URL(redirectUrl);
      const e = p.searchParams.get('error');
      if (e) return res.status(400).json({ error: `Acesso negado: ${e}` });
      code = p.searchParams.get('code');
    } catch {
      const m = redirectUrl.match(/[?&]code=([^&]+)/);
      code = m ? decodeURIComponent(m[1]) : null;
    }
    if (!code) return res.status(400).json({ error: 'Código não encontrado. Copie a URL completa do navegador.' });

    const oauth2 = oauthClient();
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) return res.status(400).json({ error: 'Refresh token não recebido. Revogue em myaccount.google.com/permissions e tente novamente.' });

    salvarEnv('YOUTUBE_REFRESH_TOKEN', tokens.refresh_token);
    if (tokens.access_token) salvarEnv('YOUTUBE_ACCESS_TOKEN', tokens.access_token);

    oauth2.setCredentials(tokens);
    const yt = google.youtube({ version: 'v3', auth: oauth2 });
    const r  = await yt.channels.list({ part: ['snippet'], mine: true });
    const canal = r.data.items?.[0]?.snippet?.title || 'Canal';
    res.json({ ok: true, canal });
  } catch (e) {
    let msg = e.message;
    if (msg.includes('invalid_grant'))         msg = 'Código expirado. Repita o processo de autorização.';
    if (msg.includes('redirect_uri_mismatch')) msg = 'redirect_uri não cadastrado no Google Cloud Console.';
    res.status(500).json({ error: msg });
  }
});

// ── YouTube upload ────────────────────────────────────────────────────────────

app.post('/api/youtube/upload', async (req, res) => {
  if (emUpload) return res.status(409).json({ error: 'Upload já em andamento' });
  if (emProducao) return res.status(409).json({ error: 'Aguarde a produção atual terminar (o vídeo pode ainda estar sendo montado) antes de subir' });
  if (!process.env.YOUTUBE_REFRESH_TOKEN) return res.status(400).json({ error: 'YouTube não autenticado' });
  const { nomeBase, privacidade = 'public' } = req.body;
  if (!nomeBase) return res.status(400).json({ error: 'nomeBase obrigatório' });
  const dirOutput = path.join(__dirname, 'output', nomeBase);
  if (!fs.existsSync(dirOutput)) return res.status(404).json({ error: 'Pasta não encontrada' });
  res.json({ ok: true });
  emUpload = true;

  capturarLogs(async () => {
    bus.emit('log', `Iniciando upload: ${nomeBase}`);
    const r = await uploadYouTube(dirOutput, { privacidade });
    bus.emit('log', `✓ Upload concluído!`);
    bus.emit('log', `URL: ${r.url}`);

    try {
      bus.emit('log', 'Enviando cópia de backup pro Google Drive...');
      const backup = await backupParaDrive(dirOutput, r.videoPath, `${nomeBase}.mp4`);
      bus.emit('log', `✓ Backup no Drive: ${backup.url}`);

      // YouTube + Drive confirmados — não precisa mais da cópia local
      fs.rmSync(dirOutput, { recursive: true, force: true });
      bus.emit('log', `🧹 Pasta local apagada (já está no YouTube e no Drive): ${nomeBase}`);
    } catch (e) {
      bus.emit('log', `⚠ Backup no Drive falhou (vídeo já está no YouTube, arquivo local mantido): ${e.message}`);
    }

    bus.emit('done', { upload: true, url: r.url });
  })().catch(e => { console.error('[Upload] Erro:', e.message); bus.emit('error', e.message); }).finally(() => { emUpload = false; });
});

// ── Download de arquivo ───────────────────────────────────────────────────────

app.get('/api/download/:nomeBase/:arquivo', (req, res) => {
  const { nomeBase, arquivo } = req.params;
  // Bloqueia path traversal
  if (nomeBase.includes('..') || arquivo.includes('..')) return res.status(400).end();
  const filePath = path.join(__dirname, 'output', nomeBase, arquivo);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado' });
  res.download(filePath, arquivo);
});

// ── Agendamento automático ──────────────────────────────────────────────────────
// Gera vídeos sozinho em horários fixos (padrão: manhã/tarde/noite), escolhendo
// o tema com sugerirTemas() (já evita repetir temas usados). NÃO faz upload —
// o vídeo fica pronto em output/ aguardando revisão manual antes de publicar.

const FUSO_HORARIO       = process.env.AGENDAMENTO_FUSO || 'America/Sao_Paulo';
const HORARIOS_AGENDADOS = (process.env.AGENDAMENTO_HORARIOS || '08:00,14:00,20:00')
  .split(',').map(h => h.trim()).filter(Boolean);
const AGENDAMENTO_ATIVO  = process.env.AGENDAMENTO_ATIVO !== 'false'; // ativo por padrão

function agendarProducaoAutomatica() {
  if (!AGENDAMENTO_ATIVO) {
    console.log('[Agendador] Desativado (AGENDAMENTO_ATIVO=false no .env)');
    return;
  }
  for (const horario of HORARIOS_AGENDADOS) {
    const [hh, mm] = horario.split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) {
      console.warn(`[Agendador] Horário inválido ignorado: "${horario}"`);
      continue;
    }
    cron.schedule(`${mm} ${hh} * * *`, () => {
      if (!process.env.GEMINI_API_KEY) {
        bus.emit('log', '⏰ Agendador disparou, mas GEMINI_API_KEY não está configurada — pulando');
        return;
      }
      const [sugestao] = sugerirTemas(1);
      if (!sugestao) {
        bus.emit('log', '⏰ Agendador disparou, mas não há temas disponíveis (todos já usados)');
        return;
      }
      bus.emit('log', `⏰ Produção agendada (${horario}) — tema: "${sugestao.tema}"`);
      dispararProducao(sugestao.tema, sugestao.categoria, `agendado ${horario}`);
    }, { timezone: FUSO_HORARIO });
    console.log(`[Agendador] Produção automática agendada para ${horario} (${FUSO_HORARIO})`);
  }
}

agendarProducaoAutomatica();

// ── Limpeza automática ──────────────────────────────────────────────────────────
// A pasta local já é apagada na hora, logo após YouTube + Drive confirmarem
// (ver rota /api/youtube/upload). Este job diário é só uma rede de segurança
// para pastas que ficaram para trás (ex: servidor reiniciou entre o backup e
// a exclusão) — nunca mexe em vídeo ainda não publicado/sem backup confirmado.

const LIMPEZA_ATIVA = process.env.LIMPEZA_ATIVA !== 'false'; // ativa por padrão
const LIMPEZA_DIAS  = parseInt(process.env.LIMPEZA_DIAS_APOS_BACKUP || '0', 10);
const LIMPEZA_HORA  = process.env.LIMPEZA_HORARIO || '04:00';

function limparVideosAntigos() {
  if (emProducao || emUpload) {
    bus.emit('log', '🧹 Limpeza adiada — produção/upload em andamento');
    return;
  }
  const outputDir = path.join(__dirname, 'output');
  let pastas;
  try { pastas = fs.readdirSync(outputDir).filter(f => fs.statSync(path.join(outputDir, f)).isDirectory()); }
  catch { return; }

  const agora = Date.now();
  let apagadas = 0;

  for (const nome of pastas) {
    const dir = path.join(outputDir, nome);
    const upPath  = path.join(dir, 'youtube_upload.json');
    const bkpPath = path.join(dir, `${nome}_drive_backup.json`);
    if (!fs.existsSync(upPath) || !fs.existsSync(bkpPath)) continue; // sem os dois confirmados, não mexe

    try {
      const backup = JSON.parse(fs.readFileSync(bkpPath, 'utf8'));
      const diasPassados = (agora - new Date(backup.backed_up_at).getTime()) / 86400000;
      if (diasPassados < LIMPEZA_DIAS) continue;

      fs.rmSync(dir, { recursive: true, force: true });
      apagadas++;
      bus.emit('log', `🧹 Pasta local apagada (já no YouTube + Drive há ${diasPassados.toFixed(1)}d): ${nome}`);
    } catch (e) {
      console.warn(`[Limpeza] Erro ao processar ${nome}: ${e.message}`);
    }
  }
  if (apagadas === 0) bus.emit('log', '🧹 Limpeza: nada elegível pra apagar hoje');
}

function agendarLimpezaAutomatica() {
  if (!LIMPEZA_ATIVA) {
    console.log('[Limpeza] Desativada (LIMPEZA_ATIVA=false no .env)');
    return;
  }
  const [hh, mm] = LIMPEZA_HORA.split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) {
    console.warn(`[Limpeza] Horário inválido no .env: "${LIMPEZA_HORA}" — limpeza desativada`);
    return;
  }
  cron.schedule(`${mm} ${hh} * * *`, limparVideosAntigos, { timezone: FUSO_HORARIO });
  console.log(`[Limpeza] Agendada para ${LIMPEZA_HORA} (${FUSO_HORARIO}) — apaga pastas com YouTube+Drive confirmados há ${LIMPEZA_DIAS}+ dias`);
}

agendarLimpezaAutomatica();

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Arquivo Sombrio — Painel: http://187.77.47.248:${PORT}\n`);
});
