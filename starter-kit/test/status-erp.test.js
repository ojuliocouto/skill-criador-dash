import { test } from 'node:test';
import assert from 'node:assert/strict';
import { template } from '../public/assets/js/templates/vendas.js';
import { computeAll } from '../public/assets/js/lib/metrics.js';

test('status negativos não entram no faturamento por conterem a palavra pago', () => {
  const rows = ['Não pago', 'Não aprovado', 'Não concluído', 'Fechada perdida'].map(Status => ({ Status, Valor: '100' }));
  const c = computeAll(template.metrics, rows, { status: 'Status', valor: 'Valor' });
  assert.equal(c.vendas_ganhas, 0);
  assert.equal(c.faturamento, 0);
});

test('status explícitos de conclusão em português entram uma vez', () => {
  const rows = ['Pago', 'Concluído', 'Faturado', 'Finalizada', 'Ganha', 'Closed won'].map(Status => ({ Status, Valor: '100' }));
  const c = computeAll(template.metrics, rows, { status: 'Status', valor: 'Valor' });
  assert.equal(c.vendas_ganhas, 6);
  assert.equal(c.faturamento, 600);
});
