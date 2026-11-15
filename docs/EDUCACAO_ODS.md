# Relatório do Conselho: o Calendário de Queimadas como ferramenta educacional alinhada aos ODS

**Projeto:** Calendário de Queimadas (NASA Space Apps 2026), piloto Cerrado/Matopiba, grade H3 res 6
**Data:** 15/11/2026
**Base:** pareceres de 4 conselheiros (ODS e políticas educacionais; pedagogia e design instrucional; sensoriamento remoto e comunicação científica; acessibilidade e inclusão), consolidados e revisados por um revisor cético. Todas as referências `arquivo:linha` foram conferidas no código-fonte (`api/main.py`, `api/schemas.py`, `api/queries.py`, `etl/transform/harmonize.py`, `etl/transform/aggregate.py`, `config/*.yaml`, `docs/PLAN.md`, `docs/METHODOLOGY.md`, `tests/test_api.py`). As correções estão na seção "Notas da revisão", no fim do documento.

**Restrição de design:** todos os textos educativos são **determinísticos**: templates pt-BR preenchidos com dados da API, sem LLM em tempo de execução.

---

## 1. Sumário executivo

**Situação atual**
- O sistema já tem base técnica sólida para duas metas:
  - **17.18 (dados confiáveis):** a harmonização MODIS→VIIRS é validada com leave-one-year-out. As métricas estão publicadas (`docs/METHODOLOGY.md:65-100`) e expostas em `/harmonization` (`api/main.py:231-258`).
  - **16.10 (acesso público à informação):** a API só tem endpoints GET, sem autenticação, e o CSV traz atribuição à NASA FIRMS (`api/main.py:309-339`, `api/main.py:33-34`).
- A cobertura de **13.3** é apenas parcial. O único texto que muda conforme os dados é `anomaly_sentence` (`api/main.py:103-121`), e ele usa linguagem técnica ("percentil", "z =").
- A cobertura de **15.1/15.2** é fraca. A única ligação com o Cerrado é o nome da região (`config/regions.yaml:5`).
- As metas **4.7 e 4.4** não são atendidas. Não há frontend (`web/README.md:1-3`), glossário, perguntas guiadas, trilhas nem medição de aprendizagem.

**Proposta consolidada**
- Criar uma **camada educativa determinística** na própria API: um módulo puro `api/education.py` mais conteúdo versionado em YAML.
- Toda resposta de visualização passa a ter um campo opcional **`learn`** com:
  - cartões contextuais ("o que você vê");
  - um bloco obrigatório **"o que este dado NÃO diz"**;
  - avisos de procedência (NRT, era MODIS, amostra sintética, mês parcial, poucos anos de referência);
  - perguntas guiadas e texto alternativo acessível;
  - referências ao glossário e às metas ODS.
- Os textos têm **três níveis de linguagem** (`simples`, `estudante`, `tecnico`) e são verificados por **testes de honestidade**: termos proibidos, avisos obrigatórios e legibilidade.

**Antes da camada educativa, corrigir a precisão dos textos atuais.** O conselho encontrou cinco problemas:
- A frase de anomalia mostra o **total** do mês (`api/main.py:116`), mas o percentil é calculado sobre a **média diária** (`etl/transform/harmonize.py:239`, `:243-257`).
- A frase não informa **quantos anos de referência** foram usados. O mínimo é 3 (`etl/transform/harmonize.py:249-250`).
- A frase não avisa quando o dado é **NRT**. O percentil 0 da temporada de 2026 é provavelmente exagerado, como a própria metodologia reconhece (`docs/METHODOLOGY.md:97-100`).
- A unidade diz "com fogo" (`api/main.py:35`), mas o dado registra a *detecção de um foco de calor* numa célula (`etl/transform/aggregate.py:91`).
- Antes de 2012, o `value` do mapa é uma redistribuição estatística, não uma contagem de dias (`etl/transform/harmonize.py:210-218`).

**Prioridades (roadmap, §10)**
- **Agora, só na API:** `education.py` + `learn` + correção da frase de anomalia + `/glossary` + testes de honestidade + procedência + `docs/ODS.md` + LICENSE.
- **Junto com o frontend:** níveis de linguagem, tooltips, legendas acessíveis, trilhas, modo professor e telemetria agregada e anônima.
- **Depois:** missões investigativas, kit offline, contexto ecológico com áreas protegidas (com consulta às comunidades), i18n e textos de previsão (quando `ml/` deixar de conter só `__init__.py`).

**Regra de alegação.** O sistema **contribui para** as metas, mas **não atinge** os indicadores oficiais. O 4.7.1 e o 13.3.1 medem a integração da educação para a cidadania global e para o desenvolvimento sustentável em políticas, currículos, formação docente e avaliação. O 17.18.1 mede a capacidade estatística nacional. Toda alegação de impacto precisa se apoiar num indicador registrado pelo próprio sistema (§11).

---

## 2. Metas ODS citadas (texto oficial resumido)

| Meta | O que diz (resumo do texto da ONU) | Como o projeto se relaciona | Ressalva |
|---|---|---|---|
| **4.4** | Aumentar substancialmente o número de jovens e adultos com habilidades relevantes, inclusive técnicas e profissionais, para emprego, trabalho decente e empreendedorismo | Letramento de dados e uso de dados abertos (CSV, filtros, leitura de gráficos) | "Competências digitais" vem do indicador 4.4.1 (habilidades em TIC). A meta é mais ampla. |
| **4.7** | Garantir que todos os estudantes adquiram conhecimentos e habilidades para promover o desenvolvimento sustentável, incluindo a educação para o desenvolvimento sustentável e a cidadania global | Camada interpretativa, pensamento crítico sobre dados de satélite | O indicador 4.7.1 mede políticas e currículos, não ferramentas |
| **13.3** | Melhorar a educação, a conscientização e a capacidade humana e institucional sobre mitigação, adaptação, redução de impacto e alerta precoce da mudança do clima | Explicar a sazonalidade e as anomalias do fogo e seus limites | Fogo no Cerrado não é só clima: há manejo e uso da terra |
| **15.1** | Assegurar a conservação, a recuperação e o uso sustentável dos ecossistemas terrestres e de água doce interiores (prazo original: 2020) | Monitoramento do fogo no Cerrado | O indicador 15.1.2 mede a cobertura de áreas-chave de biodiversidade por áreas protegidas, e não focos de calor |
| **15.2** | Promover a gestão sustentável de todos os tipos de florestas, deter o desmatamento e restaurar florestas degradadas (prazo original: 2020) | Fogo associado à conversão de vegetação | O Cerrado é sobretudo savana. A 15.2 só se aplica diretamente às formações florestais (cerradão, matas), por isso a ligação é parcial |
| **16.10** | Assegurar o acesso público à informação e proteger as liberdades fundamentais, conforme a legislação nacional e os acordos internacionais | API aberta, CSV, atribuição, linguagem acessível | O indicador 16.10.2 mede garantias legais nacionais |
| **17.18** | Até 2020, apoiar a capacitação dos países em desenvolvimento para aumentar significativamente a disponibilidade de dados de alta qualidade, atuais e confiáveis, desagregados por renda, gênero, idade, raça, etnia, situação migratória, deficiência, **localização geográfica** e outras características | Série harmonizada, validada e desagregada geograficamente (H3) | O indicador 17.18.1 mede a capacidade estatística nacional |

---

## 3. Matriz ODS × funcionalidade

| Meta | Funcionalidade | Status atual | Evidência (arquivo:linha) | Ação |
|---|---|---|---|---|
| **17.18** | Harmonização MODIS→VIIRS validada (leave-one-year-out, baseline MODIS bruto, diagnóstico fora da janela) | **Atende** | `docs/METHODOLOGY.md:65-100`; `api/main.py:231-258` | Traduzir as métricas para linguagem leiga em `learn` e colocar cada limitação junto do número que ela afeta |
| 17.18 | Proveniência (`last_etl_run`, `etl_runs`) | Parcial | `api/main.py:148-160`; `api/queries.py:117-124`; `db/schema.sql:112-121` | Objeto `procedencia` em cada resposta e endpoint `/provenance` legível |
| 17.18 | Regras de honestidade | Parcial (documentadas, não executáveis) | `docs/PLAN.md:58-62` | Testes de honestidade dos textos (§10.5) |
| **16.10** | API somente GET, CSV com atribuição | Parcial | `api/main.py:309-339`; `api/main.py:33-34`; `api/main.py:45` | LICENSE e licença dos dados derivados; CSV `planilha_br`; documentar a configuração de CORS público (hoje `localhost:3000` por padrão, `api/main.py:44`) |
| 16.10 | Acessibilidade (texto alternativo, tabela equivalente, linguagem simples) | Não atende | `web/README.md:1-3`; nenhum campo textual em `HexGridResponse` (`api/schemas.py:103-110`) | `learn.acessivel` (alt curto e longo, versão falável) e `?formato=tabela` |
| 16.10 / 4.4 | Baixa banda | Parcial (GZip ativo) | `api/main.py:47`; `boundary=True` por padrão em `api/main.py:200` e `:292` | Cache-Control/ETag por `last_etl_run`, `boundary=false` por padrão e `/resumo.txt` |
| **13.3** | Frase de anomalia pt-BR | Parcial | `api/main.py:103-121`; `api/schemas.py:62-64` | Reescrever (média diária, n de anos, NRT, sem z no nível simples) e estender a todas as visualizações |
| 13.3 | Limitações e aviso da previsão | Parcial (técnicos; as limitações só aparecem em `/harmonization`) | `api/main.py:261-271`, `:258`; `api/main.py:38-39` | Versões simples, aviso contextual por período e definição do evento previsto |
| **15.1/15.2** | Recorte "Cerrado — Matopiba" | Fraco | `config/regions.yaml:4-7` | Fichas determinísticas "Fogo no Cerrado" por mês e categoria; depois, camada de UCs e TIs feita com consulta |
| **4.7** | Camada interpretativa e pensamento crítico | Não atende | Nenhuma ocorrência de ODS ou educação no repositório | `learn`, "o que NÃO diz", perguntas guiadas, trilhas e modo professor |
| **4.4** | CSV filtrável por bbox, polígono e período | Base existe, sem mediação | `api/main.py:51-76`; `api/main.py:309-339` | Glossário, atividades com CSV e trilhas de letramento de dados |
| 4.7/13.3 | Medição de impacto educacional | Não atende; o access log do uvicorn registra o IP do cliente | `data/api.log:5` (hoje só `127.0.0.1`, uso local) | Telemetria agregada e anônima e `/impact`; desligar ou anonimizar o access log antes de publicar |
| (Previsão) | `/forecast`, `risk_next_7_days` | Indisponível (`ml/` só tem `__init__.py`) | `api/main.py:124-128`; `api/main.py:291-296` | Nenhuma alegação ODS pode se apoiar na previsão até haver métricas contra baselines (`docs/PLAN.md:55-56`) |

