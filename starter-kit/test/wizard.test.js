import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateRequired } from '../public/assets/js/config-wizard.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';

test('validateRequired: tudo ok quando todos os required têm coluna', () => {
  const colMap = {
    data: 'Data',
    investimento: 'Investimento',
    canal: null, // opcional, sem coluna, tudo bem
  };
  const missing = validateRequired(marketing.slots, colMap);
  assert.deepEqual(missing, []);
});

test('validateRequired: aponta required faltando (null e vazio)', () => {
  const colMap = {
    data: null, // required, faltando
    investimento: '   ', // required, string vazia após trim => faltando
    canal: 'Origem',
  };
  const missing = validateRequired(marketing.slots, colMap);
  const keys = missing.map((m) => m.key).sort();
  assert.deepEqual(keys, ['data', 'investimento']);
  // Carrega o label para exibição.
  assert.ok(missing.every((m) => typeof m.label === 'string' && m.label.length > 0));
});

test('validateRequired: colMap ausente conta todos os required como faltando', () => {
  const missing = validateRequired(marketing.slots, undefined);
  const reqCount = marketing.slots.filter((s) => s.required).length;
  assert.equal(missing.length, reqCount);
});

test('validateRequired: slots vazio não quebra', () => {
  assert.deepEqual(validateRequired([], { qualquer: 'x' }), []);
  assert.deepEqual(validateRequired(undefined, undefined), []);
});
