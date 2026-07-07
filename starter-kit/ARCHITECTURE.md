# Starter Kit: Contratos de Arquitetura (criador-dash v3)

Dashboard genérico para **Marketing**, **Vendas** e **Suporte**, rodando em
Cloudflare Pages + Functions (e D1 no modo histórico). O usuário conecta uma fonte
de dados (planilha Google, CSV, Meta Ads ou um conector sob medida), escolhe um
domínio, mapeia colunas e publica. Dois modos de dados: ao vivo (lê a fonte na
hora, KV só guarda config) ou histórico (um cron grava snapshots no D1 e o
dashboard lê o snapshot mais recente). Zero código para o usuário final.

Este documento é o **contrato**: todo módulo abaixo deve respeitar exatamente
estas interfaces para que as camadas fiquem desacopladas e testáveis isoladamente.

---

## Camadas

```
Fonte de dados -> Conector -> DataSet (schema comum) -> Template -> Widgets -> Render
```

1. **Conector**: busca dados de uma fonte e devolve um `DataSet`. Não sabe de métricas.
2. **DataSet**: formato comum, tabular. Nenhuma camada acima conhece a fonte.
3. **Template de domínio**: define métricas + layout de widgets + mapeamento de colunas.
4. **Widget**: função de render pura. Recebe dados já calculados, devolve HTML/DOM.

---

## Contrato 1: DataSet (schema comum)

Todo conector devolve **exatamente** este formato:

```js
/**
 * @typedef {Object} DataSet
 * @property {string[]} columns   Cabeçalhos, na ordem original. Ex: ["Data","Canal","Investimento"]
 * @property {Object[]} rows      Cada linha é um objeto { [coluna]: valor }. Valores são STRING crua.
 * @property {Object}   meta       { source: string, fetchedAt: ISO string, rowCount: number, name?: string }
 *                                  source e um identificador EXTENSIVEL: hoje 'sheets'|'csv'|'meta'
 *                                  (e 'd1' no modo historico); um conector sob medida usa o seu proprio.
 */
```

O enum de `meta.source` cobre as fontes que o código realmente emite:
- `'sheets'`: conector de planilha Google (`connectors/sheets.js`).
- `'csv'`: upload de CSV (`connectors/csv.js`).
- `'meta'`: conector Meta Ads (`lib/meta.mjs` carimba `meta.source = 'meta'`).

Além da fonte, o modo de armazenamento é ortogonal ao `DataSet`: no modo ao vivo o
conector é lido na hora; no modo histórico a config marca `storage: 'd1'` e um cron
grava snapshots do `DataSet` no D1 (ver Contrato 7). O tipo da fonte (`source.type`)
não muda entre os modos: o que muda é de onde o dashboard lê o `DataSet` pronto.

Regras:
- `rows` preserva o valor **como veio** (string). A normalização de número/data é
  responsabilidade da camada de métricas (`lib/metrics.js` + `lib/format.js`), NÃO do conector.
- Linhas totalmente vazias são descartadas pelo conector.
- Se a fonte falhar, o conector lança `Error` com mensagem amigável (PT-BR).

---

## Contrato 2: Conector

Cada conector vive em `functions/api/connectors/<nome>.js` e expõe:

- Um handler Cloudflare: `export async function onRequest(context)` que responde `DataSet` em JSON.
- A lógica pura de parse fica em `functions/lib/csv.mjs` (compartilhada, testável sem rede).

Assinatura da lógica pura (o que os testes cobrem):

```js
// functions/lib/csv.mjs
export function parseCSV(text /* string */, opts = {}) {} // -> { columns, rows }
export function detectDelimiter(text) {}                    // -> ',' | ';' | '\t'
```

Conectores implementados:
- `sheets.js`: recebe `?url=<link da planilha Google>&gid=<opcional>`. Converte o link em
  endpoint gviz `https://docs.google.com/spreadsheets/d/{ID}/gviz/tq?tqx=out:csv&gid={GID}`,
  faz `fetch`, passa por `parseCSV`. A conversão do link (`sheetUrlToCsv`) vive em
  `functions/lib/sheets-url.mjs` (compartilhada com o Worker de snapshot, sem drift).
