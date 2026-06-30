const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/config');
const logger = require('../utils/logger');
const memoria = require('../memory/gerenciador');

const client = new Anthropic({ apiKey: config.apis.anthropic });

const { pesquisarTendencias } = require('./agent1_pesquisador');
const { analisarConcorrencia } = require('./agent2_concorrencia');
const { criarEstrategia } = require('./agent3_estrategista');
const { criarRoteiro } = require('./agent4_roteirista');
const { criarStoryboard } = require('./agent5_diretor_visual');
const { prepararNarracao } = require('./agent6_narrador');
const { otimizarSEO } = require('./agent7_seo');
const { criarThumbnail } = require('./agent8_thumbnail');
const { avaliarQualidade } = require('./agent9_qualidade');

async function executarCiclo(opcoes = {}) {
  const inicio = Date.now();
  logger.info('\n' + '='.repeat(60));
  logger.info(`[Gerente] INICIANDO CICLO DE PRODUÇÃO — ${new Date().toISOString()}`);
  logger.info('='.repeat(60));

  const mem = await memoria.carregar();
  let cicloResultado = {
    inicio: new Date().toISOString(),
    tema: null,
    tentativas_qualidade: 0,
    aprovado: false,
    pacote_final: null,
    erros: [],
  };

  try {
    // FASE 1 — PESQUISA
    logger.info('\n[Gerente] FASE 1: Pesquisa de tendências');
    const ideias = await pesquisarTendencias();
    if (!ideias.length) throw new Error('Nenhuma ideia gerada');

    // Seleciona a melhor ideia
    const ideia = opcoes.ideia || ideias[0];
    cicloResultado.tema = ideia.tema;
    logger.info(`[Gerente] Tema selecionado: "${ideia.tema}" (potencial viral: ${ideia.potencial_viral})`);

    // FASE 2 — ANÁLISE DE CONCORRÊNCIA
    logger.info('\n[Gerente] FASE 2: Análise de concorrência');
    const analiseConcorrencia = await analisarConcorrencia(ideia.tema);

    // FASE 3 — LOOP DE PRODUÇÃO COM CONTROLE DE QUALIDADE
    let qualidade = null;
    let tentativas = 0;
    const maxTentativas = config.producao.maxTentativasQualidade;

    while (tentativas < maxTentativas) {
      tentativas++;
      logger.info(`\n[Gerente] FASE 3-8: Produção completa (tentativa ${tentativas}/${maxTentativas})`);

      // FASE 3 — ESTRATÉGIA
      logger.info('[Gerente] Fase 3: Criando estratégia...');
      const estrategia = await criarEstrategia(ideia, analiseConcorrencia);

      // FASE 4 — ROTEIRO
      logger.info('[Gerente] Fase 4: Criando roteiro...');
      const roteiro = await criarRoteiro(ideia, estrategia);

      // FASE 5 — STORYBOARD
      logger.info('[Gerente] Fase 5: Criando storyboard...');
      const storyboard = await criarStoryboard(ideia, roteiro);

      // FASE 6 — NARRAÇÃO
      logger.info('[Gerente] Fase 6: Preparando narração...');
      const narracao = await prepararNarracao(ideia, roteiro);

      // FASE 7 — SEO
      logger.info('[Gerente] Fase 7: Otimizando SEO...');
      const seo = await otimizarSEO(ideia, roteiro, analiseConcorrencia);

      // FASE 8 — THUMBNAIL
      logger.info('[Gerente] Fase 8: Criando thumbnail...');
      const thumbnail = await criarThumbnail(ideia, seo, storyboard);

      // FASE 9 — CONTROLE DE QUALIDADE
      logger.info('\n[Gerente] FASE 9: Controle de qualidade');
      const pacote = { ideia, estrategia, roteiro, storyboard, narracao, seo, thumbnail };
      qualidade = await avaliarQualidade(pacote);

      if (qualidade.aprovado) {
        cicloResultado.aprovado = true;
        cicloResultado.tentativas_qualidade = tentativas;
        cicloResultado.pacote_final = { ...pacote, qualidade };

        // FASE 10 — APROVAÇÃO E ARMAZENAMENTO
        logger.info('\n[Gerente] FASE 10: Aprovação e armazenamento');
        await aprovarESalvar(cicloResultado, mem);
        break;
      } else {
        logger.warn(`[Gerente] Nota ${qualidade.nota_final}/100 — abaixo do mínimo (${config.producao.notaQualidadeMinima})`);
        logger.warn(`[Gerente] Agentes para refazer: ${qualidade.agentes_para_refazer.join(', ')}`);
        if (tentativas < maxTentativas) {
          logger.info('[Gerente] Reiniciando produção com instruções de melhoria...');
          ideia._instrucoes_correcao = qualidade.instrucoes_correcao;
        }
      }
    }

    if (!cicloResultado.aprovado) {
      logger.error(`[Gerente] Conteúdo não aprovado após ${maxTentativas} tentativas`);
      mem.erros_detectados.push({
        tema: ideia.tema,
        data: new Date().toISOString(),
        nota_maxima: qualidade?.nota_final,
        motivo: qualidade?.instrucoes_correcao,
      });
      await memoria.salvar(mem);
    }

  } catch (err) {
    logger.error(`[Gerente] Erro crítico no ciclo: ${err.message}`);
    cicloResultado.erros.push(err.message);
  }

  const duracao = ((Date.now() - inicio) / 1000 / 60).toFixed(1);
  logger.info(`\n[Gerente] CICLO FINALIZADO em ${duracao}min — ${cicloResultado.aprovado ? 'SUCESSO ✓' : 'FALHOU ✗'}`);
  return cicloResultado;
}

