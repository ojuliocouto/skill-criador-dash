// Testes das funções puras do modo histórico (snapshots no D1).
// Só lógica pura: montagem de SQL parametrizado e conversão de linha para DataSet.
// Sem rede, sem D1, sem Date. Respeita o Contrato 1 (DataSet) ao reidratar.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  insertSnapshotSQL,
  latestSnapshotSQL,
  listSnapshotsSQL,
  rowToDataSet,
} from '../functions/lib/snapshots.mjs';

const dataset = {
  columns: ['Data', 'Canal', 'Investimento'],
  rows: [{ Data: '01/01', Canal: 'Meta', Investimento: '100' }],
  meta: { source: 'sheets', fetchedAt: '2026-07-06T10:00:00.000Z', rowCount: 1 },
};

test('insertSnapshotSQL: sql é um INSERT parametrizado com 3 placeholders', () => {
  const { sql, params } = insertSnapshotSQL('meu-dash', '2026-07-06T10:00:00.000Z', dataset);
  assert.match(sql, /INSERT INTO/i);
  assert.match(sql, /snapshots/);
  // três placeholders posicionais
  assert.equal((sql.match(/\?/g) || []).length, 3);
  assert.equal(params.length, 3);
  assert.equal(params[0], 'meu-dash');
  assert.equal(params[1], '2026-07-06T10:00:00.000Z');
  assert.equal(params[2], JSON.stringify(dataset));
});

test('insertSnapshotSQL: params[2] é JSON válido do dataset', () => {
  const { params } = insertSnapshotSQL('d', '2026-07-06T10:00:00.000Z', dataset);
  const parsed = JSON.parse(params[2]);
  assert.deepEqual(parsed.columns, dataset.columns);
  assert.deepEqual(parsed.rows, dataset.rows);
});

test('insertSnapshotSQL: sem dashboardId lança Error em PT-BR', () => {
  assert.throws(() => insertSnapshotSQL('', '2026-07-06T10:00:00.000Z', dataset), /dashboard/i);
});

test('insertSnapshotSQL: sem dataset lança Error em PT-BR', () => {
  assert.throws(() => insertSnapshotSQL('meu-dash', '2026-07-06T10:00:00.000Z', null), /dataset|dados/i);
});

test('latestSnapshotSQL: SELECT mais recente por captured_at DESC LIMIT 1', () => {
  const { sql, params } = latestSnapshotSQL('meu-dash');
  assert.match(sql, /SELECT/i);
  assert.match(sql, /FROM\s+snapshots/i);
  assert.match(sql, /WHERE\s+dashboard_id\s*=\s*\?/i);
  assert.match(sql, /ORDER BY\s+captured_at\s+DESC/i);
  assert.match(sql, /LIMIT\s+1/i);
  assert.deepEqual(params, ['meu-dash']);
});

test('listSnapshotsSQL: SELECT captured_at ordenado desc com limit', () => {
  const { sql, params } = listSnapshotsSQL('meu-dash', 50);
  assert.match(sql, /SELECT/i);
  assert.match(sql, /captured_at/i);
  assert.match(sql, /FROM\s+snapshots/i);
  assert.match(sql, /ORDER BY\s+captured_at\s+DESC/i);
  assert.match(sql, /LIMIT\s+\?/i);
  assert.deepEqual(params, ['meu-dash', 50]);
});

test('listSnapshotsSQL: limit default 100', () => {
  const { params } = listSnapshotsSQL('meu-dash');
  assert.equal(params[1], 100);
});

test('rowToDataSet: parse ok devolve columns e rows', () => {
  const row = { dataset_json: JSON.stringify(dataset) };
  const ds = rowToDataSet(row);
  assert.deepEqual(ds.columns, dataset.columns);
  assert.deepEqual(ds.rows, dataset.rows);
});

test('rowToDataSet: dataset_json inválido (não é JSON) lança Error PT-BR', () => {
  assert.throws(() => rowToDataSet({ dataset_json: 'nao-e-json{' }), /inválido|corrompid|snapshot/i);
});

test('rowToDataSet: JSON sem columns/rows lança Error PT-BR', () => {
  assert.throws(() => rowToDataSet({ dataset_json: JSON.stringify({ foo: 1 }) }), /inválido|columns|rows|formato/i);
});

test('rowToDataSet: dbRow null lança Error "nenhum snapshot encontrado"', () => {
  assert.throws(() => rowToDataSet(null), /nenhum snapshot encontrado/i);
});

test('rowToDataSet: dbRow undefined lança Error de snapshot ausente', () => {
  assert.throws(() => rowToDataSet(undefined), /nenhum snapshot encontrado/i);
});
