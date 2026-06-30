const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/config');
const memoria = require('../memory/gerenciador');
const logger = require('../utils/logger');

const client = new Anthropic({ apiKey: config.apis.anthropic });

const TEMAS_BASE = [
  'crimes reais não resolvidos', 'desaparecimentos misteriosos', 'lugares amaldiçoados',
  'experimentos secretos governo', 'profecias que se realizaram', 'mortes inexplicadas de celebridades',
  'civilizações perdidas', 'fenômenos paranormais documentados', 'conspirações históricas comprovadas',
  'serial killers desconhecidos', 'acidentes aéreos inexplicados', 'locais proibidos ao público',
  'tecnologia secreta militar', 'rituais ocultistas históricos', 'naufrágios misteriosos',
  'assassinatos não resolvidos do Brasil', 'missões espaciais secretas', 'animais extintos avistados',
  'bunkers e instalações subterrâneas', 'testemunhos de vida após a morte',
];

async function pesquisarTendencias() {
  logger.info('[Agente 1] Iniciando pesquisa de tendências...');

  const mem = await memoria.carregar();
  const temasUsados = mem.temas_utilizados.map(t => t.tema);

  const prompt = `Você é um pesquisador especializado em conteúdo viral para YouTube no nicho dark/mistérios.

Canal: ${config.canal.nome}
Público-alvo: ${config.canal.publicoAlvo}
Temas já utilizados (EVITAR repetir): ${temasUsados.slice(-50).join(', ') || 'nenhum ainda'}

Temas base para explorar: ${TEMAS_BASE.join(', ')}

Sua tarefa: Gerar EXATAMENTE 20 ideias de vídeo com alto potencial viral para o nicho dark/mistérios no Brasil.

Critérios obrigatórios:
- Preferir conteúdo evergreen (não datado)
- Evitar temas saturados ou muito explorados
- Priorizar histórias reais, documentadas ou baseadas em fatos
- Considerar o que gera curiosidade imediata no título
- Avaliar potencial de retenção (pessoas que começam PRECISAM terminar)

Responda APENAS com JSON válido neste formato:
{
  "ideias": [
    {
      "tema": "título do tema",
      "nicho": "sub-nicho específico",
      "publico_alvo": "segmento específico do público",
      "palavras_chave": ["kw1", "kw2", "kw3", "kw4", "kw5"],
      "nivel_concorrencia": "baixo|medio|alto",
      "potencial_viral": 0,
      "gancho_sugerido": "frase de gancho inicial para o vídeo",
      "angulo_diferenciado": "o que torna esse vídeo único vs concorrentes",
      "duracao_ideal_minutos": 0,
      "evergreen": true
    }
  ]
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const texto = response.content[0].text;
  const jsonMatch = texto.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Agente 1: resposta sem JSON válido');

  const resultado = JSON.parse(jsonMatch[0]);

  // Filtra temas já usados
  resultado.ideias = resultado.ideias.filter(i =>
    !temasUsados.some(u => u.toLowerCase().includes(i.tema.toLowerCase().slice(0, 20)))
  );

  // Ordena por potencial viral
  resultado.ideias.sort((a, b) => b.potencial_viral - a.potencial_viral);

  logger.info(`[Agente 1] ${resultado.ideias.length} ideias geradas`);
  return resultado.ideias;
}

module.exports = { pesquisarTendencias };
