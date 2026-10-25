// 3.8.0: o painel de Marketing mostra Resultados e Custo por resultado quando a fonte traz a coluna
// (Meta Ads ou export do Gerenciador com "Resultados"), e some sem aviso quando não traz (CSV comum).
// Dash do Meta criado antes da 3.8.0 (colMap sem o slot resultados) ganha os números sozinho.
import test from 'node:test';
import assert from 'node:assert/strict';

import { template as marketing } from '../public/assets/js/templates/marketing.js';
import { ALL_SLOTS } from '../functions/lib/colmap-shape.mjs';
import { autoMap } from '../public/assets/js/lib/automap.js';
import { computeAllMapped } from '../public/assets/js/lib/metrics.js';
import { renderKpiBlock, planoDoEsqueleto } from '../public/assets/js/dashboard.js';
import { resumir } from '../public/assets/js/lib/resumo.js';
import { completarColMapDaMeta } from '../public/assets/js/lib/colmap-meta.js';
import { mapInsightsToDataSet } from '../functions/lib/meta.mjs';

const COLUNAS_META = mapInsightsToDataSet({ data: [] }).columns;
const kpisDaVisaoGeral = () => marketing.tabs.find((t) => t.id === 'visao-geral').layout.filter((i) => i.widget === 'kpi');

test('template: slot Resultados (opcional) e métricas Resultados e Custo por resultado', () => {
  const slot = marketing.slots.find((s) => s.key === 'resultados');
  assert.ok(slot, 'slot resultados existe');
  assert.equal(slot.required, false);
  assert.ok(ALL_SLOTS.marketing.some((s) => s.key === 'resultados'), 'colMap com resultados passa na validação do servidor');
  const res = marketing.metrics.find((m) => m.key === 'resultados');
  assert.equal(res.agg, 'sum');
  const cpr = marketing.metrics.find((m) => m.key === 'custo_resultado');
  assert.equal(cpr.label, 'Custo por resultado');
  assert.equal(cpr.agg, 'ratio', 'custo por resultado é investimento total / resultados totais, nunca soma de custos');
  assert.deepEqual(cpr.ratioOf, ['investimento', 'resultados']);
  assert.equal(cpr.betterWhen, 'lower');
});

test('automap: as colunas do conector Meta ligam Resultados, e Custo por resultado não rouba o Investimento', () => {
  const m = autoMap(marketing.slots, COLUNAS_META);
  assert.equal(m.resultados, 'Resultados');
  assert.equal(m.investimento, 'Investimento');
  assert.equal(m.leads, 'Leads');
});

test('automap: export do Gerenciador em inglês ("Results") também liga', () => {
  assert.equal(autoMap(marketing.slots, ['Day', 'Campaign name', 'Amount spent', 'Results', 'Cost per result']).resultados, 'Results');
});

test('Visão geral: Resultados e Custo por resultado entram na faixa, marcados para sumir sem coluna', () => {
  const kpis = kpisDaVisaoGeral();
  const res = kpis.find((i) => i.props.metricKey === 'resultados');
  const cpr = kpis.find((i) => i.props.metricKey === 'custo_resultado');
  assert.ok(res && res.props.seMapeada, 'Resultados com seMapeada');
  assert.ok(cpr && cpr.props.seMapeada, 'Custo por resultado com seMapeada');
  assert.ok(kpis.some((i) => i.props.metricKey === 'leads'), 'Leads continua');
  assert.ok(kpis.some((i) => i.props.metricKey === 'CPL'), 'CPL continua');
});

const ROWS_META = [
  { Data: '2026-10-01', Campanha: 'A', Investimento: '100', Leads: '4', Resultados: '5', 'Conversões': '0' },
  { Data: '2026-10-02', Campanha: 'B', Investimento: '50', Leads: '1', Resultados: '1', 'Conversões': '0' },
];

test('faixa com fonte Meta: mostra Resultados (6) e Custo por resultado (150 / 6 = 25)', () => {
  const colMap = autoMap(marketing.slots, COLUNAS_META);
  const { computed, mapped } = computeAllMapped(marketing.metrics, ROWS_META, colMap);
  assert.equal(computed.resultados, 6);
  assert.equal(computed.custo_resultado, 25);
  const html = renderKpiBlock(kpisDaVisaoGeral(), marketing, computed, mapped);
  assert.match(html, /Resultados/);
  assert.match(html, /Custo por resultado/);
});

test('faixa com CSV sem a coluna: Resultados e Custo por resultado somem (sem "Não mapeada" a mais)', () => {
  const colMap = { data: 'Data', canal: 'Campanha', investimento: 'Investimento', leads: 'Leads' };
  const rows = ROWS_META.map(({ Resultados, ...r }) => r);
  const { computed, mapped } = computeAllMapped(marketing.metrics, rows, colMap);
  const html = renderKpiBlock(kpisDaVisaoGeral(), marketing, computed, mapped);
  assert.ok(!/Resultados/.test(html), 'Resultados não aparece');
  assert.ok(!/Custo por resultado/.test(html), 'Custo por resultado não aparece');
  // O que não tem a marca continua avisando, como antes (ex.: Receita).
  assert.match(html, /Não mapeada/);
});

