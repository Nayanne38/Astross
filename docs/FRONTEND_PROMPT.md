# Prompt para reproduzir o frontend do FIRETRACK

> Copie TUDO deste arquivo (incluindo os apêndices) e cole em outra sessão do Claude.
> O objetivo é reconstruir o frontend `web/` exatamente como está no repositório `calendario-queimadas`.

---

## 0. Papel e regras inegociáveis

Você vai construir o frontend web do **FIRETRACK** (nunca "FIREWATCH"), uma plataforma do NASA Space Apps 2026 que mostra detecções de calor por satélite (MODIS + VIIRS, NASA FIRMS) harmonizadas numa série única de 2003 até hoje para o Cerrado / Matopiba.

Regras:

1. **O frontend só conversa com a API FastAPI do projeto.**
   - Base em `NEXT_PUBLIC_API_URL`, com padrão `http://localhost:8000`.
   - Nunca coloque chaves do Supabase nem nenhum segredo em `web/`.
   - Antes de codar, gere os tipos a partir do OpenAPI: `npm run gen:api` → `lib/api-schema.d.ts`.
2. **Todo texto visível fica em `web/content/`, nunca escrito dentro dos componentes.**
   - Português em `copy.ts`, `pages.ts`, `calendar.ts`, `data.ts`, `emergency.ts` e `extra.ts`.
   - Inglês em `en.ts`, com o mesmo formato.
   - Os arquivos completos estão no **Apêndice A**: copie-os literalmente.
3. **Vocabulário obrigatório:**
   - Diga "detecção de calor / foco de calor"; nunca "incêndio confirmado".
   - Célula-dia = hexágono H3 de ~36 km² com ao menos uma detecção num dia. Não é área queimada.
   - A previsão é "Probabilidade estimada, não certeza".
4. **Nunca invente dados.**
   - Dado desconhecido aparece como "a validar".
   - Se a API não tiver um campo, faça a menor adição possível no backend em vez de inventar.
5. **Qualidade:**
   - Teclado em tudo.
   - Contraste de 4.5:1.
   - Alvos de toque de 44 px (`pointer-coarse:min-h-11`).
   - Funciona em 375 px sem rolagem horizontal.
   - Respeita a redução de animações.
   - `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` precisam passar.
6. **Referência visual:** `design/referencia-mapa-calendario.jpeg`, em tema escuro. Anexe a imagem junto com este prompt.
   - Se a imagem e esta especificação divergirem, siga a imagem e diga o que divergiu.
   - **Atenção:** a imagem mostra o nome "FIREWATCH", que está errado. Use sempre **FIRETRACK**.
   - A imagem também mostra "Alertas por e-mail" na sidebar e "dados ilustrativos" no rodapé. Essas duas partes NÃO foram implementadas.

### O que a imagem mostra (para quem não a tiver)

São duas telas lado a lado, ambas com header verde-petróleo `#0b6f5f` e fundo `#0e1418`.

**Header:**

- À esquerda, o logo: quadrado branco com chama e o nome da plataforma.
- No centro, as abas "Mapa de focos", "Calendário" e "Dados completos". A aba ativa tem fundo levemente mais claro e sublinhado.
- À direita, o botão laranja "⚠ Urgência", um botão quadrado de acessibilidade e o botão branco "Entrar".

**Sidebar (cerca de 260 px):**

- Campo "Buscar lugar" com lupa.
- Bloco "FILTROS":
  - "Região" (select "Cerrado");
  - "Período" (select "Série completa (2003 a hoje)");
  - "Cores" (select "Inferno" com uma mini faixa de cores à direita).
- Bloco "ÚTEIS PARA TODOS": itens com uma seta verde à direita.

**Tela do mapa:**

- Três cartões no topo:
  - "Focos no período" com um número grande;
  - "Comparado à média histórica" com "−14,4%" e a pill "Normal";
  - "Risco nos próximos 7 dias" com "Moderado" e uma mini barra de 4 segmentos.
- Mapa escuro com:
  - hexágonos coloridos pela paleta Inferno (roxo → laranja → amarelo-claro);
  - contorno tracejado verde da região;
  - toggle "Densidade | Focos | Risco" no canto superior esquerdo (ativo em verde);
  - coluna de ícones à direita (camadas, casa, alvo e download em verde);
  - legenda "menos ▮▮▮▮▮ mais" no canto inferior esquerdo.

**Tela do calendário:**

- Três cartões: "Mês mais crítico" (Agosto), "Anomalia do mês atual" (Normal · 26º percentil) e "Média histórica mensal" (1.703).
- Painel "Focos por mês" com o subtítulo "Cerrado, 2003 a 2026 · MODIS e VIIRS combinados".
  - Toggle "Contagem | Anomalia" à direita.
  - Grade de anos (2026 no topo até 2003) × meses Jan a Dez, com células retangulares arredondadas coloridas pela Inferno. Julho a outubro são os meses mais claros. Nov/2026 tem contorno branco.
  - Legenda "menos/mais" embaixo, botões "Ver como tabela" e "Baixar CSV" (verde).

**Rodapé, nas duas telas:**

- À esquerda, ponto verde e "Atualizado às 10:47 · MODIS + VIIRS".
- À direita, os botões "A−", "A+" e "Alto contraste", e o texto "Fonte: NASA FIRMS".

---

## 1. Stack e versões exatas

```json
"dependencies": {
  "@base-ui/react": "^1.9.0", "@tanstack/react-query": "^5.107.1", "class-variance-authority": "^0.7.1",
  "h3-js": "^4.5.0", "html-to-image": "^1.11.13", "leaflet": "^1.9.4", "lucide-react": "^1.73.0",
  "next": "16.4.6", "react": "19.3.0", "react-dom": "19.3.0", "react-leaflet": "^5.0.0",
  "recharts": "^3.10.1", "shadcn": "^4.23.0", "tw-animate-css": "^1.4.0"
},
"devDependencies": {
  "@tailwindcss/turbopack": "4.3.3", "@types/leaflet": "^1.9.22", "@types/node": "^22.20.5",
  "@types/react": "^19", "@types/react-dom": "^19", "eslint": "^9", "eslint-config-next": "16.4.6",
  "openapi-typescript": "^7.13.0", "tailwindcss": "4.3.3", "typescript": "^5", "vitest": "^5.1.0"
}
```

**Scripts:**

```json
"dev": "next dev", "build": "next build", "start": "next start", "lint": "eslint",
"gen:api": "openapi-typescript http://localhost:8000/openapi.json -o lib/api-schema.d.ts",
"typecheck": "tsc --noEmit", "test": "vitest run"
```

**Componentes shadcn** (base-ui): `popover`, `dialog`, `sheet`, `switch`, `slider`.

**`next.config.ts`:**

```ts
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: { root: path.resolve(process.cwd()), rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } },
};
```

**Pontos de atenção do Next 16:**

- Leia `node_modules/next/dist/docs/` antes de usar uma API, porque há mudanças incompatíveis com versões anteriores.
- Com Cache Components, `useSearchParams`, `cookies()` e `headers()` precisam estar dentro de `<Suspense>`.

---

## 2. Tema, tokens e tipografia (`app/globals.css`)

**Imports e variante:**

- `@import "tailwindcss"; @import "tw-animate-css"; @import "shadcn/tailwind.css";`
- `@custom-variant dark (&:is(.dark *));`
- O `<html>` sempre tem a classe `dark`.

**Tokens (`@theme inline`):**

| Token | Valor |
|---|---|
| `--color-header` | `#0b6f5f` |
| `--color-panel` | `var(--card)` |
| `--color-brand` | `#3fd0b5` |
| `--color-fire` | `#ff7a2f` |
| `--color-line` | `#26343d` |
| `--font-sans` | `var(--font-inter)` |
| `--font-heading` | `var(--font-grotesk)` |

**Variáveis da classe `.dark`:**

| Grupo | Variável | Valor |
|---|---|---|
| Base | `--background` | `#0e1418` |
| | `--foreground` | `#e9f0f3` |
| Card e popover | `--card`, `--popover` | `#141d23` (texto `#e9f0f3`) |
| Primary | `--primary` | `#3fd0b5` |
| | `--primary-foreground` | `#06201b` |
| Secondary e muted | `--secondary`, `--muted` | `#1b262d` |
| | `--muted-foreground` | `#a9bbc4` |
| Accent | `--accent` | `#1d2a31` |
| Bordas | `--border` | `#26343d` |
| | `--input` | `#2f414b` |
| | `--ring` | `#3fd0b5` |
| Destrutivo | `--destructive` | `#ff5c5c` |
| Gráficos | `--chart-1` a `--chart-5` | `#ff7a2f`, `#6b9fd6`, `#3fd0b5`, `#f6e05d`, `#a62e5f` |
| Sidebar | `--sidebar` | `#0e1418` (borda `#22303a`) |

- **Alto contraste** (`.dark.hc`): background `#000`, card `#0a0a0a`, foreground `#fff`, muted-foreground `#d6e2e7`, border `#9fb3bd`, primary `#5ff0d4`.
- **Base:** `* { border-border outline-ring/50 }`, body `bg-background text-foreground`, `h1,h2,h3` em Space Grotesk, `html` em `font-sans`.

**Leaflet:**

```css
.leaflet-container { background: var(--background) !important; font-family: inherit; }
.leaflet-tooltip { background: #141d23; color: #e9f0f3; border: 1px solid #26343d; box-shadow: none; }
.leaflet-tooltip:before { display: none; }
.leaflet-bar a { background: #141d23 !important; color: #e6eef1 !important; border-color: #22303a !important; }
.leaflet-control-attribution { background: rgba(14,20,24,.8) !important; color: #93a7b1 !important; }
.leaflet-control-attribution a { color: #3fd0b5 !important; }
.tiles-dark { filter: invert(1) hue-rotate(180deg) brightness(0.62) contrast(0.9) saturate(0.35); }
.leaflet-control-scale-line { background: rgba(14,20,24,.8) !important; color: #a9bbc4 !important; border-color: #a9bbc4 !important; }
.leaflet-container:focus-visible { outline: 2px solid #3fd0b5; outline-offset: -2px; }
```

**Redução de animações:** aplica-se com `@media (prefers-reduced-motion: reduce)` e com a classe `.reduce-motion` no `<html>`:

```css
animation-duration: .01ms; transition-duration: .01ms; scroll-behavior: auto  /* todos com !important */
```

**Fontes** (via `next/font/google` em `app/layout.tsx`):

- `Inter({ variable: "--font-inter", subsets: ["latin"] })`
- `Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"] })`

**Classes recorrentes:**

- `ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"`
- `touch = "pointer-coarse:min-h-11"`
- Botão primário: `bg-brand text-black font-semibold`.
- Cartões: `rounded-xl border border-border bg-panel`.

---

## 3. Estrutura de pastas

```
web/
  app/
    layout.tsx            # html.dark + fontes + <Suspense fallback={<ShellFallback/>}><LangGate><AppShell>{children}
    globals.css
    page.tsx              # renderiza <HomeView/> (mapa)
    home-view.tsx
    calendario/page.tsx + calendar-view.tsx
    harmonizacao/page.tsx + harmonization-view.tsx
    previsao/page.tsx + forecast-view.tsx
    dados/page.tsx + data-view.tsx
    sobre/page.tsx + about-view.tsx
    urgencia/page.tsx + urgency-view.tsx
  components/
    app-state.tsx         # Providers, LangProvider, useLang, useCopy, AppStateProvider, useAppState, useApi
    lang-gate.tsx         # server component: detecta idioma
    app-shell.tsx         # Header, Sidebar, StatusBar, AppShell, ShellFallback
    hex-map.tsx           # Leaflet (default export HexMap)
    calendar-heatmap.tsx
    learn-sheet.tsx
    panel.tsx             # Panel, StatCard, Pill, Toggle, Loading, EmptyState, ErrorBox
    ui/                   # shadcn
  content/                # TODOS os textos (Apêndice A)
    copy.ts pages.ts calendar.ts data.ts emergency.ts extra.ts en.ts index.ts
  lib/
    api.ts api-schema.d.ts types.ts filters.ts format.ts i18n.ts map-bus.ts map-layers.ts palettes.ts prefs.ts utils.ts
  tests/                  # vitest: filters, palettes, map-layers, cache-key, i18n
  public/cache/README.md  # snapshots JSON (gitignored), gerados por scripts/cache_api.py
  public/images/CREDITS.md
```

**Todas as `page.tsx` são server components finos.** Cada uma faz só isto:

```tsx
export const metadata = { title: "X · FIRETRACK" };
export default function Page() { return <XView />; }
```

As views são `"use client"`.

---

## 4. Contrato da API (FastAPI)

Todas as rotas são GET. Os parâmetros de área são comuns a quase todas:

- `region`
- `start` e `end` (`YYYY-MM-DD`)
- `bbox=w,s,e,n` **ou** `polygon=lon,lat;lon,lat;...`

Opções educativas: `learn` (padrão `true`), `nivel` (`simples|estudante|tecnico`) e `lang` (`pt|en`, padrão `pt`).

### `/meta`

Retorna:

- `regions[{key,name,bbox,data_start,data_end}]`
- `default_region`
- `h3_resolution`
- `daily_window_start`
- `last_etl_run{finished_at,...}`
- `attribution`

### `/calendar` (`top_n`)

Retorna:

- `cells[]`, cada uma com:
  - `year`, `month`
  - `value`: células-dia harmonizadas
  - `modis_cell_days`, `viirs_cell_days`
  - `hotspot_count`, `obs_days`, `is_partial`, `daily_mean`
  - `percentile`, `anomaly_zscore`, `is_top`, `deviation_pct`
- `current`
- `learn`

### `/summary`

Retorna:

- `total_hotspots`, `total_harmonized`, `monthly_mean`
- `comparison`:
  - `year`, `month`, `days_compared`, `same_days_only`
  - `deviation_pct`, `percentile`
  - `category` (`muito_abaixo|abaixo|normal|acima|muito_acima|indisponivel`)
  - `n_ref`, `ref_year_min`, `ref_year_max`, `is_provisional`, `sentence`
- `risk_next_7_days{available,n_high,n_very_high,message,...}`
- `peak`

### `/hexgrid` (`boundary`, `limit`)

Retorna:

- `granularity` (`day|month`)
- `n_cells`
- `cells[{cell_id,lat,lon,value,fire_days,modis_count,viirs_count,frp_sum}]`

