/**
 * Execução de comandos ffmpeg/shell que pode ser cancelada de verdade.
 *
 * execSync bloqueia o event loop inteiro do Node até terminar — enquanto um
 * ffmpeg de vários minutos roda, o servidor Express nem consegue responder a
 * um pedido de "parar produção". Por isso as chamadas de ffmpeg usam spawn
 * (assíncrono) aqui, guardando o processo ativo pra poder matar (SIGKILL) a
 * qualquer momento a pedido do painel.
 */

const { spawn } = require('child_process');

let processoAtivo         = null;
let cancelamentoSolicitado = false;

function solicitarCancelamento() {
  cancelamentoSolicitado = true;
  if (processoAtivo) {
    try { processoAtivo.kill('SIGKILL'); } catch {}
  }
}

function resetCancelamento() {
  cancelamentoSolicitado = false;
}

function foiCancelado() {
  return cancelamentoSolicitado;
}

function erroCancelado() {
  return Object.assign(new Error('Produção cancelada pelo usuário'), { cancelado: true });
}

// Checkpoint cooperativo: chamar entre etapas do pipeline (Gemini, loops de
// imagem, etc.) pra abortar cedo sem esperar a etapa toda terminar.
function verificarCancelamento() {
  if (cancelamentoSolicitado) throw erroCancelado();
}

// Roda `cmd` num shell, sem bloquear o event loop. Mesma assinatura de string
// única usada em todo o pipeline (facilita trocar execSync por isso sem
// reescrever os comandos). `timeout` mata o processo se passar do limite.
function execAsync(cmd, { timeout } = {}) {
  return new Promise((resolve, reject) => {
    if (cancelamentoSolicitado) return reject(erroCancelado());

    const child = spawn('bash', ['-c', cmd], { stdio: ['ignore', 'ignore', 'pipe'] });
    processoAtivo = child;

    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-200_000); // não acumula memória à toa
    });

    let estourouTimeout = false;
    const timeoutId = timeout
      ? setTimeout(() => { estourouTimeout = true; try { child.kill('SIGKILL'); } catch {} }, timeout)
      : null;

    child.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (processoAtivo === child) processoAtivo = null;

      if (cancelamentoSolicitado) return reject(erroCancelado());
      if (estourouTimeout) return reject(new Error(`Comando excedeu o timeout (${timeout}ms) e foi encerrado`));
      if (code === 0) return resolve();
      reject(new Error(`Comando falhou (código ${code}): ${stderr.slice(-2000)}`));
    });

    child.on('error', (e) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (processoAtivo === child) processoAtivo = null;
      reject(e);
    });
  });
}

module.exports = {
  execAsync,
  solicitarCancelamento,
  resetCancelamento,
  foiCancelado,
  verificarCancelamento,
};
