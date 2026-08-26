// KPI herói: hierarquia visual no painel.
//
// Por que existe (26/08/2026): o painel saía com 6 KPIs de peso visual IDÊNTICO, e o olho não
// sabia onde pousar. Pior: o template já declarava `primaryMetric` (a métrica que aquele domínio
// considera principal) e o layout IGNORAVA esse dado. A informação de hierarquia existia e era
// jogada fora. É a diferença entre este painel e Linear/Vercel/Stripe, onde sempre há um número
// herói e os outros são de apoio.
//
// O herói ganha: o dobro de largura na faixa, valor maior e uma sparkline da própria série.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render as renderKpi } from '../public/assets/js/widgets/kpi.js';

test('kpi comum: sem classe de herói, sem sparkline', () => {
  const html = renderKpi({ label: 'CPL', format: 'currency' }, 13.98);
  assert.ok(!html.includes('kpi--hero'), 'kpi comum não pode vir com a classe de herói');
  assert.ok(!html.includes('kpi__spark'), 'kpi comum não desenha sparkline');
});

test('kpi herói: ganha a classe que dá o span e o tamanho', () => {
  const html = renderKpi({ label: 'Leads', format: 'integer', hero: true }, 1001);
  assert.ok(html.includes('kpi--hero'), 'herói precisa da classe para o CSS dar span 2 e valor maior');
  assert.ok(html.includes('1.001'), 'valor continua formatado igual');
});

test('kpi herói: desenha sparkline quando recebe a série', () => {
  const html = renderKpi({ label: 'Leads', format: 'integer', hero: true, spark: [10, 14, 9, 22, 31] }, 86);
  assert.ok(html.includes('kpi__spark'), 'sparkline presente');
  assert.ok(html.includes('<svg'), 'sparkline é SVG (sem dependência externa)');
  assert.ok(/points="[\d.,\s]+"/.test(html), 'polyline com pontos numéricos');
});

test('kpi herói: série curta demais não vira sparkline (linha de 1 ponto engana)', () => {
  for (const serie of [[], [5], null, undefined]) {
    const html = renderKpi({ label: 'Leads', hero: true, spark: serie }, 5);
    assert.ok(!html.includes('kpi__spark'), `série ${JSON.stringify(serie)} não pode desenhar sparkline`);
  }
});

test('kpi herói: série achatada (todos iguais) desenha reta, sem dividir por zero', () => {
  const html = renderKpi({ label: 'Leads', hero: true, spark: [7, 7, 7, 7] }, 7);
  assert.ok(html.includes('kpi__spark'), 'série válida ainda desenha');
  assert.ok(!html.includes('NaN') && !html.includes('Infinity'), 'nada de NaN/Infinity nos pontos');
});

test('kpi herói: valores não numéricos na série não viram NaN no SVG', () => {
  const html = renderKpi({ label: 'Leads', hero: true, spark: [10, null, 'x', 22, undefined, 31] }, 63);
  assert.ok(!html.includes('NaN'), 'sanitiza a série antes de desenhar');
});

test('kpi herói: coluna não mapeada não ganha sparkline (série seria zero falso)', () => {
  // Mesma regra que já vale para trend/goal: sem coluna mapeada o valor é 0 por fallback,
  // e desenhar um gráfico disso mostra dado que não existe.
  const html = renderKpi({ label: 'CPL', hero: true, unmapped: true, spark: [1, 2, 3, 4] }, 0);
  assert.ok(!html.includes('kpi__spark'), 'sem coluna mapeada, não desenha série');
  assert.ok(html.includes('-'), 'continua mostrando o traço');
});

test('kpi herói: sparkline não injeta HTML pela série', () => {
  const html = renderKpi({ label: 'X', hero: true, spark: ['"><script>alert(1)</script>', 2, 3] }, 3);
  assert.ok(!html.includes('<script'), 'série não pode injetar tag');
});

// ---------- a ligação que faltava: o template DIZ qual é a métrica principal ----------
import { renderKpiBlock } from '../public/assets/js/dashboard.js';