### `/recent` (`days` ≤ 60, `limit`)

Retorna:

- `detections[{lat,lon,date,time_utc,satellite,sensor_family:"MODIS"|"VIIRS",frp,confidence_class,daynight}]`
- `days[{date}]`
- `truncated`

### `/forecast` (`horizon=7`, `limit`, `boundary`, `fallback`)

Retorna:

- `available`
- `cells[{cell_id,probability,risk_class:"baixo|moderado|alto|muito_alto"}]`
- `model_version`, `forecast_date`, `horizon_days`
- `metrics` (pode vir `null`, e então a tela mostra "a validar")
- `disclaimer`
- `fallback` (climatologia): `{label, cells[{cell_id,frequency,risk_class}], ref_year_min, ref_year_max, thresholds}`

### `/harmonization`

Retorna:

- `series[{year,month,modis_raw,viirs_raw,harmonized,overlap}]`
- `calibration_years[2]`
- `metrics[{method:"raw_modis|linear|quantile_mapping", scope:"loyo_daily|loyo_monthly|holdout=AAAA|outside_window=AAAA|month=MM", r2, bias, rmse, overlap_days}]`
- `limitations[]`, `limitations_simple[]`
- `unit`

### `/glossary` (`nivel`)

Retorna `[{id,termo,definicao,simples,tecnico,armadilha,ods}]`.

### `/export.csv`

- **Parâmetros:** `kind=history|forecast|calendar`, `sensor=todos|modis|viirs`, `category=todas|modis|viirs|coincidentes`.
- **Cabeçalhos:** `Content-Disposition` e `X-Row-Count`, ambos expostos via CORS.
- **Primeira linha:** começa com `#` e traz a atribuição à NASA FIRMS.

---

## 5. Camada de dados

### `lib/api.ts`

- `API_URL` vem de `NEXT_PUBLIC_API_URL`, sem a barra final. O timeout é de 15 s.
- `qs(params)` descarta parâmetros `undefined`, `null` ou `""`.
- `cacheKey(path, params)` usa a **mesma regra** de `scripts/cache_api.py`:
  1. ordena as chaves e monta `k-v` unidos por `_`;
  2. o nome base é o path sem a `/` inicial, trocando `/` e `.` por `-`;
  3. se houver parâmetros, acrescenta `__` mais o tail;
  4. remove todo caractere fora de `[a-zA-Z0-9_-]`.
  - Exemplo: `cacheKey("/calendar",{region:"matopiba",top_n:3,learn:true})` = `calendar__learn-true_region-matopiba_top_n-3`.
- `getJSON(path, params, signal)`:
  - faz `fetch` com AbortController (timeout mais o signal do TanStack);
  - se falhar e não tiver sido abortado, tenta `/cache/<cacheKey>.json`;
  - retorna `{data, source:"api"|"cache"}`.
- `setApiLang(lang)` e `langParam()`: `pt` não envia nada; `en` envia `lang=en`.
- `csvUrl(params)` monta `${API_URL}/export.csv?...` mais o idioma.

### `components/app-state.tsx`

**`Providers({lang})`** monta, de fora para dentro:

```
LangProvider > QueryClientProvider > AppStateProvider
```

QueryClient: `staleTime` de 5 min, `gcTime` de 30 min, `retry` 1, `refetchOnWindowFocus` false.

**`LangProvider`:**

- Guarda `lang` em estado.
- A cada render chama `setFormatLang(lang)` e `setApiLang(lang)`.
- Num efeito, ajusta `document.documentElement.lang` para `pt-BR` ou `en`.
- `setLang(l)` grava o cookie `firetrack.lang=l; path=/; max-age=1 ano; samesite=lax`.
- Hooks expostos: `useLang()` → `{lang,setLang,t}` e `useCopy()` → `BUNDLES[lang]`.

**`AppStateProvider` (filtros na URL):**

- `committed` = `parseFilters(useSearchParams())`.
- `filters` = um rascunho instantâneo `{base: queryString, value}`, válido enquanto `base` for igual à URL atual.
- `setFilters(patch)`:
  - atualiza o rascunho na hora;
  - depois de **300 ms de debounce** faz `router.replace(path?query, {scroll:false})`.
- `resetFilters()` volta aos padrões mantendo a região.
- `hrefWith(path, patch?)` gera links que preservam os filtros.
- Meta: `useQuery(["/meta"])` com `staleTime` de 60 s.
- `region` = `committed.region` ou `meta.default_region`.
- Prefs (`useSyncExternalStore` em `lib/prefs.ts`, localStorage `firetrack.prefs.v1` com try/catch):
  - campos: `fontStep` (0..3, mapeado em `FONT_STEPS=[1,1.125,1.25,1.4]`), `highContrast`, `reduceMotion`;
  - efeito: `html.style.fontSize = FONT_STEPS[step]*100%` e as classes `hc` e `reduce-motion`.
- `palette` = `"contraste"` se `highContrast`, senão `filters.palette`.
- `range` = `filterRange(committed, region.data_end)`.
- `area` = `areaParams(committed.area)`.
- `sources` e `reportSource` alimentam o aviso de modo offline.

**`useApi<T>(path|null, params)`:**

- Acrescenta `lang:"en"` quando o idioma for inglês.
- Chama `useQuery({queryKey:[path,params], enabled:!!path, placeholderData:keepPreviousData})`.
- Retorna `{data, error (só quando não estiver buscando), loading (pending ou placeholder), refetch}`.

### `lib/filters.ts`

**Tipos:**

- `PeriodId = serie|5a|12m|30d|1d|custom`
- `Layer = densidade|focos|risco`
- `Sensor = todos|modis|viirs`
- `CategoryFilter = todas|modis|viirs|coincidentes`
- `FrpClass = baixa|media|alta|muito_alta`

**Padrões:**

```
{region:null, period:"serie", start:null, end:null, palette:"inferno", invert:false, classes:5,
 layer:"densidade", sensor:"todos", category:"todas", frp:[], area:null, cell:null}
```

**Funções:**

- **Serialização:** a URL só recebe valores diferentes do padrão. `frp` vira lista separada por vírgula e é omitido se estiver vazio ou com as 4 classes.
- `parseArea`:
  - aceita `bbox:w,s,e,n` (exige w<e, s<n e os limites ±180/±90);
  - aceita `poly:lon,lat;...` (pelo menos 3 pontos).
- `filterRange`:
  - `custom` usa `start`/`end`;
  - `serie` retorna `{}`;
  - os demais usam `[dataEnd-(dias-1), dataEnd]`, com 5a = 1825 dias, 12m = 365, 30d = 30 e 1d = 1.
- `areaParams` converte a área em `{bbox}` ou `{polygon}`.
- `granularity(start, dailyStart)` retorna `"Diário"` se `start ≥ daily_window_start`, senão `"Mensal"`.

### `lib/format.ts`

- O locale é global e muda com `setFormatLang` (`pt-BR` ou `en-US`).
- Funções: `int`, `num(v,d=1)`, `signedPct` (usa o sinal `−` U+2212), `cap`, `addDays` (UTC).
- `brDate` mostra `DD/MM/AAAA` em português e `MM/DD/AAAA` em inglês.
- Valor nulo vira `—`.

### `lib/palettes.ts`

**Paletas:**

| Paleta | Cores |
|---|---|
| `inferno` | `#2c0b4f #56106e #7f1d6e #a62e5f #cb4149 #e85d2f #f8850f #fbb61a #f6e05d #fcffa4` |
| `cividis` | `#00224e #123570 #3b496c #575d6d #707173 #8a8779 #a69d75 #c4b56c #e4cf5b #fee838` |
| `contraste` | `#1e90ff #00e5ff #ffffff #ffe14d #ff7a2f #ff2e63` |
| `cinza` | `#2a2f33 #ffffff` |
| `DIVERGING` | `#2f6db3 #6b9fd6 #a9c6e8 #3a4249 #f6c49a #f08a3c #c4520f` |

**Funções:**

- `classColors(palette,k,invert)` amostra `k` cores interpoladas.
- `quantileBreaks(values,k)` ignora valores ≤ 0 e gera `k-1` cortes em `v[floor(i/k*n)]`.
- `classOf(x,breaks)` conta quantos cortes `x` ultrapassa estritamente.
- `divergingColor(pct)`:
  - cortes em `[-50,-25,-10,10,25,50]`;
  - `null` vira `#1c262d`.

### `lib/map-layers.ts`

Funções puras, todas testadas.

**Resolução e células:**

- `displayRes(zoom)`: abaixo de 6.5 → 4; abaixo de 8 → 5; senão → 6.
- `AREA_KM2 = {4:"1.770", 5:"253", 6:"36"}`.
- `cellCategory(modis,viirs)` → `coincidentes` (os dois > 0), `modis` ou `viirs`.
- `aggregateCells(cells,res,sensor,category)`:
  - filtra pela categoria;
  - o valor depende do sensor: `modis_count`, `viirs_count` ou `value`;
  - descarta valores ≤ 0;
  - agrega por `cellToParent`;
  - ordena em ordem decrescente;
  - percentil = (n−i)/n·100, arredondado, com empates dividindo o mesmo posto.

**FRP:**

- `frpQuartiles(det)`: quartis 0.25/0.5/0.75 calculados por sensor, separadamente.
- `FRP_ORDER = [baixa,media,alta,muito_alta]`.
- `frpClass` usa limites com `≤`.
- `frpRadius = clamp(2+√frp·0.8, 3, 10)`.

**Categorias, selo, polígono e risco:**

- `detectionCategories(det)` classifica a célula-dia H3 (res 6, com a data) como MODIS, VIIRS ou ambos.
- `anomalyBadge(category)` → `"Abaixo"` (muito_abaixo/abaixo), `"Normal"`, `"Acima"` (acima/muito_acima) ou `"Indisponível"`.
- `cellPolygonParam(boundary)` gera `lon,lat` com 5 casas, separados por `;`.
- `aggregateRisk(cells,res)` mantém a maior probabilidade e a classe correspondente por célula-pai, em ordem decrescente.

### `lib/map-bus.ts`

- `parseLatLon("lat, lon")`.
- `requestFlyTo({lat,lon,label})`, `consumeFlyTo()`, `onFlyTo(cb)`.
- Serve para a busca da sidebar centralizar o mapa.

---

## 6. Idioma (pt-BR para o Brasil, inglês para o resto)

### `lib/i18n.ts`

- `LANG_COOKIE = "firetrack.lang"`.
- `COUNTRY_HEADERS = ["x-vercel-ip-country","cf-ipcountry","cloudfront-viewer-country","x-country-code"]`.
- `langFromCountry`: país `BR` → `pt`; qualquer outro país de duas letras → `en`; `XX` ou vazio → `null`.
- `langFromAcceptLanguage`: a primeira língua começa com `pt` → `pt`, senão `en`.
- `detectLang` segue esta ordem:
  1. cookie válido;
  2. país (geolocalização por IP feita pela borda da hospedagem, sem enviar o IP a terceiros);
  3. Accept-Language.

### `components/lang-gate.tsx`

Server component assíncrono. Lê `cookies()` e `headers()` e renderiza `<Providers lang={...}>`. Fica **dentro** do `<Suspense>` do layout.

### `content/index.ts`

- `Widen<T>` transforma toda string literal em `string`.
- `Bundle = Widen<typeof pt>` com `pt = {copy, harm, prev, urg, sobre, cal, dados, emergency, ...extra}`.
- `const en: Bundle = {...}`. A tipagem obriga o inglês a ter todas as chaves.
- `BUNDLES = {pt, en}`.

### Nos componentes

- Cada componente faz `const bundle = useCopy();` e usa `bundle.copy.map`, `bundle.cal`, `bundle.months` etc.
- Interpolação de textos com:

  ```ts
  const t = (s: string, v: Record<string, string|number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""))
  ```

- Funções puras que geram texto recebem o bundle como argumento (exemplo: `cellLabel(..., T, MESES, ui)`).
- Todo `useMemo` ou `useEffect` que gera texto inclui o objeto de copy nas dependências.

### Botão PT/EN no header

- O botão mostra o idioma de destino ("EN" ou "PT") e grava o cookie.
- Em telas sm ou maiores fica na barra; no celular fica dentro do Menu.
- O `ShellFallback` mostra só a marca "FIRETRACK", sem hooks.

---

## 7. Shell (`components/app-shell.tsx`)

**Layout geral:**

- Container: `flex min-h-screen flex-col`.
- Skip link "Pular para o conteúdo" → `#conteudo`.

### Header

`bg-header text-white`, `px-3 py-2 sm:px-4`, com estes elementos:

1. **Logo:**
   - quadrado branco `size-7 rounded-md` com o ícone `Flame` em `text-header`;
   - texto "FIRETRACK" em `uppercase font-heading font-bold`, escondido abaixo de 420 px (`sr-only`).
2. **Navegação central** (md ou maior): 5 links `rounded-md px-3 py-1.5 text-sm font-medium text-white/85`.
   - O link ativo usa `bg-white/10 text-white underline decoration-brand decoration-2 underline-offset-8` e `aria-current="page"`.
   - Os links usam `hrefWith` para manter os filtros.
3. **Grupo da direita:**
   - **Menu** (só abaixo de md): popover com a navegação vertical. Abaixo de sm, também traz os dois CTAs e o botão de idioma.
   - **Urgência:** `bg-fire text-black font-semibold`, ícone `AlertTriangle`, link para `/urgencia`.
   - **Cadastrar alertas:** `bg-brand text-black`, ícone `Bell`.
   - **Faça parte da brigada:** `border-white/70 text-white`, ícone `HandHeart`.
     - Os dois CTAs aparecem só a partir de sm.
     - O texto completo aparece só a partir de xl; antes disso fica só o ícone, com o nome em `sr-only`.
     - Os dois abrem um Dialog "em breve" com a nota "Nenhum dado pessoal é coletado por enquanto."
   - **Idioma (PT/EN).**
   - **Acessibilidade:** botão `size-9 bg-white/10`, ícone `Accessibility`. Abre um popover `w-72` com:
     - Tamanho do texto (A− / A+);
     - os switches Alto contraste, Paleta para daltônicos (Cividis) e Reduzir animações.
   - **Entrar:** `bg-white text-header`, ícone `LogIn`. Abre um Dialog "Login opcional: em breve".

### Sidebar

