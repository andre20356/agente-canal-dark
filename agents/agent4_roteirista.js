const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/config');
const logger = require('../utils/logger');

const client = new Anthropic({ apiKey: config.apis.anthropic });

async function criarRoteiro(ideia, estrategia) {
  logger.info(`[Agente 4] Criando roteiro para: ${ideia.tema}`);

  const duracaoMinutos = ideia.duracao_ideal_minutos || config.producao.duracaoMediaMinutos;
  const palavrasEstimadas = duracaoMinutos * 130; // ~130 palavras por minuto narrado

  const prompt = `Você é um roteirista profissional especializado em conteúdo dark/mistérios para YouTube Brasil.

TEMA: ${ideia.tema}
TOM: ${config.canal.tomVoz}
DURAÇÃO ALVO: ${duracaoMinutos} minutos (~${palavrasEstimadas} palavras)
PÚBLICO: ${config.canal.publicoAlvo}

GANCHO INICIAL: ${estrategia.gancho_inicial.texto}
ESTRUTURA: ${JSON.stringify(estrategia.estrutura_narrativa)}
CURVAS DE CURIOSIDADE: ${JSON.stringify(estrategia.curvas_curiosidade)}

Regras absolutas:
- Frases curtas (máximo 20 palavras)
- Linguagem simples, acessível mas intrigante
- Nunca explique o que vai acontecer — mostre
- Cada parágrafo deve gerar curiosidade pelo próximo
- Inclua [PAUSA] onde a narração deve pausar dramaticamente
- Inclua [MÚSICA INTENSIFICA] e [MÚSICA SUAVE] para indicar mudanças de ritmo
- Use fatos reais e verificáveis sempre que possível
- Termine cada seção com uma pergunta ou revelação parcial

Estrutura obrigatória do roteiro:
1. GANCHO (0:00-0:30) — impacto imediato
2. APRESENTAÇÃO (0:30-1:30) — contexto mínimo necessário
3. DESENVOLVIMENTO PARTE 1 (1:30-4:00) — aprofundamento
4. VIRADA/REVELAÇÃO 1 (4:00-5:00) — primeira grande surpresa
5. DESENVOLVIMENTO PARTE 2 (5:00-8:00) — escalada da tensão
6. CLÍMAX (8:00-10:00) — ponto mais intenso
7. RESOLUÇÃO/MISTÉRIO FINAL (10:00-11:30) — conclui mas deixa dúvida
8. CTA (11:30-12:00) — chamada para ação natural

Responda APENAS com JSON válido:
{
  "titulo_interno": "título de trabalho",
  "total_palavras_estimado": 0,
  "duracao_estimada_minutos": 0,
  "secoes": [
    {
      "nome": "GANCHO",
      "inicio": "0:00",
      "fim": "0:30",
      "texto": "texto completo da narração desta seção",
      "instrucoes_audio": "instruções para o narrador/TTS",
      "objetivo_retencao": "o que esta seção faz para manter o espectador"
    }
  ],
  "palavras_chave_mencionadas": [],
  "ctas_incluidas": []
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });

  const texto = response.content[0].text;
  const jsonMatch = texto.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Agente 4: resposta sem JSON válido');

  const resultado = JSON.parse(jsonMatch[0]);

  // Salva roteiro em arquivo
  const fs = require('fs');
  const path = require('path');
  const nomeArquivo = `roteiro_${Date.now()}_${ideia.tema.replace(/[^a-z0-9]/gi, '_').slice(0, 30)}.json`;
  fs.writeFileSync(path.join(__dirname, '../output/roteiros', nomeArquivo), JSON.stringify(resultado, null, 2));

  logger.info(`[Agente 4] Roteiro criado: ${resultado.total_palavras_estimado} palavras, ~${resultado.duracao_estimada_minutos}min`);
  return resultado;
}

module.exports = { criarRoteiro };
