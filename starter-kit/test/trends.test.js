import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tendenciasDoPeriodo, buildTrends, buildGoal } from '../public/assets/js/dashboard.js';

const colMap = { data: 'Data', invest: 'Invest' };

// 3.9 (achado 3 da auditoria de 25/10/2026): a seta compara com o período ANTERIOR do mesmo tamanho.
// O "vs. início" (2a metade contra a 1a metade do próprio período) invertia o sinal: em 7 dias, Leads
// ▼30,12% numa semana em que subiram 2,32%. Estes testes travam a regra nova.
const T = {
  dateSlot: 'data',
  metrics: [
    { key: 'leads', agg: 'sum', column: 'leads', betterWhen: 'higher' },
    { key: 'investimento', agg: 'sum', column: 'investimento' },
    { key: 'conversoes', agg: 'sum', column: 'conversoes', betterWhen: 'higher' },
    { key: 'CPA', agg: 'ratio', ratioOf: ['investimento', 'conversoes'], betterWhen: 'lower' },
  ],
};
const CM = { data: 'Data', leads: 'Leads', investimento: 'Inv', conversoes: 'Conv' };
const dia = (d) => `${String(d).padStart(2, '0')}/10/2026`;
// Semana anterior (12 a 18/10): 100 leads por dia. Semana atual (19 a 25/10): começa forte (200) e termina
// fraca (60): a 2a metade é pior que a 1a, mas a semana inteira (900) é melhor que a anterior (700).
const LINHAS = [];
for (let d = 12; d <= 18; d++) LINHAS.push({ Data: dia(d), Leads: '100', Inv: '100', Conv: '2' });
for (const [d, l] of [[19, 200], [20, 200], [21, 200], [22, 60], [23, 60], [24, 60], [25, 120]]) LINHAS.push({ Data: dia(d), Leads: String(l), Inv: '100', Conv: '2' });
const SETE_DIAS = { from: '2026-10-19', to: '2026-10-25', dims: {} };

test('tendenciasDoPeriodo: 7 dias contra os 7 anteriores (não contra a metade do próprio período)', () => {
  const t = tendenciasDoPeriodo(T, LINHAS, CM, SETE_DIAS);
  assert.ok(t.leads, 'Leads tem seta');
  // 900 contra 700 = +28,57%. As metades dariam 180 (22 a 24) contra 600 (19 a 21): ▼70%.
  assert.match(t.leads.text, /▲/);
  assert.match(t.leads.text, /28,57%/);
  assert.equal(t.leads.good, true);
  assert.equal(t.leads.rotulo, 'vs. 7 dias anteriores');
  assert.equal(t.leads.titulo, 'Comparado com 12/10/2026 a 18/10/2026');
});

test('tendenciasDoPeriodo: "Tudo" não tem período anterior, então não tem seta', () => {
  assert.deepEqual(tendenciasDoPeriodo(T, LINHAS, CM, { from: null, to: null, dims: {} }), {});
});

test('tendenciasDoPeriodo: período anterior fora dos dados não mostra seta', () => {
  assert.deepEqual(tendenciasDoPeriodo(T, LINHAS, CM, { from: '2026-10-12', to: '2026-10-18', dims: {} }), {});
});

test('tendenciasDoPeriodo: o filtro de canal vale nos dois períodos', () => {
  const linhas = LINHAS.map((r) => ({ ...r, Canal: 'Meta' })).concat(
    LINHAS.map((r) => ({ ...r, Canal: 'Google', Leads: r.Data >= '19' ? '1' : '1000' })));
  const t = tendenciasDoPeriodo(T, linhas, { ...CM, canal: 'Canal' }, { ...SETE_DIAS, dims: { canal: 'Meta' } });
  assert.match(t.leads.text, /▲ 28,57%/);
});

test('buildTrends: taxa sem denominador em um dos períodos não ganha seta (CPA sem venda não é ▼100%)', () => {
  const cur = [{ Data: dia(19), Inv: '100', Conv: '0', Leads: '5' }];
  const prev = [{ Data: dia(18), Inv: '100', Conv: '2', Leads: '5' }];
  assert.equal(buildTrends(T.metrics, cur, prev, CM).CPA, undefined);
  assert.equal(buildTrends(T.metrics, prev, cur, CM).CPA, undefined);
  assert.ok(buildTrends(T.metrics, prev, [{ ...prev[0], Inv: '50' }], CM).CPA, 'com venda nos dois, a seta aparece');
});

test('buildTrends: metrica higher subindo = bom (verde)', () => {
  const metrics = [{ key: 'invest', agg: 'sum', column: 'invest', betterWhen: 'higher' }];
  const prev = [{ Invest: '10' }];
  const cur = [{ Invest: '20' }];
  const t = buildTrends(metrics, cur, prev, colMap);
  assert.ok(t.invest);
  assert.equal(t.invest.good, true);
  assert.match(t.invest.text, /▲/);
});

test('buildTrends: metrica lower subindo = ruim (vermelho)', () => {
  const metrics = [{ key: 'invest', agg: 'sum', column: 'invest', betterWhen: 'lower' }];
  const t = buildTrends(metrics, [{ Invest: '20' }], [{ Invest: '10' }], colMap);
  assert.equal(t.invest.good, false);
  assert.match(t.invest.text, /▲/);
});