- Telas lg ou maiores: `aside w-[260px] border-r p-4`.
- Telas menores: o botão "Filtros" (ícone `SlidersHorizontal`) abre um Sheet à esquerda de `w-[300px]` com o mesmo conteúdo.

Conteúdo, em ordem:

1. **Busca:**
   - input `type=search` com ícone de lupa e botão X para limpar;
   - "lat, lon" faz `requestFlyTo` e vai para `/` se estiver em outra página;
   - nome de região (comparado sem acentos) troca a região;
   - em caso de erro mostra `searchNotFound` em `text-fire`.
2. **"FILTROS":** `text-[0.7rem] uppercase tracking-widest text-muted-foreground`.
3. **Região:**
   - select com as regiões e a opção "Área personalizada" quando houver área;
   - botão X para remover a área;
   - linha da delimitação: bbox da região, retângulo desenhado ou polígono desenhado.
4. **Período:**
   - rótulo com um selo à direita: Diário (`bg-brand/15 text-brand`) ou Mensal (`bg-muted`);
   - select com os períodos ("Personalizado" desabilitado até haver datas);
   - dois `input type=date` (De / Até), limitados a `data_start` e `data_end`;
   - data inválida mostra um alerta em `text-fire`.
5. **Sensor:** controle segmentado `Todos | MODIS | VIIRS` (o ativo usa `bg-brand text-black`).
6. **Categoria:** select mais um ícone `Info` que abre um popover com a explicação de "coincidente".
7. **Intensidade (FRP):** chips "Todos", Baixa, Média, Alta e Muito alta.
   - Ativo: `border-brand bg-brand/15 text-brand`.
   - Abaixo vem a nota sobre os quartis por sensor.
8. **Cores:**
   - select de paleta, desabilitado em alto contraste;
   - faixa de amostra `h-2.5`;
   - switch "Inverter escala";
   - slider "Número de classes" de 4 a 9.
9. **Limpar filtros:** botão de largura total.
10. **"ÚTEIS PARA TODOS":**
    - "Focos nas últimas 24 h" → `/` com `period=1d` e `layer=focos`;
    - "Como ler o mapa" → Sheet com 5 dicas;
    - "Como ler [view]" → LearnSheet com o bloco `learn` da API;
    - "Alertas e urgência" → `/urgencia`.
    - Cada item tem uma seta `ArrowRight` em `text-brand`.
11. **Aviso de amostra sintética:** aparece se o nome da região contém "sintética".

### Status bar

`footer border-t px-4 py-1.5 text-xs text-muted-foreground`, com:

- **Indicador à esquerda:** ponto `bg-brand` (online) ou `bg-fire` (dados de cache).
- **Texto:** "Atualizado às HH:MM em DD/MM/AAAA · MODIS + VIIRS", a partir de `last_etl_run.finished_at`.
- **Erro da meta:** "API indisponível" mais o botão "Tentar novamente".
- **À direita:**
  - botões A−, A+ e Alto contraste;
  - link "Sobre e créditos";
  - crédito NASA FIRMS (texto completo a partir de xl, versão curta abaixo disso).

### LearnSheet

Sheet à direita com:

- seletor de nível (simples, estudante, técnico);
- avisos;
- cards agrupados por slot (O que você vê / Cuidado ao concluir / Contexto);
- "O que este dado NÃO diz";
- "Para pensar";
- "Metas ODS da ONU".

Endpoints por view: mapa → `/hexgrid`, calendário → `/calendar`, harmonização → `/harmonization`, previsão → `/forecast`.

---

## 8. Componentes de painel (`components/panel.tsx`)

| Componente | Descrição |
|---|---|
| `Panel({title, subtitle, actions, pngName})` | `section rounded-xl border bg-panel p-4`. Título `text-base font-semibold`, subtítulo `text-xs muted`. Com `pngName`, ganha um botão Download que exporta a seção via `html-to-image.toPng` (`backgroundColor #141d23`, `pixelRatio 2`), ignorando elementos com `data-html2png-ignore`. |
| `StatCard({label, value, badge, note})` | Label `text-xs muted`, valor `text-2xl font-bold tabular-nums`, selo ao lado e nota `text-xs`. |
| `Pill` | `rounded-full bg-brand/15 px-2 py-0.5 text-xs text-brand`. |
| `Toggle` | Radiogroup `bg-background p-0.5`; opção ativa `bg-brand text-black`. |
| `Loading({what,height})` | Skeleton `animate-pulse`, com `role=status` e `aria-label` "Carregando {what}". |
| `EmptyState` | Borda tracejada, `py-10`, texto centralizado. |
| `ErrorBox({error,onRetry})` | `border-fire/50 bg-fire/10`, a mensagem, o erro truncado em 160 caracteres e o botão "Tentar novamente". |

---

## 9. Tela Mapa (`app/home-view.tsx`, rota `/`)

### Constantes

```
HEX_CAP = 3000, POINT_CAP = 5000, POINT_DAYS = 60
```

### Chamadas

| Endpoint | Quando | Parâmetros |
|---|---|---|
| `/summary` | sempre | `{region,...area,start,end,learn:false}` |
| `/hexgrid` | camada densidade | `{...,boundary:false,limit:100000,learn:false}` |
| `/recent` | camada focos | `{region,...area,days:min(dias,60),limit:30000,learn:false}` |
| `/forecast` | camada risco, com risco disponível | `{...,limit:60000,boundary:false,fallback:false,learn:false}` |

`start` e `end` são o intervalo filtrado ou, se não houver, o `data_start` e o `data_end` da região.

### Cartões

Grade de 3 colunas a partir de md. Enquanto carregam, mostram skeletons de `h-[104px]`.

1. **Focos no período:**
   - valor `int(total_hotspots)`;
   - nota "DD/MM/AAAA a DD/MM/AAAA · {focosNote}";
   - com área desenhada, mostra `total_harmonized` com o texto `focosArea`.
2. **Comparado à média histórica:**
   - valor `signedPct(deviation_pct)`;
   - selo colorido: Acima `bg-fire/20 text-fire`, Abaixo `bg-sky-400/15 text-sky-300`, Normal `bg-brand/15 text-brand`, seguido de " · percentil N";
   - nota com o texto `sameDays` ou `fullMonth`, mais "· dados provisórios" quando for o caso, mais a linha dos cortes.
3. **Risco nos próximos 7 dias:**
   - valor "N células" (`n_high + n_very_high`) com Pill "alto ou muito alto";
   - se indisponível: "Indisponível", a mensagem e o link para a aba Previsão.

### Painel do mapa

`section rounded-xl border bg-panel p-3 sm:p-4`, com:

- **Cabeçalho:** título "Mapa de focos", região · período (· Área personalizada) e o botão "Ver como tabela".
- **Mapa:** `relative h-[50vh] min-h-[320px] lg:h-[60vh] rounded-lg overflow-hidden`.

Sobreposições (todas com `z-[500]`):

- **Canto superior esquerdo:** radiogroup Densidade | Focos | Risco (`bg-panel/95`, ativo `bg-brand text-black`). Risco fica desabilitado sem previsão, com tooltip `riskDisabled`.
- **Coluna de ferramentas** (`right-2 top-[84px]`, botões `size-9`, `pointer-coarse:size-11`):
  1. Camadas: popover com Escuro, Claro e Satélite (desabilitado: "licença a validar").
  2. Desenhar área: Retângulo, Polígono, Digitar coordenadas (Dialog com Oeste, Sul, Leste e Norte validados por `parseArea`) e Limpar.
  3. Minha localização: geolocalização sem envio de dados; põe um `circleMarker` branco/brand e faz `flyTo` com zoom ≥ 9.
  4. Reiniciar vista.
  5. Tela cheia (ícones Expand e Shrink).
  6. Baixar CSV (botão brand).
- **Banners** (topo, centralizados, `aria-live`):
  - dica de desenho;
  - erro de tiles;
  - mensagem de geolocalização;
  - limite de células ou de pontos ("Mostrando as N células mais ativas de T.").
- **Estados:**
  - carregando: overlay `bg-background/30` com "Carregando…";
  - erro: `ErrorBox` embaixo;
  - vazio: `EmptyState`.
- **Legenda** (canto inferior esquerdo, `bg-panel/95 text-[0.7rem] max-w-[min(380px,75%)]`):
  - **Densidade:** "menos", uma amostra `h-2.5 w-10` por classe com a faixa embaixo (`≤ a`, `a–b`, `> z`), "mais", depois a unidade e o tamanho do hexágono ("agregados; aproxime para ver ~36 km²" quando res < 6).
  - **Focos:** chips de FRP interativos, ligados ao mesmo estado da sidebar.
  - **Risco:** as 4 classes, a frase de probabilidade e a data da previsão.
- **Painel da célula** (direita, `w-64`, aberto ao clicar num hexágono na densidade):
  - id e área;
  - valor, percentil, MODIS, VIIRS e hexágonos contidos;
  - nota "série por célula ainda não disponível";
  - botões "Baixar CSV desta célula" (polygon da célula) e "Usar como área".

### Camadas

- **Densidade:**
  - `aggregateCells`, depois corta em `HEX_CAP`;
  - classes = `quantileBreaks` dos valores desenhados;
  - opacidade = `0.55 + 0.4·k/(classes−1)`;
  - tooltip HTML com valor e unidade, percentil, sensor dominante (MODIS x · VIIRS y), categoria e "soma de n hexágonos" quando agregado.
- **Focos:**
  - filtra no cliente por sensor, categoria e FRP;
  - ordena por FRP em ordem decrescente e corta em `POINT_CAP`;
  - raio por `frpRadius`, cor da classe de FRP;
  - tooltip com data, hora UTC, satélite, dia/noite, FRP e classe, confiança, categoria e "Detecção de calor, não incêndio confirmado".
- **Risco:** agregado por resolução, mantendo a probabilidade máxima.

### Notas abaixo do mapa

- Janela dos focos individuais.
- Quartis de FRP calculados.
- Aviso sobre a categoria coincidente.
- Sempre: o aviso de honestidade (`map.honesty`).

### Tabela

As 20 células com mais detecções, com id, valor, percentil e sensor dominante. Só funciona na camada Densidade.

---

## 10. Mapa Leaflet (`components/hex-map.tsx`)

- Carregado com `dynamic(() => import("@/components/hex-map"), {ssr:false, loading: MapLoading})`.
- **Nunca** usa os ícones de marcador padrão do Leaflet.

**Container:**

```
MapContainer bounds=bbox, preferCanvas, zoomControl={false}, minZoom 3, zoomSnap 0.25, keyboard, aria-label
```

**Panes:**

| Pane | zIndex | Renderização |
|---|---|---|
| `hexes` | 410 | canvas |
| `points` | 420 | canvas |
| `outline` | 450 | svg |

**Basemap:**

- **Escuro:** OSM `https://tile.openstreetmap.org/{z}/{x}/{y}.png` com `className "tiles-dark"`.
  - Se existir `NEXT_PUBLIC_CARTO_KEY`, usa CARTO `dark_all` com atribuição OSM + CARTO.
- **Claro:** OSM sem filtro.
- Em erro de tile, chama `onTileError(true)`.

**Controles:**

- Zoom no canto superior direito.
- Escala métrica no canto inferior direito.
- Atribuição sem prefixo, mais "Dados: NASA FIRMS (MODIS/VIIRS) · Hexágonos H3".
- `ResizeObserver` → `invalidateSize`.
- Escuta o map-bus para fazer `flyTo` com marcador.

**Contorno e enquadramento:**

- Contorno da região: GeoJSON do bbox, `color #3fd0b5`, `weight 1.2`, `dashArray "5 5"`, sem preenchimento.
- Área desenhada: branca, `weight 2`, `fillOpacity .04`.
- `FitOnChange`: `fitBounds` com `padding 10` quando a região, a área ou o `resetKey` mudam.

**Camadas de dados:**

- Hexágonos: `L.polygon(cellToBoundary)`, borda `#0e1418` com `weight .6`, tooltip `sticky` e clique → `onCellClick`.
- Pontos: `circleMarker`, borda `#e9f0f3` com `opacity .75`, `fillOpacity .9`.

**`DrawTool`:**

- Retângulo: arrastar.
- Polígono: um clique por vértice; fecha com duplo clique ou clicando no primeiro vértice.
- Esc cancela.
- Estilo do rascunho: branco, `dashArray "4 4"`.
- Ao terminar, chama `onDrawn("bbox:..."|"poly:...")`.

---

## 11. Tela Calendário (`app/calendario/calendar-view.tsx`)

**Chamadas:**

- `/calendar` `{region,...area,start:range.start,end:range.end,top_n:3,learn:true}`.
- `/summary` com os mesmos parâmetros e `learn:false`.

**Estado:**

- `mode`: contagem | anomalia. A anomalia só existe para a série harmonizada.
- `series`: harmonizado | modis | viirs.
- `asTable`.
- `selected`.

### Cartões (3)

1. **Mês mais crítico:** o mês com maior média em meses completos, com a nota "{v} células-dia…".
2. **Anomalia do mês atual:**
   - valor `signedPct(comparison.deviation_pct)`;
   - selo Abaixo/Normal/Acima mais "· percentil N";
   - nota: "Novembro de 2026, dias 1 a 14, comparado aos mesmos dias de 23 anos (2003–2025) · dados provisórios".
3. **Média histórica mensal:** `summary.monthly_mean`.

Abaixo dos cartões: os `learn.avisos` em caixas `border-fire/40 bg-fire/10`.

### Painel "Focos por mês"

**Conteúdo exportável (`ref` usado no PNG):**

- Título, mais o subtítulo "{região}, {ano1} a {ano2} · {descrição da série} · {data início} a {data fim}".
- Toggles Harmonizado/MODIS/VIIRS e Contagem/Anomalia (`data-html2png-ignore`).

**Heatmap (`components/calendar-heatmap.tsx`):**

- Grade CSS `role=grid` com colunas `2.75rem repeat(12,1fr)`, `gap 3px`, `min-w-[560px]`, com rolagem horizontal.
- Linhas são anos, do mais recente para o mais antigo; colunas são meses.
- Cada célula é um `<button role=gridcell>` com `h-5 rounded-sm`.
- **Cores:**
  - contagem: classe pelo quantil de `seriesValue`, que é a média diária (harmonizado = `daily_mean`, sensor = `cell_days/obs_days`);
  - anomalia: `divergingColor(deviation_pct)`.
