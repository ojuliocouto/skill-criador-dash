import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeHeader, autoMap } from '../public/assets/js/lib/automap.js';
import { templates, getTemplate } from '../public/assets/js/templates/index.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';
import { template as vendas } from '../public/assets/js/templates/vendas.js';

test('normalizeHeader: caixa e acentos', () => {
  assert.equal(normalizeHeader('Investimento'), normalizeHeader('investimento'));
  assert.equal(normalizeHeader('Conversões'), 'conversoes');
  assert.equal(normalizeHeader('  Valor   Gasto  '), 'valor gasto');
  assert.equal(normalizeHeader('IMPRESSÕES'), 'impressoes');
});

test('autoMap marketing: mapeia colunas reais', () => {
  const columns = ['Data', 'Origem', 'Valor Gasto', 'Cliques', 'Impressões'];
  const map = autoMap(marketing.slots, columns);
  assert.equal(map.data, 'Data');
  assert.equal(map.canal, 'Origem');
  assert.equal(map.investimento, 'Valor Gasto');
  assert.equal(map.cliques, 'Cliques');
  assert.equal(map.impressoes, 'Impressões');
  // slot sem coluna vira null
  assert.equal(map.leads, null);
  assert.equal(map.conversoes, null);
  assert.equal(map.receita, null);
});

test('autoMap: nao repete a mesma coluna em dois slots', () => {
  const columns = ['Data', 'Valor Gasto', 'Cliques'];
  const map = autoMap(marketing.slots, columns);
  const usados = Object.values(map).filter(Boolean);
  const unicos = new Set(usados);
  assert.equal(usados.length, unicos.size, 'cada coluna usada uma unica vez');
});

test('autoMap vendas: mapeia colunas reais', () => {
  const columns = ['Data', 'Vendedor', 'Produto', 'Valor'];
  const map = autoMap(vendas.slots, columns);
  assert.equal(map.data, 'Data');
  assert.equal(map.vendedor, 'Vendedor');
  assert.equal(map.produto, 'Produto');
  assert.equal(map.valor, 'Valor');
  assert.equal(map.status, null);
});

test('getTemplate retorna template por id', () => {
  assert.equal(getTemplate('marketing'), marketing);
  assert.equal(getTemplate('vendas'), vendas);
  assert.equal(getTemplate('inexistente'), undefined);
  assert.deepEqual(Object.keys(templates).sort(), ['marketing', 'vendas']);
});

function validaTemplate(tpl) {
  // metrics tem keys unicas
  const keys = tpl.metrics.map((m) => m.key);
  assert.equal(keys.length, new Set(keys).size, `${tpl.id}: keys de metrics unicas`);

  // toda ratio/derived referencia keys que existem ANTES dela no array
  const vistas = new Set();
  for (const m of tpl.metrics) {
    if (m.agg === 'ratio') {
      assert.ok(Array.isArray(m.ratioOf) && m.ratioOf.length === 2, `${tpl.id}/${m.key}: ratioOf par`);
      for (const dep of m.ratioOf) {
        assert.ok(vistas.has(dep), `${tpl.id}/${m.key}: dep ${dep} definida antes`);
      }
    }
    if (m.agg === 'derived') {
      assert.equal(typeof m.compute, 'function', `${tpl.id}/${m.key}: derived tem compute`);
    }
    vistas.add(m.key);
  }

  // required slots existem em slots
  const slotKeys = new Set(tpl.slots.map((s) => s.key));
  for (const s of tpl.slots) {
    if (s.required) assert.ok(slotKeys.has(s.key), `${tpl.id}: required ${s.key} existe`);
  }

  // layout referencia metricas/slots que existem
  for (const item of tpl.layout) {
    assert.ok(['kpi', 'timeseries', 'funnel', 'table', 'ranking'].includes(item.widget), `${tpl.id}: widget valido`);
  }
}

test('estrutura do template marketing', () => {
  validaTemplate(marketing);
  const keys = marketing.metrics.map((m) => m.key);
  // base antes das derivadas
  assert.ok(keys.indexOf('cliques') < keys.indexOf('CTR'));
  assert.ok(keys.indexOf('investimento') < keys.indexOf('ROAS'));
  assert.ok(keys.indexOf('receita') < keys.indexOf('ROAS'));
  // required
  const req = marketing.slots.filter((s) => s.required).map((s) => s.key).sort();
  assert.deepEqual(req, ['data', 'investimento']);
});

test('estrutura do template vendas', () => {
  validaTemplate(vendas);
  const req = vendas.slots.filter((s) => s.required).map((s) => s.key).sort();
  assert.deepEqual(req, ['data', 'valor']);
});
