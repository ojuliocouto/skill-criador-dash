// Testes da camada de métricas pura. node:test + node:assert/strict.
// Roda com: node --test test/metrics.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMetric,
  computeAll,
  groupBy,
  timeSeries,
} from '../public/assets/js/lib/metrics.js';

// colMap: slot semântico -> nome de coluna real na planilha.
const colMap = {
  data: 'Data',
  canal: 'Canal',
  investimento: 'Investimento',
  cliques: 'Cliques',
  impressoes: 'Impressoes',
  receita: 'Receita',
};

// Dataset fixo pequeno com números BR, vazios e NaN.
const rows = [
  { Data: '01/01/2026', Canal: 'Meta', Investimento: '1.234,56', Cliques: '10', Impressoes: '1.000', Receita: '3.000,00' },
  { Data: '01/01/2026', Canal: 'Google', Investimento: '2.000,00', Cliques: '20', Impressoes: '2.000', Receita: '5.000,00' },
  { Data: '02/01/2026', Canal: 'Meta', Investimento: '765,44', Cliques: '5', Impressoes: '', Receita: 'abc' },
  { Data: 'data-invalida', Canal: '', Investimento: '', Cliques: '', Impressoes: '500', Receita: '1.000,00' },
];

test('sum ignora NaN e vazios', () => {
  const def = { key: 'investimento', agg: 'sum', column: 'investimento' };
  // 1234.56 + 2000 + 765.44 + (vazio ignorado) = 4000
  assert.equal(computeMetric(def, rows, colMap), 4000);
});

test('avg usa apenas válidos', () => {
  const def = { key: 'invest_avg', agg: 'avg', column: 'investimento' };
  // (1234.56 + 2000 + 765.44) / 3 = 1333.3333...
  assert.ok(Math.abs(computeMetric(def, rows, colMap) - 4000 / 3) < 1e-9);
});

test('avg retorna 0 quando não há válidos', () => {
  const def = { key: 'x', agg: 'avg', column: 'canal' };
  // canal não é numérico -> nenhum válido -> 0
  assert.equal(computeMetric(def, rows, colMap), 0);
});

test('count conta linhas com slot não vazio', () => {
  const def = { key: 'n', agg: 'count', column: 'canal' };
  // Meta, Google, Meta, '' -> 3
  assert.equal(computeMetric(def, rows, colMap), 3);
});

test('countDistinct conta valores distintos não vazios', () => {
  const def = { key: 'canais', agg: 'countDistinct', column: 'canal' };
  // Meta, Google, Meta, '' -> distintos: Meta, Google = 2
  assert.equal(computeMetric(def, rows, colMap), 2);
});

test('ratio calcula num/den com computed', () => {
  const cliques = computeMetric({ key: 'cliques', agg: 'sum', column: 'cliques' }, rows, colMap);
  const impressoes = computeMetric({ key: 'impressoes', agg: 'sum', column: 'impressoes' }, rows, colMap);
  const computed = { cliques, impressoes };
  const def = { key: 'ctr', agg: 'ratio', ratioOf: ['cliques', 'impressoes'] };
  // cliques: 10+20+5 = 35; impressoes: 1000+2000+500 = 3500 -> 0.01
  assert.equal(cliques, 35);
  assert.equal(impressoes, 3500);
  assert.equal(computeMetric(def, rows, colMap, computed), 35 / 3500);
});

test('ratio retorna 0 quando denominador é zero', () => {
  const computed = { cliques: 35, zero: 0 };
  const def = { key: 'x', agg: 'ratio', ratioOf: ['cliques', 'zero'] };
  assert.equal(computeMetric(def, rows, colMap, computed), 0);
});

test('derived chama def.compute', () => {
  const receita = computeMetric({ key: 'receita', agg: 'sum', column: 'receita' }, rows, colMap);
  const investimento = computeMetric({ key: 'investimento', agg: 'sum', column: 'investimento' }, rows, colMap);
  const computed = { receita, investimento };
  const def = {
    key: 'roas',
    agg: 'derived',
    compute: ({ computed }) => (computed.investimento ? computed.receita / computed.investimento : 0),
  };
  // receita: 3000+5000+1000 = 9000; investimento: 4000 -> 2.25
  assert.equal(receita, 9000);
  assert.equal(investimento, 4000);
  assert.equal(computeMetric(def, rows, colMap, computed), 2.25);
});