const TPL = {
  primaryMetric: 'leads',
  metrics: [
    { key: 'investimento', label: 'Investimento', format: 'currency' },
    { key: 'leads', label: 'Leads', format: 'integer' },
    { key: 'CPL', label: 'CPL', format: 'currency' },
  ],
};
const ITENS = [
  { widget: 'kpi', props: { metricKey: 'investimento' } },
  { widget: 'kpi', props: { metricKey: 'leads' } },
  { widget: 'kpi', props: { metricKey: 'CPL' } },
];
const VALORES = { investimento: 13990.5, leads: 1001, CPL: 13.98 };

test('bloco de kpi: o primaryMetric do template vira o herói', () => {
  const html = renderKpiBlock(ITENS, TPL, VALORES);
  assert.equal((html.match(/kpi--hero/g) || []).length, 1, 'exatamente um herói');
  // o herói tem que ser o card de Leads, não o primeiro da lista
  const heroi = html.slice(html.indexOf('kpi--hero'));
  assert.ok(heroi.slice(0, 200).includes('Leads'), 'o herói é a métrica declarada, não a primeira');
});

test('bloco de kpi: primaryMetric ausente do bloco não promove ninguém', () => {
  const html = renderKpiBlock(ITENS, { ...TPL, primaryMetric: 'receita' }, VALORES);
  assert.ok(!html.includes('kpi--hero'), 'não elege um herói arbitrário');
});

test('bloco de kpi: template sem primaryMetric não quebra nem promove', () => {
  const html = renderKpiBlock(ITENS, { metrics: TPL.metrics }, VALORES);
  assert.ok(!html.includes('kpi--hero'));
  assert.ok(html.includes('1.001'), 'segue renderizando normal');
});

test('bloco de kpi: com menos de 3 kpis não há herói (faixa curta demais para hierarquia)', () => {
  const dois = ITENS.slice(0, 2);
  const html = renderKpiBlock(dois, { ...TPL, primaryMetric: 'investimento' }, VALORES);
  assert.ok(!html.includes('kpi--hero'), 'hierarquia só faz sentido com faixa cheia');
});

test('bloco de kpi: herói com coluna não mapeada não vira herói (seria destaque de zero falso)', () => {
  const html = renderKpiBlock(ITENS, TPL, VALORES, { leads: false });
  assert.ok(!html.includes('kpi--hero'), 'não destaca métrica sem dado');
});

test('bloco de kpi: a série do herói chega na sparkline', () => {
  const html = renderKpiBlock(ITENS, TPL, VALORES, {}, {}, null, { leads: [10, 20, 15, 31] });
  assert.ok(html.includes('kpi__spark'), 'sparkline do herói desenhada');
  // só o herói ganha série, mesmo que outras métricas venham no mapa
  const html2 = renderKpiBlock(ITENS, TPL, VALORES, {}, {}, null, { leads: [1, 2, 3], CPL: [4, 5, 6] });
  assert.equal((html2.match(/kpi__spark/g) || []).length, 1, 'sparkline só no herói');
});

// ---------- a série do herói: só existe quando é honesto calcular ----------
import { sparkForHero } from '../public/assets/js/dashboard.js';

const ROWS = [
  { Data: '01/07/2026', Leads: '10', Receita: '100', Investimento: '50' },
  { Data: '02/07/2026', Leads: '14', Receita: '180', Investimento: '60' },
  { Data: '03/07/2026', Leads: '9', Receita: '90', Investimento: '55' },
];
const COLMAP = { data: 'Data', leads: 'Leads', receita: 'Receita', investimento: 'Investimento' };
const TPL_BASE = {
  primaryMetric: 'leads',
  dateSlot: 'data',
  metrics: [{ key: 'leads', label: 'Leads', agg: 'sum', column: 'leads', format: 'integer' }],
};

test('sparkForHero: métrica base com coluna vira série na ordem do tempo', () => {
  const s = sparkForHero(TPL_BASE, ROWS, COLMAP);
  assert.deepEqual(s.leads, [10, 14, 9], 'um ponto por dia, na ordem');
});

