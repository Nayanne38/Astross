export const meta = {
  name: 'conselho-ods-educacao',
  description: 'Conselho de 4 especialistas analisa calendario-queimadas frente às metas ODS educacionais, sintetiza roadmap e verifica ceticamente',
  phases: [
    { title: 'Conselho', detail: '4 conselheiros em paralelo (ODS, pedagogia, ciência de dados, acessibilidade)' },
    { title: 'Síntese', detail: 'consolida pareceres em relatório e roadmap' },
    { title: 'Revisão', detail: 'revisor cético verifica contra o código e grava docs/EDUCACAO_ODS.md' },
  ],
}

const REPO = 'C:/Users/fabri/calendario-queimadas'
const CONTEXT = `Projeto: ${REPO} (NASA Space Apps 2026). Harmoniza focos de calor MODIS+VIIRS (NASA FIRMS) numa série "células-dia com fogo" em grade H3 res 6, piloto Cerrado/Matopiba. Existe ETL (etl/), DB (db/schema.sql), API FastAPI (api/main.py, api/schemas.py, api/queries.py), docs (docs/PLAN.md, METHODOLOGY.md, DATA_DICTIONARY.md), testes (tests/). NÃO existe frontend ainda (web/README.md planeja Next.js + Recharts + react-leaflet). Já existem textos pt-BR: anomaly_sentence (api/main.py ~103), LIMITATIONS (~261), FORECAST_DISCLAIMER (~38), UNIT (~35), categorias de Anomaly (api/schemas.py ~62). Nenhuma menção a ODS/educação.

Objetivo do usuário: transformar o sistema em ferramenta educacional alinhada às metas ODS da ONU — 4.7 (educação para desenvolvimento sustentável), 4.4 (competências digitais), 13.3 (educação/conscientização climática), 15.1/15.2 (ecossistemas terrestres/Cerrado), 16.10 (acesso público à informação), 17.18 (dados confiáveis). Ideia semente do usuário: "Transformar os dados em aprendizado — permitir que o usuário explore os dados e compreenda o que significam; pequenos textos explicativos que mudam conforme a visualização selecionada. Ex.: 'Você está observando uma concentração de focos de calor nesta região. Isso pode indicar uma situação que merece investigação, mas não significa necessariamente que toda a área esteja em chamas. Os dados de satélite são instrumentos de monitoramento e precisam ser interpretados em conjunto com outras informações.' Isso também ensina a interpretar dados científicos criticamente. Mas vamos pensar mais!"

Restrição de design decidida: textos educativos DETERMINÍSTICOS (templates pt-BR preenchidos com dados da API), sem LLM em tempo de execução. Regras de honestidade do projeto em docs/PLAN.md (~58). Você é SOMENTE LEITURA: não edite arquivos. Leia o código real e cite arquivo:linha. Responda em português do Brasil.`

const COUNCIL_SCHEMA = {
  type: 'object',
  properties: {
    papel: { type: 'string' },
    resumo: { type: 'string' },
    achados: { type: 'array', items: { type: 'object', properties: {
      descricao: { type: 'string' }, evidencia: { type: 'string', description: 'arquivo:linha' } }, required: ['descricao', 'evidencia'] } },
    lacunas: { type: 'array', items: { type: 'object', properties: {
      descricao: { type: 'string' }, metas_ods: { type: 'array', items: { type: 'string' } } }, required: ['descricao', 'metas_ods'] } },
    propostas: { type: 'array', items: { type: 'object', properties: {
      titulo: { type: 'string' }, descricao: { type: 'string' },
      exemplo_texto: { type: 'string', description: 'exemplo concreto de texto/template pt-BR quando aplicável' },
      metas_ods: { type: 'array', items: { type: 'string' } },
      arquivos_afetados: { type: 'array', items: { type: 'string' } },
      prioridade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
      esforco: { type: 'string', enum: ['P', 'M', 'G'] },
      depende_frontend: { type: 'boolean' } },
      required: ['titulo', 'descricao', 'metas_ods', 'arquivos_afetados', 'prioridade', 'esforco', 'depende_frontend'] } },
  },
  required: ['papel', 'resumo', 'achados', 'lacunas', 'propostas'],
}

