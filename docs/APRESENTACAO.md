# Astross: Apresentação do sistema

NASA Space Apps Challenge 2026: *Harmonization of MODIS & VIIRS Hot Spots*.
Versão web desta apresentação: `/sobre`. Os números abaixo são da região Matopiba no Supabase
(dados até 14/11/2026).

## 1. O problema
- O MODIS (Terra/Aqua, desde 2000, pixel de ~1 km) e o VIIRS (SNPP/NOAA-20/NOAA-21, desde 2012,
  pixel de 375 m) enxergam o fogo de jeitos diferentes.
- Quando o VIIRS entra, os focos "saltam". Quem compara anos com dados brutos confunde mudança de
  instrumento com mudança no fogo.
- O MODIS está em fim de vida (deriva orbital), então a série histórica precisa migrar para o VIIRS
  sem perder o passado.

## 2. O que construímos
| Camada | Entrega |
|---|---|
| ETL | FIRMS (MODIS + VIIRS) → filtros de qualidade → H3 res 6 → dedup entre satélites → Supabase/SQLite, idempotente, incremental, Apache Hop |
| Harmonização | Quantile mapping por mês do ano, ajustado em 2012–2023; VIIRS de referência = 1 satélite/dia |
| API | FastAPI, 11 endpoints, filtros por região/datas/bbox/polígono, frases de anomalia em pt-BR, CSV (células, mensal, risco) |
| Previsão | LightGBM: P(≥1 dia com fogo na célula nos próximos 7 dias), avaliado contra persistência e climatologia |
| IA | Claude (`claude-opus-5-5`) interpreta a previsão em pt-BR (modos geral e professor), com saída estruturada e cache |
| Web | Next.js: Painel, Previsão, **Para Professores** (mapa-múndi, conceitos, planos de aula BNCC) e Apresentação |

## 3. Resultados
**Harmonização** (validação deixando um ano de fora, R²):

| | MODIS bruto | Linear | Quantile mapping |
|---|---|---|---|
| Mensal | 0,32 | 0,97 | **0,99** |
| Diário | 0,32 | **0,80** | 0,76 |
| Fora da janela, 2026 | 0,41 | −0,16 | −0,44 |

**Previsão de 7 dias — modelo v2** (treino 2017–2019, validação/calibração 2020–2022, **teste 2023–nov/2026**,
nunca visto no treino nem no ajuste; 6,7 milhões de pares célula×origem; 5,6% de positivos):

| | ROC-AUC | PR-AUC | Brier | ECE | Captura top 10% |
|---|---|---|---|---|---|
| **LightGBM v2 (calibrado)** | **0,872** | **0,359** | **0,0425** | **0,003** | **0,547** |
| Climatologia | 0,822 | 0,245 | 0,0471 | 0,018 | 0,451 |
| Persistência | 0,644 | 0,171 | 0,0502 | 0,033 | 0,336 |

O modelo vence a climatologia em **todos os anos de teste** (PR-AUC 2023: 0,38 × 0,27; 2024: 0,37 × 0,25;
2025: 0,35 × 0,24; 2026: 0,31 × 0,19). Hiperparâmetros escolhidos numa grade com early stopping no bloco
de validação; probabilidades calibradas por regressão isotônica (ECE 0,003: "30%" significa ~30%).
O v1 (só 365 dias do banco, PR-AUC 0,328 em 3 meses de teste) foi substituído.

Previsão de 15/11/2026: 22.140 células com p ≥ 2%, sendo 75 "muito alto" e 2.755 "alto".

## 4. Diferenciais
1. **A régua migra para o VIIRS.** A abordagem clássica de consistência usa um satélite MODIS de
   referência (Aqua), que está em deriva e vai sair de operação. Calibramos o passado na escala do
   sensor que continua.
2. **Harmonização validada, não só aplicada.** Validação deixando um ano de fora, por mês, diária e
   mensal, contra baselines, com os números mostrados na própria interface.