test('esqueleto conta só os indicadores que vão aparecer', () => {
  const comMeta = planoDoEsqueleto(marketing, 'visao-geral', autoMap(marketing.slots, COLUNAS_META));
  const semMeta = planoDoEsqueleto(marketing, 'visao-geral', { data: 'Data', investimento: 'Investimento' });
  assert.equal(comMeta.kpis - semMeta.kpis, 2);
});

test('resumo por canal: Resultados entra com a fonte Meta e some calado sem a coluna', () => {
  const resumo = marketing.tabs.find((t) => t.id === 'visao-geral').layout.find((i) => i.widget === 'resumo');
  const comMeta = resumir({ rows: ROWS_META, colMap: autoMap(marketing.slots, COLUNAS_META), template: marketing, groupBy: 'canal', metrics: resumo.props.metrics });
  assert.ok(comMeta.colunas.some((c) => c.key === 'resultados'));
  assert.ok(comMeta.colunas.some((c) => c.key === 'custo_resultado'));
  const semMeta = resumir({ rows: ROWS_META, colMap: { data: 'Data', canal: 'Campanha', investimento: 'Investimento', leads: 'Leads' }, template: marketing, groupBy: 'canal', metrics: resumo.props.metrics });
  assert.ok(!semMeta.colunas.some((c) => c.key === 'resultados'));
  assert.ok(!semMeta.ocultas.includes('Resultados'), 'não vira nota "ficou de fora"');
  assert.ok(!semMeta.ocultas.includes('Custo por resultado'));
});

test('dash do Meta criado antes da 3.8.0: o colMap ganha Resultados quando a coluna chega', () => {
  const antigo = { data: 'Data', canal: 'Campanha', investimento: 'Investimento', leads: 'Leads', conversoes: 'Conversões' };
  const dataset = { columns: COLUNAS_META, rows: [], meta: { source: 'meta' } };
  const novo = completarColMapDaMeta(antigo, { source: { type: 'meta' }, dataset });
  assert.equal(novo.resultados, 'Resultados');
  assert.equal(antigo.resultados, undefined, 'não muta a config original');
});

test('completarColMapDaMeta: não mexe em CSV, nem em snapshot antigo sem a coluna, nem em escolha da pessoa', () => {
  const base = { data: 'Data', investimento: 'Investimento' };
  assert.equal(completarColMapDaMeta(base, { source: { type: 'csv' }, dataset: { columns: COLUNAS_META } }).resultados, undefined);
  const velho = { columns: ['Data', 'Campanha', 'Investimento', 'Leads'], meta: { source: 'meta' } };
  assert.equal(completarColMapDaMeta(base, { source: { type: 'meta' }, dataset: velho }).resultados, undefined, 'snapshot de antes da 3.8.0 não ganha um zero falso');
  const escolhido = { ...base, resultados: 'Leads' };
  assert.equal(completarColMapDaMeta(escolhido, { source: { type: 'meta' }, dataset: { columns: COLUNAS_META } }).resultados, 'Leads');
  assert.equal(completarColMapDaMeta(base, { source: { type: 'meta' } }).resultados, 'Resultados', 'sem dataset (esqueleto): confia no tipo da fonte');
});

test('passo das colunas: Resultados é campo extra, só aparece e só conta quando o arquivo tem a coluna', async () => {
  const { placarDoMapa, slotsDoArquivo } = await import('../public/assets/js/lib/mapa-colunas.js');
  const { colunasEsperadas } = await import('../public/assets/js/lib/area-resumo.js');
  const csv = ['Data', 'Canal', 'Investimento', 'Impressões', 'Cliques', 'Leads', 'Conversões', 'Receita'];
  const pCsv = placarDoMapa(marketing.slots, autoMap(marketing.slots, csv), csv);
  assert.equal(pCsv.total, 8, 'CSV comum continua "8 de 8"');
  assert.ok(!slotsDoArquivo(marketing.slots, autoMap(marketing.slots, csv), csv).some((s) => s.key === 'resultados'));
  const pMeta = placarDoMapa(marketing.slots, autoMap(marketing.slots, COLUNAS_META), COLUNAS_META);
  assert.ok(slotsDoArquivo(marketing.slots, autoMap(marketing.slots, COLUNAS_META), COLUNAS_META).some((s) => s.key === 'resultados'));
  assert.equal(pMeta.total, 9, 'Meta: os 8 de sempre mais Resultados');
  assert.equal(pMeta.encontradas, 8, 'só a Receita fica de fora (a Meta não manda receita)');
  assert.deepEqual(pMeta.faltamOpcionais.map((s) => s.key), ['receita']);
  assert.ok(!colunasEsperadas(marketing).opcionais.some((s) => s.key === 'resultados'), 'a planilha modelo não pede Resultados');
});
