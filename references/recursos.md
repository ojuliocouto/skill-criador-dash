# Recursos do dashboard: layout, filtros, grupos, tema, estética e preview de link

## Recursos dos KPIs

- Tendência (comparativo de período): métrica com `betterWhen` (`higher`/`lower`) ganha um badge
  colorido comparando a 2a metade do período com a 1a (metades de mesmo tamanho). Verde melhora, vermelho piora.
- Meta vs realizado (opcional): meta na métrica principal do domínio (`primaryMetric`); o card mostra
  barra de progresso e percentual da meta.

## Layout em grid 2D (desktop)

Os widgets não-kpi entram num grid de 12 colunas. Cada item do `layout` do template pode declarar `col`
(spans permitidos 3..8; ausente ou 12 = largura toda). Assim série e funil ficam lado a lado, rankings
pareiam, e a tabela ocupa a linha inteira, em vez de tudo empilhado verticalmente. No mobile (≤900px)
tudo colapsa pra 1 coluna. A lógica pura é `cellSpanClass(col)` em `dashboard.js` (testada); o CSS são
as classes `.dash-grid`/`.dash-cell.span-N` em `main.css`.

## Filtros (client-side, sempre ligados quando há o que filtrar)

Uma barra acima dos widgets com período (de/até, pela coluna de data do domínio) e um seletor por
dimensão mapeada (canal, vendedor, produto, status: qualquer slot que não seja o eixo de tempo nem
coluna numérica de métrica), com 2..200 valores distintos. Ao mudar, recalcula TUDO (KPIs, tendência,
funil, série, ranking, tabela e a contagem de linhas) só no navegador, sem recarregar nem tocar a
fonte; "Limpar filtros" volta ao período/valores cheios. Lógica pura em `lib/filters.js`
(`dimensionSlots`/`distinctValues`/`dateBounds`/`applyFilters`, testada em `test/filters.test.js`); a
barra sobrevive aos repaints (fica fora do `#dashbody`, que é a única parte repintada). No modo
histórico (D1) o filtro age sobre o snapshot lido, igual ao ao vivo.

## Dashboard-grupo (vários dashboards num único link, com ABAS)

Quando a mesma operação tem mais de uma área (Marketing + Vendas + Suporte do mesmo negócio), em vez de
mandar 3 links, crie um GRUPO. É uma config-pai no mesmo KV com `kind:'group'` e `tabs:[{id,label}]`
apontando pros ids dos dashboards já criados. A página `dashboard.html?id=<grupo>` mostra o nome do
grupo + uma barra de abas; cada aba carrega o dashboard-filho sob demanda (sem recarregar), com os
filtros próprios daquele domínio, e a aba ativa fica na URL (`?tab=`, compartilhável). O grupo NÃO tem
fonte própria: o POST valida `name` + `tabs` no lugar de domain/source/colMap (`isDomain` só vale pra
dashboard comum). Duas formas de criar:
- Pelo WIZARD (self-service): a landing tem o botão "Novo grupo" (`group.html` + `group-wizard.js`). A
  pessoa marca os dashboards que entram (grupos e protegidos ficam de fora), edita o rótulo de cada aba,
  dá nome e cor, e publica; cai no mesmo gate de admin token do config-wizard (401 needsAdmin -> cola o
  token uma vez). As abas saem na ordem de criação dos dashboards.
- Por API (o agente, igual ao seed de um dashboard):
```
curl -X POST "$BASE/api/dashboards" -H "content-type: application/json" -H "x-admin-token: $ADMIN" \
  -d '{"name":"Minha Empresa","kind":"group","accent":"#RRGGBB",
       "tabs":[{"id":"dash-marketing","label":"Marketing"},{"id":"dash-vendas","label":"Vendas"}]}'
```
O id do grupo sai do slug do name. A landing (`index-page.js`) lista o grupo com o badge "Grupo" e o
link único. Código: `initGroup`/`loadDashboardInto`/`resolveActiveTab` (puro, testado) em `dashboard.js`;
`group-wizard.js` (`eligibleForGroup`/`buildGroupConfig`/`validateGroup` puros, testados); validação em
`functions/api/dashboards.js`; testes em `test/handlers.test.js`, `test/render.test.js`,
`test/group-wizard.test.js`. Aba que aponta pra um dashboard protegido por senha não embute (mostra
"abrir direto"); as demais abrem.

## Tema claro/escuro

Botão na topbar (`lib/theme.js`), injetado em todas as páginas; persiste no localStorage e respeita a
preferência do sistema no primeiro acesso. A cor de destaque da marca funciona nos dois temas (o
`--accent-soft` deriva dela via color-mix, então não fica um roxo genérico fixo).

## Estética (anti-"cara de IA", nível ferramenta premium tipo Linear/Vercel, NÃO landing enfeitada)

- Tipografia PRÓPRIA self-hosted (não a fonte default do sistema, que lê como template): Geist Sans no
  texto + Geist Mono tabular em TODO número (KPI, funil, ranking, eixo do gráfico, cabeçalho de tabela).
  Arquivos em `public/assets/fonts/` (woff2 variável, SIL OFL), `@font-face` same-origin (casa com a CSP
  `default-src 'self'` + `font-src 'self'`), `font-display: swap`. Trocar a fonte = trocar o `@font-face`
  + o token `--font`/`--font-mono` no `main.css`.