test('sparkForHero: métrica DERIVADA não vira série (ROAS por dia não é a soma do ROAS)', () => {
  const tpl = {
    primaryMetric: 'ROAS',
    dateSlot: 'data',
    metrics: [{ key: 'ROAS', label: 'ROAS', agg: 'derived', format: 'number' }],
  };
  assert.deepEqual(sparkForHero(tpl, ROWS, COLMAP), {}, 'derivada sem coluna não gera série');
});

test('sparkForHero: sem primaryMetric, sem dateSlot ou sem linhas devolve vazio', () => {
  assert.deepEqual(sparkForHero({ metrics: [] }, ROWS, COLMAP), {});
  assert.deepEqual(sparkForHero({ ...TPL_BASE, dateSlot: undefined }, ROWS, COLMAP), {});
  assert.deepEqual(sparkForHero(TPL_BASE, [], COLMAP), {});
  assert.deepEqual(sparkForHero(TPL_BASE, null, COLMAP), {});
});

test('sparkForHero: coluna do herói fora do colMap devolve vazio (não inventa série de zeros)', () => {
  assert.deepEqual(sparkForHero(TPL_BASE, ROWS, { data: 'Data' }), {});
});

test('sparkForHero: um único dia não vira série (linha de 1 ponto não é tendência)', () => {
  assert.deepEqual(sparkForHero(TPL_BASE, [ROWS[0]], COLMAP), {});
});

// ---------- o grid precisa CABER o herói ----------
// Regressão real (26/08/2026): o herói com span 2 estourou o `auto-fit` da faixa e empurrou o
// último KPI para uma segunda linha, com um bloco cinza vazio do lado. Os testes passaram e o
// gate automático também: só o screenshot mostrou. Agora a contagem de colunas é explícita.
test('bloco de kpi: com herói, declara quantas colunas a faixa precisa (n+1)', () => {
  const html = renderKpiBlock(ITENS, TPL, VALORES);
  assert.match(html, /--kpi-cols:\s*4/, '3 KPIs + herói ocupando 2 = 4 unidades');
});

test('bloco de kpi: sem herói, a contagem é o número de cards', () => {
  const html = renderKpiBlock(ITENS, { metrics: TPL.metrics }, VALORES);
  assert.match(html, /--kpi-cols:\s*3/, 'sem herói, 3 cards = 3 unidades');
});

// ---------- variação neutra: informar sem julgar ----------
// O card de Investimento era o único sem a linha de variação, porque a métrica não declara
// `betterWhen` (gastar mais não é bom nem ruim por si: depende do retorno). O efeito visual
// era um card órfão no meio da faixa. A variação passa a aparecer em tom NEUTRO: a informação
// existe, o julgamento de valor é que não.
import { buildTrends } from '../public/assets/js/dashboard.js';

const M_NEUTRA = [{ key: 'investimento', label: 'Investimento', agg: 'sum', column: 'investimento', format: 'currency' }];
const M_JULGADA = [{ key: 'leads', label: 'Leads', agg: 'sum', column: 'leads', format: 'integer', betterWhen: 'higher' }];
const CUR = [{ investimento: '120', leads: '30' }];
const PREV = [{ investimento: '100', leads: '20' }];
const CM = { investimento: 'investimento', leads: 'leads' };

test('buildTrends: métrica sem betterWhen ganha variação NEUTRA (não some)', () => {
  const t = buildTrends(M_NEUTRA, CUR, PREV, CM);
  assert.ok(t.investimento, 'a variação existe');
  assert.equal(t.investimento.neutral, true, 'marcada como neutra');
  assert.ok(t.investimento.text.includes('20'), 'mostra os 20% de variação');
});

test('buildTrends: métrica com betterWhen continua julgada (verde/vermelho)', () => {
  const t = buildTrends(M_JULGADA, CUR, PREV, CM);
  assert.equal(t.leads.good, true, 'subir leads é bom');
  assert.ok(!t.leads.neutral, 'não é neutra');
});

test('kpi: variação neutra não pinta de verde nem de vermelho', () => {
  const html = renderKpi({ label: 'Investimento', trend: { text: '▲ 20,0%', neutral: true } }, 120);
  assert.ok(html.includes('is-neutral'), 'classe neutra presente');
  assert.ok(!html.includes('is-good') && !html.includes('is-bad'), 'sem cor de julgamento');
});