---

## 4. Diagnóstico

### 4.1 Pontos fortes já existentes

1. **Já existe um padrão de texto determinístico.** `Anomaly` separa `category` (Literal com 6 valores, `api/schemas.py:62-63`) de `sentence` (`api/schemas.py:64`). O frontend pode escolher tom, cor e ícone pela categoria, e o texto fica testável no backend. Esse é o molde de toda a camada `learn`.
2. **A formatação pt-BR está pronta:** `br_int` e `br_num` (`api/main.py:92-100`) e `MESES` (`api/main.py:36-37`).
3. **A categoria vem do percentil, não do z.** Isso é correto para contagens assimétricas, e o próprio código explica o motivo (`api/main.py:110`).
4. **O mês parcial já é sinalizado:** `obs_days`, `is_partial` e `daily_mean` (`api/schemas.py:36-38`; `api/main.py:106`).
5. **As limitações listadas são honestas** (`api/main.py:261-271`): um satélite VIIRS por dia, janela de calibração 2012–2023, deriva orbital, NRT, nuvens e fumaça, MODIS antes de 2012.
6. **A previsão está desligada de forma honesta.** Sem modelo, a resposta traz `available=False` e nenhum número inventado (`api/main.py:294-296`).
7. **Já há casos de ensino reais documentados:**
   - o percentil 0 da temporada de 2026, provavelmente exagerado pelo dado NRT, mas em parte corroborado pelo MODIS bruto: ago–out de 2026 é o 2º menor da série MODIS (`docs/METHODOLOGY.md:97-100`);
   - o salto de ~1,5× quando se somam satélites a partir de 2018 (`api/main.py:262-263`; `docs/METHODOLOGY.md:31-35`);
   - a razão VIIRS/MODIS estável em ~2,3–2,6 entre 2012 e 2023 (`docs/METHODOLOGY.md:31-32`).
8. **A API é a fonte da verdade do contrato.** O frontend espelha os schemas 1:1 (`api/schemas.py:1-2`), então texto, texto alternativo e legendas devem nascer na API.
9. **Já existe um teste de idioma da frase:** `tests/test_api.py:62-66` exige "células-dia" (ou "histórico") em `current.sentence`. Qualquer mudança de vocabulário precisa manter esse termo ou atualizar o teste.

### 4.2 Lacunas

**A. Precisão e vocabulário (corrigir antes de ampliar)**

| # | Problema | Evidência | Consequência |
|---|---|---|---|
| A1 | A unidade diz "células-dia **com fogo**", mas o dado registra uma célula de ~36 km² com ao menos uma **detecção de foco de calor** | `api/main.py:35`; `etl/transform/aggregate.py:91` | O leitor entende "incêndio confirmado" ou "área queimada" |
| A2 | A frase mostra `harmonized_total` (o total), mas o percentil é calculado sobre `daily_mean` | `api/main.py:115-117`; `etl/transform/harmonize.py:239`, `:243-257` | Num mês parcial aparece um número pequeno com percentil alto, e a conclusão fica incoerente |
| A3 | O percentil pode usar só 3 anos de referência, e a frase não informa n nem o intervalo de anos | `etl/transform/harmonize.py:249-250` | "Percentil 0" quer dizer apenas "menor que os n anos comparados" |
| A4 | A frase não tem aviso de NRT | `docs/METHODOLOGY.md:97-100`, `:112-113` | O percentil 0 de 2026 aparece sem ressalva |
| A5 | O z-score aparece no texto para leigos | `api/main.py:117` | É jargão, e o próprio código admite que o z engana (`api/main.py:110`) |
| A6 | Antes de 2012, o valor da célula é `modis_fire × w`, com w = MODIS calibrado ÷ MODIS bruto do dia (~2,4 em média) | `etl/transform/harmonize.py:212`, `:217-218` | No mapa antigo, `value` não é contagem de dias e pode passar de 1 por dia |
| A7 | Há massa calibrada não alocada em dias com MODIS = 0 | `etl/transform/harmonize.py:192-195`; `docs/METHODOLOGY.md:57-60` | Áreas personalizadas ficam subestimadas antes de 2012, o que pode criar uma tendência de alta artificial |
| A8 | No modo diário, `fire_days` é o `count()` das linhas célula-dia, incluindo dias em que só satélites fora da referência (ou só o MODIS) detectaram. No modo mensal, é o máximo entre as famílias, um limite aproximado | `api/queries.py:166`; `api/queries.py:177-180` | `fire_days` pode ser maior que `value`, e os dois modos não são comparáveis |
| A9 | `hotspot_count` vem antes da deduplicação entre satélites na região e depois dela numa área personalizada | `api/schemas.py:34-35` | Comparar esses números engana |
| A10 | Em `/comparison`, `viirs_hotspots` soma todos os satélites VIIRS, enquanto `viirs_cell_days` usa só o de referência | `api/main.py:219-227`; `etl/transform/aggregate.py:107-109`; `docs/METHODOLOGY.md:36` | Duas escalas misturadas lado a lado |
| A11 | A mensagem da previsão diz "detecção **de fogo**", o evento previsto não está definido no texto, falta a taxa histórica e `risk_class` é uma string livre sem limiar documentado | `api/main.py:133`; `api/schemas.py:191`; `api/main.py:38-39` | Leitura determinística ("vai queimar") |
| A12 | Numa área personalizada, o rótulo vira "a área selecionada" e a marca de amostra sintética se perde | `api/main.py:188`; `config/regions.yaml:8-11`; `docs/PLAN.md:59-60` | Viola a regra de honestidade sobre a amostra sintética |

**B. Lacunas pedagógicas e de conteúdo**
- Só existe texto para o **último mês**, e só em `/summary` (`api/main.py:194`). Calendário, mapa, comparação, harmonização e recentes chegam sem nenhuma explicação.
- Não há níveis de linguagem, glossário, perguntas guiadas, trilhas, modo professor nem missões.
- Falta contexto ecológico do Cerrado: fogo natural e manejo vs. regime alterado e desmatamento; Matopiba como fronteira agrícola.
- As limitações aparecem só em `/harmonization` (`api/main.py:258`) e nunca junto do número que afetam. Também faltam itens: foco ≠ área queimada, horário de passagem, tamanho mínimo detectável, poucos anos de referência e massa não alocada.

**C. Acessibilidade, alcance e governança**
- Não há texto alternativo nem tabela equivalente (WCAG 1.1.1, 1.3.1).
- Não há legenda nem paleta definidas pela API (WCAG 1.4.1, 1.4.11).
- O sinal de menos tipográfico (U+2212) pode ser lido como "traço" ou pulado por leitores de tela (`api/main.py:100`).
- O CSV começa com uma linha `#`, usa vírgula como separador e não tem BOM (`api/main.py:335-336`). Isso atrapalha a abertura no Excel e no LibreOffice em pt-BR.
- As mensagens de erro estão em inglês, e uma delas traz instrução de desenvolvedor (`api/main.py:61-74`, `:167`, `:184`).
- Falta um arquivo LICENSE. O CORS fica restrito a `localhost:3000` por padrão (`api/main.py:44`).
- O access log do uvicorn registra o IP do cliente (`data/api.log:5`, hoje só local). Numa implantação pública, isso conflita com o princípio da necessidade da LGPD (art. 6º, III) se o sistema passar a medir uso educacional.

---

## 5. Princípios dos textos educativos

### 5.1 Princípios de construção
1. **Determinismo total.** Templates pt-BR com placeholders preenchidos por campos da API, gatilhos com limiares documentados e nenhum LLM em tempo de execução. A mesma entrada sempre produz o mesmo texto, com o mesmo `id` estável (ex.: `cal.muito_acima.parcial`).
2. **Afirmação sempre com cautela.** Nenhum cartão declarativo sai sem ao menos um item em `nao_diz`. Nos casos de mapa, previsão e anomalia, sai também um aviso.
3. **Limitação no lugar certo.** O aviso aparece quando a condição vale para o período ou a área selecionados (NRT, era MODIS, área personalizada antes de 2012, amostra sintética, mês parcial, n pequeno), e não como lista genérica.
4. **Três níveis de linguagem** (o conselho se dividiu entre 2 e 3; prevaleceram 3, que atendem EF II, EM e público técnico):
   - `simples` (padrão): até 20 palavras por frase; sem "percentil", "z", "NRT", "H3" ou "quantil"; comparações do tipo "em 7 dos 10 anos comparados".
   - `estudante`: introduz o termo técnico com uma definição entre parênteses.
   - `tecnico`: o texto atual, mais método e referência.
5. **Descrever, nunca atribuir causa.** Fatores possíveis (seca, manejo, desmatamento) aparecem só como **hipóteses que o sistema não verificou**, sempre em lista ("pode ser A, B ou C").
6. **Comparar com referência explícita.** Nunca "normal" sozinho, e sim "na faixa típica dos {n_ref} anos comparados ({ano_min}–{ano_max})". Os códigos internos da categoria (`normal` etc.) não mudam; só o texto muda.
7. **Comparar médias diárias quando o mês é parcial**, porque o percentil é calculado sobre `daily_mean` (`etl/transform/harmonize.py:239`, `:249`).
8. **Herdar as regras de honestidade** (`docs/PLAN.md:58-62`):
   - a amostra sintética é sempre rotulada, inclusive em área personalizada;
   - o que não foi verificado é sinalizado. Por isso fichas sobre comunidades e códigos BNCC ficam marcados "a revisar" até serem validados por quem tem competência para isso.
9. **Vocabulário canônico:** "foco de calor", "detecção", "célula-dia com detecção de foco de calor", "probabilidade de detecção".
   - Decisão do conselho: o rótulo curto "células-dia com fogo" pode continuar como marca do projeto, desde que sempre acompanhado da explicação.
   - `UNIT` passa a ser "células-dia com detecção de foco de calor (H3 res {res}, ~36 km² cada; escala equivalente ao VIIRS)". O termo "células-dia" exigido por `tests/test_api.py:66` se mantém.