- `csv.js`: recebe upload (POST body text/csv), passa por `parseCSV` com `detectDelimiter`.
- `meta-ads.js`: conector REAL do Meta Ads (Facebook/Instagram) via Graph API. Dois modos:
  `POST` (preview no wizard, recebe `{ token, account, since, until }` no corpo) e
  `GET ?id=<dashboardId>` (lê a config no KV, usa o token guardado em `source.meta` e
  busca os insights). O token fica **só no servidor**: nunca vai pro browser. A lógica
  pura (montar a URL de insights, mapear a resposta para o `DataSet`) vive em
  `functions/lib/meta.mjs` (`buildInsightsUrl`, `mapInsightsToDataSet`).
- `d1.js`: conector do MODO HISTORICO. Nao bate na fonte viva: le o snapshot mais recente
  gravado pelo cron no D1 (via `functions/lib/snapshots.mjs`). So faz sentido com `storage:'d1'`.

Conectores de 2a onda (fora do MVP, deixar como stub documentado): `crm.js`, `hotmart.js`.

Os conectores por id (`d1.js`, `meta-ads.js` GET) checam a senha do dashboard antes de devolver
dados, importando `needsAuth`/`authOk` de `functions/lib/auth-config.mjs` (modulo neutro, nao de `dashboards.js`).

PONTOS DE PLUGAGEM (um conector de fonte VIVA nao e so o arquivo do handler). Pra ser usado ponta a
ponta, um novo `source.type` precisa ser ligado em:
1. `functions/api/connectors/<nome>.js` (o handler que devolve o DataSet).
2. `public/assets/js/lib/api-client.js`: um branch em `fetchDataForSource(source, id)`.
3. `public/assets/js/config-wizard.js`: um card no passo Fonte (e, se aplicavel, em `podeHistorico`).
4. `workers/snapshot/src/index.js`: um branch em `fetchDataSet` (se a fonte deve entrar no modo historico).
5. `public/assets/js/dashboard.js`: ja roteia por `storage` (ao vivo x d1); rotulo amigavel em `sourceLabel`.
Sheets/CSV/Meta ja estao ligados nos 5. Um handler solto, sem esses pontos, nunca e chamado.

---

## Contrato 3: Camada de métricas (pura, browser + node)

`public/assets/js/lib/metrics.js` (ESM, importável no browser e no node:test).

```js
// Uma métrica é calculada a partir das linhas do DataSet + o mapa de colunas.
/**
 * @typedef {Object} MetricDef
 * @property {string} key         id único. Ex: 'investimento'
 * @property {string} label       rótulo exibido. Ex: 'Investimento'
 * @property {'sum'|'avg'|'count'|'countDistinct'|'ratio'|'derived'} agg
 * @property {string} [column]    coluna-fonte (slot semântico) para sum/avg/count/countDistinct
 * @property {string} [format]    'currency'|'number'|'percent'|'integer'
 * @property {function} [compute] (ctx) => number   para agg 'derived' (ex: ROAS = receita/investimento)
 * @property {[string,string]} [ratioOf]  para agg 'ratio': [numeradorKey, denominadorKey]
 * @property {'higher'|'lower'} [betterWhen]  direcao boa (pinta a tendencia verde/vermelho no KPI)
 */

// computeMetric recebe tambem `computed` (metricas ja calculadas): ratio/derived
// dependem dele, por isso computeAll processa as defs EM ORDEM (base antes das derivadas).
export function computeMetric(def, rows, colMap, computed = {}) {}  // -> number
export function computeAll(defs, rows, colMap) {}     // -> { [key]: number }
export function groupBy(rows, colMap, dimensionSlot, valueSlot, agg) {} // -> [{ key, value }]
export function timeSeries(rows, colMap, dateSlot, valueSlot, agg) {}   // -> [{ date: ISO, value }]
```

- `colMap` mapeia **slot semântico -> nome de coluna real** na planilha do usuário.
  Ex: `{ data: 'Data', valor: 'Investimento', canal: 'Origem' }`.
- Números BR: `1.234,56` vira `1234.56`. Datas BR: `31/12/2026` vira `2026-12-31`. Ver `lib/format.js`.

---

## Contrato 4: Formatação BR (`public/assets/js/lib/format.js`)

