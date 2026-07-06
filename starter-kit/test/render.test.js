import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLayout } from '../public/assets/js/dashboard.js';

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