10. **Versão falável para leitor de tela:**
    - "menos 0,8" no lugar de "−0,8";
    - "cerca de" no lugar de "~" e "pelo menos" no lugar de "≥";
    - datas por extenso;
    - siglas expandidas na primeira ocorrência.

### 5.2 O que os textos **nunca** afirmam

Esta lista vira a constante `FORBIDDEN` (regex), verificada em testes. Termos negados explicitamente, como "não é área queimada" ou "não significa que toda a área esteja em chamas", são permitidos por uma lista de exceções.

| Nunca afirmar | Por quê | Alternativa |
|---|---|---|
| "área queimada", "hectares/km² queimados", "toda a área queimou", "em chamas" | O sistema não mede área queimada; outros produtos fazem isso (ex.: MCD64A1) | "detecção de foco de calor em uma célula de ~36 km²" |
| "incêndio confirmado", "número de incêndios" | Um incêndio gera vários focos, e um fogo pequeno pode não gerar nenhum | "detecções", "células-dia com detecção" |
| "causado por", "culpa", "desmatamento" como conclusão | O satélite não distingue manejo, acidente, desmatamento ou fogo natural | Hipóteses listadas e marcadas como "não verificadas" |
| "certeza", "vai queimar", "vai pegar fogo", "risco de incêndio" | A previsão é uma probabilidade de detecção | "probabilidade estimada de ao menos uma detecção" |
| "normal" sem referência | A referência mistura eras com incertezas diferentes | "faixa típica dos N anos comparados" |
| "o menor/maior da história" | n é finito, e o fim da série é NRT | "o menor dos N anos comparados (AAAA–AAAA)" + aviso NRT |
| "comprova", "prova" | O dado é um instrumento de monitoramento | "indica", "sugere", "merece investigação" |
| "sem fogo" para célula sem detecção | Nuvens, fumaça e o horário de passagem escondem focos | "nenhuma detecção registrada" |

---

## 6. Catálogo de textos por visualização

**Convenções**
- Placeholders sem marca são campos que a API **já retorna** (`api/schemas.py`).
- *(der.)* indica um valor **derivado**, calculado em `api/education.py` a partir da própria resposta, do DataFrame que o endpoint já carrega ou da configuração, sem mudar o banco.
- *(novo)* indica um **campo novo necessário**, que exige alteração em `queries.py`, no ETL ou no schema do banco.
- O texto mostrado é o do nível `simples`, salvo indicação.
- Cada visualização tem um bloco **"o que este dado NÃO diz"**, obrigatório e sempre visível.

**Avisos transversais (prefixados em qualquer visualização)**

| Código | Gatilho | Texto |
|---|---|---|
| `aviso.sintetico` | `region == "sample_tocantins"` (`config/regions.yaml:8-11`), inclusive em área personalizada sobre essa região. Melhor ainda: uma flag `synthetic: true` *(novo)* em `regions.yaml` | "Dados de **amostra sintética**, só para demonstração. Não representam queimadas reais." |
| `aviso.nrt` | O período selecionado termina depois de `provisional_from` *(novo)*. Esse limite **não existe hoje no banco nem na API**. Pode ser derivado da troca de referência para o NOAA-20 NRT em 2026-08-01 (`docs/METHODOLOGY.md:34-35`, `:112`) e de `nrt_sources` (`config/settings.yaml:15`), ou gravado pelo ETL em `etl_runs` | "Os dias a partir de {provisional_from} são **provisórios** (tempo quase real) e podem mudar quando a NASA publicar a versão definitiva." |
| `aviso.era_modis` | `start < 2012-01-20`, início da referência SNPP (`docs/METHODOLOGY.md:34`) | "Antes de 2012 só existia o satélite MODIS, menos sensível. Os valores desse período são **estimativas** na escala do VIIRS, com incerteza maior." |
| `aviso.custom_pre2012` | `area == "custom"` e `start < 2012-01-20` | "Em áreas desenhadas, os anos antes de 2012 tendem a aparecer menores do que foram: em média, cerca de {unplaced_pct}% do valor estimado para a região não pôde ser atribuído a hexágonos específicos. Uma 'alta' recente comparada a esse período pode ser, em parte, efeito do método." `unplaced_fraction` *(novo)*: hoje é só calculado e registrado em log (`etl/transform/harmonize.py:192-197`), não é persistido |

### 6.1 Calendário (`/calendar`, `/summary`)

**Campos:**
- já retornados: `CalendarCell.year, month, value, daily_mean, percentile, anomaly_zscore, is_partial, obs_days, is_top` (`api/schemas.py:28-41`) e `CalendarResponse.area, start, end` (`api/schemas.py:44-51`);
- derivados *(der.)*: `n_ref`, `ref_year_min/max` e `n_menor`, contados no DataFrame `q.monthly` que o endpoint já carrega, com a mesma regra de `etl/transform/harmonize.py:249` (mesmo mês, outros anos, só meses completos). Para áreas personalizadas, a regra também vale, porque `api/queries.py:151` chama `add_anomalies`. `dias_mes` vem de `year/month` (o `days_in_month` existe no DataFrame, `etl/transform/harmonize.py:236`, mas não em `CalendarCell`). `top_n` é o parâmetro da requisição (`api/main.py:164`).
- Recomendação: expor `n_ref`, `ref_year_min` e `ref_year_max` como campos *(novo)* opcionais em `CalendarCell` e `Anomaly`, para que o frontend não recalcule.

| id | Gatilho | Template (simples) |
|---|---|---|
| `cal.categoria.{cat}` | `percentile` não nulo; categoria pelos cortes de `api/main.py:111-112` | "{Mes} de {ano} ficou {desc_cat} para {area}, comparado a {n_ref} anos ({ano_min}–{ano_max}). Em {n_menor} desses {n_ref} anos, {mes} teve média diária menor." `desc_cat` ∈ {bem abaixo do que costuma ocorrer, abaixo do que costuma ocorrer, na faixa típica, acima do que costuma ocorrer, bem acima do que costuma ocorrer} |
| `cal.extremo` | `n_menor == 0` ou `n_menor == n_ref` | "É o {menor\|maior} valor de {mes} entre os {n_ref} anos comparados. Isso não quer dizer 'da história': são só {n_ref} anos." (+ `aviso.nrt`, se aplicável) |
| `cal.parcial` | `is_partial` | "{Mes} de {ano} ainda está incompleto: {obs_days} de {dias_mes} dias observados. Por isso comparamos a **média por dia** ({daily_mean} por dia), não o total." |
| `cal.n_pequeno` | `3 ≤ n_ref < 10` | "A comparação usa só {n_ref} anos. Com poucos anos, a posição muda muito se um único ano for diferente." |
| `cal.indisponivel` | `percentile is None` | "Ainda não há anos suficientes (mínimo de 3 completos) para comparar {mes} de {ano}." |
| `cal.top` | `is_top` | "Este é um dos {top_n} meses completos com mais células-dia com detecção no período escolhido." |
| `cal.sazonal` | *(der.)* mais de 70% do `value` anual entre julho e outubro na maioria dos anos selecionados (limiar a calibrar com os dados reais) | "Ano após ano, a maior parte das detecções acontece entre julho e outubro, na estação seca do Cerrado." |

Exemplo para o caso real do fim de 2026 (dados até 14/11/2026, `docs/METHODOLOGY.md:75`), no nível `estudante`. Combina `cal.parcial` + `cal.extremo` + `aviso.nrt` + a ficha estática `ctx.temporada_2026`:
> "Novembro de 2026 ainda está incompleto (14 de 30 dias observados), por isso comparamos a média de {daily_mean} células-dia com detecção de foco de calor **por dia**. Ela é {a menor\|...} entre os {n_ref} novembros comparados ({ano_min}–{ano_max}). Percentil é a posição de um valor numa lista ordenada. **Atenção:** os dias mais recentes são provisórios."

A ficha estática `ctx.temporada_2026` é texto fixo com fonte citada, não gerado de dados da API:
> "A metodologia do projeto indica que a posição muito baixa da temporada de agosto a outubro de 2026 provavelmente está exagerada pelos dados provisórios. Um segundo sensor (MODIS) também mostra uma temporada fraca, a segunda mais fraca desde 2003, mas não a mais fraca." (`docs/METHODOLOGY.md:97-100`)

**O que este dado NÃO diz**
- Não é área queimada: um hexágono de ~36 km² conta 1 no dia, seja 1 foco ou 500.
- Meses com muita nuvem ou fumaça podem parecer mais fracos do que foram.
- Antes de 2012 os valores são estimados a partir do MODIS.
- "Acima do que costuma ocorrer" não diz a causa.

**Perguntas guiadas** (rotina Ver–Pensar–Perguntar)
- Ver: "Em quais meses as cores ficam mais fortes, ano após ano?"
- Pensar: "O que acontece com a chuva no Cerrado nesses meses?"
- Perguntar: "Se este mês ficou acima do que costuma ocorrer, que outra informação você buscaria para entender o porquê (chuva, notícias locais, um produto de área queimada)?"

**Metas:** 13.3, 4.7, 4.4 (leitura de posição relativa), 17.18 (n e procedência).

### 6.2 Mapa hexagonal (`/hexgrid`)

**Campos:**
- já retornados: `HexCell.value, fire_days, modis_count, viirs_count, frp_sum, lat, lon` (`api/schemas.py:91-100`) e `HexGridResponse.granularity, start, end, max_value` (`api/schemas.py:103-110`);
- derivados *(der.)*:
  - `n_cells`, o número de células com detecção;
  - `top10_share`, a fração do `value` nas 10% células mais ativas;
  - `centroide_top`, a lat/lon média do decil superior, usada só se esse decil estiver agrupado (ex.: desvio < 1°);
  - `dias_periodo = end − start + 1`;
  - `frp_medio = frp_sum / (modis_count + viirs_count)`.