test('computeAll respeita dependências base -> ratio/derived', () => {
  const defs = [
    { key: 'investimento', agg: 'sum', column: 'investimento' },
    { key: 'cliques', agg: 'sum', column: 'cliques' },
    { key: 'impressoes', agg: 'sum', column: 'impressoes' },
    { key: 'receita', agg: 'sum', column: 'receita' },
    { key: 'ctr', agg: 'ratio', ratioOf: ['cliques', 'impressoes'] },
    { key: 'cpc', agg: 'ratio', ratioOf: ['investimento', 'cliques'] },
    { key: 'roas', agg: 'derived', compute: ({ computed }) => (computed.investimento ? computed.receita / computed.investimento : 0) },
  ];
  const out = computeAll(defs, rows, colMap);
  assert.equal(out.investimento, 4000);
  assert.equal(out.cliques, 35);
  assert.equal(out.impressoes, 3500);
  assert.equal(out.receita, 9000);
  assert.equal(out.ctr, 35 / 3500);
  assert.equal(out.cpc, 4000 / 35);
  assert.equal(out.roas, 2.25);
});

test('groupBy rankeia por canal ordenado desc', () => {
  const res = groupBy(rows, colMap, 'canal', 'investimento', 'sum');
  // Meta: 1234.56 + 765.44 = 2000; Google: 2000. '' descartado (key vazia).
  assert.equal(res.length, 2);
  const keys = res.map((r) => r.key).sort();
  assert.deepEqual(keys, ['Google', 'Meta']);
  assert.ok(res.every((r) => r.value === 2000));
});

test('groupBy com agg count conta linhas por key', () => {
  const res = groupBy(rows, colMap, 'canal', null, 'count');
  // Meta: 2, Google: 1, '' descartado
  const map = Object.fromEntries(res.map((r) => [r.key, r.value]));
  assert.equal(map.Meta, 2);
  assert.equal(map.Google, 1);
  // ordenado desc
  assert.equal(res[0].key, 'Meta');
});

test('timeSeries agrupa por data, ordena asc, ignora inválida', () => {
  const res = timeSeries(rows, colMap, 'data', 'investimento', 'sum');
  // 01/01: 1234.56 + 2000 = 3234.56; 02/01: 765.44; linha data-invalida descartada
  assert.deepEqual(res, [
    { date: '2026-01-01', value: 3234.56 },
    { date: '2026-01-02', value: 765.44 },
  ]);
});

// ---------- robustez: slot ausente no colMap ----------
// Fix 1: quando o slot nao esta no colMap e nao existe coluna com esse nome
// exato no dataset, a metrica nao deve inventar uma coluna a partir do nome do
// slot. Deve tratar como coluna ausente (valor seguro), sem acoplar slot->coluna.
test('computeMetric com slot ausente no colMap retorna valor seguro', () => {
  // 'gasto' nao esta no colMap e nao existe coluna 'gasto' nas linhas.
  const somaAusente = computeMetric({ key: 'x', agg: 'sum', column: 'gasto' }, rows, colMap);
  assert.equal(somaAusente, 0, 'sum de slot ausente = 0');
  const avgAusente = computeMetric({ key: 'x', agg: 'avg', column: 'gasto' }, rows, colMap);
  assert.equal(avgAusente, 0, 'avg de slot ausente = 0');
  const countAusente = computeMetric({ key: 'x', agg: 'count', column: 'gasto' }, rows, colMap);
  assert.equal(countAusente, 0, 'count de slot ausente = 0');
  const distAusente = computeMetric({ key: 'x', agg: 'countDistinct', column: 'gasto' }, rows, colMap);
  assert.equal(distAusente, 0, 'countDistinct de slot ausente = 0');
});

test('groupBy com dimensao ausente no colMap retorna vazio', () => {
  const res = groupBy(rows, colMap, 'setor', 'investimento', 'sum');
  assert.deepEqual(res, [], 'sem dimensao mapeada nao ha o que agrupar');
});

test('groupBy com valueSlot ausente soma zero por bucket', () => {
  // Dimensao existe (canal), valueSlot ausente ('gasto'): nenhum numero valido.
  const res = groupBy(rows, colMap, 'canal', 'gasto', 'sum');
  assert.ok(res.every((r) => r.value === 0), 'value 0 quando valueSlot ausente');
});

