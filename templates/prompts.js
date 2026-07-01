// Prompts prontos para colar no Claude.ai — geram roteiros profissionais sem custo

function gerarPromptRoteiro(tema, duracaoMin = 12) {
  const palavras = duracaoMin * 130;
  return `Você é um roteirista de vídeos dark/mistérios para YouTube Brasil.

Crie o texto de narração completo para o vídeo: "${tema}"

REGRAS ABSOLUTAS — LEIA COM ATENÇÃO:
- Escreva APENAS as palavras que o narrador vai falar em voz alta
- PROIBIDO incluir: direções de cena, descrições visuais, nomes de personagens, indicações de câmera, sons de ambiente, instruções de produção
- PROIBIDO usar formato de roteiro cinematográfico (VOZ:, NARRADOR:, (som de...), (tela preta), etc.)
- PROIBIDO descrever o que aparece na tela ou como a imagem deve ser
- Use apenas o texto falado — como se fosse uma narração de audiobook
- Tom: sombrio, envolvente, cinematográfico, senso de urgência
- Frases curtas (máximo 20 palavras cada)
- Linguagem simples e acessível
- Cada parágrafo deve gerar curiosidade pelo próximo
- Use fatos reais sempre que possível
- Duração alvo: ${duracaoMin} minutos (~${palavras} palavras)

ESTRUTURA (use apenas como separadores internos — não aparecem na narração):

## GANCHO
[primeiros 30 segundos — impacto imediato, deve prender o espectador]

## APRESENTAÇÃO
[contexto mínimo — quem, onde, quando — sem revelar o mistério ainda]

## DESENVOLVIMENTO 1
[aprofundamento — começa a revelar detalhes perturbadores]

## VIRADA
[primeira grande revelação — algo que muda a perspectiva]

## DESENVOLVIMENTO 2
[escalada de tensão — cada parágrafo mais intenso]

## CLÍMAX
[ponto mais intenso — a revelação principal]

## RESOLUÇÃO
[conclui mas deixa uma dúvida no ar — gera comentários]

## CTA
[chamada para ação natural — leva ao próximo vídeo]

EXEMPLO DO QUE É CORRETO:
"Em 1947, algo caiu no deserto do Novo México.
O governo disse que era um balão meteorológico.
Mas as testemunhas contavam uma história diferente.
Uma história que nunca deveria ser revelada."

EXEMPLO DO QUE É ERRADO (NUNCA FAÇA ISSO):
"VOZ (sussurrada): Em 1947...
(Som de trovão ao fundo)
NARRADOR: O governo disse...
(Corte para imagem de jornal)"

Escreva APENAS a narração agora:`;
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