- KPIs num PAINEL único dividido por hairline (gap de 1px sobre fundo da cor da borda), não N cards com
  barrinha colorida (isso era tell de IA). Títulos de painel em FRASE (sentence-case), uppercase-tracked
  reservado só pros micro-rótulos de dado (label de KPI, cabeçalho de coluna). Superfície chapada, borda
  de 1px, sombra mínima tingida, sem gradiente/glow.
- Gráfico com eixo Y em números REDONDOS (`niceScale` em `timeseries.js`), não min/meio/max cru (que
  gerava rótulo com casas decimais, cara de número de máquina). Valor do funil sai PRA FORA da barra
  quando ela é curta (cor de texto), pra não sumir sobre a trilha clara.
- Guards no `test/design.test.js` travam: sem radial-gradient, fonte Geist wired + woff2 válidos, números
  em `--font-mono`. Antes de mexer no visual, faça uma revisão crítica adversarial (pergunte-se: "isso
  parece template de IA ou ferramenta profissional?") e confira o resultado nos DOIS temas (claro e
  escuro) antes de entregar.

## Preview de link (OpenGraph) por dashboard

Quando alguém compartilha o link (WhatsApp/Slack/etc.), o card mostra o NOME do dashboard, uma
descrição por domínio e uma imagem branded na cor da marca. Como o crawler não roda JS, o
`_middleware.js` injeta no SERVIDOR (via HTMLRewriter, streaming) no `<head>` de `/dashboard(.html)?id=`:
`<title>`, `description`, `og:*`/`twitter:*`, `theme-color` (accent) e a favicon tingida com a cor,
lendo a config do KV pelo id. A imagem OG (1200x630) é um SVG branded servido pela rota `/og?id=`
(`functions/og.js`). Lógica pura em `functions/lib/og.mjs` (`buildMeta`/`metaTagsHtml`/`ogImageSvg`/
`faviconDataUri`, testada em `test/og.test.js`); o `dashboard.js` também seta o `document.title` da aba.
Dashboard protegido por senha NÃO vaza nome/domínio (cai no texto/imagem genérico, `noindex`). CAVEAT:
og:image é SVG (dependency-free, casa com o resto da skill) e renderiza na maioria das plataformas;
WhatsApp/Facebook às vezes não mostram imagem SVG (o título e a descrição aparecem sempre). Se precisar
da IMAGEM no WhatsApp, aí sim precisaria de um gerador raster (PNG via workers-og/WASM), que quebra o
"dependency-free" e seria opt-in. Nota: o Cloudflare Pages redireciona `/dashboard.html` para
`/dashboard` (308, clean URLs); crawlers seguem o redirect e recebem as tags normalmente.

## Árvore de arquivos (`starter-kit/`, sem node_modules)

```
ARCHITECTURE.md                 contratos das 3 camadas (fonte da verdade)
package.json  wrangler.toml
db/schema.sql                   tabela de snapshots do modo historico (D1)
examples/                       marketing-exemplo.csv, vendas-exemplo.csv, suporte-exemplo.csv
functions/
  _middleware.js                CORS + cache KV + security headers (CSP) + injeta OpenGraph no HTML do dashboard
  og.js                         rota /og?id= : imagem de preview (SVG branded na cor da marca)
  api/
    dashboards.js               CRUD das configs no KV + gate de senha + strip de segredos
    connectors/
      sheets.js                 conector carro-chefe (gviz CSV)
      csv.js                     conector de upload
      meta-ads.js                conector Meta Ads (Graph API, token no servidor)
      d1.js                      conector do modo historico (le snapshot do D1)
      crm.js  hotmart.js         stubs (ponto de partida)
  lib/
    csv.mjs                     parseCSV + detectDelimiter (puro, testavel)
    sheets-url.mjs              sheetUrlToCsv (compartilhado por sheets.js e pelo worker)
    meta.mjs                    buildInsightsUrl + mapInsightsToDataSet (puro)
    snapshots.mjs               SQL do modo historico + rowToDataSet (puro)
    auth-config.mjs             needsAuth/authOk (PBKDF2 salgado)/safeEqual/checkAdminToken (neutro)
    rate-limit.mjs              rate limiter em KV (gate de senha + preview Meta)
    domains.mjs                 lista DOMAINS do servidor (valida o POST); paridade com a do browser
    source-shape.mjs            validarFonte: valida a forma de source por tipo no POST (puro)
    og.mjs                      metadados de preview de link (buildMeta/metaTagsHtml/ogImageSvg, puro)
workers/
  snapshot/ src/index.js        Worker com cron que grava snapshots no D1 (SNAPSHOT_FETCHERS)
public/
  index.html  config.html (wizard)  group.html (wizard de grupo)  dashboard.html
  assets/css/main.css
  assets/js/
    config-wizard.js  group-wizard.js  dashboard.js  index-page.js  domains.mjs (lista DOMAINS do browser: fonte da verdade dos dominios)
    sources/ index.js (registry de fontes: type, label, canHistory)
    lib/ api-client.js  automap.js  format.js  metrics.js  filters.js (filtro puro)  auth.js  theme.js  color.js  html.js
    templates/ index.js  marketing.js  vendas.js  suporte.js
    widgets/ index.js (registry)  _util.js  kpi.js  timeseries.js  funnel.js  table.js  ranking.js
test/                           500+ testes (npm test  ->  node --test test/*.test.js)
```
