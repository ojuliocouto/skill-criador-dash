// Conector Meta Ads 3.9: Receita (action_values) e Cliques no link (inline_link_clicks).
//
// Achado da auditoria de 25/10/2026: no painel do Meta, Receita e ROAS ficavam "Não mapeada". O conector
// não pedia `action_values`, então não tinha de onde tirar o valor das compras. E o CTR e o CPC usavam
// `clicks` (todos os cliques), não o clique no link que o gestor vê no Gerenciador.
//
// Documentação oficial (Ad Account Insights, lida em 25/10/2026):
//   https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights/
//   action_values       list<AdsActionStats>  "The total value of all conversions attributed to your ads."
//   inline_link_clicks  numeric string        "The number of clicks on links to select destinations or
//                                              experiences, on or off Facebook-owned properties."
//   clicks              numeric string        "The number of clicks on your ads."
// AdsActionStats (action_type, value): https://developers.facebook.com/docs/marketing-api/reference/ads-action-stats/
//
// Regra da Receita = a mesma das Conversões: `omni_purchase` é o agregado que já inclui as compras do pixel.
// Com ele, vale só ele; sem ele, soma `purchase` + `offsite_conversion.fb_pixel_purchase`. Nunca os dois.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildInsightsUrl, mapInsightsToDataSet, buscarTodasAsPaginas } from '../functions/lib/meta.mjs';
import { template as marketing } from '../public/assets/js/templates/marketing.js';
import { autoMap } from '../public/assets/js/lib/automap.js';
import { computeAllMapped } from '../public/assets/js/lib/metrics.js';
import { renderKpiBlock } from '../public/assets/js/dashboard.js';
import { completarColMapDaMeta } from '../public/assets/js/lib/colmap-meta.js';
import worker from '../workers/snapshot/src/index.js';
import { onRequest as metaAds } from '../functions/api/connectors/meta-ads.js';

const linha = (extra) => ({
  campaign_name: 'Camp', spend: '100.00', impressions: '1000', clicks: '50', inline_link_clicks: '20', date_start: '2026-10-01', ...extra,
});
const um = (extra) => mapInsightsToDataSet({ data: [linha(extra)] }).rows[0];

test('URL pede action_values e inline_link_clicks', () => {
  const fields = new URL(buildInsightsUrl({ token: 'TK', accountId: '1' })).searchParams.get('fields').split(',');
  assert.ok(fields.includes('action_values'), 'fields tem action_values');
  assert.ok(fields.includes('inline_link_clicks'), 'fields tem inline_link_clicks');
  for (const f of ['campaign_name', 'spend', 'impressions', 'clicks', 'actions', 'results', 'cost_per_result', 'date_start']) {
    assert.ok(fields.includes(f), `fields continua com ${f}`);
  }
});

test('Receita: com omni_purchase vale só ele (não soma com purchase nem com o pixel)', () => {
  const r = um({
    actions: [{ action_type: 'omni_purchase', value: '3' }, { action_type: 'purchase', value: '3' }],
    action_values: [
      { action_type: 'omni_purchase', value: '1491.00' },
      { action_type: 'purchase', value: '1491.00' },
      { action_type: 'offsite_conversion.fb_pixel_purchase', value: '1491.00' },
    ],
  });
  assert.equal(r.Receita, '1491.00');
  assert.equal(r['Conversões'], '3');
});

test('Receita: sem omni_purchase soma purchase e o pixel (mesma regra das Conversões)', () => {
  const r = um({
    action_values: [
      { action_type: 'purchase', value: '497' },
      { action_type: 'offsite_conversion.fb_pixel_purchase', value: '100.5' },
      { action_type: 'lead', value: '999' },
    ],
  });
  assert.equal(r.Receita, '597.50', 'valor de lead não entra na receita');
});

test('Cliques = cliques no link (inline_link_clicks); todos os cliques vão para "Cliques (todos)"', () => {
  const r = um({});
  assert.equal(r.Cliques, '20');
  assert.equal(r['Cliques (todos)'], '50');
  const semLink = um({ inline_link_clicks: undefined });
  assert.equal(semLink.Cliques, '0', 'campo pedido e ausente na resposta é zero clique no link, não o total');
});

test('colunas: as 11 de antes na mesma ordem, "Cliques (todos)" depois, e Receita só quando a conta tem compra', () => {
  const semCompra = mapInsightsToDataSet({ data: [linha({ actions: [{ action_type: 'lead', value: '4' }] })] });
  assert.deepEqual(semCompra.columns, [
    'Data', 'Campanha', 'Investimento', 'Impressões', 'Cliques', 'Leads', 'Conversões',
    'Resultados', 'Tipo de resultado', 'Custo por resultado', 'CPL', 'Cliques (todos)',
  ]);
  assert.ok(!('Receita' in semCompra.rows[0]), 'sem valor de compra não há coluna Receita (nada de R$ 0,00 falso)');
  const comCompra = mapInsightsToDataSet({ data: [linha({ action_values: [{ action_type: 'omni_purchase', value: '10' }] }), linha({})] });
  assert.deepEqual(comCompra.columns.slice(-2), ['Cliques (todos)', 'Receita']);
  assert.equal(comCompra.rows[1].Receita, '', 'linha sem compra fica vazia quando outra linha tem compra');
});

