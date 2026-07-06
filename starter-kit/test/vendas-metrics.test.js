import { test } from 'node:test';
import assert from 'node:assert/strict';
import { template } from '../public/assets/js/templates/vendas.js';
import { computeAll } from '../public/assets/js/lib/metrics.js';

const colMap = { data: 'Data', vendedor: 'Vendedor', produto: 'Produto', valor: 'Valor', status: 'Status' };

const rowsComStatus = [
  { Data: '01/07/2026', Vendedor: 'Ana', Produto: 'Pro', Valor: '1.000,00', Status: 'Ganha' },
  { Data: '01/07/2026', Vendedor: 'Bruno', Produto: 'Start', Valor: '500,00', Status: 'Perdida' },
  { Data: '02/07/2026', Vendedor: 'Ana', Produto: 'Enterprise', Valor: '2.000,00', Status: 'Ganha' },
];

test('vendas: faturamento conta so as ganhas quando ha status', () => {
  const c = computeAll(template.metrics, rowsComStatus, colMap);
  assert.equal(c.num_vendas, 3);        // total de negocios
  assert.equal(c.vendas_ganhas, 2);     // ganhas
  assert.equal(c.faturamento, 3000);    // 1000 + 2000 (exclui a perdida)
  assert.equal(c.ticket_medio, 1500);   // 3000 / 2 ganhas
  assert.ok(Math.abs(c.taxa_conversao - (2 / 3)) < 1e-9); // 66,67%
});

test('vendas: sem coluna de status, todas contam como ganhas (fallback)', () => {
  const semStatus = rowsComStatus.map(({ Status, ...r }) => r);
  const cm = { ...colMap }; delete cm.status;
  const c = computeAll(template.metrics, semStatus, cm);
  assert.equal(c.num_vendas, 3);
  assert.equal(c.vendas_ganhas, 3);
  assert.equal(c.faturamento, 3500);    // soma tudo
  assert.equal(c.taxa_conversao, 1);    // 100%
});

test('vendas: status presente mas todos em branco cai no fallback', () => {
  const rows = rowsComStatus.map((r) => ({ ...r, Status: '' }));
  const c = computeAll(template.metrics, rows, colMap);
  assert.equal(c.vendas_ganhas, 3);
  assert.equal(c.faturamento, 3500);
});

test('vendas: template tem funil e kpi de taxa de conversao no layout', () => {
  const widgets = template.layout.map((l) => l.widget);
  assert.ok(widgets.includes('funnel'), 'deve ter funil');
  const kpiKeys = template.layout.filter((l) => l.widget === 'kpi').map((l) => l.props.metricKey);
  assert.ok(kpiKeys.includes('taxa_conversao'), 'deve ter KPI de taxa de conversao');
});
