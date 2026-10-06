// Print real no celular (05/10/2026): o gráfico de linha em cartão de largura total era
// desenhado num quadro de 1400 x 240 e encolhido pra caber em 318 px, virando uma tirinha de
// 55 px de altura no meio de um cartão de 240, com os números do eixo ilegíveis. A proporção
// do desenho passa a seguir a largura REAL da tela quando ela é estreita, não só o `col`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { render as renderTimeseries, larguraDoDesenho } from '../public/assets/js/widgets/timeseries.js';
import { registry } from '../public/assets/js/widgets/index.js';

const PONTOS = [{ date: '2026-09-05', value: 10 }, { date: '2026-09-06', value: 30 }, { date: '2026-09-07', value: 20 }];
const viewBoxDe = (html) => Number((html.match(/viewBox="0 0 (\d+) 240"/) || [])[1]);

test('larguraDoDesenho: sem largura de tela, vale o col (comportamento de sempre)', () => {
  assert.equal(larguraDoDesenho(12), 1400);
  assert.equal(larguraDoDesenho(10), 1200);
  assert.equal(larguraDoDesenho(8), 900);
  assert.equal(larguraDoDesenho(6), 600);
  assert.equal(larguraDoDesenho(undefined), 600);
  assert.equal(larguraDoDesenho(12, undefined), 1400);
  assert.equal(larguraDoDesenho(12, 0), 1400);
});

test('larguraDoDesenho: tela larga não muda nada', () => {
  assert.equal(larguraDoDesenho(12, 1440), 1400);
  assert.equal(larguraDoDesenho(6, 1440), 600);
  assert.equal(larguraDoDesenho(12, 901), 1400);
});

test('larguraDoDesenho: tela estreita manda mais que o col (a célula ocupa a largura toda)', () => {
  assert.equal(larguraDoDesenho(12, 390), 360, 'celular: quadro quase do tamanho da tela');
  assert.equal(larguraDoDesenho(6, 390), 360);
  assert.equal(larguraDoDesenho(12, 620), 360);
  assert.equal(larguraDoDesenho(12, 700), 600);
  assert.equal(larguraDoDesenho(12, 768), 900);
  assert.equal(larguraDoDesenho(6, 900), 900);
});

test('gráfico: no celular o quadro é de 360 e no desktop continua o do col', () => {
  assert.equal(viewBoxDe(renderTimeseries({ col: 12, screenWidth: 390 }, PONTOS)), 360);
  assert.equal(viewBoxDe(renderTimeseries({ col: 12, screenWidth: 1440 }, PONTOS)), 1400);
  assert.equal(viewBoxDe(renderTimeseries({ col: 12 }, PONTOS)), 1400);
  assert.equal(viewBoxDe(renderTimeseries({}, PONTOS)), 600);
});

test('gráfico: no quadro estreito os pontos continuam dentro do desenho', () => {
  const html = renderTimeseries({ col: 12, screenWidth: 390 }, PONTOS);
  const xs = [...html.matchAll(/<circle[^>]*cx="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.equal(xs.length, 3);
  assert.ok(xs.every((x) => x >= 0 && x <= 360), `pontos fora do quadro: ${xs}`);
});

test('registry: a largura da tela chega no gráfico pelo ctx', () => {
  const template = { slots: [], metrics: [{ key: 'v', agg: 'sum', column: 'v' }] };
  const dataset = { columns: ['D', 'V'], rows: [{ D: '2026-09-05', V: '10' }, { D: '2026-09-06', V: '30' }] };
  const base = { template, dataset, colMap: { data: 'D', v: 'V' }, findMetricDef: (t, k) => t.metrics.find((m) => m.key === k), card: (t, h) => h };
  const item = { widget: 'timeseries', col: 12, props: { dateSlot: 'data', valueSlot: 'v' } };
  assert.equal(viewBoxDe(registry.timeseries.toHtml(item, { ...base, larguraDaTela: 390 })), 360);
  assert.equal(viewBoxDe(registry.timeseries.toHtml(item, base)), 1400);
});