```js
export function parseNumberBR(v) {}   // "1.234,56" | "1234.56" | "R$ 1.234" -> 1234.56 (NaN se inválido)
export function parseDateBR(v) {}     // "31/12/2026" | "2026-12-31" | Date-ish -> "2026-12-31" (null se inválido)
export function fmtCurrency(n) {}     // 1234.5 -> "R$ 1.234,50"
export function fmtNumber(n) {}       // 1234.5 -> "1.234,5"
export function fmtPercent(n) {}      // 0.1234 -> "12,34%"
export function fmtInteger(n) {}      // 1234 -> "1.234"
```

---

## Contrato 5: Template de domínio (`public/assets/js/templates/<dominio>.js`)

```js
/**
 * @typedef {Object} Template
 * @property {string} id            'marketing' | 'vendas' | 'suporte'
 * @property {string} label
 * @property {string} [primaryMetric]  metrica-chave do dominio (usada pela meta opcional no wizard)
 * @property {SlotDef[]} slots      slots semânticos que o usuário mapeia para colunas
 * @property {MetricDef[]} metrics  métricas do domínio (usam os slots)
 * @property {LayoutItem[]} layout  ordem/tipo de widgets a renderizar
 */
/**
 * @typedef {Object} SlotDef
 * @property {string} key       'data' | 'valor' | 'canal' ...
 * @property {string} label     'Data', 'Investimento' ...
 * @property {boolean} required
 * @property {string[]} aliases nomes de cabeçalho comuns p/ auto-detecção (lowercase, sem acento)
 */
/**
 * @typedef {Object} LayoutItem
 * @property {'kpi'|'timeseries'|'funnel'|'table'|'ranking'} widget
 * @property {Object} props   ex: { metricKey:'investimento' } ou { dateSlot:'data', valueSlot:'valor' }
 */

// autoMap vive em `public/assets/js/lib/automap.js` (nao no template): e generico.
export function autoMap(slots, columns) {} // -> { [slotKey]: columnName|null }  casa aliases vs columns
```

Templates prontos: `marketing.js`, `vendas.js`, `suporte.js` (3 domínios).
- **Marketing** slots: data, canal, investimento, impressoes, cliques, leads, conversoes, receita.
  Métricas: investimento (sum), impressoes (sum), cliques (sum), CTR (ratio cliques/impressoes),
  CPC (ratio invest/cliques), leads (sum), CPL (ratio invest/leads), conversoes (sum),
  CPA (ratio invest/conversoes), ROAS (derived receita/investimento).
- **Vendas** slots: data, vendedor, produto, valor, status.
  Métricas: num_vendas (count), vendas_ganhas (derived: conta linhas com status "ganho"),
  faturamento (derived: soma do valor SO das ganhas), ticket_medio (derived: faturamento/ganhas),
  taxa_conversao (derived: ganhas/num_vendas). Layout tambem tem funil, timeSeries e rankings.
  Nota: um `derived.compute` PODE ser imperativo e usar `lib/format.js` (o vendas.js filtra as
  linhas ganhas e soma via `parseNumberBR`); marketing e suporte sao 100% declarativos. O contrato
  permite as duas formas: `sum/avg/count/ratio` declarativos, ou `derived` com `compute` proprio.
- **Suporte** slots: data, canal, atendimentos, resolvidos, tempo_resposta, csat.
  Métricas: atendimentos (sum), resolvidos (sum), tempo_resposta (avg), csat (avg),
  taxa_resolucao (ratio resolvidos/atendimentos).

`autoMap` normaliza (lowercase, remove acento) tanto os aliases quanto os `columns` e casa por
inclusão. Slot sem match vira `null` (usuário mapeia na mão no wizard).

---

## Contrato 6: Widget (`public/assets/js/widgets/<nome>.js`)

Cada widget é uma função pura de render (sem fetch, sem estado global):

```js
export function render(props, data) {} // -> string HTML (o kit padroniza string; o dashboard injeta via innerHTML)
```

- `kpi.js`: card com label + valor formatado + (opcional) variação.
- `timeseries.js`: gráfico de linha (SVG puro, sem lib externa). Recebe `[{date,value}]`.
- `funnel.js`: funil vertical com % entre etapas. Recebe `[{label,value}]`.
- `table.js`: tabela paginada simples. Recebe `{columns, rows}`.
- `ranking.js`: barras horizontais ordenadas. Recebe `[{key,value}]`.