| id | Gatilho | Template (simples) |
|---|---|---|
| `mapa.concentracao.alta` | `top10_share ≥ 0,5` | "Você está observando uma **concentração** de focos de calor: {pct_top10}% das células-dia com detecção entre {inicio} e {fim} estão em só 1 de cada 10 hexágonos com detecção[, principalmente perto de {lat_c}, {lon_c}]. Isso pode indicar uma situação que merece investigação, mas **não significa que toda a área esteja em chamas**. Os dados de satélite são instrumentos de monitoramento e precisam ser interpretados junto com outras informações." (O trecho entre colchetes só aparece se o decil superior estiver agrupado.) |
| `mapa.concentracao.dispersa` | `top10_share < 0,3` | "As detecções estão espalhadas por muitos hexágonos, sem um grande agrupamento." |
| `mapa.recorrencia` | `granularity == "day"` e célula selecionada com `fire_days ≥ 0,4 × dias_periodo` | "Neste hexágono algum satélite registrou detecção em {fire_days} dos {dias_periodo} dias do período. Detecção repetida no mesmo lugar merece atenção, mas o satélite não diz se é manejo, limpeza de pasto, desmatamento ou incêndio." (Aqui `fire_days` conta qualquer satélite, ver A8.) |
| `mapa.intenso` | célula com `frp_medio` no decil superior | "As detecções deste hexágono tiveram **potência radiativa** alta em média. Potência indica a intensidade no instante da passagem, não o tamanho da área." |
| `mapa.sensor` | `viirs_count > 3 × modis_count` na célula | "O VIIRS registrou bem mais pontos que o MODIS aqui por dois motivos: enxerga fogos menores (pixels de 375 m contra 1 km) e esta contagem soma vários satélites VIIRS. Não houve mais fogo para um satélite do que para o outro." (`docs/METHODOLOGY.md:36`) |
| `mapa.mensal` | `granularity == "month"` | "Para este período, o mapa usa totais mensais, e o número de dias com detecção é uma **estimativa aproximada**." (A8) |
| `mapa.era_modis` | `start < 2012-01-20` | "Antes de 2012, os valores são estimativas distribuídas entre os hexágonos onde o MODIS detectou algo. Por isso um hexágono pode passar de 1 por dia. Use para ver padrões, não para contar dias." (A6) |
| `mapa.vazio` | `n_cells == 0` | "Nenhuma detecção registrada neste período e área. Isso não garante que não houve fogo: nuvens, fumaça e o horário das passagens podem esconder focos." |

**O que este dado NÃO diz**
- A cor indica células-dia com ao menos uma detecção, não a extensão do fogo. Um único foco colore o hexágono inteiro (~36 km², cerca de 3.600 hectares, algo como 5 mil campos de futebol).
- Hexágono sem cor não quer dizer "sem fogo".
- O mapa não indica causa nem responsável.

**Perguntas guiadas**
- "O que você percebe sobre onde os focos se agrupam?"
- "Essas áreas são lavoura, pastagem ou vegetação nativa? Este sistema não responde isso. Onde você buscaria?"
- "Como você comunicaria este mapa a vizinhos **sem exagerar**?"

**Metas:** 4.7, 13.3, 15.1, 16.10.

### 6.3 Comparação MODIS × VIIRS (`/comparison`)

**Campos:** `ComparisonPoint.year, month, modis_cell_days, viirs_cell_days, harmonized, modis_hotspots, viirs_hotspots` (`api/schemas.py:113-120`). Derivados *(der.)*:
- `razao_celulas = viirs_cell_days / modis_cell_days` (nula se o MODIS for 0 ou nulo);
- `razao_focos = viirs_hotspots / modis_hotspots`.

| id | Gatilho | Template (simples) |
|---|---|---|
| `comp.razao` | `2 ≤ razao_celulas ≤ 3` | "Em {mes} de {ano}, o VIIRS marcou {viirs_cell_days} células-dia e o MODIS {modis_cell_days}: cerca de {razao} vezes mais. Não houve mais fogo para um satélite do que para o outro. O VIIRS tem uma 'lente' mais fina e enxerga fogos menores. Por isso não dá para emendar as duas séries sem ajuste." |
| `comp.pre_viirs` | `viirs_cell_days is None` | "Em {ano}, ainda não havia dados do VIIRS (a série começa em 2012). Só há MODIS." |
| `comp.focos_vs_celulas` | `razao_focos > 1,3 × razao_celulas` (típico a partir de 2018) | "A contagem de **focos** do VIIRS soma vários satélites; a de **células-dia** usa só um satélite de referência por dia. Somar satélites inflaria as contagens em cerca de 1,5 vez." (A10; `api/main.py:262-263`) |
| `comp.razao_atipica` | `razao_celulas < 1,8` ou `> 3,2` | "Neste mês, a diferença entre os sensores fugiu do habitual (de 2,3 a 2,6 vezes entre 2012 e 2023). Pode ser efeito de nuvens, da mudança de órbita do MODIS (a partir de 2022) ou de dados provisórios." (`docs/METHODOLOGY.md:31-32`, `:39-42`) |

**O que este dado NÃO diz**
- A diferença entre as linhas não mede "fogo a mais"; mede a sensibilidade de instrumentos diferentes.
- Focos e células-dia são unidades diferentes.

**Perguntas guiadas**
- "Se um satélite novo vê o dobro de fogo, o fogo dobrou?"
- "Por que os cientistas escolhem um único satélite de referência?"

**Metas:** 4.7, 4.4, 17.18.

### 6.4 Harmonização (`/harmonization`)

**Campos:** `HarmonizationPoint.year, month, modis_raw, viirs_raw, modis_calibrated, harmonized, overlap`; `CalibrationMetric.method, scope, bias, rmse, r2, overlap_days`; `HarmonizationResponse.method, calibration_years, overlap_start/end, limitations` (`api/schemas.py:128-157`).

| id | Gatilho | Template (simples) |
|---|---|---|
| `harm.estimado` | ponto com `viirs_raw is None` e `modis_calibrated` não nulo (na prática, antes de 2012) | "Esta parte da linha é **estimada**: é o que o VIIRS provavelmente teria visto, calculado a partir do MODIS." |
| `harm.medido` | ponto com `viirs_raw` não nulo | "Desde 2012, a linha usa diretamente o que o VIIRS registrou (um satélite de referência por dia)." (`etl/transform/harmonize.py:205`) |
| `harm.validacao` | existe métrica do `method` padrão com escopo mensal | "Para testar a estimativa, o projeto escondeu um ano por vez e tentou adivinhá-lo com os outros. O ajuste explicou cerca de {r2_pct}% da variação mês a mês, e o erro típico foi de {rmse} células-dia por mês." (Valores reais de referência: r² ≈ 0,986 e RMSE ≈ 1.481, `docs/METHODOLOGY.md:81-85`. Os nomes exatos de `scope` gravados pelo ETL precisam ser conferidos antes de fixar o gatilho.) |
| `harm.vies` | `abs(bias)` > 5% da média mensal *(der.)* | "Em média, a estimativa ficou {acima\|abaixo} do valor medido em {abs_bias} células-dia por mês." |
| `harm.janela` | série inclui ano ≥ 2024 | "A partir de 2022, as órbitas dos satélites do MODIS mudaram e ele passou a se comportar diferente. Por isso o ajuste usa só 2012–2023. Nos anos recentes a linha não muda, porque usa o VIIRS diretamente." (`docs/METHODOLOGY.md:38-45`) |
| `harm.limitacoes` | sempre | Versão simples de cada item de `LIMITATIONS` (`api/main.py:261-271`), mostrando primeiro as que se aplicam ao período |

**O que este dado NÃO diz**
- A calibração não recupera fogo que nenhum satélite viu.
- "Harmonizado" não é a soma dos dois satélites.
- Antes de 2012 a incerteza é maior.

**Perguntas guiadas**
- "Antes de 2012, a linha é medida ou estimada? Como foi testado se a estimativa é boa?"
- "Por que é honesto mostrar o erro junto com o resultado?"

**Metas:** 17.18, 4.7, 4.4.

### 6.5 Detecções recentes (`/recent`)

**Campos:** `Detection.lat, lon, date, time_utc, satellite, sensor_family, frp, confidence_class`; `RecentResponse.truncated`; `RecentDay.date, harmonized, modis_fcd, viirs_fcd, hotspots_total` (`api/schemas.py:160-183`). Derivados *(der.)*:
- `hora_local`: `time_utc` está em HHMM (`etl/transform/normalize.py:4`), somado ao `timezone_offset_hours = −3` de `config/regions.yaml:7`. Esse deslocamento não é exposto pela API; o `education.py` o lê da configuração.
- `share_high`: fração com `confidence_class == "high"`.

| id | Gatilho | Template (simples) |
|---|---|---|
| `rec.passagem` | ponto selecionado | "Detecção do satélite {satellite} às {hora_local} (horário de Brasília) de {data}. O ponto marca o centro de um 'quadrado' de pelo menos {375 m\|1 km} (maior nas bordas da faixa do satélite), não a posição exata do fogo. O satélite só registra o que está quente **no instante em que passa**: um fogo que começou e apagou entre duas passagens não aparece." |
| `rec.provisorio` | último dia ≥ `provisional_from` *(novo; ver `aviso.nrt`)* | "Estes dados são provisórios e podem mudar um pouco." |
| `rec.confianca` | sempre que houver detecções | "Só aparecem detecções com confiança **nominal** ou **alta**; as de confiança baixa são descartadas antes. {pct_high}% destas têm confiança alta." (Filtro em `config/settings.yaml:19`; `etl/transform/quality.py:43-44`) |
| `rec.truncado` | `truncated` | "Mostrando só parte das detecções ({n}) para o mapa não ficar pesado. Baixe o CSV para ver todas." |
| `rec.frp` | ponto com `frp` | "Potência radiativa: {frp} megawatts. Mede quanta energia o fogo emitia naquele instante, não o tamanho da área." |
| `rec.dia_sem_obs` | `RecentDay.harmonized is None` | "Em {data}, não há dados de nenhum dos satélites para esta região (por exemplo, uma lacuna entre produtos). Ausência de dado não é ausência de fogo." (`etl/transform/harmonize.py:204-205`; `docs/METHODOLOGY.md:62-63`) |

**O que este dado NÃO diz**
- Não distingue queima agrícola, manejo, incêndio florestal ou outra fonte quente.
- Não indica o tamanho da área.
- Um ponto não é um incêndio.

**Perguntas guiadas**
- "Por que quase todas as detecções acontecem perto das mesmas horas?"
- "O que um fogo noturno curto teria de diferente?"

**Metas:** 4.4, 13.3, 16.10.

### 6.6 Previsão (`/forecast`, `risk_next_7_days`)

**Estado atual:** `available=False` (`ml/` só contém `__init__.py`; `api/main.py:294-296`). Até existirem métricas contra persistência e climatologia (`docs/PLAN.md:55-56`), **só o cartão `prev.indisponivel` é emitido**.