const COUNCIL = [
  { key: 'ods', label: 'Especialista ODS', prompt: `Você é especialista em ODS da Agenda 2030 da ONU e políticas educacionais. Mapeie cada funcionalidade existente (endpoints, dados, exportação, docs) às metas ODS listadas, com status (atende / parcial / não atende). Identifique metas sem cobertura e proponha o que tornaria o sistema evidência defensável de contribuição a cada meta (incluindo indicadores mensuráveis de impacto educacional que o próprio sistema poderia registrar sem violar privacidade).` },
  { key: 'pedagogia', label: 'Pedagogo', prompt: `Você é pedagogo e designer instrucional (Ensino Fundamental II, Médio e educação de adultos; BNCC — competências gerais 2, 7, 10 e Ciências da Natureza/Geografia). Proponha: catálogo de textos explicativos POR VISUALIZAÇÃO (calendário mensal, mapa hexagonal, comparação MODIS×VIIRS, harmonização, detecções recentes, previsão) com gatilho baseado nos dados e template pt-BR; perguntas guiadas ("o que você percebe? o que mais precisaria saber?"); trilhas de aprendizagem progressivas; modo professor com roteiros de aula; missões/desafios investigativos com os dados reais; níveis de linguagem (leigo/estudante/técnico). Use os campos reais que a API retorna.` },
  { key: 'ciencia', label: 'Cientista de dados', prompt: `Você é cientista de dados de sensoriamento remoto e comunicador científico. Avalie a precisão e honestidade dos textos existentes (anomaly_sentence, LIMITATIONS, FORECAST_DISCLAIMER, UNIT) e defina o que pode e o que NÃO pode ser afirmado a partir de cada visualização: foco de calor ≠ área queimada ≠ incêndio; célula-dia vs contagem de focos; nuvens/fumaça ocultam fogo; horário de passagem dos satélites; NRT provisório; resolução 375 m vs 1 km; calibração MODIS→VIIRS e incerteza pré-2012; percentil/z-score com poucos anos; correlação ≠ causa; previsão é probabilidade. Proponha um bloco "o que este dado NÃO diz" por visualização, um glossário (termo + definição leiga + armadilha comum) e regras para que os templates nunca gerem afirmações falsas (ex.: nunca dizer 'área queimada'). Verifique as fórmulas reais no ETL (etl/transform/harmonize.py, aggregate.py).` },
  { key: 'acessibilidade', label: 'Acessibilidade', prompt: `Você é especialista em acessibilidade digital (WCAG 2.2, eMAG), inclusão e educação em contextos de baixa conectividade (escolas rurais do Matopiba). Avalie o sistema e proponha: linguagem simples (nível de leitura), descrições textuais alternativas para cada gráfico/mapa geradas pela API (para leitores de tela), paletas seguras para daltonismo, uso offline/baixa banda (CSV, payloads leves, GZip já existe?), i18n (pt-BR fixo hoje; espanhol/inglês e línguas de comunidades?), e representatividade de comunidades tradicionais e do Cerrado nos conteúdos. Indique o que pode ser feito já na API antes do frontend existir.` },
]

phase('Conselho')
const pareceres = (await parallel(COUNCIL.map(c => () =>
  agent(`${CONTEXT}\n\n## Seu papel\n${c.prompt}\n\nSeja concreto e acionável; mínimo 5 propostas. Retorne no schema.`,
    { label: c.label, phase: 'Conselho', schema: COUNCIL_SCHEMA })))).filter(Boolean)
log(`${pareceres.length}/4 pareceres recebidos`)

phase('Síntese')
const rascunho = await agent(`${CONTEXT}\n\n## Tarefa\nVocê é o relator do conselho. Abaixo estão os pareceres de ${pareceres.length} conselheiros (JSON). Consolide em um relatório Markdown pt-BR completo, resolvendo conflitos e deduplicando propostas. Estrutura obrigatória:\n1. Sumário executivo\n2. Matriz ODS × funcionalidade (tabela: meta, funcionalidade, status, evidência arquivo:linha, ação)\n3. Diagnóstico (pontos fortes já existentes / lacunas)\n4. Princípios dos textos educativos (determinísticos, honestos, regras do que nunca afirmar)\n5. Catálogo de textos por visualização — para calendário, mapa hexagonal, comparação, harmonização, recentes, previsão: gatilho (condição sobre campos reais da API), template pt-BR com placeholders, bloco "o que este dado NÃO diz", pergunta guiada, metas ODS\n6. Glossário (termo, definição leiga, armadilha comum)\n7. Trilhas de aprendizagem e modo professor (roteiro de aula exemplo de 50 min alinhado à BNCC)\n8. Acessibilidade e inclusão\n9. Proposta técnica: contrato do campo \`learn\` nas respostas da API, endpoints /glossary e /learn/paths, módulo api/education.py, testes\n10. Roadmap priorizado (Agora — só API / Com o frontend / Depois), com prioridade, esforço e metas\n11. Indicadores de impacto educacional\nRetorne APENAS o Markdown.\n\n## Pareceres\n${JSON.stringify(pareceres, null, 1)}`,
  { label: 'Relator', phase: 'Síntese' })

phase('Revisão')
const final = await agent(`${CONTEXT.replace('Você é SOMENTE LEITURA: não edite arquivos.', '')}\n\n## Tarefa\nVocê é o revisor cético do conselho. Abaixo está o rascunho do relatório. Verifique, lendo o código real com Read/Grep:\n- toda referência arquivo:linha existe e diz o que o relatório afirma (corrija números de linha; remova o que for falso);\n- todo placeholder de template corresponde a um campo que a API realmente retorna (api/schemas.py) ou marque explicitamente como "campo novo necessário";\n- nenhum template afirma algo cientificamente indevido (área queimada, causa, certeza) nem viola as regras de honestidade de docs/PLAN.md;\n- as metas ODS citadas existem e são descritas corretamente (4.4, 4.7, 13.3, 15.1, 15.2, 16.10, 17.18).\nCorrija o rascunho e GRAVE a versão final com a ferramenta Write em ${REPO}/docs/EDUCACAO_ODS.md (crie o arquivo; não edite nenhum outro). Adicione ao final uma seção "Notas da revisão" listando o que foi corrigido/removido. Depois retorne um resumo curto (máx 15 linhas): caminho gravado, nº de correções, top 5 recomendações.\n\n## Rascunho\n${rascunho}`,
  { label: 'Revisor cético', phase: 'Revisão' })

return { conselheiros: pareceres.map(p => p.papel), final }
