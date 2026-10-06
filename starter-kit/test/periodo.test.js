// Agrupamento por período (dia, semana, mês) em cima do slot de data. Lógica pura, usada pelo
// widget `resumo` na aba "Evolução". A semana começa na segunda-feira e o rótulo mostra só os
// dias que TÊM dado: uma semana com 2 dias não pode se apresentar como semana cheia.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ehPeriodo, inicioDaSemana, chavePeriodo, agruparPorPeriodo, rotuloDaDimensaoDePeriodo,
} from '../public/assets/js/lib/periodo.js';

const COLMAP = { data: 'Data' };
const linha = (data, extra = {}) => ({ Data: data, ...extra });

test('ehPeriodo: só dia, semana e mes são período; slot de dimensão não é', () => {
  assert.equal(ehPeriodo('dia'), true);
  assert.equal(ehPeriodo('semana'), true);
  assert.equal(ehPeriodo('mes'), true);
  assert.equal(ehPeriodo('canal'), false);
  assert.equal(ehPeriodo(undefined), false);
});

test('inicioDaSemana: devolve a segunda-feira da semana da data', () => {
  // 05/09/2026 é sábado; a segunda daquela semana é 31/08/2026.
  assert.equal(inicioDaSemana('2026-09-05'), '2026-08-31');
  assert.equal(inicioDaSemana('2026-09-06'), '2026-08-31', 'domingo fecha a semana');
  assert.equal(inicioDaSemana('2026-09-07'), '2026-09-07', 'segunda abre a semana');
  assert.equal(inicioDaSemana('2026-10-04'), '2026-09-28');
  assert.equal(inicioDaSemana('2026-01-01'), '2025-12-29', 'atravessa a virada do ano');
  assert.equal(inicioDaSemana('lixo'), null);
});

test('chavePeriodo: chave ordenável por tipo de período', () => {
  assert.equal(chavePeriodo('2026-09-05', 'dia'), '2026-09-05');
  assert.equal(chavePeriodo('2026-09-05', 'semana'), '2026-08-31');
  assert.equal(chavePeriodo('2026-09-05', 'mes'), '2026-09');
  assert.equal(chavePeriodo(null, 'dia'), null);
});

test('agruparPorPeriodo (semana): ordem cronológica e rótulo só com os dias que têm dado', () => {
  const rows = [
    linha('2026-09-14'), linha('2026-09-05'), linha('2026-09-06'), linha('2026-09-07'),
    linha('2026-09-13'), linha('2026-09-20'),
  ];
  const { grupos, semData } = agruparPorPeriodo(rows, COLMAP, 'data', 'semana');
  assert.deepEqual(grupos.map((g) => g.label), ['05/09 a 06/09', '07/09 a 13/09', '14/09 a 20/09']);
  assert.deepEqual(grupos.map((g) => g.rows.length), [2, 2, 2]);
  assert.equal(semData.length, 0);
});

test('agruparPorPeriodo (semana): semana de um dia só mostra o dia, sem intervalo falso', () => {
  const { grupos } = agruparPorPeriodo([linha('2026-09-05'), linha('2026-09-08')], COLMAP, 'data', 'semana');
  assert.deepEqual(grupos.map((g) => g.label), ['05/09', '08/09']);
});

test('agruparPorPeriodo: aceita data brasileira e ISO na mesma coluna', () => {
  const { grupos } = agruparPorPeriodo([linha('05/09/2026'), linha('2026-09-05')], COLMAP, 'data', 'dia');
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].label, '05/09/2026');
  assert.equal(grupos[0].rows.length, 2);
});

test('agruparPorPeriodo (mes): rótulo por extenso e em ordem', () => {
  const { grupos } = agruparPorPeriodo([linha('2026-10-04'), linha('2026-09-05'), linha('2026-09-30')], COLMAP, 'data', 'mes');
  assert.deepEqual(grupos.map((g) => g.label), ['Setembro de 2026', 'Outubro de 2026']);
  assert.deepEqual(grupos.map((g) => g.rows.length), [2, 1]);
});

test('agruparPorPeriodo: dados que atravessam o ano levam o ano no rótulo da semana', () => {
  const { grupos } = agruparPorPeriodo([linha('2025-12-30'), linha('2026-01-02'), linha('2026-01-06')], COLMAP, 'data', 'semana');
  assert.deepEqual(grupos.map((g) => g.label), ['30/12/2025 a 02/01/2026', '06/01/2026']);
});

test('agruparPorPeriodo: linha sem data válida vai pra semData, não some nem vira grupo', () => {
  const { grupos, semData } = agruparPorPeriodo([linha('2026-09-05'), linha(''), linha('abc')], COLMAP, 'data', 'dia');
  assert.equal(grupos.length, 1);
  assert.equal(semData.length, 2);
});

test('agruparPorPeriodo: sem coluna de data mapeada devolve tudo em semData', () => {
  const { grupos, semData } = agruparPorPeriodo([linha('2026-09-05')], {}, 'data', 'semana');
  assert.equal(grupos.length, 0);
  assert.equal(semData.length, 1);
});

test('rotuloDaDimensaoDePeriodo: nome da primeira coluna em palavra comum', () => {
  assert.equal(rotuloDaDimensaoDePeriodo('dia'), 'Dia');
  assert.equal(rotuloDaDimensaoDePeriodo('semana'), 'Semana');
  assert.equal(rotuloDaDimensaoDePeriodo('mes'), 'Mês');
});
