import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dimensionSlots,
  distinctValues,
  dateBounds,
  emptyFilterState,
  applyFilters,
} from '../public/assets/js/lib/filters.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';
import { template as vendas } from '../public/assets/js/templates/vendas.js';

// ---------- dimensionSlots ----------
test('dimensionSlots marketing: so canal (nem data nem colunas numericas)', () => {
  const dims = dimensionSlots(marketing).map((d) => d.key);
  assert.deepEqual(dims, ['canal']);
});

test('dimensionSlots vendas: vendedor, produto e status (valor e numerico, data e o eixo)', () => {
  const dims = dimensionSlots(vendas).map((d) => d.key);
  assert.deepEqual(dims, ['vendedor', 'produto', 'status']);
});

test('dimensionSlots: devolve label junto da key', () => {
  const canal = dimensionSlots(marketing).find((d) => d.key === 'canal');
  assert.equal(canal.label, 'Canal');
});

// ---------- distinctValues ----------
test('distinctValues: unicos na ordem de aparicao, ignora vazio/nulo', () => {
  const rows = [
    { Canal: 'Instagram' }, { Canal: 'Google' }, { Canal: 'Instagram' },
    { Canal: '' }, { Canal: null }, { Canal: 'TikTok' },
  ];
  assert.deepEqual(distinctValues(rows, 'Canal'), ['Instagram', 'Google', 'TikTok']);
});

test('distinctValues: lista vazia devolve []', () => {
  assert.deepEqual(distinctValues([], 'Canal'), []);
  assert.deepEqual(distinctValues(undefined, 'Canal'), []);
});

// ---------- dateBounds ----------
test('dateBounds: menor e maior data ISO, ignora datas invalidas', () => {
  const rows = [
    { Data: '03/07/2026' }, { Data: '01/07/2026' },
    { Data: 'sem data' }, { Data: '05/07/2026' },
  ];
  assert.deepEqual(dateBounds(rows, 'Data'), { min: '2026-07-01', max: '2026-07-05' });
});

test('dateBounds: sem datas validas devolve nulls', () => {
  assert.deepEqual(dateBounds([{ Data: 'x' }], 'Data'), { min: null, max: null });
});

// ---------- applyFilters ----------
const ROWS = [
  { Data: '01/07/2026', Canal: 'Instagram', Investimento: '100' },
  { Data: '02/07/2026', Canal: 'Google', Investimento: '200' },
  { Data: '03/07/2026', Canal: 'Instagram', Investimento: '300' },
  { Data: '05/07/2026', Canal: 'TikTok', Investimento: '400' },
];
const COLMAP = { data: 'Data', canal: 'Canal', investimento: 'Investimento' };

test('applyFilters: estado vazio nao filtra nada', () => {
  const out = applyFilters(ROWS, COLMAP, marketing, emptyFilterState());
  assert.equal(out.length, 4);
});

test('applyFilters: periodo [from,to] inclusivo pela coluna de data', () => {
  const out = applyFilters(ROWS, COLMAP, marketing, { from: '2026-07-02', to: '2026-07-03', dims: {} });
  assert.deepEqual(out.map((r) => r.Canal), ['Google', 'Instagram']);
});

test('applyFilters: so from (a partir de) inclui o limite', () => {
  const out = applyFilters(ROWS, COLMAP, marketing, { from: '2026-07-03', to: null, dims: {} });
  assert.deepEqual(out.map((r) => r.Data), ['03/07/2026', '05/07/2026']);
});

test('applyFilters: filtro de dimensao por igualdade exata', () => {
  const out = applyFilters(ROWS, COLMAP, marketing, { from: null, to: null, dims: { canal: 'Instagram' } });
  assert.equal(out.length, 2);
  assert.ok(out.every((r) => r.Canal === 'Instagram'));
});

test('applyFilters: periodo E dimensao combinam (AND)', () => {
  const out = applyFilters(ROWS, COLMAP, marketing, { from: '2026-07-02', to: '2026-07-05', dims: { canal: 'Instagram' } });
  assert.deepEqual(out.map((r) => r.Data), ['03/07/2026']);
});

test('applyFilters: dimensao vazia ("Todos") e ignorada', () => {
  const out = applyFilters(ROWS, COLMAP, marketing, { from: null, to: null, dims: { canal: '' } });
  assert.equal(out.length, 4);
});

test('applyFilters: linha sem data valida sai quando ha filtro de periodo', () => {
  const rows = [...ROWS, { Data: 'lixo', Canal: 'Google', Investimento: '9' }];
  const semPeriodo = applyFilters(rows, COLMAP, marketing, { from: null, to: null, dims: {} });
  assert.equal(semPeriodo.length, 5, 'sem filtro de periodo, a linha sem data fica');
  const comPeriodo = applyFilters(rows, COLMAP, marketing, { from: '2026-07-01', to: '2026-07-05', dims: {} });
  assert.equal(comPeriodo.length, 4, 'com filtro de periodo, a linha sem data sai');
});

test('applyFilters: estado nulo devolve as linhas como estao', () => {
  assert.equal(applyFilters(ROWS, COLMAP, marketing, null).length, 4);
});