- **Marcações:**
  - mês parcial: hachura `repeating-linear-gradient(45deg, rgba(0,0,0,.5) 0 2px, transparent 2px 6px)`;
  - mês atual: `box-shadow inset 0 0 0 2px #e9f0f3`;
  - mês provisório (a partir de `learn.procedencia.provisional_from`): `inset 0 0 0 1px rgba(233,240,243,.8)`;
  - top 3: "▲" branco no canto;
  - sem dado: borda tracejada e `aria-disabled`;
  - selecionado: `ring-2 ring-white`.
- **Teclado:** roving tabindex; setas, Home e End movem; Enter seleciona.
- **Tooltip:** flutuante, posicionado acima da célula, igual ao `aria-label`, via `cellLabel`.

**Legenda:**

- Contagem: "menos", amostras `h-3 w-12` com faixa (`≤ a`, `a–b`, `> z`), "mais" e a explicação.
- Anomalia: 8 amostras (≤ −50% … ≥ +50%, sem referência).
- Também: a nota longa das marcações e o crédito "Fonte: NASA FIRMS…".

**Rodapé do painel:**

- Nota "As classes do mapa usam outra medida…".
- Botões "Ver como tabela", "Baixar PNG" e "Baixar CSV" (brand).
- O PNG é salvo como `calendario-queimadas_{regiao}_{inicio}_{fim}.png`.

**Detalhe do mês** (ao clicar):

- Grade com células-dia, por dia, MODIS, VIIRS, detecções, dias com dados, percentil e desvio.
- Botão "Ver no mapa": `period=custom` com início e fim do mês (o fim limitado a `data_end`), navega para `/`.
- Botão "Baixar CSV deste mês".

**Tabela:** meses do mais recente para o mais antigo, com Mês, Células-dia, Por dia, MODIS, VIIRS, Dias obs., Percentil e Desvio.

### Gráfico "Ano atual acumulado vs. histórico"

- Recharts `ComposedChart` com altura de 280 px.
  - `Area` com a faixa mínimo–máximo dos anos completos anteriores (`fill #fff`, `opacity .08`).
  - `Line` da mediana: `#a9bbc4`, tracejada `5 4`.
  - `Line` do ano atual: `#1fa58d`, `strokeWidth 2`, pontos com `r 3`.
- Grade `#26343d` só horizontal; eixos `#a9bbc4` com fonte 11.
- Exige pelo menos 3 anos completos.
- Legenda HTML acima; `role=img` com `aria-label`.

No fim da página: `comparison.sentence`.

---

## 12. Tela Harmonização (`app/harmonizacao/harmonization-view.tsx`)

**Chamada:** `/harmonization {region, learn:false}`.

**Painéis:**

1. **"Harmonização MODIS + VIIRS":**
   - à esquerda, 4 parágrafos de introdução;
   - à direita, um `ol` de 4 passos: cartões `bg-background` com número em círculo `bg-brand` e seta `ArrowRight` entre eles a partir de xl.
2. **"Séries mensais da região"** (PNG: `harmonizacao_{regiao}_{modo}`):
   - Toggle Antes (`modis_raw` + `viirs_raw`) / Depois (`harmonized`) e botão de tabela.
   - Recharts `LineChart` com altura de 340 px.
     - Cores: `modis_raw #5b8ff0`, `viirs_raw #e0632a`, `harmonized #1fa58d`.
     - `ReferenceArea` no período de sobreposição (`fill #fff`, `opacity .05`).
     - Eixo X com `interval 23`; eixo Y com `int()`.
     - Tooltip escuro; `isAnimationActive=false`.
   - Nota da janela de calibração.
3. **Métricas:**
   - Tabela de métodos com R² diário e mensal, viés, RMSE e dias de sobreposição. O mapeamento de quantis vem em negrito.
   - `<details>` com o erro por ano (holdout) e os anos fora da janela.
   - Nota "dessazonalizado não fornecido".
4. **Limitações:** a lista `harm.extraLimits` mais `limitations` da API.

---

## 13. Tela Previsão (`app/previsao/forecast-view.tsx`)

**Chamada:** `/forecast {region,...area,horizon:7,limit:60000,boundary:false,learn:false,fallback:true}`.

**Elementos, em ordem:**

1. **Faixa de aviso:** `border-fire/40 bg-fire/10` com "Probabilidade estimada, não certeza." mais o `disclaimer`.
2. **4 cartões:** contagem de células por classe (muito alto → baixo), com a nota "de N hexágonos de ~36 km²".
3. **Mapa de risco:**
   - `HexMap` com `aggregateRisk`, 4 cores e opacidade `0.55+0.4·k/3`;
   - legenda;
   - select de horizonte com só "7 dias";
   - tabela das 20 células com maior probabilidade.
4. **Sem modelo:** usa o fallback de climatologia ("% dos anos com detecção") e a nota dos limiares "a validar".
5. **Métricas:**
   - cartões ROC-AUC, PR-AUC e Brier;
   - se `metrics` for nulo, mostram "a validar" com Pill "sem dados" e uma nota explicativa.
6. **Comparação com referências:** persistência e climatologia, sem dados publicados ("a validar").

---

## 14. Tela Dados completos (`app/dados/data-view.tsx`)

**Painel "Filtros ativos":**

- `dl` com Região, Recorte, Período ("Últimos 12 meses · DD/MM/AAAA a DD/MM/AAAA"), Sensor, Categoria e FRP.
- Pill da granularidade, mais "N hexágonos com detecção" (via `/hexgrid` com `limit:1`) e "· N dias".
- Nota sobre o início dos dados diários.
- Se houver filtro de FRP: aviso em `text-fire` de que o FRP não se aplica ao CSV.

**Dois painéis lado a lado (xl):**

1. **"Focos filtrados (por hexágono)":**
   - descrição;
   - aviso "pesado" (granularidade mensal e mais de 366 dias);
   - botão Baixar CSV com `sensor` e `category`.
2. **"Calendário mensal":**
   - descrição e "N meses";
   - botão Baixar CSV (`kind=calendar`);
   - botão "CSV da previsão" só se houver modelo; senão, um texto de indisponibilidade.

**Download:**

- Faz `fetch` e gera um blob.
- O nome do arquivo vem de `Content-Disposition`; o número de linhas vem de `X-Row-Count`.
- Durante o download, o botão mostra `Loader2 animate-spin motion-reduce:animate-none` e "Gerando arquivo…".
- Ao terminar, um toast `role=status aria-live` fixo embaixo, no centro, mostra "{arquivo} baixado: N linhas." e some em 8 s.

**Outros elementos:**

- Nota legal (atribuição, CC BY 4.0, dados provisórios a partir de 01/08/2026).
- Dois dicionários de colunas em tabelas, com o nome da coluna em `font-mono text-brand`.

---

## 15. Urgência e Sobre

### `/urgencia` (`urgency-view.tsx`, `max-w-3xl`)

- h1 e o texto de abertura.
- Aviso com o ícone `ShieldAlert`.
- 2 cartões de contato (193 Corpo de Bombeiros e 199 Defesa Civil):
  - número grande em `font-heading text-4xl` como link `tel:`;
  - `aria-label` com os dígitos separados.
- Seção "Enquanto isso" com dicas.
- Botão para `/?period=1d&layer=focos`.
- Fontes oficiais com a data em que os números foram conferidos.

### `/sobre` (`about-view.tsx`, `max-w-4xl`)

- h1 e o texto de abertura.
- Grade de 2 colunas: Fontes de dados (links), Agradecimentos, Créditos de imagens e Licenças/Equipe.
- Limitações: `harm.extraLimits` mais `limitations_simple`.
- Seção `#glossario` com os termos de `/glossary` em cartões (termo, texto simples e "Cuidado:" em `text-fire`).

---

## 16. Offline, cache e scripts

**Cache para modo offline:**

- `scripts/cache_api.py` grava as respostas padrão de cada tela em `web/public/cache/<cacheKey>.json`.
- Os JSON ficam no gitignore (cerca de 30 MB).
- O `getJSON` usa esses arquivos quando a API falha, e a status bar mostra "Modo offline".

**Comandos:**

- `python tasks.py web`: servidor de desenvolvimento na porta 3000.
- `python tasks.py demo`:
  1. recusa iniciar se as portas 8000 ou 3000 estiverem ocupadas;
  2. sobe a API;
  3. gera o cache;
  4. roda o build;
  5. faz `next start`.

---

## 17. Testes (vitest, `web/tests/`)

| Arquivo | O que cobre |
|---|---|
| `filters.test.ts` | parse e serialize, `parseArea`, `filterRange` |
| `palettes.test.ts` | `classColors`, `quantileBreaks`, `classOf`, `divergingColor` |
| `map-layers.test.ts` | `displayRes`, `aggregateCells` (percentis com empate), FRP, categorias, `anomalyBadge` |
| `cache-key.test.ts` | os nomes batem com os de `scripts/cache_api.py` |
| `i18n.test.ts` | BR → pt; US/PT → en; XX → null; Accept-Language; o cookie vence o país |

Os imports nos testes são relativos (`../lib/...`), porque o alias `@/` não resolve no vitest.

---

## 18. Checklist de aceite

- [ ] `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` passam sem erros.
- [ ] Com a API rodando, `/`, `/calendario`, `/harmonizacao`, `/previsao`, `/dados`, `/sobre` e `/urgencia` renderizam sem erro no console.
- [ ] Mudar um filtro altera a URL depois de 300 ms; recarregar a página mantém o estado.
- [ ] Em 375 px não há rolagem horizontal; o header cabe (CTAs e idioma vão para o Menu).
- [ ] Com o cookie `firetrack.lang=en`, ou o header `x-vercel-ip-country: US`, tudo aparece em inglês, inclusive números (`12,345`) e datas (`MM/DD/AAAA`). Com BR, tudo em português.
- [ ] Nenhuma ocorrência de "incêndio confirmado" afirmativo nem de "FIREWATCH".
- [ ] Sem chaves no `web/`.

---

## Apêndice A: textos (copiar literalmente)

Os arquivos abaixo são a fonte única de todos os textos. Crie-os exatamente assim em `web/content/` e em `web/lib/i18n.ts`.

### `web/content/copy.ts`

