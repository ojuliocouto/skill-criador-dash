import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDateBR } from '../public/assets/js/lib/format.js';
import { timeSeries } from '../public/assets/js/lib/metrics.js';

test('datas brasileiras com hora preservam o dia informado', () => {
  for (const data of ['11/09/2026 14:35', '11/09/2026 14:35:09', '11/09/2026T14:35:09-03:00']) {
    assert.equal(parseDateBR(data), '2026-09-11');
  }
});

test('hora inválida e texto solto não viram data', () => {
  for (const data of ['11/09/2026 25:00', '2026-09-11 lixo', '2026-09-11 23:99', '31/02/2026 10:00']) {
    assert.equal(parseDateBR(data), null);
  }
});

test('série temporal não perde linhas de exportação brasileira com hora', () => {
  assert.deepEqual(timeSeries([{ Dia: '11/09/2026 14:35', Valor: '150,00' }],
    { data: 'Dia', valor: 'Valor' }, 'data', 'valor'), [{ date: '2026-09-11', value: 150 }]);
});