async function aprovarESalvar(ciclo, mem) {
  const { pacote_final } = ciclo;
  const { ideia, seo, qualidade } = pacote_final;

  // Registra tema como utilizado
  mem.temas_utilizados.push({
    tema: ideia.tema,
    data: new Date().toISOString(),
    titulo: seo.titulo_recomendado,
    nota_qualidade: qualidade.nota_final,
    ctr_estimado: qualidade.estimativa_performance.ctr_estimado_pct,
    retencao_estimada: qualidade.estimativa_performance.retencao_estimada_pct,
    status: 'produzido',
  });

  // Atualiza métricas
  mem.metricas_globais.total_videos++;

  // Registra acertos
  if (qualidade.pontos_fortes.length) {
    qualidade.pontos_fortes.forEach(ponto => {
      if (!mem.acertos_detectados.includes(ponto)) {
        mem.acertos_detectados.push(ponto);
      }
    });
  }

  // Aprendizado — atualiza estratégia
  await atualizarEstrategia(mem, ciclo);

  await memoria.salvar(mem);
  logger.info(`[Gerente] Conteúdo salvo na memória. Total produzido: ${mem.metricas_globais.total_videos}`);
}

async function atualizarEstrategia(mem, ciclo) {
  if (mem.metricas_globais.total_videos % 5 !== 0) return; // atualiza a cada 5 vídeos

  const prompt = `Com base nos seguintes dados de produção de conteúdo dark/mistérios:

Temas recentes: ${JSON.stringify(mem.temas_utilizados.slice(-10))}
Acertos detectados: ${mem.acertos_detectados.slice(-10).join(', ')}
Erros detectados: ${mem.erros_detectados.slice(-5).map(e => e.motivo).join(', ')}

Sugira em JSON:
{
  "foco_atual": "novo foco estratégico",
  "evitar": ["lista atualizada de coisas a evitar"],
  "priorizar": ["lista atualizada de prioridades"]
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });
    const txt = response.content[0].text;
    const jsonMatch = txt.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const novaEstrategia = JSON.parse(jsonMatch[0]);
      mem.estrategia_atual = { ...mem.estrategia_atual, ...novaEstrategia, versao: mem.estrategia_atual.versao + 1, atualizado_em: new Date().toISOString() };
      logger.info(`[Gerente] Estratégia atualizada para versão ${mem.estrategia_atual.versao}`);
    }
  } catch (e) {
    logger.warn(`[Gerente] Falha ao atualizar estratégia: ${e.message}`);
  }
}

module.exports = { executarCiclo };
