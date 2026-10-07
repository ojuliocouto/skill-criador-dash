// Efeito 7 (tabela que reordena): a conta da ordenação. Número, data brasileira e texto, estável
// no empate, com a terceira volta devolvendo a ordem original.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { valorDeOrdenacao, ordemDasLinhas, proximaDirecao } from '../public/assets/js/lib/tabela-ordena.js';

test('valorDeOrdenacao: número brasileiro, moeda e porcentagem viram número; data vira ISO; resto é texto', () => {
  assert.deepEqual(valorDeOrdenacao('R$ 1.234,56'), { tipo: 'num', v: 1234.56 });
  assert.deepEqual(valorDeOrdenacao('4.472'), { tipo: 'num', v: 4472 });
  assert.deepEqual(valorDeOrdenacao('12,5%'), { tipo: 'num', v: 12.5 });
  assert.deepEqual(valorDeOrdenacao('05/10/2026'), { tipo: 'data', v: '2026-10-05' });
  assert.deepEqual(valorDeOrdenacao('2026-10-05'), { tipo: 'data', v: '2026-10-05' });
  assert.deepEqual(valorDeOrdenacao('Instagram'), { tipo: 'texto', v: 'instagram' });
  assert.deepEqual(valorDeOrdenacao(''), { tipo: 'vazio', v: null });
  assert.deepEqual(valorDeOrdenacao('sem dado'), { tipo: 'texto', v: 'sem dado' });
});

test('ordemDasLinhas: crescente e decrescente por número, não por texto (9 vem antes de 10)', () => {
  const col = ['10', '9', '100', '2'];
  assert.deepEqual(ordemDasLinhas(col, 'asc'), [3, 1, 0, 2]);
  assert.deepEqual(ordemDasLinhas(col, 'desc'), [2, 0, 1, 3]);
});

test('ordemDasLinhas: data brasileira ordena no calendário, não por dia', () => {
  const col = ['02/09/2026', '15/08/2026', '01/10/2026'];
  assert.deepEqual(ordemDasLinhas(col, 'asc'), [1, 0, 2]);
});

test('ordemDasLinhas: texto sem diferenciar acento e caixa; empate mantém a ordem de antes', () => {
  assert.deepEqual(ordemDasLinhas(['Google', 'instagram', 'Álbum', 'Google'], 'asc'), [2, 0, 3, 1]);
  assert.deepEqual(ordemDasLinhas(['b', 'a', 'a', 'b'], 'desc'), [0, 3, 1, 2]);
});

test('ordemDasLinhas: vazio vai sempre pro fim, nas duas direções', () => {
  assert.deepEqual(ordemDasLinhas(['3', '', '1'], 'asc'), [2, 0, 1]);
  assert.deepEqual(ordemDasLinhas(['3', '', '1'], 'desc'), [0, 2, 1]);
});

test('ordemDasLinhas: sempre uma permutação de todos os índices', () => {
  const col = ['x', '5', '', '05/10/2026', 'R$ 1,00', 'y'];
  for (const dir of ['asc', 'desc']) assert.deepEqual([...ordemDasLinhas(col, dir)].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(ordemDasLinhas([], 'asc'), []);
});

test('proximaDirecao: ordena crescente, depois decrescente, depois volta ao original', () => {
  assert.equal(proximaDirecao(null), 'asc');
  assert.equal(proximaDirecao('asc'), 'desc');
  assert.equal(proximaDirecao('desc'), null);
});