| id | Gatilho | Template (simples) |
|---|---|---|
| `prev.indisponivel` | `available == False` | "Ainda não há previsão para esta região. Preferimos não mostrar nada a mostrar um número que ainda não foi avaliado." |
| `prev.celula` | `available` e célula selecionada (`ForecastCell.probability`, `ForecastResponse.horizon_days`) | "Probabilidade estimada de **ao menos uma detecção** de foco de calor neste hexágono (~36 km²) nos próximos {horizon_days} dias: {prob}%." Uma segunda frase ("em situações parecidas, cerca de {k} em cada 10 tiveram detecção") **só sai se** a tabela de confiabilidade *(novo)* mostrar que o modelo é bem calibrado nessa faixa |
| `prev.taxa_base` | `available` e taxa climatológica disponível *(novo, em `metrics`)* | "Em semanas de {mes} dos anos anteriores, hexágonos desta região tiveram detecção em {base}% dos casos." |
| `prev.classe` | `risk_class` com limiar documentado *(novo: Literal fechado + limiares)* | "'{rotulo}' significa probabilidade de pelo menos {limiar}%." Sem limiar documentado, a classe **não aparece em texto** |
| `prev.desempenho` | `metrics` tipado *(novo; hoje é `dict` livre, `api/schemas.py:202`)* | "Em anos que o modelo não viu, ele foi {melhor\|pior} que repetir a semana anterior e que usar a média histórica." |

**O que este dado NÃO diz**
- Não diz se haverá incêndio, qual será o tamanho nem quem seria responsável.
- "Alto" não é "vai acontecer".

**Pergunta guiada:** "Se a probabilidade é 70% e não houve fogo, o modelo errou?"

**Metas:** 13.3, 4.4, 17.18.

---

## 7. Glossário

O conteúdo fica em `api/content/glossario.yaml` e é servido por `GET /glossary`. Cada termo tem `id`, `simples`, `tecnico`, `armadilha`, `exemplo_api` (opcional, preenchido com um valor real) e `en`/`es` (fase posterior).

| Termo (`id`) | Definição leiga | Armadilha comum |
|---|---|---|
| Foco de calor (`foco_de_calor`) | Ponto onde o satélite mediu calor anormal na superfície durante a passagem | Achar que cada foco é um incêndio. Um incêndio grande gera muitos focos, e um pequeno pode não gerar nenhum |
| Detecção (`deteccao`) | Registro de um foco por um satélite num instante | Somar detecções de satélites diferentes como se fossem fogos distintos |
| Célula-dia com detecção (`celula_dia`) | Um hexágono de ~36 km² em que algum satélite viu ao menos um foco num dia. 10 células-dia podem ser 1 lugar durante 10 dias ou 10 lugares num só dia | Ler como área queimada ou número de incêndios |
| Hexágono H3 (`h3`) | Pedaço de uma grade de hexágonos quase iguais que cobre o mapa (resolução 6 ≈ 36 km²) | Achar que o hexágono inteiro pegou fogo |
| Área queimada (`area_queimada`) | Superfície que de fato queimou, medida por outros produtos (ex.: MCD64A1) | **Este sistema não mede área queimada** |
| MODIS (`modis`) | Sensor nos satélites Terra (desde 2000) e Aqua (desde 2002), pixel de ~1 km | Comparar diretamente com o VIIRS |
| VIIRS (`viirs`) | Sensor mais novo (dados desde 2012), pixel de ~375 m, vê fogos menores | Achar que "mais focos no VIIRS" é "mais fogo" |
| Resolução (`resolucao`) | Tamanho do "quadradinho" que o sensor enxerga; cresce nas bordas da faixa | Tomar o ponto como posição exata do fogo |
| Passagem do satélite (`passagem`) | Momento em que o satélite sobrevoa a área (poucas vezes por dia) | Achar que o satélite vigia o tempo todo |
| NRT × processamento padrão (`nrt`) | NRT é o dado em tempo quase real, provisório. Depois é substituído pela versão definitiva (SP) | Tratar dado provisório como definitivo |
| Harmonização / calibração (`harmonizacao`) | Ajuste que coloca o MODIS na "escala" do VIIRS para formar uma série contínua desde 2003 | Achar que o harmonizado soma os dois satélites ou recupera fogo não visto |
| Validação (`validacao`) | Teste em que se esconde um ano e se verifica se o método consegue adivinhá-lo | Confiar no resultado sem olhar o erro |
| Viés, RMSE, R² (`metricas`) | Erro médio para cima ou para baixo; erro típico; quanto da variação o ajuste explica | Ler R² alto como "sem erro" |
| FRP (`frp`) | Potência radiativa do fogo, em megawatts: intensidade no instante da passagem | Ler como tamanho da área |
| Confiança da detecção (`confianca`) | Baixa, nominal ou alta: o quanto o sinal foi claro. Aqui as baixas são descartadas | Aceitar tudo sem olhar a confiança |
| Percentil (`percentil`) | Posição entre os anos comparados (50 = meio). "Percentil 90" = maior que 9 de cada 10 anos comparados | "Percentil 90 = 90% da região queimou". Com poucos anos, "percentil 0" só quer dizer "o menor daqueles N anos" |
| Escore z (`zscore`) | Quantos desvios-padrão acima ou abaixo da média | Usar com dados assimétricos e poucos anos (é por isso que o projeto classifica pelo percentil) |
| Faixa típica / anomalia (`anomalia`) | O quanto um mês se afasta do que costuma ocorrer no mesmo mês de outros anos | Tomar "acima" como prova de crime ou desastre |
| Mês parcial (`mes_parcial`) | Mês ainda em andamento, comparado pela média por dia | Comparar o total parcial com totais de meses completos |
| Probabilidade (`probabilidade`) | Chance estimada de um evento. Só vira "3 em cada 10" se o modelo for bem calibrado | Ler "alto" como "vai acontecer" |
| Taxa histórica (`taxa_base`) | Com que frequência o evento costuma ocorrer naquela época e lugar | Julgar uma previsão sem saber a taxa normal |
| Nuvens e fumaça (`omissao`) | Escondem focos de todos os sensores | Ler ausência de detecção como ausência de fogo |
| Correlação × causa (`correlacao_causa`) | Coisas que variam juntas não provam que uma causa a outra | Atribuir focos à seca, ao agronegócio ou a uma pessoa por coincidência no mapa |
| Amostra sintética (`sintetico`) | Dados inventados só para demonstração | Usá-los como resultado real |
| Cerrado e fogo (`cerrado_fogo`) | Muitas plantas do Cerrado rebrotam após o fogo, e há queima de manejo legítima. O problema é o fogo frequente, fora de época ou ligado ao desmatamento | Achar que todo foco é crime ou dano, ou que todo fogo é natural |
| Manejo Integrado do Fogo (`mif`) | Queimas planejadas, em geral no início da seca, para reduzir o material combustível e evitar grandes incêndios (praticadas, por exemplo, pelo ICMBio e pelo Prevfogo/Ibama) | Confundir queima prescrita com incêndio |

---

## 8. Trilhas de aprendizagem e modo professor

### 8.1 Trilhas (`GET /learn/paths`, conteúdo em `api/content/paths.yaml`)

Cada etapa traz:
- objetivo verificável;
- `view` com filtros pré-configurados (`region`, `start`, `end`);
- `card_id` principal;
- pergunta de saída.

O progresso fica só no navegador (`localStorage`), sem conta.

| Trilha | Público | Etapas |
|---|---|---|
| **T1 — Lendo o fogo pelo satélite** | EF II, público geral | (1) O que é um foco de calor? (`recent`, `rec.passagem`); (2) Por que hexágonos? (`hexgrid`, `celula_dia`); (3) O ritmo do fogo (`calendar` 2015–2025, `cal.sazonal`); (4) Este ano é diferente? (`cal.categoria.*`); (5) Cuidado com conclusões (`aviso.nrt`, `mapa.vazio`) |
| **T2 — Dois satélites, uma história** | EM | (1) `comparison` 2010–2016 (`comp.pre_viirs`); (2) razão VIIRS/MODIS (`comp.razao`); (3) por que não emendar as séries; (4) `harmonization` (`harm.estimado`); (5) validação (`harm.validacao`); (6) deriva orbital (`harm.janela`) |
| **T3 — O fogo no Cerrado** | EF II/EM, Geografia | (1) Cerrado e fogo (`cerrado_fogo`); (2) sazonalidade seca/chuva; (3) concentração espacial (`mapa.concentracao.alta`); (4) hipóteses sem atribuir causa (`correlacao_causa`); (5) comunicar sem alarmismo |
| **T4 — Probabilidade não é certeza** | EM, EJA | **Bloqueada** até `/forecast` ter `available=True` e métricas contra baselines |

Exemplo de etapa (T1, 3/5):
> "Objetivo: identificar o período com mais detecções no Cerrado e relacioná-lo à estação seca. Abra o calendário de 2015 a 2025. Pergunta de saída: em qual trimestre aparece a maior parte das células-dia com detecção? Cite dois anos como evidência."

### 8.2 Modo professor
- Cada cartão ganha `dica_professor`, com a resposta esperada e o equívoco comum, visível só nesse modo.
- Ficha do aluno imprimível, gerada a partir dos cartões no nível `estudante`.
- Link com filtros prontos e o CSV de `/export.csv`.
- **Códigos BNCC marcados "a verificar por docente"** antes de publicar, pela regra "o que não foi verificado é sinalizado" (`docs/PLAN.md:61-62`).

### 8.3 Roteiro de aula exemplo (50 min): "Dá para confiar no satélite?"

- **Público:** 9º ano do EF ou 1ª série do EM.
- **BNCC** (a verificar por docente):
  - Competências gerais 2 (pensamento científico, crítico e criativo), 5 (cultura digital), 7 (argumentação com base em fatos e dados) e 10 (responsabilidade e cidadania);
  - EF07GE11 (componentes físico-naturais e biomas brasileiros, incluindo o Cerrado; retomada);
  - EM13MAT102 (analisar tabelas e gráficos e identificar inadequações que possam induzir a erros de interpretação);
  - EM13CNT301 (construir questões, elaborar hipóteses e interpretar dados).
- **ODS:** 4.7, 4.4, 13.3, 15.1, 17.18.
- **Materiais:** API e frontend (ou CSV impresso / kit offline), fichas do aluno e quadro.

