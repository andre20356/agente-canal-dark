// Prompts prontos para colar no Claude.ai — geram roteiros profissionais sem custo

function gerarPromptRoteiro(tema, duracaoMin = 12) {
  const palavras = duracaoMin * 130;
  return `Você é um roteirista profissional de vídeos dark/mistérios para YouTube Brasil.

Crie um roteiro completo para o vídeo: "${tema}"

REGRAS OBRIGATÓRIAS:
- Tom: sombrio, envolvente, cinematográfico, senso de urgência
- Frases curtas (máximo 20 palavras cada)
- Linguagem simples e acessível
- Cada parágrafo deve gerar curiosidade pelo próximo
- Use fatos reais sempre que possível
- Coloque [PAUSA] onde a narração deve pausar dramaticamente
- Coloque [MÚSICA INTENSA] e [MÚSICA SUAVE] para mudanças de ritmo
- Duração alvo: ${duracaoMin} minutos (~${palavras} palavras narradas)

ESTRUTURA OBRIGATÓRIA:

## GANCHO (0:00 - 0:30)
[primeiros 30 segundos — impacto imediato, deve prender o espectador antes de explicar qualquer coisa]

## APRESENTAÇÃO (0:30 - 1:30)
[contexto mínimo necessário — quem, onde, quando — sem revelar o mistério ainda]

## DESENVOLVIMENTO PARTE 1 (1:30 - 4:00)
[aprofundamento — começa a revelar detalhes perturbadores]

## VIRADA (4:00 - 5:00)
[primeira grande revelação — algo que muda completamente a perspectiva]

## DESENVOLVIMENTO PARTE 2 (5:00 - 8:00)
[escalada de tensão — cada parágrafo mais intenso que o anterior]

## CLÍMAX (8:00 - 10:00)
[ponto mais intenso do vídeo — a revelação principal]

## RESOLUÇÃO (10:00 - 11:30)
[conclui a história mas deixa uma dúvida no ar — gera comentários]

## CTA (11:30 - 12:00)
[chamada para ação natural, não forçada — leva ao próximo vídeo]

Escreva o roteiro completo agora:`;
}

function gerarPromptGancho(tema) {
  return `Crie 5 ganchos diferentes para o vídeo sobre: "${tema}"

Cada gancho deve:
- Ter no máximo 3 frases
- Começar com algo perturbador ou uma pergunta impossível
- Fazer o espectador precisar continuar assistindo
- Usar presente ou passado imediato para criar urgência

Formato:
GANCHO 1: [texto]
GANCHO 2: [texto]
...`;
}

function gerarPromptTitulos(tema) {
  return `Crie 10 títulos para um vídeo do YouTube sobre: "${tema}"

Regras:
- Máximo 60 caracteres cada
- Gerar curiosidade imediata
- Usar números quando possível
- Evitar clickbait exagerado
- Estilo: sombrio, intrigante, baseado em fatos

Formato:
1. [título]
2. [título]
...

Depois indique qual é o melhor e por quê.`;
}

module.exports = { gerarPromptRoteiro, gerarPromptGancho, gerarPromptTitulos };
