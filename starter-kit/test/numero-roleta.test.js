// Efeito 3 (números de roleta): a conta dos dígitos. Quais caracteres rolam, de qual dígito pra
// qual, em que direção, e o quanto cada coluna espera pra começar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { planoDaRoleta, direcaoDaRoleta, caminhoDoDigito, atrasoDoDigito, DURACAO_DA_ROLETA, CELULAS_DA_TIRA, tiraDoDigito }
  from '../public/assets/js/lib/numero-roleta.js';

test('direcaoDaRoleta: valor subiu rola pra cima (1), desceu rola pra baixo (-1), igual ou inválido sobe', () => {
  assert.equal(direcaoDaRoleta(10, 20), 1);
  assert.equal(direcaoDaRoleta(20, 10), -1);
  assert.equal(direcaoDaRoleta(5, 5), 1);
  assert.equal(direcaoDaRoleta(NaN, 5), 1);
});

test('caminhoDoDigito: sobe de 3 a 7 passa por 4, 5, 6; 9 pra 2 dando a volta passa por 0 e 1', () => {
  assert.deepEqual(caminhoDoDigito(3, 7, 1), { inicio: 3, fim: 7 });
  assert.deepEqual(caminhoDoDigito(9, 2, 1), { inicio: 9, fim: 12 });
  assert.deepEqual(caminhoDoDigito(7, 3, -1), { inicio: 17, fim: 13 });
  assert.deepEqual(caminhoDoDigito(2, 9, -1), { inicio: 12, fim: 9 });
  // O dígito mostrado no início e no fim da tira é o certo, em qualquer caso.
  for (let de = 0; de < 10; de++) for (let para = 0; para < 10; para++) for (const dir of [1, -1]) {
    const c = caminhoDoDigito(de, para, dir);
    assert.equal(c.inicio % 10, de);
    assert.equal(c.fim % 10, para);
    assert.ok(c.inicio >= 0 && c.inicio < CELULAS_DA_TIRA && c.fim >= 0 && c.fim < CELULAS_DA_TIRA);
    assert.ok(dir === 1 ? c.fim >= c.inicio : c.fim <= c.inicio, 'anda na direção pedida');
  }
});

test('planoDaRoleta: só rola o dígito que mudou; símbolos e separadores ficam parados', () => {
  const p = planoDaRoleta('R$ 1.234,50', 'R$ 1.834,50');
  assert.equal(p.map((c) => c.ch).join(''), 'R$ 1.834,50');
  const rolam = p.filter((c) => c.tipo === 'rola');
  assert.equal(rolam.length, 1);
  assert.deepEqual([rolam[0].de, rolam[0].para], [2, 8]);
  assert.ok(p.filter((c) => !/\d/.test(c.ch)).every((c) => c.tipo === 'fixo'));
});

test('planoDaRoleta: alinha pela direita; dígito a mais é novo, dígito a menos some sem inventar coluna', () => {
  const mais = planoDaRoleta('950', '1.050');
  assert.equal(mais.map((c) => c.ch).join(''), '1.050');
  assert.equal(mais[0].tipo, 'novo');
  assert.equal(mais[0].para, 1);
  assert.equal(mais[1].tipo, 'fixo');
  const menos = planoDaRoleta('1.050', '950');
  assert.equal(menos.length, 3);
  assert.deepEqual(menos.map((c) => c.tipo), ['rola', 'fixo', 'fixo']);
});

test('planoDaRoleta: texto igual não rola nada; texto antigo vazio faz todo dígito ser novo', () => {
  assert.ok(planoDaRoleta('74', '74').every((c) => c.tipo === 'fixo'));
  assert.ok(planoDaRoleta('', '74').every((c) => c.tipo === 'novo'));
  assert.deepEqual(planoDaRoleta('74', ''), []);
});

test('o texto que o plano monta é sempre o valor final, caractere por caractere', () => {
  const casos = [['0', '4.472'], ['R$ 102.512,51', 'R$ 17.230,10'], ['2,17', '2,24'], ['12,50%', '9,03%']];
  for (const [a, b] of casos) assert.equal(planoDaRoleta(a, b).map((c) => c.ch).join(''), b);
});

test('atrasoDoDigito: o da direita sai primeiro, com teto, e tudo cabe em menos de 900 ms', () => {
  assert.equal(atrasoDoDigito(0), 0);
  assert.ok(atrasoDoDigito(3) > atrasoDoDigito(1));
  assert.equal(atrasoDoDigito(40), atrasoDoDigito(6), 'teto');
  assert.ok(DURACAO_DA_ROLETA + atrasoDoDigito(99) < 900);
  assert.ok(DURACAO_DA_ROLETA >= 400);
});

// ---------------------------------------------------------------- roleta limpa (3.7.0)

test('tiraDoDigito: a casa tem só duas células, o dígito que sai e o que entra, nunca um dígito de passagem', () => {
  assert.deepEqual(tiraDoDigito(3, 7, 1), { celulas: [3, 7], de: 0, para: -50 });
  assert.deepEqual(tiraDoDigito(3, 7, -1), { celulas: [7, 3], de: -50, para: 0 });
  assert.deepEqual(tiraDoDigito(9, 0, 1), { celulas: [9, 0], de: 0, para: -50 });
  for (let de = 0; de < 10; de++) for (let para = 0; para < 10; para++) {
    if (de === para) continue;
    for (const dir of [1, -1]) {
      const t = tiraDoDigito(de, para, dir);
      assert.equal(t.celulas.length, 2);
      assert.deepEqual([...t.celulas].sort(), [de, para].sort());
      // sobe: o novo entra por baixo (a tira anda -50%); desce: o novo entra por cima (anda +50%)
      assert.equal(t.para - t.de, dir === 1 ? -50 : 50);
    }
  }
});

test('CSS da roleta: cada casa tem a própria máscara de uma linha, com dígitos de largura igual', () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/assets/css/efeitos.css'), 'utf8');
  const bloco = css.slice(css.indexOf('/* EFEITO 3'), css.indexOf('/* EFEITO 4'));
  assert.match(bloco, /\.rd--col[^}]*overflow: hidden/);
  assert.match(bloco, /\.rd--col[^}]*height: 1\.15em/);
  assert.match(bloco, /tabular-nums/);
});