| Tempo | Etapa | Atividade | Recurso do sistema |
|---|---|---|---|
| 0–5' | Abertura | Pergunta-provocação: "Se um satélite novo vê o dobro de fogo, o fogo dobrou?" A turma vota | — |
| 5–15' | Exploração 1 (duplas) | Mapa dos últimos 30 dias: localizar a maior concentração e ler o cartão `mapa.concentracao.alta`. Registrar "o que o mapa diz / o que NÃO diz" | `/hexgrid` + `learn` |
| 15–27' | Exploração 2 (duplas) | Comparação 2010–2016: anotar `modis_cell_days` e `viirs_cell_days` de 3 meses e calcular a razão. Discutir `comp.razao` | `/comparison` |
| 27–37' | Sistematização (turma) | Harmonização: o que é estimado e o que é medido; ler o cartão de validação (erro junto do resultado). Glossário: resolução, calibração, validação | `/harmonization`, `/glossary` |
| 37–45' | Leitura crítica | Calendário de 2026: a temporada "mais fraca" é confiável? Ler `cal.extremo` + `aviso.nrt` + a ficha `ctx.temporada_2026` e relacionar com dado provisório | `/calendar` |
| 45–50' | Saída | Cada aluno escreve **uma frase verdadeira e uma exagerada** sobre os dados; a turma classifica usando a tabela "nunca afirmar" (§5.2) | Ficha do aluno |

- **Avaliação formativa:** a frase verdadeira usa a unidade correta e cita uma limitação; a exagerada é identificada pelos colegas.
- **Equívocos comuns:** "harmonizado = soma dos satélites"; "hexágono colorido = área queimada"; "percentil 0 = nunca houve tão pouco fogo".

---

## 9. Acessibilidade e inclusão

1. **Alternativa textual nascida na API** (WCAG 1.1.1; eMAG, recomendação 3.6). Em toda resposta, `learn.acessivel` traz:
   - `alt_curto` (até 150 caracteres, para `aria-label`);
   - `descricao_longa` (3 a 6 frases, para `aria-describedby` ou `<details>`);
   - `destaques[]`;
   - `falavel` (sem U+2212, "z", "≥", "×" ou "~").
   - Exemplo: "Mapa de hexágonos do Cerrado — Matopiba, de 16 de outubro a 14 de novembro de 2026: {n_cells} hexágonos tiveram ao menos uma detecção de foco de calor."
2. **Tabela equivalente** (`?formato=tabela`): `{cabecalhos_ptbr, linhas formatadas, legenda_tabela, resumo}`, para um `<table>` semântico com `<caption>` e `<th scope>` ao lado de cada gráfico. Para o mapa, as N células mais ativas com coordenadas arredondadas, o que dá uma alternativa de teclado ao Leaflet (WCAG 1.3.1, 2.1.1).
3. **Legendas e paletas definidas pela API** (`GET /legends` ou dentro de `/meta`):
   - escala sequencial cividis/viridis para células-dia;
   - escala divergente azul↔laranja para as 6 categorias de anomalia (nunca verde↔vermelho);
   - escala ordinal para `risk_class`, que vira um Literal fechado `baixo|moderado|alto|muito_alto` com `risk_label`. Hoje é `str` (`api/schemas.py:191`; `db/schema.sql:107`), e o código já compara com "alto" e "muito_alto" (`api/main.py:130-131`).
   - Cada classe tem cor, contorno, padrão (hachura ou pontilhado) e ícone, com contraste testado: ≥ 3:1 para elementos gráficos e ≥ 4,5:1 para texto (WCAG 1.4.1, 1.4.3, 1.4.11). Meses parciais levam hachura, nunca só cor.
4. **Linguagem simples verificada:**
   - nível `simples` com frases de até 20–25 palavras;
   - índice de Flesch adaptado ao português (Martins et al., 1996) ≥ 50;
   - sem jargão (WCAG 3.1.3, 3.1.5).
5. **Baixa banda e escolas rurais:**
   - `Cache-Control: public, max-age=3600` + ETag derivado de `last_etl_run`, com resposta 304;
   - `boundary=false` por padrão em `/hexgrid` e `/forecast` (`api/main.py:200`, `:292`), com o cliente reconstruindo os polígonos via h3-js;
   - reduzir de 5 para 4 casas decimais em `cell_geo` (`api/queries.py:99-101`);
   - `?leve=true`;
   - `GET /resumo.txt` (< 1 KB, até 3 frases) para WhatsApp, rádio comunitária e mural;
   - orçamento de payload testado.
6. **CSV amigável a planilhas pt-BR** (`?formato=planilha_br`): separador `;`, decimal `,`, UTF-8 com BOM, colunas em português e atribuição num LEIA-ME separado (hoje vai numa linha `#`, `api/main.py:335`). Mais tarde, `GET /kit.zip` com CSV, LEIA-ME simples, glossário, HTML estático imprimível e 3 atividades, para levar em pendrive.
7. **Erros em linguagem do usuário:** `{codigo, mensagem_usuario (pt-BR), detalhe_tecnico}` no lugar de "no monthly statistics loaded" ou "Run: python tasks.py etl" (`api/main.py:61-74`, `:167`, `:184`).
8. **i18n:** catálogo `api/i18n/{pt_BR,es,en}.yaml`, `lang=` ou Accept-Language, e `Content-Language` (WCAG 3.1.1).
   - Ordem: pt-BR → en (banca do Space Apps) → es.
   - Línguas indígenas da região só com tradução **coproduzida** e marcada "revisado por", nunca com tradução automática.
9. **Representatividade sem estigma:**
   - fichas sobre o fogo tradicional e o MIF (indígenas, quilombolas, geraizeiros, quebradeiras de coco, brigadas), com fontes citadas e marcadas "a revisar com comunidades" até haver coautoria;
   - **nenhum ranking de focos por terra indígena ou quilombo**;
   - sobreposição territorial só com consulta.
10. **Diretrizes para o frontend** (registrar já em `web/README.md`):
    - foco visível;
    - alvos de toque ≥ 24×24 px (WCAG 2.5.8);
    - sem animação temporal automática (2.2.2) e com respeito a `prefers-reduced-motion`;
    - zoom de 200%;
    - link "pular mapa";
    - testes com NVDA e com TalkBack em Android básico;
    - página inicial < 500 KB.

---

## 10. Proposta técnica

### 10.1 Módulo `api/education.py` (novo)

Decisão do conselho: um único nome. As propostas `explain.py`, `edu.py` e `textos.py` foram unificadas aqui.

- **Funções puras**, sem I/O. Recebem o modelo Pydantic já calculado mais um contexto e devolvem `Learn`:
  - `learn_calendar(resp: CalendarResponse, ctx) -> Learn`;
  - `learn_summary`, `learn_hexgrid`, `learn_comparison`, `learn_harmonization`, `learn_recent`, `learn_forecast`.
- **Contexto** (`LearnContext`): `nivel`, `area_label`, `is_synthetic`, `provisional_from`, `n_ref`/`ref_years`, `unplaced_fraction`, `last_etl_run`, `top_n`, `tz_offset`.
- **Motor de regras:** lista ordenada de `Rule(id, view, gatilho: Callable[[dados, ctx], bool], slot, template_id, ods, glossario)`. Em cada slot (`situacao`, `cautela`, `contexto`), vence a primeira regra que casar. Os avisos transversais (§6) são cumulativos.
- **Templates** em `api/content/templates.yaml`, no formato `{id: {simples, estudante, tecnico, falavel?}}`, formatados com `br_int`/`br_num`. A versão falável usa `falavel()`.
- **Constantes:**
  - `VOCAB`, com os termos canônicos;
  - `FORBIDDEN`, com os regex de §5.2 e a lista de exceções para negações explícitas;
  - `LIMITATIONS_SIMPLES`, paralela a `LIMITATIONS`. Esta ganha os itens que faltam: foco ≠ área queimada, horário de passagem, tamanho mínimo detectável, equivalência NRT→SP não verificada no fim da série (`docs/METHODOLOGY.md:112-113`), poucos anos de referência e massa não alocada em áreas pequenas.
- **`anomaly_sentence`** (`api/main.py:103-121`) passa a delegar ao `education.py`:
  - `sentence` mantém a versão técnica, para retrocompatibilidade e para `tests/test_api.py:62-66`, já corrigida: média diária se o mês for parcial, n e anos, aviso NRT e "faixa típica";
  - nova chave `Anomaly.sentences: dict[nivel, str]`;
  - novos campos `n_ref`, `ref_year_min`, `ref_year_max`, `is_provisional` e `caveats`.
- **Correções de texto:**
  - `UNIT` (`api/main.py:35`) muda para a forma de §5.1, item 9;
  - a mensagem de `RiskSummary` (`api/main.py:133`) passa a dizer "detecção de foco de calor".

### 10.2 Contrato do campo `learn`

O campo fica em `api/schemas.py`, como opcional em `CalendarResponse`, `Summary`, `HexGridResponse`, `ComparisonResponse`, `HarmonizationResponse`, `RecentResponse` e `ForecastResponse`. É aditivo e não quebra o espelho TS planejado (`api/schemas.py:1-2`).

```python
Nivel = Literal["simples", "estudante", "tecnico"]
View  = Literal["calendario", "resumo", "mapa", "comparacao", "harmonizacao", "recentes", "previsao"]

class LearnCard(BaseModel):
    id: str                      # estável, ex.: "mapa.concentracao.alta"
    slot: Literal["situacao", "cautela", "contexto"]
    gatilho: str                 # descrição legível da regra, ex.: "top10_share>=0.5"
    titulo: str
    texto: str
    dica_professor: Optional[str] = None

class Caveat(BaseModel):
    codigo: Literal["sintetico", "nrt", "era_modis", "custom_pre2012", "parcial", "n_ref_pequeno",
                    "truncado", "previsao_indisponivel"]
    texto: str

class GuidedQuestion(BaseModel):
    tipo: Literal["ver", "pensar", "perguntar", "limite_do_dado", "cidadania"]
    texto: str

class Provenance(BaseModel):
    fonte: str                   # ATTRIBUTION
    atualizado_em: Optional[datetime]
    provisional_from: Optional[date]   # campo novo (ver aviso.nrt)
    eras: list[str]              # "estimado_MODIS", "VIIRS_SNPP", "VIIRS_NOAA20_NRT"
    is_synthetic: bool
    metodo: Optional[str] = None

class Accessible(BaseModel):
    alt_curto: str               # <= 150 caracteres
    descricao_longa: str
    falavel: str
    destaques: list[str] = []

class Learn(BaseModel):
    version: str = "learn-1"
    view: View
    nivel: Nivel
    cards: list[LearnCard]
    nao_diz: list[str]           # min_length=1 (obrigatório)
    avisos: list[Caveat]
    perguntas: list[GuidedQuestion]
    procedencia: Provenance
    acessivel: Accessible
    glossario: list[str]         # ids de /glossary
    ods: list[str]               # ex.: ["4.7", "13.3"]
```