test('buildTrends: sem previous nao gera tendencia', () => {
  const metrics = [{ key: 'invest', agg: 'sum', column: 'invest', betterWhen: 'higher' }];
  assert.deepEqual(buildTrends(metrics, [{ Invest: '20' }], null, colMap), {});
});

// MUDANCA DE CONTRATO (26/08/2026). Antes: metrica sem `betterWhen` nao gerava tendencia
// nenhuma. O motivo era bom (nao inventar julgamento: gastar mais nao e bom nem ruim por si),
// mas o efeito na tela era ruim: o card de Investimento ficava uma linha mais curto que os
// vizinhos, orfao no meio da faixa de KPI. Agora a variacao APARECE, marcada `neutral`, e o
// CSS pinta de cinza em vez de verde/vermelho. A informacao existe; o julgamento e que nao.
test('buildTrends: metrica sem betterWhen gera tendencia NEUTRA (nao julga, mas informa)', () => {
  const metrics = [{ key: 'invest', agg: 'sum', column: 'invest' }];
  const t = buildTrends(metrics, [{ Invest: '20' }], [{ Invest: '10' }], colMap);
  assert.equal(t.invest.neutral, true, 'marcada como neutra');
  assert.equal(t.invest.good, undefined, 'sem veredito de bom/ruim');
  assert.ok(t.invest.text.includes('100'), 'a variacao real aparece');
});

test('buildTrends: denominador zero (previous soma 0) nao gera tendencia', () => {
  // Guard p === 0: sem base anterior nao da pra calcular variacao percentual.
  const metrics = [{ key: 'invest', agg: 'sum', column: 'invest', betterWhen: 'higher' }];
  const prev = [{ Invest: '0' }];
  const cur = [{ Invest: '50' }];
  const t = buildTrends(metrics, cur, prev, colMap);
  assert.equal(t.invest, undefined);
  assert.deepEqual(t, {});
});

test('buildTrends: variacao abaixo do limiar (< 0,05%) e considerada estavel', () => {
  // delta = (10001 - 10000) / 10000 = 0.0001 < 0.0005 -> nao aparece.
  const metrics = [{ key: 'invest', agg: 'sum', column: 'invest', betterWhen: 'higher' }];
  const prev = [{ Invest: '10000' }];
  const cur = [{ Invest: '10001' }];
  const t = buildTrends(metrics, cur, prev, colMap);
  assert.equal(t.invest, undefined);
  assert.deepEqual(t, {});
});

test('buildGoal: calcula percentual da meta', () => {
  const g = buildGoal({ goal: { metricKey: 'leads', value: 1000 } }, { leads: 1001 });
  assert.equal(g.metricKey, 'leads');
  assert.ok(Math.abs(g.pct - 1.001) < 1e-9);
  assert.match(g.text, /da meta/);
});

test('buildGoal: sem meta, meta <= 0 ou metrica ausente devolve null', () => {
  assert.equal(buildGoal({}, { leads: 10 }), null);
  assert.equal(buildGoal({ goal: { metricKey: 'leads', value: 0 } }, { leads: 10 }), null);
  assert.equal(buildGoal({ goal: { metricKey: 'leads', value: -5 } }, { leads: 10 }), null);
  assert.equal(buildGoal({ goal: { metricKey: 'x', value: 100 } }, {}), null);
});

test('buildGoal: taxa sem denominador não monta barra de meta (ROAS sem investimento não é "0% da meta")', () => {
  const tpl = { metrics: [{ key: 'ROAS', agg: 'derived', denominator: 'investimento', betterWhen: 'higher' }] };
  assert.equal(buildGoal({ goal: { metricKey: 'ROAS', value: 2 } }, { ROAS: 0, investimento: 0 }, {}, tpl), null);
  assert.ok(buildGoal({ goal: { metricKey: 'ROAS', value: 2 } }, { ROAS: 1, investimento: 10 }, {}, tpl));
});

// Achado extra (teste de aluno, 25/10/2026): "499,73% da meta proporcional" não se lê. Meta passada do
// dobro vira múltiplo ("5x a meta"); até o dobro, o percentual continua.
test('buildGoal: meta passada do dobro vira múltiplo legível', () => {
  const tpl = { metrics: [{ key: 'leads', agg: 'sum', column: 'leads', betterWhen: 'higher' }] };
  const g = buildGoal({ goal: { metricKey: 'leads', value: 100, periodo: 'periodo' } }, { leads: 499.73 }, {}, tpl);
  assert.equal(g.text, '5x a meta do período');
  assert.ok(g.pct > 4.99, 'a barra continua cheia com o percentual de verdade');
  assert.equal(buildGoal({ goal: { metricKey: 'leads', value: 100, periodo: 'periodo' } }, { leads: 250 }, {}, tpl).text, '2,5x a meta do período');
  assert.match(buildGoal({ goal: { metricKey: 'leads', value: 100, periodo: 'periodo' } }, { leads: 130 }, {}, tpl).text, /^130,00% da meta do período$/);
  // Proporcional (pedaço de mês): múltiplo e o aviso de ritmo.
  const prop = buildGoal({ goal: { metricKey: 'leads', value: 400, periodo: 'mensal' } }, { leads: 600 }, {}, tpl, { min: '2026-10-10', max: '2026-10-18' });
  assert.match(prop.text, /^\d+(,\d)?x a meta proporcional \(.+\), acima do ritmo$/);
  assert.doesNotMatch(prop.text, /%/);
});
