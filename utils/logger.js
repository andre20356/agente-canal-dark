const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function getLogFile() {
  const hoje = new Date().toISOString().split('T')[0];
  return path.join(LOG_DIR, `${hoje}.log`);
}

function formatMsg(nivel, msg) {
  return `[${new Date().toISOString()}] [${nivel}] ${msg}`;
}

function escrever(nivel, msg) {
  const linha = formatMsg(nivel, msg);
  console.log(linha);
  fs.appendFileSync(getLogFile(), linha + '\n');
}

module.exports = {
  info: (msg) => escrever('INFO', msg),
  warn: (msg) => escrever('WARN', msg),
  error: (msg) => escrever('ERROR', msg),
};