- **Parâmetros comuns:**
  - `learn: bool = True`, para que clientes de baixa banda possam omitir o campo;
  - `nivel: Nivel = "simples"`.
- **Endpoint autônomo opcional:** `GET /learn?view=...&nivel=...`, com o mesmo `Depends(Area)`, para o frontend pedir só a explicação.
- **Campos derivados novos e baratos** (opcionais), para que os gatilhos não dependam de lógica no frontend:
  - `HexGridResponse.top10_share`, `n_cells` e `total_value`;
  - `RecentResponse.share_high_confidence`;
  - `ComparisonPoint.viirs_modis_ratio`;
  - `HarmonizationResponse.default_metric`;
  - `CalendarCell`/`Anomaly`: `n_ref`, `ref_year_min` e `ref_year_max`;
  - `ForecastResponse.metrics` tipado (`auc`, `brier`, `skill_vs_persistence`, `skill_vs_climatology`, `limiares`, `taxa_base`, `confiabilidade`) no lugar do `dict` livre (`api/schemas.py:202`).

### 10.3 Endpoints novos

| Endpoint | Retorno | Fonte |
|---|---|---|
| `GET /glossary?nivel=` | `list[GlossaryTerm{id, termo, simples, tecnico, armadilha, exemplo_api?, ods}]` | `api/content/glossario.yaml` |
| `GET /glossary/{id}` | um termo | idem |
| `GET /learn/paths` | `list[LearningPath{id, titulo, publico, ods, bncc (flag a_verificar), etapas[{ordem, objetivo, view, params, card_id, pergunta_saida}]}]` | `api/content/paths.yaml` |
| `GET /learn/paths/{id}` | uma trilha, com filtros resolvidos para a região padrão | idem |
| `GET /provenance` | `Provenance` + frase-resumo pt-BR + contagens de `etl_runs` | settings + `etl_runs` (`db/schema.sql:112-121`) |
| `GET /legends` | escalas acessíveis (§9, item 3) | `config/settings.yaml` |
| `GET /resumo.txt` | texto puro de até 3 frases | `education.py` |
| *(com frontend)* `POST /telemetry/{event}` | 204 | enum fechado; só contadores diários (exige liberar POST no CORS, hoje `allow_methods=["GET"]`, `api/main.py:45`) |
| *(com frontend)* `GET /impact` | agregados com supressão de contagens < 10 | `learning_events_daily` |

### 10.4 Dados e infraestrutura
- `etl/transform/harmonize.py`:
  - `add_anomalies` (`:243-257`) passa a devolver também `n_ref`, `ref_year_min` e `ref_year_max`;
  - `unplaced_fraction`, que já é calculada em `:192-195` e retornada em `HarmonizationResult` (`:198`), passa a ser persistida.
- `db/schema.sql`:
  - colunas `n_ref`/`ref_year_min`/`ref_year_max` nas estatísticas mensais;
  - `unplaced_fraction` e `provisional_from` como colunas em `etl_runs` ou numa tabela de metadados da harmonização;
  - *(com frontend)* `learning_events_daily(date, view, nivel, event, count)` **sem IP, user-agent, cookie ou ID de sessão**.
- Rodar o uvicorn com `--no-access-log`, ou com log anonimizado (`tasks.py`), antes de qualquer telemetria ou implantação pública.
- Adicionar `LICENSE` para o código (ex.: MIT) e declarar a licença dos dados derivados (ex.: CC BY 4.0, mantendo a atribuição FIRMS). A política de uso de dados da FIRMS deve ser conferida e registrada em `docs/DATA_DICTIONARY.md`.

### 10.5 Testes

**`tests/test_education.py` (novo).** Hoje só `tests/test_api.py:62-66` toca o conteúdo do texto, verificando "células-dia" na frase, e `:91` exige pelo menos 3 limitações.
1. **Cobertura combinatória:** 6 categorias × parcial/completo × região/custom × NRT sim/não × era MODIS sim/não × n_ref {3, 8, 23} × 3 níveis. Todo caso produz `cards` não vazio, `nao_diz` com pelo menos 1 item e `acessivel.alt_curto` com até 150 caracteres.
2. **Termos proibidos:** nenhum texto casa com `FORBIDDEN` fora das exceções de negação.
3. **Avisos obrigatórios:**
   - `is_provisional` → "provisório";
   - `is_partial` → "incompleto" e "por dia";
   - `start < 2012` → "estimad";
   - região sintética (inclusive custom) → "sintética";
   - views mapa, anomalia e previsão → presença de `cautela` ou `nao_diz`.
4. **Posição relativa com n:** todo texto que menciona posição relativa contém `n_ref` e o intervalo de anos.
5. **Previsão:**
   - `available=False` → só `prev.indisponivel`;
   - textos de previsão contêm "probabilidade" e nunca "certeza" ou "vai";
   - sem tabela de confiabilidade, nenhuma frase "em cada 10".
6. **Linguagem simples:** sem `{"percentil", "z =", "NRT", "H3", "quantil", "VIIRS-equivalente"}`, frases de até 25 palavras e Flesch-PT ≥ 50.
7. **Versão falável:** sem U+2212, "≥", "×" ou "~".
8. **Formatação pt-BR:** vírgula decimal e ponto de milhar, coerentes com `br_num`/`br_int`.
9. **Determinismo:** a mesma entrada produz o mesmo texto e os mesmos `ids` (snapshot).

**`tests/test_api.py` (extensão)**
- `/glossary` e `/learn/paths` retornam conteúdo válido;
- todo id de glossário referenciado em `learn` existe em `/glossary`;
- `learn=false` omite o campo;
- contraste das legendas;
- orçamento de payload (`/summary` < 5 KB; `/hexgrid?leve=true` < 300 KB com gzip);
- `tests/test_api.py:66` continua passando após a mudança de `UNIT`.

---

## 11. Roadmap priorizado

Esforço: P = até 1 dia, M = 2–4 dias, G = mais de 1 semana.

### Agora: só API (sem depender do frontend)

| # | Entrega | Prioridade | Esforço | Metas |
|---|---|---|---|---|
| 1 | Corrigir `anomaly_sentence`: média diária se parcial, `n_ref` e anos, aviso NRT, "faixa típica", sem z no nível simples; novos campos em `Anomaly` | Alta | M | 17.18, 13.3, 4.7 |
| 2 | Vocabulário: novo texto de `UNIT`, mensagem de `RiskSummary`, `FORBIDDEN` + teste | Alta | P | 17.18, 16.10 |
| 3 | `api/education.py` + contrato `learn` em calendário, resumo, mapa, comparação, harmonização, recentes e previsão (catálogo §6, 3 níveis) | Alta | M | 4.7, 13.3, 4.4 |
| 4 | Avisos de procedência (`sintetico`, `nrt`, `era_modis`, `custom_pre2012`) + `Provenance` + `/provenance` + campo `provisional_from`; `LIMITATIONS` completa, contextual e com versão simples | Alta | M | 17.18, 16.10 |
| 5 | `GET /glossary` + `glossario.yaml` (§7) | Alta | P | 4.4, 4.7, 15.1 |
| 6 | Testes de honestidade e legibilidade (§10.5) | Alta | P | 17.18, 4.7 |
| 7 | `learn.acessivel` (texto alternativo curto, longo e falável) + `?formato=tabela` | Alta | M | 16.10, 4.4 |
| 8 | `docs/ODS.md` (matriz §3 + "o que NÃO afirmamos") + LICENSE + licença dos dados | Alta | P | 16.10, 17.18, todas |
| 9 | Desligar ou anonimizar o access log com IP | Alta (pré-requisito do 18) | P | 16.10 (LGPD) |
| 10 | Baixa banda: cache/ETag, `boundary=false` por padrão, 4 casas decimais, `/resumo.txt` | Média | P | 4.4, 16.10 |
| 11 | Erros pt-BR estruturados; CSV `planilha_br` | Média | P | 16.10, 4.4 |
| 12 | `risk_class` como Literal + `/legends` com paletas seguras | Média | P | 16.10, 17.18 |
| 13 | Semântica de campos: `fire_days` (só referência, ou renomear e documentar), `hotspot_count` bruto/deduplicado, `viirs_hotspots` de referência | Média | M | 17.18, 4.4 |
| 14 | Persistir `unplaced_fraction`; aviso de viés entre eras em área personalizada | Média | M | 17.18, 4.7 |
| 15 | `GET /learn/paths` com T1–T3 (T4 bloqueada) | Média | P | 4.7, 4.4, 13.3 |
| 16 | Fichas "Fogo no Cerrado" por mês e categoria (`contexto_cerrado.yaml`, com fontes; trechos sobre comunidades marcados "a revisar") | Média | M | 15.1, 15.2, 13.3 |

### Com o frontend (Next.js + Recharts + react-leaflet)

| # | Entrega | Prioridade | Esforço | Metas |
|---|---|---|---|---|
| 17 | Painel "Entenda esta visualização" ligado a `learn`, seletor de nível, tooltips do glossário e cartão fixo "Foco de calor não é área queimada" | Alta | M | 4.7, 13.3 |
| 18 | Telemetria agregada e anônima (`POST /telemetry`, `GET /impact`) com aviso de privacidade | Alta | M | 4.7, 13.3, 4.4 |
| 19 | Requisitos de acessibilidade (§9, item 10): `aria-describedby`, tabela equivalente, teclado no mapa, legendas com padrão e ícone | Alta | M | 16.10, 4.4 |
| 20 | Interface das trilhas + modo professor + ficha do aluno imprimível | Média | M | 4.7, 4.4 |
| 21 | Quiz pré/pós de interpretação crítica (alimenta o I3) | Média | M | 4.7 |

### Depois

