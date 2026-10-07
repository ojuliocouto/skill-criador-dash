// Efeito 1 (gráfico que responde): a parte com conta. Qual dia está mais perto do ponteiro, onde
// a etiqueta fica (nunca em cima do ponto que ela descreve) e como o rótulo é escrito.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { indiceMaisProximo, posicaoDaDica, rotuloDaDica, diaDaSemanaCurto, DURACAO_DA_REGUA }
  from '../public/assets/js/lib/grafico-responde.js';
import { render as renderSerie } from '../public/assets/js/widgets/timeseries.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

test('indiceMaisProximo: acha o dia do ponto mais perto do ponteiro', () => {
  const xs = [48, 100, 152, 204, 256];
  assert.equal(indiceMaisProximo(xs, 0), 0);
  assert.equal(indiceMaisProximo(xs, 70), 0);
  assert.equal(indiceMaisProximo(xs, 80), 1);
  assert.equal(indiceMaisProximo(xs, 204), 3);
  assert.equal(indiceMaisProximo(xs, 9999), 4);
  assert.equal(indiceMaisProximo([], 10), -1);
  assert.equal(indiceMaisProximo([5], 500), 0);
});

test('indiceMaisProximo: no meio exato entre dois dias fica com o da esquerda (não pisca)', () => {
  assert.equal(indiceMaisProximo([0, 10], 5), 0);
});

test('posicaoDaDica: etiqueta no topo do desenho, centrada, sem sair da caixa e longe do ponto', () => {
  const caixa = { w: 600, h: 240 };
  const dica = { w: 120, h: 44 };
  const p = posicaoDaDica({ ponto: { x: 300, y: 150 }, dica, caixa });
  assert.equal(p.abaixo, false);
  assert.equal(p.x, 240);
  assert.equal(p.y, 4);
  assert.ok(150 - (p.y + dica.h) >= 14, 'termina com folga antes do ponto: não cobre o valor que descreve');
  const comTopo = posicaoDaDica({ ponto: { x: 300, y: 150 }, dica, caixa, topo: 40 });
  assert.equal(comTopo.y, 44);
  const esq = posicaoDaDica({ ponto: { x: 10, y: 150 }, dica, caixa });
  assert.equal(esq.x, 0);
  const dir = posicaoDaDica({ ponto: { x: 595, y: 150 }, dica, caixa });
  assert.equal(dir.x, 480);
});

test('posicaoDaDica: ponto perto do topo, a etiqueta vai pra baixo dele', () => {
  const p = posicaoDaDica({ ponto: { x: 300, y: 20 }, dica: { w: 120, h: 44 }, caixa: { w: 600, h: 240 } });
  assert.equal(p.abaixo, true);
  assert.ok(p.y > 20, 'começa depois do ponto');
});

test('diaDaSemanaCurto e rotuloDaDica: data brasileira com dia da semana e valor no formato da série', () => {
  assert.equal(diaDaSemanaCurto('2026-10-03'), 'sáb');
  assert.equal(diaDaSemanaCurto('2026-10-05'), 'seg');
  assert.equal(diaDaSemanaCurto('lixo'), '');
  const r = rotuloDaDica('2026-10-03', 1234.5, 'currency');
  assert.equal(r.data, 'sáb, 03/10');
  assert.match(r.valor, /^R\$\s1\.234,50$/);
  const n = rotuloDaDica('2026-10-03', 74, 'integer');
  assert.equal(n.valor, '74');
  assert.equal(rotuloDaDica('', 5, 'number').data, '');
});

test('a régua desliza em 80 a 200 ms (dentro da régua de interação do kit)', () => {
  assert.ok(DURACAO_DA_REGUA >= 80 && DURACAO_DA_REGUA <= 200);
});

test('timeseries: cada ponto leva a data e o valor em atributo, o formato vai no SVG', () => {
  const html = renderSerie({ title: 'Leads', format: 'integer' }, [
    { date: '2026-10-01', value: 10 }, { date: '2026-10-02', value: 14 }, { date: '2026-10-03', value: 9 },
  ]);
  assert.equal([...html.matchAll(/data-d="2026-10-0\d"/g)].length, 3);
  assert.equal([...html.matchAll(/data-v="\d+"/g)].length, 3);
  assert.match(html, /data-formato="integer"/);
});

test('travas do CSS: a régua e a etiqueta só animam transform e opacity, sem gradiente', () => {
  const css = readFileSync(join(raiz, 'public/assets/css/efeitos.css'), 'utf8');
  const bloco = css.slice(css.indexOf('/* EFEITO 1'), css.indexOf('/* EFEITO 2') > 0 ? css.indexOf('/* EFEITO 2') : undefined);
  assert.ok(bloco.length > 100, 'bloco do efeito 1 existe');
  assert.ok(!/gradient\(|blur\(|filter:/.test(bloco));
  for (const m of bloco.matchAll(/transition\s*:\s*([^;]+);/g)) {
    for (const parte of m[1].split(',')) assert.match(parte.trim().split(/\s+/)[0], /^(transform|opacity|none)$/);
  }
});
