import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeHeader, autoMap } from '../public/assets/js/lib/automap.js';
import { templates, getTemplate, DOMAINS } from '../public/assets/js/templates/index.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';
import { template as vendas } from '../public/assets/js/templates/vendas.js';
import { template as suporte } from '../public/assets/js/templates/suporte.js';
import { resolveDateSlot } from '../public/assets/js/dashboard.js';
import { DOMAINS as SERVER_DOMAINS, isDomain } from '../functions/lib/domains.mjs';

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
  assert.equal(getTemplate('suporte'), suporte);
  assert.equal(getTemplate('inexistente'), undefined);
  assert.deepEqual(Object.keys(templates).sort(), ['marketing', 'suporte', 'vendas']);
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

test('autoMap suporte: mapeia todos os slots', () => {
  const columns = ['Data', 'Canal', 'Atendimentos', 'Resolvidos', 'Tempo de resposta', 'CSAT'];
  const map = autoMap(suporte.slots, columns);
  assert.equal(map.data, 'Data');
  assert.equal(map.canal, 'Canal');
  assert.equal(map.atendimentos, 'Atendimentos');
  assert.equal(map.resolvidos, 'Resolvidos');
  assert.equal(map.tempo_resposta, 'Tempo de resposta');
  assert.equal(map.csat, 'CSAT');
});

test('estrutura do template suporte', () => {
  validaTemplate(suporte);
  const req = suporte.slots.filter((s) => s.required).map((s) => s.key).sort();
  assert.deepEqual(req, ['atendimentos', 'data']);
  // base antes da derivada: taxa_resolucao (ratio) depende de resolvidos e atendimentos
  const keys = suporte.metrics.map((m) => m.key);
  assert.ok(keys.indexOf('resolvidos') < keys.indexOf('taxa_resolucao'));
  assert.ok(keys.indexOf('atendimentos') < keys.indexOf('taxa_resolucao'));
});

// ---------- HARDENING fix 3+4: dominios vem do registry (domains.mjs) ----------

test('registry de templates casa EXATAMENTE com a lista canonica de dominios', () => {
  // As chaves do registry sao a mesma lista que o servidor valida. Adicionar um
  // dominio num lugar so (sem o outro) e o drift que este teste trava.
  assert.deepEqual(Object.keys(templates).sort(), [...DOMAINS].sort());
  // A lista exportada pelo front-end e a MESMA do servidor (single source).
  assert.deepEqual([...DOMAINS].sort(), [...SERVER_DOMAINS].sort());
});

test('isDomain aceita cada dominio do registry e rejeita o resto', () => {
  for (const id of DOMAINS) {
    assert.equal(isDomain(id), true, `${id} valido`);
    assert.ok(getTemplate(id), `${id} tem template`);
  }
  assert.equal(isDomain('financeiro'), false);
  assert.equal(isDomain(''), false);
  assert.equal(isDomain(null), false);
  assert.equal(isDomain(undefined), false);
});

// ---------- HARDENING fix 2: dateSlot LIDO do template, nao hardcoded ----------

test('cada template declara dateSlot, e ele casa com o widget timeseries', () => {
  for (const tpl of [marketing, vendas, suporte]) {
    assert.equal(typeof tpl.dateSlot, 'string', `${tpl.id}: declara dateSlot`);
    assert.ok(tpl.slots.some((s) => s.key === tpl.dateSlot), `${tpl.id}: dateSlot e um slot real`);
    const ts = tpl.layout.find((l) => l.widget === 'timeseries');
    if (ts) {
      assert.equal(ts.props.dateSlot, tpl.dateSlot, `${tpl.id}: dateSlot do template == dateSlot do timeseries`);
    }
  }
});

test('resolveDateSlot LE do template (nao retorna sempre o hardcoded "data")', () => {
  // Prova que nao ha fallback fixo: um template com outro slot de tempo e honrado.
  assert.equal(resolveDateSlot({ dateSlot: 'competencia' }), 'competencia');
  assert.equal(resolveDateSlot(marketing), 'data');
  assert.equal(resolveDateSlot(vendas), 'data');
  assert.equal(resolveDateSlot(suporte), 'data');
  // Fallback seguro so quando o template nao declara nada.
  assert.equal(resolveDateSlot({}), 'data');
  assert.equal(resolveDateSlot(null), 'data');
  assert.equal(resolveDateSlot(undefined), 'data');
});
