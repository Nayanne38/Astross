# Calendário de Queimadas e os ODS da ONU

Este documento diz **para quais metas da Agenda 2030 o projeto contribui, com quais funcionalidades
e com qual evidência**. Também diz **o que não afirmamos**. O diagnóstico completo do conselho de
especialistas está em [`EDUCACAO_ODS.md`](EDUCACAO_ODS.md).

## Regra de alegação
O sistema **contribui para** as metas. Ele **não atinge** os indicadores oficiais:
- os indicadores 4.7.1 e 13.3.1 medem a integração da educação em políticas, currículos, formação
  docente e avaliação;
- o 15.1.2 mede a cobertura de áreas de biodiversidade por áreas protegidas;
- o 16.10.2 mede garantias legais nacionais;
- o 17.18.1 mede a capacidade estatística nacional.

Qualquer alegação de impacto educacional precisa se apoiar em indicadores registrados pelo próprio
sistema (`EDUCACAO_ODS.md` §12). Esses indicadores ainda não existem.

## Matriz meta × funcionalidade

| Meta | Contribuição | Onde está | Status |
|---|---|---|---|
| **4.7** Educação para o desenvolvimento sustentável | Camada interpretativa `learn` em todas as visualizações, com o bloco obrigatório "o que este dado NÃO diz", perguntas guiadas e trilhas | `api/education.py`; `GET /learn/paths` | Implementado na API, aguarda o frontend |
| **4.4** Competências (letramento de dados) | Três níveis de linguagem, glossário com o "equívoco comum" de cada termo, CSV aberto, validação e erro publicados | `GET /glossary`; `?nivel=`; `/export.csv` | Implementado na API |
| **13.3** Educação sobre o clima | Sazonalidade (`cal.sazonal`), comparação com referência explícita (n anos, intervalo), avisos de dado provisório | `learn` em `/calendar` e `/summary` | Implementado na API |
| **15.1 / 15.2** Ecossistemas terrestres | Glossário "Cerrado e fogo" e "Manejo Integrado do Fogo"; trilha T3 | `api/content/glossario.yaml`, `trilhas.yaml` | Parcial. A 15.2 trata de florestas, então a ligação com o Cerrado é só parcial. Faltam as fichas de contexto ecológico |
| **16.10** Acesso público à informação | API somente GET, CSV com atribuição, texto alternativo e versão falável em cada resposta, procedência legível | `learn.acessivel`; `GET /provenance` | Implementado na API. Faltam a tabela equivalente e as legendas acessíveis |
| **17.18** Dados de qualidade | Harmonização validada (LOYO), avisos de procedência (sintético, provisório, era MODIS), limitações em versão simples | `/harmonization`; `learn.procedencia` | Implementado |

## O que nunca afirmamos
A lista abaixo é verificada por teste (`FORBIDDEN` em `api/education.py`, `tests/test_education.py`):
- **área queimada**, hectares queimados, "em chamas": o sistema conta células-dia com detecção, não área;
- **incêndio confirmado** ou número de incêndios: um incêndio gera vários focos, e um fogo pequeno pode não gerar nenhum;
- **causa** ("causado por"): o satélite não distingue manejo, acidente, desmatamento ou fogo natural;
- **certeza** ou "vai queimar": a previsão, quando existir, é uma probabilidade de detecção;
- **"maior/menor da história"**: comparamos com N anos explícitos;
- **"prova" ou "comprova"**: o dado é um instrumento de monitoramento;
- **"sem fogo"**: nenhuma detecção registrada não garante ausência de fogo.

Negações explícitas são permitidas ("isso não significa que toda a área esteja em chamas").

## Como usar em sala
- Toda resposta de visualização traz `learn` (desligue com `?learn=false`). Escolha o nível com
  `?nivel=simples|estudante|tecnico`.
- `GET /learn/paths` lista as trilhas T1 (Lendo o fogo pelo satélite), T2 (Dois satélites, uma
  história) e T3 (O fogo no Cerrado). A T4 (Probabilidade não é certeza) fica bloqueada até existir
  uma previsão avaliada.
- Os códigos BNCC estão marcados **"a verificar por docente"**.
- A aula modelo de 50 minutos ("Dá para confiar no satélite?") está em `EDUCACAO_ODS.md` §8.3.

## Próximos passos (roadmap em `EDUCACAO_ODS.md` §11)
1. Desligar ou anonimizar o access log com IP antes de qualquer implantação pública (LGPD).
2. Baixa banda: cache/ETag, `boundary=false` por padrão, `/resumo.txt`.
3. Erros em pt-BR estruturados; CSV `planilha_br`.
4. `/legends` com paletas seguras para daltonismo; tabela equivalente (`?formato=tabela`).
5. Persistir `n_ref` e `unplaced_fraction` no ETL; fichas "Fogo no Cerrado".
6. Frontend: painel "Entenda esta visualização", telemetria agregada e anônima, quiz pré/pós.
