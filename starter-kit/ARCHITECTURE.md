# Starter Kit: Contratos de Arquitetura (criador-dash v2)

Dashboard genérico plug-and-play para **Marketing** e **Vendas**, rodando em
Cloudflare Pages + Functions. O usuário conecta uma fonte de dados (planilha
Google ou CSV), escolhe um domínio, mapeia colunas e publica. Zero código.

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
 * @property {Object}   meta       { source: 'sheets'|'csv', fetchedAt: ISO string, rowCount: number, name?: string }
 */
```

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

Conectores do MVP:
- `sheets.js`: recebe `?url=<link da planilha Google>&gid=<opcional>`. Converte o link em
  endpoint gviz `https://docs.google.com/spreadsheets/d/{ID}/gviz/tq?tqx=out:csv&gid={GID}`,
  faz `fetch`, passa por `parseCSV`. Extrai o ID do link (`/spreadsheets/d/{ID}/`).
- `csv.js`: recebe upload (POST body text/csv), passa por `parseCSV` com `detectDelimiter`.

Conectores de 2a onda (fora do MVP, deixar como stub documentado): `meta-ads.js`, `crm.js`, `hotmart.js`.

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
 */

export function computeMetric(def, rows, colMap) {}  // -> number
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
 * @property {string} id            'marketing' | 'vendas'
 * @property {string} label
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

export function autoMap(slots, columns) {} // -> { [slotKey]: columnName|null }  casa aliases vs columns
```

Templates do MVP: `marketing.js`, `vendas.js`.
- **Marketing** slots: data, canal, investimento, impressoes, cliques, leads, conversoes, receita.
  Métricas: investimento (sum), impressoes (sum), cliques (sum), CTR (ratio cliques/impressoes),
  CPC (ratio invest/cliques), leads (sum), CPL (ratio invest/leads), conversoes (sum),
  CPA (ratio invest/conversoes), ROAS (derived receita/investimento).
- **Vendas** slots: data, vendedor, produto, valor, status.
  Métricas: faturamento (sum valor), num_vendas (count), ticket_medio (avg valor),
  ranking por vendedor (groupBy), evolução (timeSeries).

`autoMap` normaliza (lowercase, remove acento) tanto os aliases quanto os `columns` e casa por
inclusão. Slot sem match vira `null` (usuário mapeia na mão no wizard).

---

## Contrato 6: Widget (`public/assets/js/widgets/<nome>.js`)

Cada widget é uma função pura de render (sem fetch, sem estado global):

```js
export function render(props, data) {} // -> HTMLElement  (ou string HTML, ver padrão do kit)
```

- `kpi.js`: card com label + valor formatado + (opcional) variação.
- `timeseries.js`: gráfico de linha (SVG puro, sem lib externa). Recebe `[{date,value}]`.
- `funnel.js`: funil vertical com % entre etapas. Recebe `[{label,value}]`.
- `table.js`: tabela paginada simples. Recebe `{columns, rows}`.
- `ranking.js`: barras horizontais ordenadas. Recebe `[{key,value}]`.

Widgets NÃO conhecem template nem conector. Recebem dados já calculados.

---

## Contrato 7: Config (KV) e Dashboard

`functions/api/dashboards.js`: CRUD no KV `DASHBOARDS_KV`. Cada dashboard:

```js
{
  id: 'slug',
  name: 'Meu Dash de Marketing',
  domain: 'marketing',
  source: { type: 'sheets', url: '...', gid: '0' },  // ou { type:'csv', data:'...' }
  colMap: { data:'Data', investimento:'Investimento', ... },
  accent: '#6d28d9',        // cor de destaque (branding)
  createdAt: ISO
}
```

Fluxo do wizard (`config.html` + `config-wizard.js`), 4 passos:
1. Escolher domínio (marketing/vendas)
2. Conectar fonte (colar link Google Sheets / subir CSV), chama conector, mostra preview das colunas
3. Mapear colunas (autoMap pré-preenche, usuário ajusta), valida slots required
4. Nomear + cor de destaque, salva no KV, redireciona pro dashboard

`dashboard.html` + `dashboard.js`: lê `?id=`, busca config no KV, busca dados via conector,
roda `computeAll` + layout do template, renderiza widgets.

---

## Convenções

- **Sem dependências externas** no runtime (nem no browser, nem nas functions). SVG na mão.
- **Testes**: `node:test` (`node --test test/`). Toda lógica pura tem teste ANTES do código (TDD).
- **ESM em tudo** (`import`/`export`). Browser carrega via `<script type="module">`.
- **PT-BR** em toda string de UI e mensagem de erro. Zero travessão. Acentuação correta.
- **Nada sensível**: zero token, Account ID ou KV id real. Tudo placeholder/secret do Cloudflare.
