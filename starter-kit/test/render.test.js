import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLayout, cellSpanClass, resolveActiveTab } from '../public/assets/js/dashboard.js';
import { registry, getWidget } from '../public/assets/js/widgets/index.js';

// ---------- registry de widgets ----------
test('registry: tem as chaves esperadas e cada entrada expoe toHtml funcao', () => {
  const esperadas = ['kpi', 'timeseries', 'funnel', 'table', 'ranking'];
  for (const key of esperadas) {
    assert.ok(registry[key], `registry tem a chave ${key}`);
    assert.equal(typeof registry[key].toHtml, 'function', `${key}.toHtml e funcao`);
    assert.equal(typeof registry[key].render, 'function', `${key}.render e funcao`);
  }
  assert.equal(typeof getWidget('table').toHtml, 'function', 'getWidget resolve a entrada');
  assert.equal(getWidget('inexistente'), undefined, 'getWidget de tipo desconhecido e undefined');
});

// ---------- cellSpanClass (grid 2D) ----------
test('cellSpanClass: spans permitidos viram classe span-N', () => {
  assert.equal(cellSpanClass(3), ' span-3');
  assert.equal(cellSpanClass(4), ' span-4');
  assert.equal(cellSpanClass(6), ' span-6');
  assert.equal(cellSpanClass(8), ' span-8');
});
test('cellSpanClass: full-width e valores invalidos NAO geram classe (span 12 = padrao)', () => {
  assert.equal(cellSpanClass(12), '');
  assert.equal(cellSpanClass(undefined), '');
  assert.equal(cellSpanClass(2), '');
  assert.equal(cellSpanClass(9), '');
  assert.equal(cellSpanClass('8'), ''); // so aceita number, nao string
});

// ---------- resolveActiveTab (grupo com abas) ----------
test('resolveActiveTab: pedida valida vence', () => {
  const tabs = [{ id: 'mkt' }, { id: 'vendas' }];
  assert.equal(resolveActiveTab(tabs, 'vendas'), 'vendas');
});
test('resolveActiveTab: pedida invalida ou ausente cai na primeira', () => {
  const tabs = [{ id: 'mkt' }, { id: 'vendas' }];
  assert.equal(resolveActiveTab(tabs, 'inexistente'), 'mkt');
  assert.equal(resolveActiveTab(tabs, null), 'mkt');
});
test('resolveActiveTab: sem abas devolve null; ignora abas sem id', () => {
  assert.equal(resolveActiveTab([], 'x'), null);
  assert.equal(resolveActiveTab([{ label: 'sem id' }, { id: 'ok' }], null), 'ok');
});

// ---------- planLayout ----------
test('planLayout: 6 kpis seguidos viram 1 bloco kpis', () => {
  const layout = [
    { widget: 'kpi', props: { metricKey: 'a' } },
    { widget: 'kpi', props: { metricKey: 'b' } },
    { widget: 'kpi', props: { metricKey: 'c' } },
    { widget: 'kpi', props: { metricKey: 'd' } },
    { widget: 'kpi', props: { metricKey: 'e' } },
    { widget: 'kpi', props: { metricKey: 'f' } },
  ];
  const blocks = planLayout(layout);
  assert.equal(blocks.length, 1, 'um unico bloco');
  assert.equal(blocks[0].type, 'kpis');
  assert.equal(blocks[0].items.length, 6, 'seis kpis no bloco');
});

test('planLayout: kpi, timeseries, kpi viram bloco-kpi, single, bloco-kpi', () => {
  const layout = [
    { widget: 'kpi', props: { metricKey: 'a' } },
    { widget: 'timeseries', props: { dateSlot: 'data', valueSlot: 'valor' } },
    { widget: 'kpi', props: { metricKey: 'b' } },
  ];
  const blocks = planLayout(layout);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].type, 'kpis');
  assert.equal(blocks[0].items.length, 1);
  assert.equal(blocks[1].type, 'single');
  assert.equal(blocks[1].item.widget, 'timeseries');
  assert.equal(blocks[2].type, 'kpis');
  assert.equal(blocks[2].items.length, 1);
});

test('planLayout: agrupa apenas kpis consecutivos', () => {
  const layout = [
    { widget: 'kpi', props: { metricKey: 'a' } },
    { widget: 'kpi', props: { metricKey: 'b' } },
    { widget: 'ranking', props: { dimensionSlot: 'canal', valueSlot: 'valor' } },
    { widget: 'kpi', props: { metricKey: 'c' } },
    { widget: 'table', props: {} },
  ];
  const blocks = planLayout(layout);
  assert.equal(blocks.length, 4);
  assert.equal(blocks[0].type, 'kpis');
  assert.equal(blocks[0].items.length, 2);
  assert.equal(blocks[1].type, 'single');
  assert.equal(blocks[1].item.widget, 'ranking');
  assert.equal(blocks[2].type, 'kpis');
  assert.equal(blocks[2].items.length, 1);
  assert.equal(blocks[3].type, 'single');
  assert.equal(blocks[3].item.widget, 'table');
});

test('planLayout: layout vazio devolve lista vazia', () => {
  assert.deepEqual(planLayout([]), []);
  assert.deepEqual(planLayout(undefined), []);
});

test('planLayout: apenas widgets nao-kpi viram singles', () => {
  const layout = [
    { widget: 'timeseries', props: {} },
    { widget: 'table', props: {} },
  ];
  const blocks = planLayout(layout);
  assert.equal(blocks.length, 2);
  assert.ok(blocks.every((b) => b.type === 'single'));
});