```ts
// All user-facing text (pt-BR). Components import from here; no copy hardcoded in components.
// Wording rule: "detecção de calor / foco de calor", never "incêndio confirmado".

export const copy = {
  brand: "FIRETRACK",
  skipLink: "Pular para o conteúdo",
  nav: [
    { href: "/", label: "Mapa de focos" },
    { href: "/calendario", label: "Calendário" },
    { href: "/harmonizacao", label: "Harmonização" },
    { href: "/previsao", label: "Previsão" },
    { href: "/dados", label: "Dados completos" },
  ],
  header: {
    menu: "Menu",
    urgencia: "Urgência",
    acessibilidade: "Acessibilidade",
    entrar: "Entrar",
    loginTitle: "Login opcional",
    loginBody: "Login opcional: em breve. Tudo funciona sem conta.",
    loginNote: "Nenhum dado pessoal é coletado.",
    alertas: "Cadastrar alertas",
    alertasTitle: "Cadastro de alertas",
    alertasBody: "Cadastro de alertas: em breve. Você poderá receber avisos de focos de calor na sua região.",
    brigada: "Faça parte da brigada",
    brigadaTitle: "Brigada de incêndio",
    brigadaBody: "Faça parte da brigada: em breve. Aqui você vai encontrar como se voluntariar.",
    emBreveNote: "Nenhum dado pessoal é coletado por enquanto.",
    fechar: "Fechar",
  },
  a11y: {
    title: "Acessibilidade",
    textSize: "Tamanho do texto",
    smaller: "Diminuir texto",
    larger: "Aumentar texto",
    highContrast: "Alto contraste",
    colorblind: "Paleta para daltônicos",
    colorblindHint: "Usa a paleta Cividis",
    reduceMotion: "Reduzir animações",
  },
  sidebar: {
    filtersButton: "Filtros",
    filtersTitle: "Filtros",
    search: "Buscar lugar ou lat, lon",
    searchClear: "Limpar busca",
    searchHint: "Digite “lat, lon” (ex.: -10.2, -48.3) ou o nome de uma região.",
    searchNotFound: "Lugar não encontrado. Use “lat, lon” ou o nome de uma região.",
    searchOutside: "Ponto fora da região selecionada.",
    region: "Região",
    customArea: "Área personalizada",
    clearArea: "Remover área personalizada",
    delimBbox: "Delimitação: retângulo (bbox) da região",
    delimCustomBbox: "Delimitação: retângulo desenhado",
    delimCustomPoly: "Delimitação: polígono desenhado",
    period: "Período",
    periods: {
      serie: "Série completa (2003 a hoje)",
      "5a": "Últimos 5 anos",
      "12m": "Últimos 12 meses",
      "30d": "Últimos 30 dias",
      "1d": "Últimas 24 h (último dia com dados)",
      custom: "Personalizado",
    },
    from: "De",
    to: "Até",
    dateError: "A data inicial precisa ser anterior ou igual à final, dentro de",
    granularityTitle: "Granularidade dos dados por célula",
    sensor: "Sensor",
    sensors: { todos: "Todos", modis: "MODIS", viirs: "VIIRS" },
    category: "Categoria",
    categories: { todas: "Todas", modis: "Só MODIS", viirs: "Só VIIRS", coincidentes: "Coincidentes" },
    categoryInfo: "Coincidente = os dois sensores detectaram calor na mesma célula e dia. Coincidente não significa o mesmo evento.",
    frp: "Intensidade (FRP)",
    frpAll: "Todos",
    frpClasses: { baixa: "Baixa", media: "Média", alta: "Alta", muito_alta: "Muito alta" },
    frpNote: "Relativa a cada sensor (quartis de FRP do MODIS e do VIIRS separadamente).",
    colors: "Cores",
    invert: "Inverter escala",
    classes: "Número de classes",
    clear: "Limpar filtros",
    usefulTitle: "Úteis para todos",
    last24h: "Focos nas últimas 24 h",
    howToRead: "Como ler o mapa",
    alerts: "Alertas e urgência",
    synthetic: "Amostra sintética: só para demonstração, não representa queimadas reais.",
  },
  guide: {
    title: "Como ler o mapa",
    intro: "Cinco dicas rápidas para não tirar conclusões erradas.",
    tips: [
      "Cada ponto ou hexágono é uma detecção de calor feita por satélite, não um incêndio confirmado.",
      "Hexágonos mais claros reúnem mais células-dia com detecção; a cor é relativa às classes da legenda.",
      "Nuvens, fumaça e o horário de passagem do satélite escondem parte dos focos: ausência de ponto não prova ausência de fogo.",
      "MODIS (pixel de ~1 km) e VIIRS (pixel de 375 m) enxergam de forma diferente; por isso a série é harmonizada.",
      "Dados dos últimos meses são provisórios (tempo quase real) e podem mudar.",
    ],
  },
  status: {
    updated: "Atualizado às",
    updatedOn: "em",
    sensors: "MODIS + VIIRS",
    offline: "Modo offline: dados em cache local",
    apiDown: "API indisponível",
    credit: "Este projeto usa dados do NASA Fire Information for Resource Management System (FIRMS), parte do NASA LANCE e do ESDIS.",
    creditShort: "Fonte: NASA FIRMS",
    about: "Sobre e créditos",
    creditUrl: "https://earthdata.nasa.gov/firms",
  },
  map: {
    ariaMap: "Mapa de detecções de calor. Use as setas para mover e + / − para aproximar.",
    zoomIn: "Aproximar",
    zoomOut: "Afastar",
    dataAttribution: "Dados: NASA FIRMS (MODIS/VIIRS) · Hexágonos H3",
    panelTitle: "Mapa de focos",
    layers: { densidade: "Densidade", focos: "Focos", risco: "Risco" },
    layerLabel: "Camada do mapa",
    riskDisabled: "Sem previsão de modelo avaliado para esta região. A expectativa por climatologia está na aba Previsão.",
    tools: {
      camadas: "Camadas (mapa base)",
      desenhar: "Desenhar área",
      localizacao: "Minha localização",
      reiniciar: "Reiniciar vista",
      telaCheia: "Tela cheia",
      sairTelaCheia: "Sair da tela cheia",
      csv: "Baixar CSV",
    },
    basemaps: { escuro: "Escuro", claro: "Claro", satelite: "Satélite" },
    sateliteDisabled: "Satélite (Esri): licença de uso a validar; desativado.",
    tileError: "Mapa base indisponível; os dados continuam visíveis.",
    draw: {
      rect: "Retângulo",
      poly: "Polígono",
      typed: "Digitar coordenadas",
      clear: "Limpar",
      hintRect: "Clique e arraste para desenhar o retângulo. Esc cancela.",
      hintPoly: "Clique para adicionar vértices; clique no primeiro ou dê duplo clique para fechar. Esc cancela.",
      typedTitle: "Digitar coordenadas da área",
      typedDesc: "Graus decimais (WGS84). Oeste < Leste e Sul < Norte.",
      west: "Oeste", south: "Sul", east: "Leste", north: "Norte",
      apply: "Aplicar",
      invalid: "Coordenadas inválidas: confira oeste < leste, sul < norte e os limites (−180 a 180, −90 a 90).",
    },
    geo: {
      denied: "Localização negada ou indisponível. Nada foi enviado nem guardado.",
      unsupported: "Este navegador não oferece geolocalização.",
      you: "Você está aqui (aproximado). A posição não é enviada nem guardada.",
    },
    legend: { less: "menos", more: "mais" },
    densityUnit: { todos: "células-dia com detecção (escala VIIRS)", modis: "detecções MODIS", viirs: "detecções VIIRS" },
    cellSize: "Hexágonos de ~{km2} km²",
    aggregated: "agregados; aproxime para ver ~36 km²",
    capBanner: "Mostrando as {n} células mais ativas de {total}.",
    pointsCapBanner: "Mostrando as {n} detecções de maior FRP de {total} carregadas.",
    pointsTruncated: "A API limitou a lista a {n} detecções (as mais recentes).",
    pointsWindow: "Focos individuais existem só para os últimos {days} dias de dados ({start} a {end}).",
    frpComputed: "Classes de FRP calculadas a partir das detecções carregadas (quartis por sensor): MODIS {m} MW · VIIRS {v} MW.",
    categoryNoteDensity: "Coincidentes no mapa de densidade = os dois sensores detectaram na célula durante o período (não necessariamente no mesmo dia).",
    honesty: "Cada cor indica detecções de calor por satélite, não área queimada nem incêndio confirmado. Ausência de cor não garante ausência de fogo (nuvens, fumaça e horário das passagens).",
    pointDisclaimer: "Detecção de calor, não incêndio confirmado",
    riskTooltip: "Probabilidade estimada, não certeza",
    riskMax: "maior probabilidade entre os contidos",
    riskLegend: "Probabilidade de ao menos uma detecção de calor nos próximos 7 dias, por hexágono",
    toPrevisao: "Ver a aba Previsão",
    table: { show: "Ver como tabela", hide: "Ver mapa", caption: "As 20 células com mais detecções no período", id: "Célula", count: "Valor", pct: "Percentil", dominant: "Sensor com mais detecções", onlyDensity: "A tabela lista as células da camada Densidade." },
    cellPanel: {
      title: "Detalhe da célula",
      close: "Fechar detalhe",
      noSeries: "Série temporal por célula ainda não disponível na API; mostrando os totais do período.",
      csv: "Baixar CSV desta célula",
      useArea: "Usar como área",
      percentile: "Percentil no período",
      modis: "Detecções MODIS",
      viirs: "Detecções VIIRS",
      children: "Hexágonos de ~36 km² contidos",
    },
    tooltip: {
      cellDays: "células-dia com detecção",
      percentile: "percentil {p} entre as células do período",
      dominant: "sensor com mais detecções",
      sum: "soma de {n} hexágonos de ~36 km²",
      category: { modis: "só MODIS", viirs: "só VIIRS", coincidentes: "MODIS e VIIRS" },
      day: "dia", night: "noite",
      confidence: "confiança",
    },
  },
  cards: {
    focos: "Focos no período",
    focosNote: "detecções de calor de todos os satélites, após filtros de qualidade (o mesmo fogo pode ser visto por mais de um satélite)",
    focosArea: "Células-dia com detecção na área",
    focosAreaNote: "área desenhada; cada célula conta uma vez por dia, sem duplicar satélites",
    comparado: "Comparado à média histórica",
    comparadoCuts: "Abaixo: percentil < 33 · Normal: 33 a 67 · Acima: > 67 (mesmo mês nos outros anos)",
    sameDays: "mês em andamento: dias 1 a {d} comparados aos mesmos dias de {n} anos anteriores",
    fullMonth: "{mes} vs. média de {n} anos anteriores",
    risco: "Risco nos próximos 7 dias",
    riscoNA: "Indisponível",
  },
  ui: {
    range: "{a} a {b}",
    monthYear: "{m} de {y}",
    days: "{n} dias",
    load: { regioes: "regiões", calendario: "calendário", series: "séries", metricas: "métricas", tabela: "tabela", previsao: "previsão", glossario: "glossário", dados: "dados" },
    badge: { Abaixo: "Abaixo", Normal: "Normal", Acima: "Acima", Indisponível: "Indisponível" },
    granularity: { Diário: "Diário", Mensal: "Mensal" },
    percentile: "percentil {p}",
    provisional: "dados provisórios",
    sameDaysLong: "{m} de {y}, dias 1 a {d}, comparado aos mesmos dias de {n} anos ({a}–{b})",
    vsYears: "{m} de {y} vs. {n} anos anteriores",
    cumAria: "{t}: {y} vs. mediana e faixa de {a} a {b}.",
    cells: "{n} células",
    riskAgg: "{max}, {n} hexágonos de ~36 km²",
    ofHexes: "de {n} hexágonos de ~36 km²",
    riskCells: "Células: risco {c}",
    yearsWith: "{p}% dos anos",
    withDetection: "com detecção",
    hexSize: "Hexágonos de ~{k} km²",
    maxContained: " (maior valor entre os contidos)",
    noData: "sem dados",
    methodSteps: "Método em 4 passos",
    navMain: "Principal",
    png: "Baixar como PNG",
    pngAria: "Baixar painel como PNG",
    palettes: { inferno: "Inferno", cividis: "Cividis", contraste: "Alto contraste", cinza: "Escala de cinza" },
    cellLabel: "{m} de {y}: {v} {unit} ({d} por dia)",
    cellPct: ", percentil {p} vs. o mesmo mês nos outros anos",
    cellDev: ", {x} vs. anos anteriores",
    cellDays: " ({n} dias)",
    learn: {
      titles: { mapa: "Como ler o mapa", calendario: "Como ler o calendário", harmonizacao: "Como ler a harmonização", previsao: "Como ler a previsão" },
      desc: "Textos gerados a partir dos dados exibidos, sem inteligência artificial.",
      level: "Nível de linguagem",
      levels: { simples: "simples", estudante: "estudante", tecnico: "técnico" },
      slots: { situacao: "O que você vê", cautela: "Cuidado ao concluir", contexto: "Contexto" },
      error: "Não foi possível carregar a explicação.",
      naoDiz: "O que este dado NÃO diz",
      think: "Para pensar",
      ods: "Metas ODS da ONU:",
    },
  },
  states: {
    loading: "Carregando",
    empty: "Nenhum foco encontrado para esta busca",
    error: "Não foi possível carregar os dados.",
    retry: "Tentar novamente",
  },
} as const;

export type Copy = typeof copy;

// Page copy lives in content/pages.ts (kept separate for size); import it from here.
export { harm, prev, urg, sobre } from "./pages";
export { cal } from "./calendar";
export { dados } from "./data";

```

### `web/content/pages.ts`

```ts
// Copy for the Harmonização, Previsão, Urgência and Sobre pages (pt-BR). Re-exported by content/copy.ts.
// Wording rule: "detecção de calor / foco de calor", never "incêndio confirmado".

export const harm = {
  title: "Harmonização MODIS + VIIRS",
  intro: [
    "O MODIS (desde 2003) enxerga o chão em pixels de cerca de 1 km; o VIIRS (desde 2012), em pixels de 375 m.",
    "O VIIRS detecta focos menores e mais focos por fogo: somar os dois contaria o mesmo fogo várias vezes e criaria um salto falso em 2012.",
    "Por isso contamos células-dia (hexágonos de ~36 km² com ao menos uma detecção) e ajustamos o MODIS para a escala do VIIRS usando os anos em que os dois funcionaram juntos.",
    "O resultado é uma série única de 2003 até hoje, com mais incerteza antes de 2012.",
  ],
  steps: [
    { t: "Carregar", d: "Detecções MODIS e VIIRS da NASA FIRMS, com filtros de qualidade." },
    { t: "Agrupar no espaço e no tempo", d: "Cada detecção vira célula-dia: hexágono H3 de ~36 km² × dia." },
    { t: "Base harmonizada", d: "MODIS ajustado à escala VIIRS (mapeamento de quantis); VIIRS usado direto onde existe." },
    { t: "Indicadores", d: "Calendário, anomalias, mapa e CSV saem da mesma base." },
  ],
  chartTitle: "Séries mensais da região",
  chartSub: "células-dia com detecção por mês",
  before: "Antes",
  after: "Depois",
  toggleLabel: "Comparar antes e depois da harmonização",
  series: { modis_raw: "MODIS bruto", viirs_raw: "VIIRS bruto", harmonized: "Harmonizado (escala VIIRS)" },
  overlap: "Sombreado: período em que os dois sensores operam",
  calibWindow: "A calibração usa {a}–{b}; depois disso a série usa o VIIRS diretamente.",
  table: "Ver como tabela",
  chart: "Ver gráfico",
  monthCol: "Mês",
  metricsTitle: "Métricas de calibração",
  metricsSub: "Validação deixando um ano de fora (LOYO): o ajuste é treinado sem aquele ano e testado nele.",
  methods: { raw_modis: "MODIS bruto (sem ajuste)", linear: "Ajuste linear", quantile_mapping: "Mapeamento de quantis (usado)" } as Record<string, string>,
  cols: { method: "Método", r2d: "R² diário", r2m: "R² mensal", bias: "Viés diário", rmse: "RMSE diário", days: "Dias de sobreposição", year: "Ano", r2: "R²" },
  perYear: "Erro por ano deixado de fora (mapeamento de quantis)",
  outside: "Anos fora da janela de calibração (verificação de deriva)",
  noDeseason: "Erro sobre anomalias dessazonalizadas: não fornecido pela API.",
  limitsTitle: "Limitações",
  extraLimits: [
    "Detecção de calor não é incêndio confirmado nem área queimada.",
    "A NASA anunciou o fim das entregas do Suomi NPP na FIRMS às 13:00 UTC de 02/11/2026 (outra página da NASA cita 01/11). Nesta base, o Suomi NPP vai até 31/07/2026 (produto padrão); a partir de 01/08/2026 o tempo quase real usa NOAA-20 e NOAA-21.",
    "Agosto a novembro de 2026 vêm de produtos em tempo quase real: estão em validação adicional e podem mudar.",
    "Depois de 2012, harmonized_count usa o VIIRS; uma célula vista só pelo MODIS fica, em geral, com harmonized_count = 0. A coluna modis_only = 1 marca esses casos no CSV (nos últimos 30 dias: 7.006 linhas, 23 delas com valor > 0, a validar).",
  ],
};

export const prev = {
  title: "Previsão de risco",
  always: "Probabilidade estimada, não certeza.",
  horizon: "Horizonte",
  horizonOnly: "Só o horizonte de 7 dias está disponível na API.",
  model: "Modelo {v}, rodado em {d}",
  legendTitle: "Probabilidade de ao menos uma detecção de calor nos próximos {h} dias, por hexágono",
  classes: { baixo: "Baixo", moderado: "Moderado", alto: "Alto", muito_alto: "Muito alto" } as Record<string, string>,
  metricsTitle: "Avaliação do modelo",
  metric: { roc_auc: "ROC-AUC", pr_auc: "PR-AUC", brier: "Brier" } as Record<string, string>,
  metricHelp: {
    roc_auc: "1 = separa perfeitamente; 0,5 = sorteio",
    pr_auc: "mais alto é melhor; foca nos dias com fogo",
    brier: "erro das probabilidades; mais baixo é melhor",
  } as Record<string, string>,
  noMetrics: "a validar",
  noMetricsNote: "As métricas do modelo ainda não foram publicadas: a API não retorna avaliação. Sem elas, não é possível afirmar que o modelo supera as referências simples.",
  baselinesTitle: "Comparação com referências simples",
  baselines: {
    persistencia: "Persistência (repete o que aconteceu nos últimos dias)",
    climatologia: "Climatologia (média do mesmo período em anos anteriores)",
  } as Record<string, string>,
  beats: "O modelo supera esta referência.",
  notBeats: "O modelo NÃO supera esta referência.",
  baselineNA: "Sem dados de comparação publicados (a validar).",
  fallbackTitle: "Expectativa por climatologia (não é previsão)",
  fallbackNote: "Sem modelo avaliado: o mapa mostra em que fração dos anos ({a}–{b}) cada hexágono teve detecção VIIRS no mês. Limiares {t} (a validar).",
  table: "Ver como tabela",
  tableCaption: "As 20 células com maior probabilidade",
  tableCols: { id: "Célula", p: "Probabilidade", cls: "Classe" },
};

export const urg = {
  title: "Urgência",
  lead: "Se há fogo perto de você, ligue agora. A ligação é gratuita.",
  notice: "Este serviço é informativo e não substitui os órgãos oficiais.",
  call: "Ligar para",
  see24h: "Ver focos das últimas 24 h",
  see24hNote: "Os focos aparecem com algumas horas de atraso, e nuvens ou fumaça podem escondê-los.",
  safetyTitle: "Enquanto isso",
  safety: [
    "Afaste-se da fumaça e do fogo; não tente apagar um fogo grande sozinho.",
    "Siga as orientações dos bombeiros e da Defesa Civil.",
    "Não espalhe boatos: confirme as informações nos canais oficiais.",
  ],
  noAlerts: "Alertas e assinaturas por e-mail não estão disponíveis.",
  sources: "Números conferidos em {d} nestas fontes oficiais:",
};

export const sobre = {
  title: "Sobre o FIRETRACK",
  lead: "Uma série única de detecções de calor por satélite (MODIS + VIIRS) para o Cerrado, de 2003 até hoje, com mapa, calendário, dados abertos e textos que ensinam a ler os dados com cuidado.",
  sourcesTitle: "Fontes de dados",
  sources: [
    { name: "NASA FIRMS: MODIS (Terra e Aqua), produto padrão e tempo quase real", url: "https://earthdata.nasa.gov/firms" },
    { name: "NASA FIRMS: VIIRS 375 m (Suomi NPP, NOAA-20, NOAA-21), produto padrão e tempo quase real", url: "https://earthdata.nasa.gov/firms" },
    { name: "Grade hexagonal H3 (licença Apache 2.0)", url: "https://h3geo.org" },
    { name: "Mapa base: © colaboradores do OpenStreetMap (ODbL)", url: "https://www.openstreetmap.org/copyright" },
  ],
  ackTitle: "Agradecimentos",
  ack: "Este projeto usa dados do NASA Fire Information for Resource Management System (FIRMS), parte do NASA LANCE e do ESDIS. O uso dos dados não implica endosso da NASA.",
  creditsTitle: "Créditos de imagens",
  credits: [
    "Nenhuma imagem de terceiros é usada na interface (registro em web/public/images/CREDITS.md).",
    "Ícones: Lucide (licença ISC).",
    "Fontes tipográficas: Space Grotesk e Inter (SIL Open Font License).",
  ],
  limitsTitle: "Limitações",
  glossaryTitle: "Glossário",
  glossaryPitfall: "Cuidado:",
  teamTitle: "Equipe",
  team: "Equipe do NASA Space Apps 2026: nomes a definir.",
  licenseTitle: "Licenças",
  license: "Código: MIT. Dados derivados e textos educativos: CC BY 4.0, com atribuição obrigatória à NASA FIRMS. Termos de uso da FIRMS: a validar.",
};

```

