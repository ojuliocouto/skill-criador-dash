import { test } from 'node:test';
import assert from 'node:assert/strict';
import { template } from '../public/assets/js/templates/marketing.js';
import { computeAll } from '../public/assets/js/lib/metrics.js';

test('fórmulas do template produzem os resultados comerciais esperados', () => {
  const rows = [{ investimento: '200', receita: '1000', impressoes: '10000', cliques: '400', leads: '20', conversoes: '5' }];
  const calculado = computeAll(template.metrics, rows, {});
  assert.equal(calculado.ROAS, 5);
  assert.equal(calculado.CPL, 10);
  assert.equal(calculado.CPC, 0.5);
  assert.equal(calculado.CPA, 40);
  assert.equal(calculado.CTR, 0.04);
});

test('denominador zero não produz número não finito', () => {
  const calculado = computeAll(template.metrics, [{ investimento: '0', receita: '1000', leads: '0' }], {});
  assert.equal(calculado.ROAS, 0);
  assert.equal(calculado.CPL, 0);
});
