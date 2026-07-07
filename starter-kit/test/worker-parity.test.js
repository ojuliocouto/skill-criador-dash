// Guarda de paridade: o Worker de snapshot (modo histórico) NÃO pode ter uma
// cópia divergente da lógica de parse de CSV nem da conversão de link do Sheets.
// Ambos devem usar EXATAMENTE a mesma função que os conectores de Pages.
//
// O worker reexporta parseCSV e sheetUrlToCsv; aqui comparamos essas referências
// com as do lib compartilhado e com o conector de Pages, tanto por identidade de
// função quanto por igualdade de resultado para vários inputs.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCSV as workerParseCSV,
  sheetUrlToCsv as workerSheetUrlToCsv,
  buildInsightsUrl as workerBuildInsightsUrl,
  mapInsightsToDataSet as workerMapInsightsToDataSet,
  insertSnapshotSQL as workerInsertSnapshotSQL,
} from '../workers/snapshot/src/index.js';
import { parseCSV as libParseCSV } from '../functions/lib/csv.mjs';
import { sheetUrlToCsv as libSheetUrlToCsv } from '../functions/lib/sheets-url.mjs';
import {
  buildInsightsUrl as libBuildInsightsUrl,
  mapInsightsToDataSet as libMapInsightsToDataSet,
} from '../functions/lib/meta.mjs';
import { insertSnapshotSQL as libInsertSnapshotSQL } from '../functions/lib/snapshots.mjs';
import { sheetUrlToCsv as connectorSheetUrlToCsv } from '../functions/api/connectors/sheets.js';

test('paridade: worker usa a MESMA função parseCSV do lib (identidade)', () => {
  assert.strictEqual(workerParseCSV, libParseCSV);
});

test('paridade: worker, lib e conector usam a MESMA sheetUrlToCsv (identidade)', () => {
  assert.strictEqual(workerSheetUrlToCsv, libSheetUrlToCsv);
  assert.strictEqual(connectorSheetUrlToCsv, libSheetUrlToCsv);
});

test('paridade: sheetUrlToCsv produz o mesmo endpoint para vários links', () => {
  const urls = [
    'https://docs.google.com/spreadsheets/d/1AbC-def_GHI123/edit#gid=0',
    'https://docs.google.com/spreadsheets/d/1AbC-def_GHI123/edit?usp=sharing',
    'https://docs.google.com/spreadsheets/d/AAAA_bbbb-CCCC/',
    'docs.google.com/spreadsheets/d/short/edit',
  ];
  const gids = ['0', '42', undefined, '7'];
  for (let i = 0; i < urls.length; i++) {
    assert.strictEqual(
      workerSheetUrlToCsv(urls[i], gids[i]),
      libSheetUrlToCsv(urls[i], gids[i]),
    );
  }
});

test('paridade: link inválido lança nas duas', () => {
  assert.throws(() => workerSheetUrlToCsv('https://exemplo.com/planilha'));
  assert.throws(() => libSheetUrlToCsv('https://exemplo.com/planilha'));
});

test('paridade: parseCSV produz o mesmo resultado (vírgula e ponto-e-vírgula)', () => {
  const inputs = [
    'a,b,c\n1,2,3\n4,5,6',
    'nome;idade;cidade\nAna;30;SP\nBia;25;RJ',
    'x\ty\tz\n1\t2\t3',
    'campo,"com, vírgula",fim\nv1,"a ""aspa"" b",v3',
    'col1,col2\n"linha\ncom quebra",ok',
    '',
    'so_header,vazio\n',
  ];
  for (const input of inputs) {
    assert.deepStrictEqual(
      workerParseCSV(input),
      libParseCSV(input),
    );
  }
});

test('paridade: worker usa as MESMAS funções de meta.mjs (identidade)', () => {
  assert.strictEqual(workerBuildInsightsUrl, libBuildInsightsUrl);
  assert.strictEqual(workerMapInsightsToDataSet, libMapInsightsToDataSet);
});

test('paridade: mapInsightsToDataSet produz o mesmo DataSet no worker e no lib', () => {
  const apiJsons = [
    {
      data: [
        {
          campaign_name: 'Campanha A',
          spend: '150.50',
          impressions: '10000',
          clicks: '250',
          date_start: '2026-01-01',
          actions: [
            { action_type: 'lead', value: '12' },
            { action_type: 'purchase', value: '5' },
            { action_type: 'omni_purchase', value: '3' },
          ],
        },
        { campaign_name: 'Campanha B', spend: '80', impressions: '4000', clicks: '90', date_start: '2026-01-02' },
      ],
    },
    {},
    { data: [] },
  ];
  for (const apiJson of apiJsons) {
    assert.deepStrictEqual(
      workerMapInsightsToDataSet(apiJson),
      libMapInsightsToDataSet(apiJson),
    );
  }
});

test('paridade: worker usa a MESMA função insertSnapshotSQL do lib (identidade)', () => {
  // O Worker NÃO monta o INSERT do snapshot inline: ele importa e reexporta a
  // função pura de functions/lib/snapshots.mjs. Se alguém recolocar SQL inline
  // no Worker, esta identidade quebra.
  assert.strictEqual(workerInsertSnapshotSQL, libInsertSnapshotSQL);
});

test('paridade: insertSnapshotSQL gera o mesmo sql/params no worker e no lib', () => {
  const capturedAt = '2026-07-06T10:00:00.000Z';
  const casos = [
    ['dash-a', { columns: ['nome', 'valor'], rows: [['Ana', 30]], meta: { source: 'sheets' } }],
    ['dash-b', { columns: [], rows: [], meta: { source: 'meta', rowCount: 0 } }],
    [42, { columns: ['x'], rows: [[1], [2], [3]] }],
  ];
  for (const [dashboardId, dataset] of casos) {
    const doWorker = workerInsertSnapshotSQL(dashboardId, capturedAt, dataset);
    const doLib = libInsertSnapshotSQL(dashboardId, capturedAt, dataset);
    assert.deepStrictEqual(doWorker, doLib);
    // E confere o contrato posicional do INSERT (dashboard_id, captured_at, dataset_json).
    assert.match(doWorker.sql, /INSERT INTO snapshots \(dashboard_id, captured_at, dataset_json\) VALUES \(\?, \?, \?\)/);
    assert.deepStrictEqual(doWorker.params, [
      String(dashboardId),
      capturedAt,
      JSON.stringify(dataset),
    ]);
  }
});
