import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNumberBR } from '../public/assets/js/lib/format.js';
import { groupBy, timeSeries } from '../public/assets/js/lib/metrics.js';

test('parseNumberBR: milhar US com sinal negativo/positivo', () => {
  assert.equal(parseNumberBR('-1,000'), -1000);
  assert.equal(parseNumberBR('+1,000'), 1000);
  assert.equal(parseNumberBR('-12,345'), -12345);
  assert.equal(parseNumberBR('-1,000,000'), -1000000);
  // decimal BR com sinal continua decimal
  assert.equal(parseNumberBR('-1,23'), -1.23);
  // soma com estorno negativo (o caso de corrupcao silenciosa do achado)
  assert.equal(parseNumberBR('2,000') + parseNumberBR('-1,000'), 1000);
});

test('groupBy/timeSeries: countDistinct sobre coluna de TEXTO conta por string', () => {
  const rows = [
    { Canal: 'Meta', Data: '2026-01-01', Produto: 'Curso A' },
    { Canal: 'Meta', Data: '2026-01-01', Produto: 'Curso B' },
    { Canal: 'Meta', Data: '2026-01-02', Produto: 'Curso A' },
    { Canal: 'Google', Data: '2026-01-01', Produto: 'Curso C' },
  ];
  const cm = { canal: 'Canal', data: 'Data', produto: 'Produto' };
  const g = groupBy(rows, cm, 'canal', 'produto', 'countDistinct');
  assert.deepEqual(g, [{ key: 'Meta', value: 2 }, { key: 'Google', value: 1 }]);
  const t = timeSeries(rows, cm, 'data', 'produto', 'countDistinct');
  const byDate = Object.fromEntries(t.map((r) => [r.date, r.value]));
  assert.equal(byDate['2026-01-01'], 3); // Curso A, B, C
  assert.equal(byDate['2026-01-02'], 1); // Curso A
});
