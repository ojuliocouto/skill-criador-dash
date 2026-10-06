// Personalização por dashboard (herói e métricas que não entram) em template COM abas. Antes
// das abas, aplicarPersonalizacao só mexia no `layout`; com abas, a decisão da pessoa tem que
// valer na tela que ela vê, que agora é o layout de cada aba.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { aplicarPersonalizacao, metricasDoPainel } from '../public/assets/js/lib/personalizacao.js';
import { abasDoTemplate } from '../public/assets/js/lib/abas.js';
import { faixaDeKpi } from '../public/assets/js/dashboard.js';

const kpi = (k) => ({ widget: 'kpi', props: { metricKey: k } });
const TPL = {
  primaryMetric: 'leads',
  metrics: ['investimento', 'leads', 'CTR', 'CPL', 'CPA', 'receita', 'ROAS', 'impressoes'].map((k) => ({ key: k, label: k })),
  layout: [kpi('investimento'), kpi('leads'), kpi('CTR'), { widget: 'table', props: {} }],
  tabs: [
    { id: 'geral', label: 'Geral', layout: [
      kpi('investimento'), kpi('leads'), kpi('CPL'), kpi('CPA'),
      { widget: 'resumo', props: { groupBy: 'canal', metrics: ['investimento', 'CPL', { key: 'CTR', label: 'Cliques' }] } },
    ] },
    { id: 'funil', label: 'Funil', layout: [
      { widget: 'funnel', props: { steps: [{ label: 'Impressões', metricKey: 'impressoes' }, { label: 'Leads', metricKey: 'leads' }] } },
      { widget: 'resumo', props: { groupBy: 'canal', metrics: ['CTR'] } },
    ] },
  ],
};
const kpisDaAba = (tpl, id) => abasDoTemplate(tpl).find((t) => t.id === id).layout.filter((i) => i.widget === 'kpi').map((i) => i.props.metricKey);

test('personalização com abas: herói abre a faixa da aba e métrica oculta sai dela', () => {
  const antes = JSON.stringify(TPL);
  const tpl = aplicarPersonalizacao(TPL, { heroMetric: 'CPA', hiddenMetrics: ['CPL'] });
  assert.equal(tpl.primaryMetric, 'CPA');
  assert.deepEqual(kpisDaAba(tpl, 'geral'), ['CPA', 'investimento', 'leads']);
  assert.equal(JSON.stringify(TPL), antes, 'o template do domínio continua intacto');
});

test('personalização com abas: herói fora da faixa entra só na aba que tem faixa', () => {
  const tpl = aplicarPersonalizacao(TPL, { heroMetric: 'ROAS' });
  assert.equal(kpisDaAba(tpl, 'geral')[0], 'ROAS');
  assert.deepEqual(kpisDaAba(tpl, 'funil'), [], 'aba sem faixa de indicador não ganha uma');
});

test('personalização com abas: métrica oculta sai do funil e do resumo de qualquer aba', () => {
  const tpl = aplicarPersonalizacao(TPL, { hiddenMetrics: ['impressoes', 'CTR'] });
  const abas = abasDoTemplate(tpl);
  const funil = abas[1].layout.find((i) => i.widget === 'funnel');
  assert.deepEqual(funil.props.steps.map((s) => s.metricKey), ['leads']);
  const resumoGeral = abas[0].layout.find((i) => i.widget === 'resumo');
  assert.deepEqual(resumoGeral.props.metrics, ['investimento', 'CPL']);
  assert.ok(!abas[1].layout.some((i) => i.widget === 'resumo'), 'resumo que ficou sem métrica some');
});

test('personalização com abas: o layout plano continua sendo personalizado como antes', () => {
  const tpl = aplicarPersonalizacao(TPL, { heroMetric: 'CTR', hiddenMetrics: ['leads'] });
  assert.deepEqual(tpl.layout.filter((i) => i.widget === 'kpi').map((i) => i.props.metricKey), ['CTR', 'investimento']);
});

test('personalização: template sem abas não ganha a chave tabs', () => {
  const { tabs, ...semAbas } = TPL;
  const tpl = aplicarPersonalizacao(semAbas, { heroMetric: 'CTR' });
  assert.equal('tabs' in tpl, false);
});

test('metricasDoPainel: "na faixa" olha a faixa do layout plano e a das abas', () => {
  const lista = metricasDoPainel(TPL);
  const naFaixa = (k) => lista.find((m) => m.key === k).naFaixa;
  assert.equal(naFaixa('CTR'), true, 'está na faixa do layout plano');
  assert.equal(naFaixa('CPA'), true, 'está na faixa de uma aba');
  assert.equal(naFaixa('receita'), false);
});

// ---------- faixa de indicadores longa: quantas colunas ----------

test('faixaDeKpi: até 7 unidades fica numa linha só', () => {
  for (const n of [1, 3, 6, 7]) assert.equal(faixaDeKpi(n), n);
});

test('faixaDeKpi: 8 ou mais unidades em número par quebra em duas linhas iguais, sem buraco', () => {
  assert.equal(faixaDeKpi(8), 4);
  assert.equal(faixaDeKpi(10), 5);
  assert.equal(faixaDeKpi(12), 6);
});

test('faixaDeKpi: número ímpar não quebra (sobraria um buraco cinza na segunda linha)', () => {
  assert.equal(faixaDeKpi(9), 9);
  assert.equal(faixaDeKpi(11), 11);
});