### `web/content/calendar.ts`

```ts
// Copy for the Calendário page (pt-BR). Re-exported by content/copy.ts.
export const cal = {
  cardPeak: "Mês mais crítico",
  cardPeakNote: "{v} células-dia com detecção, em média, nos meses completos do período",
  cardAnomaly: "Anomalia do mês atual",
  cardMean: "Média histórica mensal",
  cardMeanNote: "células-dia com detecção por mês completo (escala VIIRS)",
  panelTitle: "Focos por mês",
  panelSub: "{r}, {a} a {b} · {s}",
  seriesSub: { harmonizado: "MODIS e VIIRS combinados (escala VIIRS)", modis: "só MODIS (bruto)", viirs: "só VIIRS (bruto, satélite de referência)" },
  modeLabel: "Modo do calendário",
  modes: { contagem: "Contagem", anomalia: "Anomalia" },
  seriesLabel: "Série",
  series: { harmonizado: "Harmonizado", modis: "MODIS", viirs: "VIIRS" },
  anomalyOnlyHarm: "A anomalia só existe para a série harmonizada (a API não calcula para MODIS ou VIIRS brutos).",
  gridLabel: "Calendário de detecções de calor por mês e ano. Use as setas para navegar e Enter para ver detalhes.",
  unit: { harmonizado: "células-dia com detecção (harmonizado)", modis: "células-dia com detecção MODIS", viirs: "células-dia com detecção VIIRS" },
  noData: "sem dados",
  partial: "mês incompleto",
  provisional: "dados provisórios",
  top3: "um dos 3 meses com mais detecções",
  less: "menos",
  more: "mais",
  noRef: "sem referência",
  legendCount: {
    harmonizado: "Média de células-dia com detecção por dia (harmonizado); classes por quantil dos meses exibidos.",
    modis: "Média de células-dia com detecção MODIS por dia; classes por quantil dos meses exibidos.",
    viirs: "Média de células-dia com detecção VIIRS por dia; classes por quantil dos meses exibidos.",
  },
  legendAnomaly: "Desvio vs. média do mesmo mês nos anos anteriores completos (mínimo 3).",
  legendSameBreaks: "As classes do mapa usam outra medida (células no período), por isso os limites numéricos são diferentes.",
  notes: "Contorno branco = mês atual · hachurado = mês incompleto (comparado só com os mesmos dias) · contorno fino = dados provisórios · ▲ = um dos 3 meses com mais detecções · borda tracejada = sem dados. Cada célula-dia é um hexágono de ~36 km² com ao menos uma detecção de calor; não é área queimada.",
  table: "Ver como tabela",
  grid: "Ver como calendário",
  png: "Baixar PNG",
  csv: "Baixar CSV",
  credit: "Fonte: NASA FIRMS (MODIS/VIIRS), parte do NASA LANCE e do ESDIS · FIRETRACK",
  detail: {
    title: "{m} de {y}",
    close: "Fechar detalhes",
    value: "Células-dia (harmonizado)",
    perDay: "Por dia",
    modis: "MODIS (células-dia)",
    viirs: "VIIRS (células-dia)",
    detections: "Detecções",
    obsDays: "Dias com dados",
    percentile: "Percentil (mesmo mês, outros anos)",
    deviation: "Desvio vs. anos anteriores",
    toMap: "Ver no mapa",
    csv: "Baixar CSV deste mês",
  },
  tableCols: ["Mês", "Células-dia", "Por dia", "MODIS", "VIIRS", "Dias obs.", "Percentil", "Desvio"],
  cumTitle: "Ano atual acumulado vs. histórico",
  cumSub: "Células-dia com detecção acumuladas mês a mês (harmonizado)",
  cumSeries: { current: "{y} (acumulado)", median: "Mediana {a}–{b}", band: "Mínimo–máximo {a}–{b}" },
  cumNote: "Faixa e mediana usam os anos completos do período, exceto o ano atual. O último mês do ano atual pode estar incompleto.",
};

```

### `web/content/data.ts`

```ts
// Copy for the Dados completos page (pt-BR). Re-exported by content/copy.ts.
export const dados = {
  title: "Dados completos",
  subtitle: "Baixe os dados com os filtros ativos. Fonte: NASA FIRMS (MODIS + VIIRS).",
  filtersTitle: "Filtros ativos",
  filtersHelp: "Mude os filtros no painel lateral. Os arquivos seguem o que está aqui.",
  labels: { region: "Região", area: "Recorte", period: "Período", sensor: "Sensor", category: "Categoria", frp: "Intensidade (FRP)" },
  wholeRegion: "região inteira",
  customArea: "área personalizada desenhada no mapa",
  frpAll: "todas",
  frpNotApplied: "não se aplica aos CSVs: eles somam detecções por hexágono e o FRP de cada detecção não entra na soma.",
  granularity: { Diário: "Diário: uma linha por dia e hexágono", Mensal: "Mensal: uma linha por mês e hexágono" },
  dailyFrom: "Dados diários existem a partir de {d}. Períodos que começam antes usam totais mensais.",
  cellsHint: "{n} hexágonos com detecção no período",
  monthsHint: "{n} meses no período",
  focosTitle: "Focos filtrados (por hexágono)",
  focosDesc: "Uma linha por hexágono de ~36 km² e por dia ou mês, com contagens MODIS, VIIRS e harmonizada. Sensor e categoria são aplicados.",
  calTitle: "Calendário mensal",
  calDesc: "Uma linha por mês para a região ou área: células-dia com detecção, percentil e desvio vs. anos anteriores. Sensor e categoria não mudam esta série (ela é sempre MODIS + VIIRS harmonizada).",
  download: "Baixar CSV",
  downloading: "Gerando arquivo…",
  done: "{f} baixado: {n} linhas.",
  failed: "Não foi possível gerar o arquivo. Tente novamente.",
  heavy: "Período longo com dados mensais por hexágono pode gerar centenas de milhares de linhas. Para a série regional, use o calendário mensal.",
  forecastCsv: "CSV da previsão (risco 7 dias)",
  forecastNA: "CSV de previsão: indisponível até existir um modelo avaliado.",
  legal: "A primeira linha de cada arquivo traz a atribuição obrigatória à NASA FIRMS. Dados derivados sob CC BY 4.0. Os dias a partir de 1º/08/2026 vêm de produtos em tempo quase real e são provisórios.",
  dictTitle: "Dicionário de colunas",
  dictSub: "Unidade principal: células-dia com detecção de foco de calor (não é área queimada)",
  columns: [
    ["date", "Dia (dados diários) ou 1º dia do mês (dados mensais), AAAA-MM-DD"],
    ["region", "Chave da região (config/regions.yaml)"],
    ["cell_id", "Hexágono H3 resolução 6 (~36 km²)"],
    ["lat, lon", "Centro do hexágono (graus WGS84), não a posição do fogo"],
    ["harmonized_count", "Células-dia com detecção na escala VIIRS (série harmonizada). Antes de 2012 é estimativa a partir do MODIS"],
    ["modis_count, viirs_count", "Detecções de cada sensor no hexágono, após filtros de qualidade (VIIRS soma os satélites)"],
    ["source_mix", "Quem detectou: MODIS, VIIRS ou BOTH (ambos), pelas contagens brutas. harmonized_count usa só o satélite VIIRS de referência, por isso pode ser 0 numa linha VIIRS"],
    ["percentile, anomaly_zscore", "Posição do mês da região em relação ao mesmo mês nos outros anos (repetido em cada linha do mês)"],
    ["modis_only", "1 = só o MODIS detectou neste hexágono e período (nenhuma detecção VIIRS); 0 = caso contrário"],
  ] as [string, string][],
  calColumns: [
    ["year, month", "Ano e mês"],
    ["harmonized_cell_days, daily_mean", "Células-dia com detecção (harmonizado) no mês e média por dia com dados"],
    ["modis_cell_days, viirs_cell_days", "Células-dia com detecção de cada sensor (brutos)"],
    ["obs_days, is_partial", "Dias com dados no mês; 1 = mês incompleto"],
    ["percentile, deviation_pct", "Posição vs. o mesmo mês nos outros anos; desvio % vs. média dos anos anteriores"],
  ] as [string, string][],
};

```

### `web/content/emergency.ts`

```ts
// Emergency contacts shown on /urgencia. Single config file: edit here only.
// Checked 2026-11-15 against state government pages (national numbers standardized by Anatel).
// Defesa Civil service can vary by municipality.
export const EMERGENCY = {
  checkedOn: "15/11/2026",
  contacts: [
    { number: "193", name: "Corpo de Bombeiros", when: "Fogo perto de pessoas, casas ou estradas; resgate e salvamento." },
    { number: "199", name: "Defesa Civil", when: "Risco coletivo, fumaça intensa, necessidade de evacuação. O atendimento pode variar por município." },
  ],
  sources: [
    { label: "Governo de Minas Gerais: atendimento de urgência pelo Corpo de Bombeiros (193)", url: "https://www.mg.gov.br/servico/solicitar-atendimento-de-urgencia-e-emergencia-pelo-corpo-de-bombeiros-militar" },
    { label: "Corpo de Bombeiros do Estado do Rio de Janeiro: em caso de emergência, disque 193", url: "https://www.cbmerj.rj.gov.br/?p=30222" },
    { label: "Prefeitura de Porto Alegre: risco de incêndio, ligue 199 (Defesa Civil)", url: "https://prefeitura.poa.br/carta-de-servicos/risco-de-incendio-ligue-199" },
  ],
} as const;

```

### `web/content/extra.ts`

```ts
// Small pt-BR strings that used to live in lib/format or components. English twin: extraEn in content/en.ts.
export const extra = {
  months: ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"],
  monthsShort: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],
  lang: { label: "Idioma", pt: "Português", en: "English", switchTo: "Switch to English" },
};

```

### `web/content/en.ts`

