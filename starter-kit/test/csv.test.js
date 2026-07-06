// Testes das funções puras dos conectores de dados (Contratos 1 e 2).
// Só lógica pura: parseCSV, detectDelimiter, sheetUrlToCsv. Sem rede.
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseCSV, detectDelimiter } from '../functions/lib/csv.mjs';
import { sheetUrlToCsv } from '../functions/api/connectors/sheets.js';

test('detectDelimiter: detecta vírgula', () => {
  assert.equal(detectDelimiter('a,b,c\n1,2,3'), ',');
});

test('detectDelimiter: detecta ponto e vírgula', () => {
  assert.equal(detectDelimiter('a;b;c\n1;2;3'), ';');
});

test('detectDelimiter: detecta tabulação', () => {
  assert.equal(detectDelimiter('a\tb\tc\n1\t2\t3'), '\t');
});

test('detectDelimiter: default vírgula quando não há separador claro', () => {
  assert.equal(detectDelimiter('coluna'), ',');
});

test('detectDelimiter: usa só a primeira linha', () => {
  // primeira linha tem mais ponto e vírgula, então ganha o ';'
  assert.equal(detectDelimiter('a;b;c\n1,2,3,4,5'), ';');
});

test('parseCSV: CSV separado por vírgula', () => {
  const { columns, rows } = parseCSV('Data,Canal,Investimento\n01/01,Meta,100\n02/01,Google,200');
  assert.deepEqual(columns, ['Data', 'Canal', 'Investimento']);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { Data: '01/01', Canal: 'Meta', Investimento: '100' });
  assert.deepEqual(rows[1], { Data: '02/01', Canal: 'Google', Investimento: '200' });
});

test('parseCSV: CSV separado por ponto e vírgula (auto-detecta)', () => {
  const { columns, rows } = parseCSV('Nome;Valor\nAna;10\nBia;20');
  assert.deepEqual(columns, ['Nome', 'Valor']);
  assert.deepEqual(rows[0], { Nome: 'Ana', Valor: '10' });
  assert.deepEqual(rows[1], { Nome: 'Bia', Valor: '20' });
});

test('parseCSV: respeita delimitador passado em opts', () => {
  const { columns, rows } = parseCSV('a\tb\n1\t2', { delimiter: '\t' });
  assert.deepEqual(columns, ['a', 'b']);
  assert.deepEqual(rows[0], { a: '1', b: '2' });
});

test('parseCSV: campo entre aspas contendo o delimitador', () => {
  const { columns, rows } = parseCSV('Nome,Descricao\n"Silva, Ana","vendas, marketing"');
  assert.deepEqual(columns, ['Nome', 'Descricao']);
  assert.deepEqual(rows[0], { Nome: 'Silva, Ana', Descricao: 'vendas, marketing' });
});

test('parseCSV: campo entre aspas contendo quebra de linha', () => {
  const { rows } = parseCSV('Nome,Obs\n"Ana","linha1\nlinha2"');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Obs, 'linha1\nlinha2');
});

test('parseCSV: aspas escapadas ("") viram uma aspa', () => {
  const { rows } = parseCSV('Frase\n"ela disse ""oi"" pra mim"');
  assert.equal(rows[0].Frase, 'ela disse "oi" pra mim');
});

test('parseCSV: descarta linhas totalmente vazias', () => {
  const { rows } = parseCSV('a,b\n1,2\n\n3,4\n\n\n');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { a: '1', b: '2' });
  assert.deepEqual(rows[1], { a: '3', b: '4' });
});

test('parseCSV: lida com \\r\\n (CRLF)', () => {
  const { columns, rows } = parseCSV('a,b\r\n1,2\r\n3,4');
  assert.deepEqual(columns, ['a', 'b']);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], { a: '3', b: '4' });
});

test('parseCSV: texto vazio devolve columns e rows vazios', () => {
  const { columns, rows } = parseCSV('');
  assert.deepEqual(columns, []);
  assert.deepEqual(rows, []);
});

test('sheetUrlToCsv: link completo vira endpoint gviz com gid', () => {
  const url = 'https://docs.google.com/spreadsheets/d/1AbC-dEf_123/edit#gid=42';
  assert.equal(
    sheetUrlToCsv(url, '42'),
    'https://docs.google.com/spreadsheets/d/1AbC-dEf_123/gviz/tq?tqx=out:csv&gid=42'
  );
});

test('sheetUrlToCsv: gid default 0 quando não informado', () => {
  const url = 'https://docs.google.com/spreadsheets/d/ABC123/edit';
  assert.equal(
    sheetUrlToCsv(url),
    'https://docs.google.com/spreadsheets/d/ABC123/gviz/tq?tqx=out:csv&gid=0'
  );
});

test('sheetUrlToCsv: link inválido lança Error', () => {
  assert.throws(() => sheetUrlToCsv('https://exemplo.com/planilha'), /planilha|inválido|link/i);
});
