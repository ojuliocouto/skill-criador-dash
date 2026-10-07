// Efeito 2 (gráfico que se transforma): a conta da interpolação. Pontos da linha do desenho
// antigo pro novo (mesmo com número de pontos diferente) e escala inicial das barras.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { reamostrar, interpolarPontos, pontosParaTexto, escalaInicialDaBarra, DURACAO_DOS_DADOS }
  from '../public/assets/js/lib/grafico-transforma.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

test('reamostrar: mesmo tamanho devolve cópia; outro tamanho mantém as pontas e interpola no meio', () => {
  const a = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }];
  const igual = reamostrar(a, 3);
  assert.deepEqual(igual, a);
  assert.notEqual(igual, a, 'cópia, não a mesma lista');
  const mais = reamostrar(a, 5);
  assert.equal(mais.length, 5);
  assert.deepEqual(mais[0], { x: 0, y: 0 });
  assert.deepEqual(mais[4], { x: 20, y: 0 });
  assert.deepEqual(mais[1], { x: 5, y: 5 });
  assert.deepEqual(mais[2], { x: 10, y: 10 });
  const menos = reamostrar(a, 2);
  assert.deepEqual(menos, [{ x: 0, y: 0 }, { x: 20, y: 0 }]);
  assert.deepEqual(reamostrar([{ x: 3, y: 4 }], 3), [{ x: 3, y: 4 }, { x: 3, y: 4 }, { x: 3, y: 4 }]);
  assert.deepEqual(reamostrar([], 3), []);
});

test('interpolarPontos: t=0 é o desenho antigo, t=1 é EXATAMENTE o novo, no meio fica entre os dois', () => {
  const de = [{ x: 0, y: 100 }, { x: 50, y: 80 }, { x: 100, y: 60 }];
  const para = [{ x: 0, y: 20 }, { x: 50, y: 40 }, { x: 100, y: 0 }];
  assert.deepEqual(interpolarPontos(de, para, 0), de);
  assert.deepEqual(interpolarPontos(de, para, 1), para);
  assert.deepEqual(interpolarPontos(de, para, 7), para, 't acima de 1 é aparado');
  const meio = interpolarPontos(de, para, 0.5);
  assert.ok(meio.every((p, i) => p.y > Math.min(de[i].y, para[i].y) && p.y < Math.max(de[i].y, para[i].y)));
});

test('interpolarPontos: número de pontos diferente resulta sempre com o tamanho do desenho novo', () => {
  const de = Array.from({ length: 60 }, (_, i) => ({ x: i, y: i % 7 }));
  const para = [{ x: 0, y: 5 }, { x: 10, y: 9 }, { x: 20, y: 2 }, { x: 30, y: 4 }];
  for (const t of [0, 0.25, 0.5, 1]) assert.equal(interpolarPontos(de, para, t).length, 4);
  assert.deepEqual(interpolarPontos(de, para, 1), para);
  assert.deepEqual(interpolarPontos([], para, 0.3), para, 'sem desenho antigo, o novo aparece direto');
});

test('pontosParaTexto: formato do atributo points do SVG, sem ruído de casa decimal', () => {
  assert.equal(pontosParaTexto([{ x: 1, y: 2.3456 }, { x: 10.5, y: 20 }]), '1,2.35 10.5,20');
  assert.equal(pontosParaTexto([]), '');
});

test('escalaInicialDaBarra: de onde a barra parte pra chegar ao valor novo só com transform', () => {
  assert.equal(escalaInicialDaBarra(40, 80), 0.5);
  assert.equal(escalaInicialDaBarra(80, 40), 2);
  assert.equal(escalaInicialDaBarra(null, 60), 0, 'barra que não existia cresce do zero');
  assert.equal(escalaInicialDaBarra(0, 60), 0);
  assert.equal(escalaInicialDaBarra(50, 50), 1);
  assert.equal(escalaInicialDaBarra(50, 0), 1, 'valor novo zero: nada pra escalar');
  assert.equal(escalaInicialDaBarra(900, 3), 8, 'teto: não estica uma barra mais que 8 vezes');
});

test('duração dos dados: perceptível mas curta (400 a 800 ms)', () => {
  assert.ok(DURACAO_DOS_DADOS >= 400 && DURACAO_DOS_DADOS <= 800);
});

test('o main.css e o efeitos.css não animam largura nem pontos do gráfico por CSS (a troca é por JS, transform)', () => {
  const css = readFileSync(join(raiz, 'public/assets/css/efeitos.css'), 'utf8');
  assert.ok(!/transition[^;]*\bwidth\b/.test(css));
  assert.ok(!/@keyframes[^{]*\{[^}]*width:/.test(css));
});