test('Receita soma certo com várias páginas da Graph API', async () => {
  const paginas = {
    1: { data: [linha({ action_values: [{ action_type: 'omni_purchase', value: '497' }] })], paging: { next: 'https://graph.facebook.com/v25.0/act_1/insights?after=CURSOR2' } },
    2: { data: [linha({ date_start: '2026-10-02', action_values: [{ action_type: 'omni_purchase', value: '994' }] })] },
  };
  const fetchFn = async (url) => {
    const n = /CURSOR2/.test(String(url)) ? 2 : 1;
    return new Response(JSON.stringify(paginas[n]), { status: 200 });
  };
  const body = await buscarTodasAsPaginas(buildInsightsUrl({ token: 'TK', accountId: '1' }), fetchFn);
  const ds = mapInsightsToDataSet(body);
  const total = ds.rows.reduce((s, r) => s + Number(r.Receita || 0), 0);
  assert.equal(total, 1491);
});

const kpisDaVisaoGeral = () => marketing.tabs.find((t) => t.id === 'visao-geral').layout.filter((i) => i.widget === 'kpi');

test('painel Meta com compra: Receita e ROAS calculados, sem "Não mapeada"', () => {
  const ds = mapInsightsToDataSet({ data: [
    linha({ spend: '200', action_values: [{ action_type: 'omni_purchase', value: '994' }], actions: [{ action_type: 'omni_purchase', value: '2' }] }),
  ] });
  const colMap = autoMap(marketing.slots, ds.columns);
  assert.equal(colMap.receita, 'Receita', 'o assistente liga a Receita sozinho');
  assert.equal(colMap.cliques, 'Cliques', 'CTR e CPC usam o clique no link');
  const { computed, mapped } = computeAllMapped(marketing.metrics, ds.rows, colMap);
  assert.equal(computed.receita, 994);
  assert.ok(Math.abs(computed.ROAS - 4.97) < 1e-9, `ROAS 994 / 200 = 4,97 (veio ${computed.ROAS})`);
  const html = renderKpiBlock(kpisDaVisaoGeral(), marketing, computed, mapped);
  assert.ok(!/Não mapeada/.test(html), 'nenhum indicador da Visão geral fica "Não mapeada"');
});

test('dash do Meta criado antes da 3.9: ganha a Receita quando a coluna chega, e não ganha sem compra', () => {
  const antigo = { data: 'Data', canal: 'Campanha', investimento: 'Investimento', cliques: 'Cliques', conversoes: 'Conversões' };
  const comCompra = mapInsightsToDataSet({ data: [linha({ action_values: [{ action_type: 'omni_purchase', value: '10' }] })] });
  assert.equal(completarColMapDaMeta(antigo, { source: { type: 'meta' }, dataset: comCompra }).receita, 'Receita');
  const semCompra = mapInsightsToDataSet({ data: [linha({})] });
  assert.equal(completarColMapDaMeta(antigo, { source: { type: 'meta' }, dataset: semCompra }).receita, undefined);
  assert.equal(completarColMapDaMeta({ ...antigo, receita: 'Conversões' }, { source: { type: 'meta' }, dataset: comCompra }).receita, 'Conversões', 'escolha da pessoa fica');
  assert.equal(completarColMapDaMeta(antigo, { source: { type: 'csv' }, dataset: { ...comCompra, meta: { source: 'csv' } } }).receita, undefined, 'CSV não ganha nada');
  assert.equal(completarColMapDaMeta(antigo, { source: { type: 'meta' } }).receita, undefined, 'sem DataSet (esqueleto) a Receita não é prometida');
});

// ---- handler (GET ?id) e Worker de snapshot: os dois chegam na Receita ----
const GRAPH = { data: [linha({ action_values: [{ action_type: 'omni_purchase', value: '497' }] })] };
async function comFetch(fn) {
  const original = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => { urls.push(String(url)); return new Response(JSON.stringify(GRAPH), { status: 200 }); };
  try { return await fn(urls); } finally { globalThis.fetch = original; }
}
const CFG = { id: 'dash-meta', name: 'Meta', domain: 'marketing', colMap: { data: 'Data', investimento: 'Investimento' }, source: { type: 'meta', meta: { token: 'tok', account: '123' } } };
const kv = (obj) => ({
  async get(k) { return obj[k] == null ? null : JSON.stringify(obj[k]); },
  async list() { return { keys: Object.keys(obj).map((name) => ({ name })) }; },
  async put() {}, async delete() {},
});

test('handler GET ?id: o DataSet do painel traz a Receita e pede action_values', async () => {
  await comFetch(async (urls) => {
    const res = await metaAds({ request: new Request('https://x.test/api/connectors/meta-ads?id=dash-meta'), env: { DASHBOARDS_KV: kv({ 'dash:dash-meta': CFG }) } });
    assert.equal(res.status, 200);
    const ds = await res.json();
    assert.ok(ds.columns.includes('Receita'));
    assert.equal(ds.rows[0].Receita, '497.00');
    assert.match(urls[0], /action_values/);
  });
});

test('Worker de snapshot: a foto do Meta guarda a Receita', async () => {
  await comFetch(async () => {
    const gravados = [];
    const db = {
      prepare(sql) {
        return {
          bind(...p) { this.p = p; return this; },
          async run() { gravados.push({ sql, p: this.p }); return { success: true }; },
          async all() { return { results: [] }; },
          async first() { return null; },
        };
      },
      async batch(stmts) { for (const s of stmts) await s.run(); return []; },
    };
    await worker.scheduled({}, { DASHBOARDS_KV: kv({ 'dash:dash-meta': CFG }), DASHBOARD_DB: db }, {});
    const comDado = gravados.map((g) => g.p || []).flat().filter((v) => typeof v === 'string' && v.includes('Receita'));
    assert.ok(comDado.length > 0, 'algum valor gravado no D1 tem a coluna Receita');
    assert.ok(comDado.some((v) => v.includes('497.00')), 'com o valor da compra');
  });
});