Widgets NÃO conhecem template nem conector: `render(props, data)` recebe dados já prontos e devolve HTML.

O registry `widgets/index.js` e a FRONTEIRA que prepara os dados: cada entrada tem `toHtml(item, ctx)`
que faz a agregacao especifica do widget (ex: chamar `groupBy`/`timeSeries` de `lib/metrics.js`,
montar os steps do funil) e so entao chama o `render` puro. Ou seja, quem toca metricas e o registry,
nao o widget. Adicionar um widget = criar `widgets/<nome>.js` (render puro) + uma entrada no registry.

---

## Contrato 7: Config (KV) e Dashboard

`functions/api/dashboards.js`: CRUD no KV `DASHBOARDS_KV`. Cada dashboard:

```js
{
  id: 'slug',
  name: 'Meu Dash de Marketing',
  domain: 'marketing',                                // 'marketing' | 'vendas' | 'suporte'
  source: { type: 'sheets', url: '...', gid: '0' },   // ou { type:'csv', data:'...' }
                                                      // ou { type:'meta', meta:{ token, account, since, until } }
  colMap: { data:'Data', investimento:'Investimento', ... },
  accent: '#6d28d9',        // cor de destaque (branding)
  goal: { metricKey:'investimento', value: 10000 },   // opcional: meta vs realizado na métrica principal
  auth: { hash: '<sha256 da senha>' },                // opcional: senha do dashboard (só o hash SHA-256)
  storage: 'd1',                                      // opcional: modo histórico (cron grava snapshots no D1)
  createdAt: ISO
}
```

Campos opcionais da config (o código só os grava quando o usuário os preenche):
- `source.meta`: presente quando `source.type === 'meta'`. Guarda `{ token, account, since, until }`.
  O `token` fica **só no servidor** (KV): nunca é devolvido ao browser (ver `meta-ads.js` e Contrato 2).
- `goal`: `{ metricKey, value }`. Habilita a comparação meta vs realizado na métrica principal do domínio.
- `auth`: `{ hash }` com o SHA-256 da senha (nunca a senha em texto puro). Ao ler/escrever a config
  protegida, o cliente manda a senha no header `x-dash-auth`; o `hash` nunca é exposto na resposta.
- `storage: 'd1'`: liga o modo histórico. Nesse modo o Worker de snapshot (cron) grava o `DataSet`
  no D1 e o dashboard lê o snapshot mais recente. Ausente (ou diferente de `'d1'`) = modo ao vivo.

Trava global de mutação (opcional): a env `ADMIN_TOKEN` no projeto Pages. Quando definida, `POST` e
`DELETE` de `/api/dashboards` exigem o header `x-admin-token` igual a ela (comparação em tempo constante);
sem/errado devolve 401 `{ needsAdmin: true }`. O cliente guarda o token em `localStorage` (`cd-admin-token`)
e o injeta em `saveDashboard`/`deleteDashboard`. Sem `ADMIN_TOKEN` definida, a API fica aberta (self-serve).

Fluxo do wizard (`config.html` + `config-wizard.js`), 4 passos:
1. Escolher domínio (marketing/vendas/suporte)
2. Conectar fonte (colar link Google Sheets / subir CSV / conectar Meta Ads), chama conector, mostra preview das colunas
3. Mapear colunas (autoMap pré-preenche, usuário ajusta), valida slots required
4. Nomear + cor de destaque + (opcional) meta, senha e modo histórico; salva no KV, redireciona pro dashboard

`dashboard.html` + `dashboard.js`: lê `?id=`, busca config no KV, busca dados via conector,
roda `computeAll` + layout do template, renderiza widgets.

---

## Convenções

- **Sem dependências externas** no runtime (nem no browser, nem nas functions). SVG na mão.
- **Testes**: `node:test` (`node --test test/`). Toda lógica pura tem teste ANTES do código (TDD).
- **ESM em tudo** (`import`/`export`). Browser carrega via `<script type="module">`.
- **PT-BR** em toda string de UI e mensagem de erro. Zero travessão. Acentuação correta.
- **Nada sensível**: zero token, Account ID ou KV id real. Tudo placeholder/secret do Cloudflare.
