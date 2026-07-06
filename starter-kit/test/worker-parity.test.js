// Guarda de paridade: o Worker de snapshot (modo histórico) NÃO pode ter uma
// cópia divergente da lógica de parse de CSV nem da conversão de link do Sheets.
// Ambos devem usar EXATAMENTE a mesma função que os conectores de Pages.
//
// O worker reexporta parseCSV e sheetUrlToCsv; aqui comparamos essas referências
// com as do lib compartilhado e com o conector de Pages, tanto por identidade de
// função quanto por igualdade de resultado para vários inputs.

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseCSV as workerParseCSV, sheetUrlToCsv as workerSheetUrlToCsv } from '../workers/snapshot/src/index.js';
import { parseCSV as libParseCSV } from '../functions/lib/csv.mjs';
import { sheetUrlToCsv as libSheetUrlToCsv } from '../functions/lib/sheets-url.mjs';
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