```ts
// All user-facing text in English (visitors outside Brazil). Same shape as the pt-BR files; the type
// check in content/index.ts fails if a key is missing.
// Wording rule: "heat detection / hotspot", never "confirmed fire".

export const copyEn = {
  brand: "FIRETRACK",
  skipLink: "Skip to content",
  nav: [
    { href: "/", label: "Hotspot map" },
    { href: "/calendario", label: "Calendar" },
    { href: "/harmonizacao", label: "Harmonization" },
    { href: "/previsao", label: "Forecast" },
    { href: "/dados", label: "Full data" },
  ],
  header: {
    menu: "Menu",
    urgencia: "Emergency",
    acessibilidade: "Accessibility",
    entrar: "Sign in",
    loginTitle: "Optional sign-in",
    loginBody: "Optional sign-in: coming soon. Everything works without an account.",
    loginNote: "No personal data is collected.",
    alertas: "Sign up for alerts",
    alertasTitle: "Alert sign-up",
    alertasBody: "Alert sign-up: coming soon. You will be able to get notices of heat detections in your region.",
    brigada: "Join the fire brigade",
    brigadaTitle: "Fire brigade",
    brigadaBody: "Join the fire brigade: coming soon. Here you will find how to volunteer.",
    emBreveNote: "No personal data is collected for now.",
    fechar: "Close",
  },
  a11y: {
    title: "Accessibility",
    textSize: "Text size",
    smaller: "Smaller text",
    larger: "Larger text",
    highContrast: "High contrast",
    colorblind: "Colorblind-safe palette",
    colorblindHint: "Uses the Cividis palette",
    reduceMotion: "Reduce motion",
  },
  sidebar: {
    filtersButton: "Filters",
    filtersTitle: "Filters",
    search: "Search place or lat, lon",
    searchClear: "Clear search",
    searchHint: "Type “lat, lon” (e.g. -10.2, -48.3) or the name of a region.",
    searchNotFound: "Place not found. Use “lat, lon” or the name of a region.",
    searchOutside: "Point outside the selected region.",
    region: "Region",
    customArea: "Custom area",
    clearArea: "Remove custom area",
    delimBbox: "Boundary: region bounding box",
    delimCustomBbox: "Boundary: drawn rectangle",
    delimCustomPoly: "Boundary: drawn polygon",
    period: "Period",
    periods: {
      serie: "Full series (2003 to today)",
      "5a": "Last 5 years",
      "12m": "Last 12 months",
      "30d": "Last 30 days",
      "1d": "Last 24 h (latest day with data)",
      custom: "Custom",
    },
    from: "From",
    to: "To",
    dateError: "The start date must be on or before the end date, within",
    granularityTitle: "Per-cell data granularity",
    sensor: "Sensor",
    sensors: { todos: "All", modis: "MODIS", viirs: "VIIRS" },
    category: "Category",
    categories: { todas: "All", modis: "MODIS only", viirs: "VIIRS only", coincidentes: "Coincident" },
    categoryInfo: "Coincident = both sensors detected heat in the same cell and day. Coincident does not mean the same event.",
    frp: "Intensity (FRP)",
    frpAll: "All",
    frpClasses: { baixa: "Low", media: "Medium", alta: "High", muito_alta: "Very high" },
    frpNote: "Relative to each sensor (FRP quartiles of MODIS and VIIRS computed separately).",
    colors: "Colors",
    invert: "Invert scale",
    classes: "Number of classes",
    clear: "Clear filters",
    usefulTitle: "Useful for everyone",
    last24h: "Hotspots in the last 24 h",
    howToRead: "How to read the map",
    alerts: "Alerts and emergency",
    synthetic: "Synthetic sample: for demonstration only, does not represent real fires.",
  },
  guide: {
    title: "How to read the map",
    intro: "Five quick tips to avoid wrong conclusions.",
    tips: [
      "Each point or hexagon is a heat detection made by satellite, not a confirmed fire.",
      "Lighter hexagons group more cell-days with detection; the color is relative to the legend classes.",
      "Clouds, smoke and the satellite overpass time hide some hotspots: no point does not prove there is no fire.",
      "MODIS (~1 km pixel) and VIIRS (375 m pixel) see differently; that is why the series is harmonized.",
      "Data from recent months is provisional (near real time) and may change.",
    ],
  },
  status: {
    updated: "Updated at",
    updatedOn: "on",
    sensors: "MODIS + VIIRS",
    offline: "Offline mode: locally cached data",
    apiDown: "API unavailable",
    credit: "We acknowledge the use of data and imagery from NASA's Fire Information for Resource Management System (FIRMS), part of NASA LANCE and ESDIS.",
    creditShort: "Source: NASA FIRMS",
    about: "About and credits",
    creditUrl: "https://earthdata.nasa.gov/firms",
  },
  map: {
    ariaMap: "Map of heat detections. Use the arrow keys to pan and + / − to zoom.",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    dataAttribution: "Data: NASA FIRMS (MODIS/VIIRS) · H3 hexagons",
    panelTitle: "Hotspot map",
    layers: { densidade: "Density", focos: "Hotspots", risco: "Risk" },
    layerLabel: "Map layer",
    riskDisabled: "No evaluated model forecast for this region. The climatology expectation is on the Forecast tab.",
    tools: {
      camadas: "Layers (basemap)",
      desenhar: "Draw area",
      localizacao: "My location",
      reiniciar: "Reset view",
      telaCheia: "Full screen",
      sairTelaCheia: "Exit full screen",
      csv: "Download CSV",
    },
    basemaps: { escuro: "Dark", claro: "Light", satelite: "Satellite" },
    sateliteDisabled: "Satellite (Esri): usage license to be validated; disabled.",
    tileError: "Basemap unavailable; the data is still visible.",
    draw: {
      rect: "Rectangle",
      poly: "Polygon",
      typed: "Type coordinates",
      clear: "Clear",
      hintRect: "Click and drag to draw the rectangle. Esc cancels.",
      hintPoly: "Click to add vertices; click the first one or double-click to close. Esc cancels.",
      typedTitle: "Type the area coordinates",
      typedDesc: "Decimal degrees (WGS84). West < East and South < North.",
      west: "West", south: "South", east: "East", north: "North",
      apply: "Apply",
      invalid: "Invalid coordinates: check west < east, south < north and the limits (−180 to 180, −90 to 90).",
    },
    geo: {
      denied: "Location denied or unavailable. Nothing was sent or stored.",
      unsupported: "This browser does not offer geolocation.",
      you: "You are here (approximate). Your position is not sent or stored.",
    },
    legend: { less: "less", more: "more" },
    densityUnit: { todos: "cell-days with detection (VIIRS scale)", modis: "MODIS detections", viirs: "VIIRS detections" },
    cellSize: "~{km2} km² hexagons",
    aggregated: "aggregated; zoom in to see ~36 km²",
    capBanner: "Showing the {n} most active cells out of {total}.",
    pointsCapBanner: "Showing the {n} highest-FRP detections out of {total} loaded.",
    pointsTruncated: "The API limited the list to {n} detections (the most recent).",
    pointsWindow: "Individual hotspots exist only for the last {days} days of data ({start} to {end}).",
    frpComputed: "FRP classes computed from the loaded detections (quartiles per sensor): MODIS {m} MW · VIIRS {v} MW.",
    categoryNoteDensity: "Coincident on the density map = both sensors detected in the cell during the period (not necessarily on the same day).",
    honesty: "Each color shows satellite heat detections, not burned area or confirmed fire. No color does not guarantee no fire (clouds, smoke and overpass times).",
    pointDisclaimer: "Heat detection, not a confirmed fire",
    riskTooltip: "Estimated probability, not certainty",
    riskMax: "highest probability among those contained",
    riskLegend: "Probability of at least one heat detection in the next 7 days, per hexagon",
    toPrevisao: "Go to the Forecast tab",
    table: { show: "View as table", hide: "View map", caption: "The 20 cells with the most detections in the period", id: "Cell", count: "Value", pct: "Percentile", dominant: "Sensor with most detections", onlyDensity: "The table lists the cells of the Density layer." },
    cellPanel: {
      title: "Cell detail",
      close: "Close detail",
      noSeries: "Per-cell time series not yet available in the API; showing the period totals.",
      csv: "Download CSV for this cell",
      useArea: "Use as area",
      percentile: "Percentile in the period",
      modis: "MODIS detections",
      viirs: "VIIRS detections",
      children: "~36 km² hexagons contained",
    },
    tooltip: {
      cellDays: "cell-days with detection",
      percentile: "percentile {p} among the cells of the period",
      dominant: "sensor with most detections",
      sum: "sum of {n} ~36 km² hexagons",
      category: { modis: "MODIS only", viirs: "VIIRS only", coincidentes: "MODIS and VIIRS" },
      day: "day", night: "night",
      confidence: "confidence",
    },
  },
  cards: {
    focos: "Hotspots in the period",
    focosNote: "heat detections from all satellites, after quality filters (the same fire may be seen by more than one satellite)",
    focosArea: "Cell-days with detection in the area",
    focosAreaNote: "drawn area; each cell counts once per day, without double-counting satellites",
    comparado: "Compared with the historical average",
    comparadoCuts: "Below: percentile < 33 · Normal: 33 to 67 · Above: > 67 (same month in other years)",
    sameDays: "month in progress: days 1 to {d} compared with the same days of {n} previous years",
    fullMonth: "{mes} vs. average of {n} previous years",
    risco: "Risk in the next 7 days",
    riscoNA: "Unavailable",
  },
  ui: {
    range: "{a} to {b}",
    monthYear: "{m} {y}",
    days: "{n} days",
    load: { regioes: "regions", calendario: "calendar", series: "series", metricas: "metrics", tabela: "table", previsao: "forecast", glossario: "glossary", dados: "data" },
    badge: { Abaixo: "Below", Normal: "Normal", Acima: "Above", Indisponível: "Unavailable" },
    granularity: { Diário: "Daily", Mensal: "Monthly" },
    percentile: "percentile {p}",
    provisional: "provisional data",
    sameDaysLong: "{m} {y}, days 1 to {d}, compared with the same days of {n} years ({a}–{b})",
    vsYears: "{m} {y} vs. {n} previous years",
    cumAria: "{t}: {y} vs. median and range from {a} to {b}.",
    cells: "{n} cells",
    riskAgg: "{max}, {n} ~36 km² hexagons",
    ofHexes: "of {n} ~36 km² hexagons",
    riskCells: "Cells: {c} risk",
    yearsWith: "{p}% of years",
    withDetection: "with detection",
    hexSize: "~{k} km² hexagons",
    maxContained: " (highest value among those contained)",
    noData: "no data",
    methodSteps: "Method in 4 steps",
    navMain: "Main",
    png: "Download as PNG",
    pngAria: "Download panel as PNG",
    palettes: { inferno: "Inferno", cividis: "Cividis", contraste: "High contrast", cinza: "Grayscale" },
    cellLabel: "{m} {y}: {v} {unit} ({d} per day)",
    cellPct: ", percentile {p} vs. the same month in other years",
    cellDev: ", {x} vs. previous years",
    cellDays: " ({n} days)",
    learn: {
      titles: { mapa: "How to read the map", calendario: "How to read the calendar", harmonizacao: "How to read the harmonization", previsao: "How to read the forecast" },
      desc: "Texts generated from the data shown, without artificial intelligence.",
      level: "Language level",
      levels: { simples: "simple", estudante: "student", tecnico: "technical" },
      slots: { situacao: "What you see", cautela: "Careful before concluding", contexto: "Context" },
      error: "Could not load the explanation.",
      naoDiz: "What this data does NOT say",
      think: "To think about",
      ods: "UN SDG targets:",
    },
  },
  states: {
    loading: "Loading",
    empty: "No hotspots found for this search",
    error: "Could not load the data.",
    retry: "Try again",
  },
};

export const harmEn = {
  title: "MODIS + VIIRS harmonization",
  intro: [
    "MODIS (since 2003) sees the ground in pixels of about 1 km; VIIRS (since 2012), in 375 m pixels.",
    "VIIRS detects smaller hotspots and more hotspots per fire: adding the two would count the same fire several times and create a false jump in 2012.",
    "So we count cell-days (~36 km² hexagons with at least one detection) and adjust MODIS to the VIIRS scale using the years when both worked together.",
    "The result is a single series from 2003 to today, with more uncertainty before 2012.",
  ],
  steps: [
    { t: "Load", d: "MODIS and VIIRS detections from NASA FIRMS, with quality filters." },
    { t: "Group in space and time", d: "Each detection becomes a cell-day: ~36 km² H3 hexagon × day." },
    { t: "Harmonized base", d: "MODIS adjusted to the VIIRS scale (quantile mapping); VIIRS used directly where it exists." },
    { t: "Indicators", d: "Calendar, anomalies, map and CSV all come from the same base." },
  ],
  chartTitle: "Monthly series for the region",
  chartSub: "cell-days with detection per month",
  before: "Before",
  after: "After",
  toggleLabel: "Compare before and after harmonization",
  series: { modis_raw: "Raw MODIS", viirs_raw: "Raw VIIRS", harmonized: "Harmonized (VIIRS scale)" },
  overlap: "Shaded: period when both sensors operate",
  calibWindow: "Calibration uses {a}–{b}; after that the series uses VIIRS directly.",
  table: "View as table",
  chart: "View chart",
  monthCol: "Month",
  metricsTitle: "Calibration metrics",
  metricsSub: "Leave-one-year-out validation (LOYO): the adjustment is trained without that year and tested on it.",
  methods: { raw_modis: "Raw MODIS (no adjustment)", linear: "Linear adjustment", quantile_mapping: "Quantile mapping (used)" } as Record<string, string>,
  cols: { method: "Method", r2d: "Daily R²", r2m: "Monthly R²", bias: "Daily bias", rmse: "Daily RMSE", days: "Overlap days", year: "Year", r2: "R²" },
  perYear: "Error per left-out year (quantile mapping)",
  outside: "Years outside the calibration window (drift check)",
  noDeseason: "Error on deseasonalized anomalies: not provided by the API.",
  limitsTitle: "Limitations",
  extraLimits: [
    "A heat detection is not a confirmed fire nor burned area.",
    "NASA announced the end of Suomi NPP deliveries to FIRMS at 13:00 UTC on 11/02/2026 (another NASA page cites 11/01). In this dataset, Suomi NPP runs until 07/31/2026 (standard product); from 08/01/2026 near real time uses NOAA-20 and NOAA-21.",
    "August to November 2026 come from near-real-time products: they are under additional validation and may change.",
    "After 2012, harmonized_count uses VIIRS; a cell seen only by MODIS generally gets harmonized_count = 0. The modis_only = 1 column flags these cases in the CSV (last 30 days: 7,006 rows, 23 of them with a value > 0, to be validated).",
  ],
};

export const prevEn = {
  title: "Risk forecast",
  always: "Estimated probability, not certainty.",
  horizon: "Horizon",
  horizonOnly: "Only the 7-day horizon is available in the API.",
  model: "Model {v}, run on {d}",
  legendTitle: "Probability of at least one heat detection in the next {h} days, per hexagon",
  classes: { baixo: "Low", moderado: "Moderate", alto: "High", muito_alto: "Very high" } as Record<string, string>,
  metricsTitle: "Model evaluation",
  metric: { roc_auc: "ROC-AUC", pr_auc: "PR-AUC", brier: "Brier" } as Record<string, string>,
  metricHelp: {
    roc_auc: "1 = separates perfectly; 0.5 = coin flip",
    pr_auc: "higher is better; focuses on days with fire",
    brier: "error of the probabilities; lower is better",
  } as Record<string, string>,
  noMetrics: "to be validated",
  noMetricsNote: "The model metrics have not been published yet: the API returns no evaluation. Without them, we cannot claim the model beats the simple baselines.",
  baselinesTitle: "Comparison with simple baselines",
  baselines: {
    persistencia: "Persistence (repeats what happened in the last days)",
    climatologia: "Climatology (average of the same period in previous years)",
  } as Record<string, string>,
  beats: "The model beats this baseline.",
  notBeats: "The model does NOT beat this baseline.",
  baselineNA: "No published comparison data (to be validated).",
  fallbackTitle: "Climatology expectation (not a forecast)",
  fallbackNote: "No evaluated model: the map shows in what fraction of the years ({a}–{b}) each hexagon had a VIIRS detection in the month. Thresholds {t} (to be validated).",
  table: "View as table",
  tableCaption: "The 20 cells with the highest probability",
  tableCols: { id: "Cell", p: "Probability", cls: "Class" },
};

export const urgEn = {
  title: "Emergency",
  lead: "If there is a fire near you in Brazil, call now. The call is free.",
  notice: "This service is informational and does not replace the official agencies.",
  call: "Call",
  see24h: "See hotspots from the last 24 h",
  see24hNote: "Hotspots appear a few hours late, and clouds or smoke can hide them.",
  safetyTitle: "Meanwhile",
  safety: [
    "Move away from smoke and fire; do not try to put out a large fire alone.",
    "Follow the instructions of the fire department and Civil Defense.",
    "Do not spread rumors: check information on official channels.",
  ],
  noAlerts: "Email alerts and subscriptions are not available.",
  sources: "Numbers checked on {d} with these official sources (in Portuguese):",
};

export const sobreEn = {
  title: "About FIRETRACK",
  lead: "A single series of satellite heat detections (MODIS + VIIRS) for the Brazilian Cerrado, from 2003 to today, with a map, a calendar, open data and texts that teach how to read the data carefully.",
  sourcesTitle: "Data sources",
  sources: [
    { name: "NASA FIRMS: MODIS (Terra and Aqua), standard and near-real-time products", url: "https://earthdata.nasa.gov/firms" },
    { name: "NASA FIRMS: VIIRS 375 m (Suomi NPP, NOAA-20, NOAA-21), standard and near-real-time products", url: "https://earthdata.nasa.gov/firms" },
    { name: "H3 hexagonal grid (Apache 2.0 license)", url: "https://h3geo.org" },
    { name: "Basemap: © OpenStreetMap contributors (ODbL)", url: "https://www.openstreetmap.org/copyright" },
  ],
  ackTitle: "Acknowledgements",
  ack: "We acknowledge the use of data and imagery from NASA's Fire Information for Resource Management System (FIRMS), part of NASA LANCE and ESDIS. Use of the data does not imply NASA endorsement.",
  creditsTitle: "Image credits",
  credits: [
    "No third-party images are used in the interface (record in web/public/images/CREDITS.md).",
    "Icons: Lucide (ISC license).",
    "Typefaces: Space Grotesk and Inter (SIL Open Font License).",
  ],
  limitsTitle: "Limitations",
  glossaryTitle: "Glossary",
  glossaryPitfall: "Watch out:",
  teamTitle: "Team",
  team: "NASA Space Apps 2026 team: names to be defined.",
  licenseTitle: "Licenses",
  license: "Code: MIT. Derived data and educational texts: CC BY 4.0, with mandatory attribution to NASA FIRMS. FIRMS terms of use: to be validated.",
};

export const calEn = {
  cardPeak: "Most critical month",
  cardPeakNote: "{v} cell-days with detection, on average, in the complete months of the period",
  cardAnomaly: "Current month anomaly",
  cardMean: "Historical monthly average",
  cardMeanNote: "cell-days with detection per complete month (VIIRS scale)",
  panelTitle: "Hotspots per month",
  panelSub: "{r}, {a} to {b} · {s}",
  seriesSub: { harmonizado: "MODIS and VIIRS combined (VIIRS scale)", modis: "MODIS only (raw)", viirs: "VIIRS only (raw, reference satellite)" },
  modeLabel: "Calendar mode",
  modes: { contagem: "Count", anomalia: "Anomaly" },
  seriesLabel: "Series",
  series: { harmonizado: "Harmonized", modis: "MODIS", viirs: "VIIRS" },
  anomalyOnlyHarm: "The anomaly exists only for the harmonized series (the API does not compute it for raw MODIS or VIIRS).",
  gridLabel: "Calendar of heat detections by month and year. Use the arrow keys to move and Enter to see details.",
  unit: { harmonizado: "cell-days with detection (harmonized)", modis: "cell-days with MODIS detection", viirs: "cell-days with VIIRS detection" },
  noData: "no data",
  partial: "incomplete month",
  provisional: "provisional data",
  top3: "one of the 3 months with the most detections",
  less: "less",
  more: "more",
  noRef: "no reference",
  legendCount: {
    harmonizado: "Average cell-days with detection per day (harmonized); classes by quantile of the months shown.",
    modis: "Average cell-days with MODIS detection per day; classes by quantile of the months shown.",
    viirs: "Average cell-days with VIIRS detection per day; classes by quantile of the months shown.",
  },
  legendAnomaly: "Deviation vs. average of the same month in previous complete years (minimum 3).",
  legendSameBreaks: "The map classes use another measure (cells in the period), so the numeric limits differ.",
  notes: "White outline = current month · hatched = incomplete month (compared only with the same days) · thin outline = provisional data · ▲ = one of the 3 months with the most detections · dashed border = no data. Each cell-day is a ~36 km² hexagon with at least one heat detection; it is not burned area.",
  table: "View as table",
  grid: "View as calendar",
  png: "Download PNG",
  csv: "Download CSV",
  credit: "Source: NASA FIRMS (MODIS/VIIRS), part of NASA LANCE and ESDIS · FIRETRACK",
  detail: {
    title: "{m} {y}",
    close: "Close details",
    value: "Cell-days (harmonized)",
    perDay: "Per day",
    modis: "MODIS (cell-days)",
    viirs: "VIIRS (cell-days)",
    detections: "Detections",
    obsDays: "Days with data",
    percentile: "Percentile (same month, other years)",
    deviation: "Deviation vs. previous years",
    toMap: "View on map",
    csv: "Download CSV for this month",
  },
  tableCols: ["Month", "Cell-days", "Per day", "MODIS", "VIIRS", "Obs. days", "Percentile", "Deviation"],
  cumTitle: "Current year cumulative vs. history",
  cumSub: "Cell-days with detection accumulated month by month (harmonized)",
  cumSeries: { current: "{y} (cumulative)", median: "Median {a}–{b}", band: "Minimum–maximum {a}–{b}" },
  cumNote: "The band and median use the complete years of the period, except the current year. The last month of the current year may be incomplete.",
};

export const dadosEn = {
  title: "Full data",
  subtitle: "Download the data with the active filters. Source: NASA FIRMS (MODIS + VIIRS).",
  filtersTitle: "Active filters",
  filtersHelp: "Change the filters in the side panel. The files follow what is shown here.",
  labels: { region: "Region", area: "Area", period: "Period", sensor: "Sensor", category: "Category", frp: "Intensity (FRP)" },
  wholeRegion: "whole region",
  customArea: "custom area drawn on the map",
  frpAll: "all",
  frpNotApplied: "does not apply to the CSVs: they sum detections per hexagon, and the FRP of each detection is not part of the sum.",
  granularity: { Diário: "Daily: one row per day and hexagon", Mensal: "Monthly: one row per month and hexagon" },
  dailyFrom: "Daily data exists from {d}. Periods that start earlier use monthly totals.",
  cellsHint: "{n} hexagons with detection in the period",
  monthsHint: "{n} months in the period",
  focosTitle: "Filtered hotspots (per hexagon)",
  focosDesc: "One row per ~36 km² hexagon and per day or month, with MODIS, VIIRS and harmonized counts. Sensor and category are applied.",
  calTitle: "Monthly calendar",
  calDesc: "One row per month for the region or area: cell-days with detection, percentile and deviation vs. previous years. Sensor and category do not change this series (it is always harmonized MODIS + VIIRS).",
  download: "Download CSV",
  downloading: "Generating file…",
  done: "{f} downloaded: {n} rows.",
  failed: "Could not generate the file. Try again.",
  heavy: "A long period with monthly data per hexagon can produce hundreds of thousands of rows. For the regional series, use the monthly calendar.",
  forecastCsv: "Forecast CSV (7-day risk)",
  forecastNA: "Forecast CSV: unavailable until an evaluated model exists.",
  legal: "The first line of each file carries the mandatory attribution to NASA FIRMS. Derived data under CC BY 4.0. Days from 08/01/2026 come from near-real-time products and are provisional.",
  dictTitle: "Column dictionary",
  dictSub: "Main unit: cell-days with heat detection (not burned area)",
  columns: [
    ["date", "Day (daily data) or 1st day of the month (monthly data), YYYY-MM-DD"],
    ["region", "Region key (config/regions.yaml)"],
    ["cell_id", "H3 hexagon, resolution 6 (~36 km²)"],
    ["lat, lon", "Hexagon center (WGS84 degrees), not the fire position"],
    ["harmonized_count", "Cell-days with detection on the VIIRS scale (harmonized series). Before 2012 it is an estimate from MODIS"],
    ["modis_count, viirs_count", "Detections of each sensor in the hexagon, after quality filters (VIIRS sums its satellites)"],
    ["source_mix", "Who detected: MODIS, VIIRS or BOTH, from the raw counts. harmonized_count uses only the reference VIIRS satellite, so it can be 0 on a VIIRS row"],
    ["percentile, anomaly_zscore", "Position of the region's month relative to the same month in other years (repeated on each row of the month)"],
    ["modis_only", "1 = only MODIS detected in this hexagon and period (no VIIRS detection); 0 = otherwise"],
  ] as [string, string][],
  calColumns: [
    ["year, month", "Year and month"],
    ["harmonized_cell_days, daily_mean", "Cell-days with detection (harmonized) in the month and average per day with data"],
    ["modis_cell_days, viirs_cell_days", "Cell-days with detection of each sensor (raw)"],
    ["obs_days, is_partial", "Days with data in the month; 1 = incomplete month"],
    ["percentile, deviation_pct", "Position vs. the same month in other years; % deviation vs. average of previous years"],
  ] as [string, string][],
};

export const EMERGENCY_EN = {
  checkedOn: "11/15/2026",
  contacts: [
    { number: "193", name: "Fire Department (Corpo de Bombeiros)", when: "Fire near people, homes or roads; rescue." },
    { number: "199", name: "Civil Defense (Defesa Civil)", when: "Collective risk, heavy smoke, need for evacuation. Service may vary by municipality." },
  ],
  sources: [
    { label: "Minas Gerais state government: emergency service by the Fire Department (193)", url: "https://www.mg.gov.br/servico/solicitar-atendimento-de-urgencia-e-emergencia-pelo-corpo-de-bombeiros-militar" },
    { label: "Rio de Janeiro State Fire Department: in an emergency, dial 193", url: "https://www.cbmerj.rj.gov.br/?p=30222" },
    { label: "Porto Alegre city hall: fire risk, call 199 (Civil Defense)", url: "https://prefeitura.poa.br/carta-de-servicos/risco-de-incendio-ligue-199" },
  ],
};

export const extraEn = {
  months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  lang: { label: "Language", pt: "Português", en: "English", switchTo: "Mudar para português" },
};

```

