import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitByPeriod, buildTrends, buildGoal } from '../public/assets/js/dashboard.js';

const colMap = { data: 'Data', invest: 'Invest' };

test('splitByPeriod divide as datas distintas em duas metades', () => {
  const rows = [
    { Data: '01/07/2026', Invest: '10' },
    { Data: '02/07/2026', Invest: '20' },
    { Data: '03/07/2026', Invest: '30' },
    { Data: '04/07/2026', Invest: '40' },
  ];
  const { current, previous } = splitByPeriod(rows, colMap, 'data');
  assert.equal(previous.length, 2); // 01 e 02
  assert.equal(current.length, 2);  // 03 e 04
  assert.equal(previous[0].Invest, '10');
  assert.equal(current[current.length - 1].Invest, '40');
});

test('splitByPeriod com datas impares: metades iguais, dia do meio descartado', () => {
  const rows = [
    { Data: '01/07/2026', Invest: '10' },
    { Data: '02/07/2026', Invest: '20' },
    { Data: '03/07/2026', Invest: '30' }, // meio: descartado
    { Data: '04/07/2026', Invest: '40' },
    { Data: '05/07/2026', Invest: '50' },
  ];
  const { current, previous } = splitByPeriod(rows, colMap, 'data');
  assert.equal(previous.length, 2); // 01, 02
  assert.equal(current.length, 2);  // 04, 05
  assert.ok(!previous.concat(current).some((r) => r.Invest === '30')); // 03 fora
});

test('splitByPeriod sem comparacao possivel (1 data) devolve previous null', () => {
  const rows = [{ Data: '01/07/2026', Invest: '10' }, { Data: '01/07/2026', Invest: '20' }];
  const { current, previous } = splitByPeriod(rows, colMap, 'data');
  assert.equal(previous, null);
  assert.equal(current.length, 2);
});

test('splitByPeriod ignora linhas com data invalida', () => {
  const rows = [
    { Data: 'xx', Invest: '10' },
    { Data: '01/07/2026', Invest: '20' },
    { Data: '02/07/2026', Invest: '30' },
  ];
  const { current, previous } = splitByPeriod(rows, colMap, 'data');
  assert.equal(previous.length, 1);
  assert.equal(current.length, 1);
});

test('buildTrends: metrica higher subindo = bom (verde)', () => {
  const metrics = [{ key: 'invest', agg: 'sum', column: 'invest', betterWhen: 'higher' }];
  const prev = [{ Invest: '10' }];
  const cur = [{ Invest: '20' }];
  const t = buildTrends(metrics, cur, prev, colMap);
  assert.ok(t.invest);
  assert.equal(t.invest.good, true);
  assert.match(t.invest.text, /▲/);
});

test('buildTrends: metrica lower subindo = ruim (vermelho)', () => {
  const metrics = [{ key: 'invest', agg: 'sum', column: 'invest', betterWhen: 'lower' }];
  const t = buildTrends(metrics, [{ Invest: '20' }], [{ Invest: '10' }], colMap);
  assert.equal(t.invest.good, false);
  assert.match(t.invest.text, /▲/);
});

test('buildTrends: sem previous nao gera tendencia', () => {
  const metrics = [{ key: 'invest', agg: 'sum', column: 'invest', betterWhen: 'higher' }];
  assert.deepEqual(buildTrends(metrics, [{ Invest: '20' }], null, colMap), {});
});

test('buildTrends: metrica sem betterWhen nao gera tendencia', () => {
  const metrics = [{ key: 'invest', agg: 'sum', column: 'invest' }];
  assert.deepEqual(buildTrends(metrics, [{ Invest: '20' }], [{ Invest: '10' }], colMap), {});
});

test('buildGoal: calcula percentual da meta', () => {
  const g = buildGoal({ goal: { metricKey: 'leads', value: 1000 } }, { leads: 1001 });
  assert.equal(g.metricKey, 'leads');
  assert.ok(Math.abs(g.pct - 1.001) < 1e-9);
  assert.match(g.text, /da meta/);
});

test('buildGoal: sem meta, meta <= 0 ou metrica ausente devolve null', () => {
  assert.equal(buildGoal({}, { leads: 10 }), null);
  assert.equal(buildGoal({ goal: { metricKey: 'leads', value: 0 } }, { leads: 10 }), null);
  assert.equal(buildGoal({ goal: { metricKey: 'leads', value: -5 } }, { leads: 10 }), null);
  assert.equal(buildGoal({ goal: { metricKey: 'x', value: 100 } }, {}), null);
});
