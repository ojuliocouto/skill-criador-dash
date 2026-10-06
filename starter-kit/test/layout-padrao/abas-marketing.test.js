// ABAS DE FÁBRICA do Marketing. Mesmo papel do layout-padrao.test.js: é o único lugar da suíte
// que confere quais abas o domínio traz e o que tem em cada uma. Só mude este arquivo quando a
// decisão for mudar o padrão da biblioteca pra todo mundo.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { templates } from '../../public/assets/js/templates/index.js';
import { abasDoTemplate } from '../../public/assets/js/lib/abas.js';
import { getWidget } from '../../public/assets/js/widgets/index.js';
import { ehPeriodo } from '../../public/assets/js/lib/periodo.js';

const mkt = templates.marketing;
const abas = abasDoTemplate(mkt);
const aba = (id) => abas.find((t) => t.id === id);
const tipos = (id) => aba(id).layout.filter((i) => i.widget !== 'kpi').map((i) => i.widget);
const chave = (m) => (typeof m === 'string' ? m : m.key);

test('marketing: cinco abas, com nome em palavra comum', () => {
  assert.deepEqual(abas.map((t) => [t.id, t.label]), [
    ['visao-geral', 'Visão geral'],
    ['canais', 'Canais'],
    ['evolucao', 'Evolução'],
    ['funil', 'Funil'],
    ['dados', 'Dados'],
  ]);
});

test('marketing / Visão geral: faixa de indicadores, resumo por canal e calculadora de meta', () => {
  const t = aba('visao-geral');
  assert.deepEqual(t.layout.filter((i) => i.widget === 'kpi').map((i) => i.props.metricKey),
    ['investimento', 'leads', 'CPL', 'conversoes', 'CPA', 'receita', 'ROAS']);
  assert.deepEqual(tipos('visao-geral'), ['resumo', 'meta']);
  const resumo = t.layout.find((i) => i.widget === 'resumo');
  assert.equal(resumo.props.groupBy, 'canal');
  const meta = t.layout.find((i) => i.widget === 'meta');
  assert.equal(meta.props.label, 'Meta de conversões no período');
  assert.equal(meta.props.targetKey, 'conversoes');
});

test('marketing / Canais: resumo completo (com CTR e CPC) e três rankings', () => {
  assert.deepEqual(tipos('canais'), ['resumo', 'ranking', 'ranking', 'ranking']);
  const resumo = aba('canais').layout.find((i) => i.widget === 'resumo');
  assert.equal(resumo.props.groupBy, 'canal');
  const chaves = resumo.props.metrics.map(chave);
  for (const k of ['investimento', 'CTR', 'CPC', 'leads', 'CPL', 'conversoes', 'CPA', 'receita', 'ROAS']) {
    assert.ok(chaves.includes(k), `resumo completo tem ${k}`);
  }
  assert.deepEqual(aba('canais').layout.filter((i) => i.widget === 'ranking').map((i) => i.props.valueSlot),
    ['investimento', 'conversoes', 'receita']);
});

test('marketing / Evolução: resumo por semana e três gráficos no tempo', () => {
  assert.deepEqual(tipos('evolucao'), ['resumo', 'timeseries', 'timeseries', 'timeseries']);
  assert.equal(aba('evolucao').layout.find((i) => i.widget === 'resumo').props.groupBy, 'semana');
  const series = aba('evolucao').layout.filter((i) => i.widget === 'timeseries');
  assert.deepEqual(series.map((i) => i.props.valueSlot), ['investimento', 'leads', 'conversoes']);
  for (const s of series) assert.equal(s.props.dateSlot, mkt.dateSlot);
});

test('marketing / Funil: o funil de 4 etapas e as taxas entre etapas por canal', () => {
  assert.deepEqual(tipos('funil'), ['funnel', 'resumo']);
  const funil = aba('funil').layout.find((i) => i.widget === 'funnel');
  assert.deepEqual(funil.props.steps.map((s) => s.metricKey), ['impressoes', 'cliques', 'leads', 'conversoes']);
  const taxas = aba('funil').layout.find((i) => i.widget === 'resumo');
  assert.equal(taxas.props.groupBy, 'canal');
  assert.deepEqual(taxas.props.metrics.map(chave), ['CTR', 'taxa_lead', 'taxa_conversao']);
});

test('marketing / Dados: a tabela linha a linha', () => {
  assert.deepEqual(aba('dados').layout.map((i) => i.widget), ['table']);
});

test('marketing: tudo que as abas citam existe (widget, métrica, slot)', () => {
  const metricas = new Set(mkt.metrics.map((m) => m.key));
  const slots = new Set(mkt.slots.map((s) => s.key));
  for (const t of abas) {
    for (const item of t.layout) {
      assert.ok(getWidget(item.widget), `${t.id}: widget ${item.widget} está no registry`);
      const p = item.props || {};
      if (item.widget === 'kpi') assert.ok(metricas.has(p.metricKey), `${t.id}: kpi ${p.metricKey}`);
      if (item.widget === 'resumo') {
        assert.ok(ehPeriodo(p.groupBy) || slots.has(p.groupBy), `${t.id}: groupBy ${p.groupBy}`);
        for (const m of p.metrics) assert.ok(metricas.has(chave(m)), `${t.id}: métrica ${chave(m)}`);
        assert.ok(p.title, `${t.id}: resumo tem título`);
      }
      if (item.widget === 'ranking' || item.widget === 'timeseries') assert.ok(slots.has(p.valueSlot), `${t.id}: slot ${p.valueSlot}`);
      if (item.widget === 'meta') {
        for (const k of [p.targetKey, p.costKey, p.leadKey, p.revenueKey]) assert.ok(metricas.has(k), `${t.id}: meta usa ${k}`);
      }
    }
  }
});

test('marketing: nome de aba e de bloco sem jargão de interface nem caixa alta', () => {
  const nomes = abas.flatMap((t) => [t.label, ...t.layout.map((i) => i.props && i.props.title).filter(Boolean)]);
  for (const n of nomes) {
    assert.notEqual(n, n.toUpperCase(), `"${n}" não pode ser todo em caixa alta`);
    assert.ok(!/overview|dashboard|breakdown|insight|performance/i.test(n), `"${n}" usa jargão`);
    assert.ok(!n.includes(String.fromCharCode(8212)), `"${n}" tem travessão`);
  }
});

test('marketing: o layout plano continua declarado (serve quem não usa abas)', () => {
  assert.ok(Array.isArray(mkt.layout) && mkt.layout.length > 0);
});
