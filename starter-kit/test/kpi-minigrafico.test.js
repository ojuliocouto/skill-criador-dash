// Layout de fábrica sem cartão meio vazio (3.7.1, D13 e decisão do coordenador): quando o número em destaque é largo
// (com sparkline), os cartões vizinhos ganham um minigráfico de tendência do período com a variação ao lado, em vez de
// esticar vazios. Indicador sem série no tempo fica sem minigráfico e com a altura do conteúdo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render as renderKpi } from '../public/assets/js/widgets/kpi.js';
import { renderKpiBlock, sparksDaFaixa, sparkForHero } from '../public/assets/js/dashboard.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(raiz, 'public/assets/css/main.css'), 'utf8');
const SERIE = [3, 5, 4, 8, 6, 9];

test('cartão vizinho com série: ganha kpi--mini, o minigráfico e a variação juntos na mesma linha', () => {
  const h = renderKpi({ label: 'CPL', format: 'currency', mini: true, spark: SERIE, trend: { text: '▼ 7,38%', good: true } }, 26);
  assert.match(h, /class="kpi kpi--mini/);
  assert.match(h, /<div class="kpi__linha">\s*<svg class="kpi__spark"/);
  assert.match(h, /kpi__linha">.*kpi__trend.*vs\. início.*<\/div><\/div>/s);
});

test('cartão vizinho sem série (ou com 1 ponto): sem minigráfico, sem linha, altura do conteúdo', () => {
  for (const spark of [undefined, [], [4], ['x', 'y']]) {
    const h = renderKpi({ label: 'Taxa', format: 'percent', mini: true, spark, trend: { text: '▲ 1%', good: true } }, 3);
    assert.doesNotMatch(h, /kpi--mini|kpi__linha|kpi__spark/);
    assert.match(h, /kpi__trend/);
  }
});

test('indicador sem coluna (não mapeado) nunca ganha minigráfico', () => {
  assert.doesNotMatch(renderKpi({ label: 'X', mini: true, spark: SERIE, unmapped: true }, 0), /kpi__spark/);
});

test('o destaque continua igual (sem linha, minigráfico direto)', () => {
  const h = renderKpi({ label: 'Leads', format: 'integer', hero: true, spark: SERIE, trend: { text: '▲ 5%', good: true } }, 99);
  assert.match(h, /kpi--hero/);
  assert.doesNotMatch(h, /kpi__linha|kpi--mini/);
  assert.match(h, /kpi__spark/);
});

// Modelo próprio do teste: a biblioteca não depende do layout nem do destaque de fábrica de nenhum domínio.
const marketing = {
  id: 'teste', primaryMetric: 'leads', dateSlot: 'data',
  metrics: [
    { key: 'investimento', label: 'Investimento', agg: 'sum', column: 'investimento', format: 'currency' },
    { key: 'leads', label: 'Leads', agg: 'sum', column: 'leads', format: 'integer', betterWhen: 'higher' },
    { key: 'conversoes', label: 'Conversões', agg: 'sum', column: 'conversoes', format: 'integer', betterWhen: 'higher' },
    { key: 'receita', label: 'Receita', agg: 'sum', column: 'receita', format: 'currency', betterWhen: 'higher' },
    { key: 'CPL', label: 'CPL', agg: 'ratio', ratioOf: ['investimento', 'leads'], format: 'currency', betterWhen: 'lower' },
    { key: 'CPA', label: 'CPA', agg: 'ratio', ratioOf: ['investimento', 'conversoes'], format: 'currency', betterWhen: 'lower' },
    { key: 'ROAS', label: 'ROAS', agg: 'derived', format: 'number', betterWhen: 'higher', dependsOn: ['receita', 'investimento'], denominator: 'investimento',
      compute: ({ computed }) => (computed.investimento ? computed.receita / computed.investimento : 0) },
  ],
};
const itens = ['investimento', 'leads', 'CPL', 'conversoes', 'CPA', 'receita', 'ROAS'].map((metricKey) => ({ widget: 'kpi', props: { metricKey } }));
const computed = { investimento: 1000, leads: 40, CPL: 25, conversoes: 8, CPA: 125, receita: 4000, ROAS: 4 };
const SPARKS = { leads: SERIE, investimento: SERIE, CPL: SERIE, conversoes: SERIE, CPA: SERIE, receita: SERIE };

test('com destaque largo: todo vizinho que tem série vira mini; ROAS, sem série, fica sem', () => {
  const h = renderKpiBlock(itens, marketing, computed, {}, {}, null, SPARKS);
  assert.equal((h.match(/kpi--mini/g) || []).length, 5, 'investimento, CPL, conversões, CPA e receita');
  assert.equal((h.match(/kpi--hero/g) || []).length, 1);
  const roas = h.split('<div class="kpi').find((p) => p.includes('>ROAS<'));
  assert.ok(roas && !/kpi__spark/.test(roas), 'ROAS não tem série e não ganha minigráfico');
});

test('sem destaque largo (sem série do destaque): ninguém ganha minigráfico, a faixa é a de sempre', () => {
  const { leads, ...semHeroi } = SPARKS;
  const h = renderKpiBlock(itens, marketing, computed, {}, {}, null, semHeroi);
  assert.doesNotMatch(h, /kpi--mini|kpi__spark/);
});

const dias = Array.from({ length: 8 }, (_, i) => `0${i + 1}/07/2026`);
const rows = dias.flatMap((d, i) => ['Instagram', 'Google'].map((c) => ({ data: d, canal: c, investimento: String(100 + i * 10), leads: String(5 + (i % 3)), conversoes: String(1 + (i % 2)), receita: String(300 + i * 20) })));
const colMap = { data: 'data', canal: 'canal', investimento: 'investimento', leads: 'leads', conversoes: 'conversoes', receita: 'receita' };

test('sparksDaFaixa: série por dia para coluna e para derivada (CPL), uma entrada por chave pedida', () => {
  const s = sparksDaFaixa(marketing, rows, colMap, ['investimento', 'leads', 'CPL', 'ROAS']);
  assert.equal(s.investimento.length, 8);
  assert.equal(s.leads.length, 8);
  assert.equal(s.CPL.length, 8, 'CPL dia a dia: investimento sobre leads de cada dia');
  assert.ok(s.ROAS.length >= 2, 'ROAS é derivada com dependências: série dia a dia');
});

test('sparksDaFaixa: coluna sem mapeamento, um único dia ou denominador zero em todo dia não geram série', () => {
  assert.deepEqual(Object.keys(sparksDaFaixa(marketing, rows, { ...colMap, leads: undefined }, ['leads', 'CPL'])), []);
  assert.deepEqual(sparksDaFaixa(marketing, rows.slice(0, 2), colMap, ['leads']), {});
  const zero = rows.map((r) => ({ ...r, leads: '0' }));
  assert.equal(sparksDaFaixa(marketing, zero, colMap, ['CPL']).CPL, undefined);
});

test('sparkForHero continua devolvendo só a série do destaque', () => {
  assert.deepEqual(Object.keys(sparkForHero(marketing, rows, colMap)), ['leads']);
});

test('CSS: o minigráfico do vizinho ocupa o espaço que sobra do cartão e usa a cor de texto secundária, sem eixo', () => {
  assert.match(css, /\.kpi--mini\s*\{[^}]*display:\s*flex/);
  assert.match(css, /\.kpi--mini \.kpi__linha\s*\{[^}]*flex:\s*1/);
  assert.match(css, /\.kpi--mini \.kpi__spark polyline\s*\{[^}]*stroke:\s*var\(--text-dim\)/);
});

test('CSS: em tela estreita o minigráfico passa para cima da variação e, se não couber, some sozinho', () => {
  assert.match(css, /@container \(max-width: 230px\)[^{]*\{[^}]*\.kpi--mini \.kpi__linha[^}]*flex-direction:\s*column/s);
  assert.match(css, /@container \(max-width: 120px\)[^{]*\{[^}]*\.kpi--mini \.kpi__spark\s*\{\s*display:\s*none/s);
});

test('CSS: no celular os cartões ficam em 2 colunas (o último, se ímpar, cresce e ocupa a linha: sem buraco cinza)', () => {
  const m = css.match(/@media \(max-width: 560px\)\s*\{(?:\s*\/\*.*?\*\/)?\s*\.grid\.kpis > \* \{([^}]*)\}/s);
  assert.ok(m, 'regra do celular da faixa');
  assert.match(m[1], /flex-basis:\s*calc\(50%/);
  assert.doesNotMatch(css.match(/\.grid\.kpis > \* \{ flex: ([^}]*)\}/)[1], /flex-grow:\s*0|^0 /, 'os cartões crescem para preencher a linha');
});

test('CSS: o traço se desenha na abertura SÓ com movimento permitido, em todo minigráfico', () => {
  const bloco = css.slice(css.indexOf('@media (prefers-reduced-motion: no-preference)'));
  assert.match(bloco, /\.anima-entrada \.kpi__spark polyline\s*\{[^}]*stroke-dasharray/);
  const fora = css.slice(0, css.indexOf('@media (prefers-reduced-motion: no-preference)'));
  assert.doesNotMatch(fora, /anima-entrada \.kpi__spark polyline/);
});