3. **Deriva orbital detectada e tratada.** A mudança de horário de passagem de Terra/Aqua foi medida
   nos dados FIRMS. A calibração usa só 2012–2023, e a degradação fora da janela é exibida.
4. **Unidade sem dupla contagem.** Células-dia H3 e um VIIRS de referência por dia: lançar mais
   satélites não infla a série (inflaria ~1,5× a partir de 2018).
5. **IA com responsabilidade.** Arquitetura híbrida: o modelo é medido contra baselines, e a LLM só
   interpreta, sem inventar números.
6. **Feito para a escola.** Mapa-múndi, conceitos, 3 planos de aula com BNCC, CSV mensal pronto para
   planilha e IA em modo professor.
7. **Linguagem de gente.** Frases em pt-BR do tipo "acima do normal, percentil 78".
8. **Reprodutível e barato.** Um comando por etapa, amostra sintética offline, plano gratuito do
   Supabase, 30 testes.

## 5. Falas críticas de desenvolvimento
1. **Foco de calor ≠ incêndio ≠ área queimada.** Nuvens e fumaça escondem fogo dos dois sensores,
   e a calibração não recupera o que nenhum satélite viu.
2. **A harmonização reduz o degrau, não o elimina.** Mensal R² ≈ 0,99, diário ≈ 0,76. Em meses de
   transição (mar–abr) o R² por mês do ano fica perto de zero. Antes de 2012 a incerteza é maior.
3. **O linear empatou com o quantile mapping.** No diário o linear foi melhor (0,795 contra 0,760).
   Mantivemos o QM por preservar a distribuição e ser melhor no mensal, mas é uma escolha, não uma
   vitória.
4. **O MODIS envelhece.** Fora de 2012–2023 o erro cresce (R² negativo em 2026). Isso confirma a
   decisão de limitar o ajuste e a urgência de migrar a série para o VIIRS.
5. **O mapa é mundial, os dados são regionais.** O Matopiba ocupa ~346 MB dos 500 MB do Supabase
   gratuito. Expandir é configuração, mas custa armazenamento.
6. **A previsão ainda erra muito.** O v2 treina em 10 anos de histórico diário (arquivo FIRMS em
   parquet, porque o banco só guarda 365 dias) e vence os baselines em todos os anos de teste, mas
   PR-AUC 0,36 está longe de perfeito, e 2026 é o ano mais difícil (0,31). Desvio do plano em `PLAN.md`.
7. **Sem clima.** Chuva, umidade e vento ficaram fora (primeiro corte de escopo). É o próximo ganho
   óbvio.
8. **A LLM não prevê.** Ela pode errar a interpretação (por exemplo, nomes de lugares a partir de
   lat/lon), por isso o texto é rotulado como gerado por IA.
9. **Custo e segurança.** Cada análise é uma chamada paga: gerada sob demanda e em cache. A chave fica
   só no servidor. O Supabase tem RLS sem policies, e o acesso passa só pela API.
10. **NRT muda.** Os dias recentes são reprocessados pela NASA, e o SNPP NRT parou em 02/11/2026.
11. **Prazo de hackathon.** Priorizamos o que o desafio exige e adiamos 14/30 dias, clima e
    multi-região.

## 6. Aderência ao desafio
Série MODIS+VIIRS consistente desde 2003 · sem salto em 2012 · validação quantitativa · unidade sem
dupla contagem · visualização acessível em pt-BR · filtros por região, período e área · export
CSV com atribuição FIRMS · uso educacional · previsão com avaliação honesta · limitações explícitas.

## 7. Roteiro de demo (5 min)
1. `/sobre`: problema e diferenciais (1 min).
2. `/`: calendário, mês atual em linguagem simples, gráfico de harmonização mostrando o degrau de 2012
   sumindo (1,5 min).
3. `/previsao`: mapa de risco, "Gerar análise" com o Claude e a tabela modelo contra baselines (1,5 min).
4. `/professores`: mapa-múndi com zoom no Matopiba, um plano de aula e download do CSV mensal (1 min).