| # | Entrega | Prioridade | Esforço | Metas |
|---|---|---|---|---|
| 22 | Missões investigativas (M1 "Detetive da temporada 2026", M2 "O salto de 2012", M3 "O degrau de 2018", M4 "Fogo recorrente", M5 "Intenso ou extenso?"), com critério de conclusão calculado pela API | Média | G | 4.7, 4.4, 17.18 |
| 23 | Kit offline `GET /kit.zip`; PWA com cache do último kit | Média | M | 4.4, 16.10 |
| 24 | i18n en/es; traduções indígenas coproduzidas | Média | M | 16.10, 4.7 |
| 25 | Camada de UCs com a fração de células-dia com detecção dentro de áreas protegidas: indicador **próprio**, relacionado à meta 15.1 (não é o indicador oficial 15.1.2). TIs e quilombos só com consulta e sem ranking | Baixa | G | 15.1, 15.2 |
| 26 | Textos completos de previsão (taxa base, limiares, confiabilidade) quando `ml/` produzir métricas contra persistência e climatologia; liberar T4 | Média (bloqueada) | M | 13.3, 4.4, 17.18 |
| 27 | Validação dos códigos BNCC por docentes e teste com turmas-piloto | Alta para alegar impacto | M | 4.7 |

---

## 12. Indicadores de impacto educacional

**Princípios**
- Só métricas registradas pelo próprio sistema.
- Dados agregados por dia, sem dado pessoal (LGPD, art. 6º, III, princípio da necessidade).
- Publicação em `/impact` com supressão de contagens < 10.
- Cada indicador amarrado a uma meta e a um limite explícito do que se pode alegar.

| Código | Indicador | Cálculo | Meta ODS | Limiar sugerido p/ status "atende" em `docs/ODS.md` | O que **não** afirmamos |
|---|---|---|---|---|---|
| **I1** | Taxa de abertura das explicações | `explain_opened / view_opened`, por visualização | 4.7, 13.3 | ≥ 30% | Que o usuário leu ou entendeu |
| **I2** | Taxa de leitura das limitações | `limitation_expanded / view_opened` | 17.18, 4.7 | ≥ 15% | Que o usuário aplicou a limitação |
| **I3** | Ganho em interpretação crítica | acerto pós − acerto pré em perguntas fechadas (ex.: "hexágono colorido = área queimada?"), anônimo, na mesma sessão de página | 4.7, 13.3 | ganho > 0 com n ≥ 100 respostas | Mudança de comportamento ou de atitude |
| **I4** | Reuso de dados abertos | exportações de CSV e kit por mês | 16.10, 4.4 | tendência crescente | Que os dados foram bem usados |
| **I5** | Profundidade de uso | proporção de uso dos níveis `estudante` e `tecnico`; termos de glossário abertos por sessão | 4.4 | — | Proficiência digital |
| **I6** | Uso escolar | trilhas iniciadas e concluídas; ativações do modo professor | 4.7 | ≥ 1 turma-piloto documentada | Adoção curricular |
| **I7** | Acesso inclusivo | requisições com `formato=tabela`, `/resumo.txt`, `leve=true` e `kit.zip` | 16.10 | — | Número de pessoas com deficiência atendidas (não é medido) |

Os limiares sugeridos são metas internas do projeto, sem base em literatura; devem ser revistos após o piloto.

**Indicadores de qualidade do produto** (medidos em CI, sem usuários):
- **Q1:** % de respostas de visualização com `learn` válido. Alvo: 100%.
- **Q2:** casos combinatórios aprovados nos testes de honestidade. Alvo: 100%.
- **Q3:** legibilidade do nível `simples`: Flesch-PT médio ≥ 50 e nenhuma frase com mais de 25 palavras.
- **Q4:** cobertura do glossário: todo id de glossário referenciado existe.
- **Q5:** paletas aprovadas no teste de contraste.
- **Q6:** % de conteúdos sensíveis (BNCC, comunidades) com status "revisado por" vs. "a verificar".

**Declaração-padrão para `docs/ODS.md` e para a página "Sobre":**
> "O Calendário de Queimadas é um recurso educacional aberto que **contribui para** as metas 4.4, 4.7, 13.3, 15.1/15.2, 16.10 e 17.18 dos Objetivos de Desenvolvimento Sustentável. Não medimos os indicadores oficiais da ONU (como 4.7.1, 13.3.1 e 17.18.1), que avaliam políticas e capacidades nacionais. Medimos, de forma agregada e anônima, a exposição a conteúdo interpretativo e o acerto em perguntas de leitura crítica. Contamos apenas quantas vezes cada explicação foi aberta por dia, sem identificar você: não usamos cookies nem guardamos seu endereço IP."

(A última frase só pode ser publicada depois da entrega 9 do roadmap, que desliga ou anonimiza o access log.)

---

## Notas da revisão

Revisão cética feita em 15/11/2026, com leitura direta do código. Foram **24 correções**:

**Referências arquivo:linha corrigidas**
1. A regra dos anos de referência está em `etl/transform/harmonize.py:249`, e não em `:248` (que é o `for`).
2. O `fire_days` mensal está em `api/queries.py:177-180`, e não em `:174-176` (que define a tabela e as chaves).
3. Erros em inglês: o intervalo foi ampliado para `api/main.py:61-74`, porque `:74` também tem mensagem em inglês.
4. `cell_geo` arredonda para **5** casas (`api/queries.py:99-101`). O texto agora diz "reduzir de 5 para 4".
5. Foram acrescentadas evidências que faltavam: `api/queries.py:117-124` (last_run), `etl/transform/aggregate.py:107-109` e `docs/METHODOLOGY.md:36` (A10), e `api/main.py:292` (`boundary=True` também em `/forecast`).

**Afirmações falsas ou imprecisas corrigidas**
6. "Os testes atuais não validam texto" era falso: `tests/test_api.py:62-66` exige "células-dia" na frase e `:91` exige pelo menos 3 limitações. Isso entrou como restrição para a mudança de `UNIT`.
7. O cartão `harm.pos2024` dizia que "a partir de 2024 a linha usa o VIIRS diretamente". Na verdade, o VIIRS é usado diretamente **desde 2012** sempre que observa (`etl/transform/harmonize.py:205`); 2024+ só fica fora do ajuste. O cartão foi substituído por `harm.medido` + `harm.janela`.
8. O cartão `rec.dia_sem_obs` atribuía `harmonized = None` à falta de passagem do satélite de referência. Na verdade, significa que **nenhum** produto observou (`etl/transform/harmonize.py:204-205`; `docs/METHODOLOGY.md:62-63`).
9. O cartão `rec.confianca` (fração de confiança "low") foi removido, porque detecções "low" são descartadas no ETL (`config/settings.yaml:19`; `etl/transform/quality.py:43-44`) e o gatilho nunca dispararia. Foi substituído por um texto sobre o filtro e a fração "high".
10. O exemplo de setembro de 2026 "parcial: 14 de 30 dias" era impossível: os dados vão até 14/11/2026 (`docs/METHODOLOGY.md:75`), então setembro está completo. O exemplo foi refeito com novembro.
11. A corroboração pelo MODIS (2º menor) refere-se à temporada **ago–out** de 2026, não a um mês isolado (`docs/METHODOLOGY.md:97-98`). Ela virou a ficha estática `ctx.temporada_2026`, com fonte citada.
12. "~36 km² ≈ 3.600 campos de futebol" estava errado. 36 km² ≈ 3.600 ha, o que dá cerca de 5 mil campos oficiais (~0,7 ha cada).
13. O Prevfogo é do **Ibama**, não do ICMBio (glossário, MIF).
14. O IP no log (`data/api.log:5`) é hoje só `127.0.0.1`. O risco foi requalificado como risco de implantação pública.

**Templates (honestidade e placeholders)**
15. `cal.categoria`: "em k de cada 10 anos ... teve menos detecções" virou "em {n_menor} dos {n_ref} anos ... teve média diária menor". O texto antigo era ilegítimo com n pequeno e comparava a grandeza errada (o percentil usa `daily_mean`).
16. `mapa.concentracao.alta`: "{pct}% de tudo o que os satélites registraram" virou "das células-dia com detecção", porque `top10_share` é calculado sobre `value`. O centroide só aparece se o decil superior estiver agrupado.
17. `mapa.sensor`: `viirs_count` soma todos os satélites VIIRS (`docs/METHODOLOGY.md:36`), e esse segundo motivo foi incluído.
18. `mapa.intenso_vs_extenso` usava `frp_sum`, que é soma e cresce com o número de detecções. Virou `mapa.intenso`, com FRP médio por detecção *(der.)*.
19. `prev.celula`: a leitura de frequência ("k em cada 10") passou a ser condicionada a uma tabela de confiabilidade *(novo)*.
20. Placeholders sem campo na API foram explicitados: `dias_mes`, `n_ref`, `n_menor`, `ref_year_*` e `hora_local` (o fuso vem da configuração, não da API) como *(der.)*; `provisional_from`, `unplaced_fraction`, flag `synthetic` e `metrics` tipado como *(novo)*. Foi registrado que `provisional_from` não existe hoje no banco.
21. `mapa.recorrencia` agora exige `granularity == "day"` e avisa que `fire_days` conta qualquer satélite (A8).

**Metas ODS**
22. Foi incluída a seção 2 com o texto resumido das metas. A 4.4 trata de habilidades para emprego, e "competências digitais" vem do indicador 4.4.1.
23. A meta 15.2 trata de **florestas**; para o Cerrado (savana), a ligação é parcial. As metas 15.1, 15.2 e 17.18 tinham prazo original em 2020.
24. Roadmap, item 25: "indicador 15.1" foi corrigido. O indicador oficial 15.1.2 mede a cobertura de áreas-chave de biodiversidade por áreas protegidas; a fração de células-dia em UCs é um indicador próprio do projeto.

**Verificado e mantido:** as demais referências (`api/main.py:33-47, 92-121, 124-133, 148-160, 188, 194, 200, 219-227, 231-271, 291-296, 309-339`; `api/schemas.py:1-2, 28-41, 34-35, 62-64, 91-120, 128-183, 191, 202`; `etl/transform/harmonize.py:192-195, 210-218, 239, 243-257`; `etl/transform/aggregate.py:91`; `db/schema.sql:112-121`; `docs/PLAN.md:55-62`; `docs/METHODOLOGY.md:31-35, 65-100, 112-113`; `config/regions.yaml:5`; `web/README.md:1-3`; `ml/` só com `__init__.py`; 9 testes em `tests/test_api.py`). Também foram mantidos os critérios WCAG citados (1.1.1, 1.3.1, 1.4.1, 1.4.3, 1.4.11, 2.1.1, 2.2.2, 2.5.8, 3.1.1, 3.1.3, 3.1.5), a LGPD art. 6º, III e os códigos BNCC (EF07GE11, EM13MAT102, EM13CNT301, competências gerais 2, 5, 7 e 10), que seguem marcados "a verificar por docente".