### `web/content/index.ts`

```ts
// Language bundles. pt-BR for visitors in Brazil, English for everyone else (see lib/i18n.ts).
import { copy, harm, prev, urg, sobre, cal, dados } from "./copy";
import { EMERGENCY } from "./emergency";
import { extra } from "./extra";
import { EMERGENCY_EN, calEn, copyEn, dadosEn, extraEn, harmEn, prevEn, sobreEn, urgEn } from "./en";
import type { Lang } from "@/lib/i18n";

/** Same shape with every string widened, so the English bundle is checked key by key. */
type Widen<T> = T extends string ? string
  : T extends readonly (infer U)[] ? readonly Widen<U>[]
  : T extends object ? { -readonly [K in keyof T]: Widen<T[K]> } : T;

const pt = { copy, harm, prev, urg, sobre, cal, dados, emergency: EMERGENCY, ...extra };
export type Bundle = Widen<typeof pt>;
const en: Bundle = { copy: copyEn, harm: harmEn, prev: prevEn, urg: urgEn, sobre: sobreEn, cal: calEn, dados: dadosEn, emergency: EMERGENCY_EN, ...extraEn };

export const BUNDLES: Record<Lang, Bundle> = { pt, en };

```

### `web/lib/i18n.ts`

```ts
// Language choice: Brazilian visitors get pt-BR, everyone else English.
// Country comes from the hosting edge (IP geolocation done by Vercel / Cloudflare / CloudFront),
// so no visitor IP is sent to any third party. Without a country header (local dev, other hosts)
// we fall back to the browser language. A manual choice (header toggle) is kept in a cookie and wins.
export type Lang = "pt" | "en";
export const LANG_COOKIE = "firetrack.lang";
export const COUNTRY_HEADERS = ["x-vercel-ip-country", "cf-ipcountry", "cloudfront-viewer-country", "x-country-code"];

export function isLang(v: unknown): v is Lang {
  return v === "pt" || v === "en";
}

export function langFromCountry(country: string | null | undefined): Lang | null {
  const c = (country || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c) || c === "XX") return null; // XX = unknown (Cloudflare)
  return c === "BR" ? "pt" : "en";
}

export function langFromAcceptLanguage(header: string | null | undefined): Lang {
  const first = (header || "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("pt") ? "pt" : "en";
}

export function detectLang(opts: { cookie?: string | null; country?: string | null; acceptLanguage?: string | null }): Lang {
  if (isLang(opts.cookie)) return opts.cookie;
  return langFromCountry(opts.country) ?? langFromAcceptLanguage(opts.acceptLanguage);
}

```