test('timeSeries com valueSlot ausente soma zero por data', () => {
  const res = timeSeries(rows, colMap, 'data', 'gasto', 'sum');
  assert.ok(res.every((r) => r.value === 0), 'value 0 quando valueSlot ausente');
});

// MINOR: groupBy/timeSeries so tratavam valueSlot null pra agg='count'. Com 'avg' e
// 'countDistinct' + coluna null, deviam degradar previsivelmente (nao virar count mudo
// nem quebrar). Sem numero valido: avg -> 0, countDistinct -> 0 por bucket.
test('groupBy: valueSlot null com avg/countDistinct degrada para 0 (nao vira count)', () => {
  const avg = groupBy(rows, colMap, 'canal', null, 'avg');
  assert.ok(avg.every((r) => r.value === 0), 'avg com coluna null = 0 por bucket');
  const dist = groupBy(rows, colMap, 'canal', null, 'countDistinct');
  assert.ok(dist.every((r) => r.value === 0), 'countDistinct com coluna null = 0 por bucket');
  // count com null continua contando linhas (comportamento ja existente e correto)
  const cnt = groupBy(rows, colMap, 'canal', null, 'count');
  assert.equal(Object.fromEntries(cnt.map((r) => [r.key, r.value])).Meta, 2);
});

test('timeSeries: valueSlot null com avg/countDistinct degrada para 0 (nao vira count)', () => {
  const avg = timeSeries(rows, colMap, 'data', null, 'avg');
  assert.ok(avg.every((r) => r.value === 0), 'avg com coluna null = 0 por data');
  const dist = timeSeries(rows, colMap, 'data', null, 'countDistinct');
  assert.ok(dist.every((r) => r.value === 0), 'countDistinct com coluna null = 0 por data');
  // count com null continua contando linhas por data
  const cnt = timeSeries(rows, colMap, 'data', null, 'count');
  assert.equal(Object.fromEntries(cnt.map((r) => [r.date, r.value]))['2026-01-01'], 2);
});

// Slot que casa por NOME exato de coluna no dataset (sem estar no colMap) ainda
// deve funcionar: mantemos a possibilidade de passar coluna direta.
test('computeMetric aceita nome de coluna direto quando existe no dataset', () => {
  // 'Investimento' e o nome real da coluna; nao e chave do colMap.
  const soma = computeMetric({ key: 'x', agg: 'sum', column: 'Investimento' }, rows, colMap);
  assert.equal(soma, 4000, 'coluna direta pelo nome real do dataset soma normal');
});

// ---------- robustez: dataset vazio ----------
test('funcoes lidam com dataset vazio sem lancar', () => {
  const empty = [];
  assert.doesNotThrow(() => {
    assert.equal(computeMetric({ key: 'x', agg: 'sum', column: 'investimento' }, empty, colMap), 0);
    assert.equal(computeMetric({ key: 'x', agg: 'avg', column: 'investimento' }, empty, colMap), 0);
    assert.equal(computeMetric({ key: 'x', agg: 'count', column: 'canal' }, empty, colMap), 0);
    assert.equal(computeMetric({ key: 'x', agg: 'countDistinct', column: 'canal' }, empty, colMap), 0);
    assert.deepEqual(groupBy(empty, colMap, 'canal', 'investimento', 'sum'), []);
    assert.deepEqual(timeSeries(empty, colMap, 'data', 'investimento', 'sum'), []);
    assert.deepEqual(computeAll([{ key: 'inv', agg: 'sum', column: 'investimento' }], empty, colMap), { inv: 0 });
  });
});

// ---------- robustez: colMap ausente/indefinido ----------
test('funcoes lidam com colMap indefinido sem lancar', () => {
  assert.doesNotThrow(() => {
    // Sem colMap, 'investimento' nao casa nenhuma coluna real -> 0.
    assert.equal(computeMetric({ key: 'x', agg: 'sum', column: 'investimento' }, rows, undefined), 0);
    assert.deepEqual(groupBy(rows, undefined, 'canal', 'investimento', 'sum'), []);
    assert.deepEqual(timeSeries(rows, undefined, 'data', 'investimento', 'sum'), []);
  });
});
