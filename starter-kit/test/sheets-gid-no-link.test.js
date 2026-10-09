// A aba da planilha vem do link que a pessoa colou.
//
// Achado da prova no ar de 08/10/2026: quem copia o link da SEGUNDA aba do Google Sheets recebe um endereço que
// termina em `#gid=777`. O conector só olhava o parâmetro `gid` (que o painel manda como '0' quando a config não
// tem o campo), então o painel lia a PRIMEIRA aba em silêncio: número de outra aba, com cara de certo. Agora o gid
// do próprio link vale quando a config não pede outra aba, e o gid explícito (diferente de 0) continua mandando.
// O gid também só aceita dígitos: qualquer outra coisa não entra na URL que o servidor busca.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetUrlToCsv } from '../functions/lib/sheets-url.mjs';

const ID = '1woUliEiWfKPQ5zNr5XH-OAogbIeY-36ftfJKonMU84o';
const base = `https://docs.google.com/spreadsheets/d/${ID}`;
const gidDe = (u) => new URL(u).searchParams.get('gid');

test('link com #gid=777 e sem gid na config: lê a aba 777', () => {
  assert.equal(gidDe(sheetUrlToCsv(`${base}/edit#gid=777`)), '777');
});

test('link com #gid=777 e gid padrão "0" vindo do painel: lê a aba 777 (não a primeira)', () => {
  assert.equal(gidDe(sheetUrlToCsv(`${base}/edit#gid=777`, '0')), '777');
});

test('link com ?gid=555 na query também vale', () => {
  assert.equal(gidDe(sheetUrlToCsv(`${base}/edit?gid=555`, '0')), '555');
  assert.equal(gidDe(sheetUrlToCsv(`${base}/edit?usp=sharing&gid=555#gid=555`, '0')), '555');
});

test('gid explícito diferente de 0 manda mais que o do link', () => {
  assert.equal(gidDe(sheetUrlToCsv(`${base}/edit#gid=777`, '123')), '123');
});

test('link sem gid e sem gid na config: aba 0, como sempre', () => {
  assert.equal(gidDe(sheetUrlToCsv(`${base}/edit?usp=sharing`)), '0');
  assert.equal(gidDe(sheetUrlToCsv(`${base}/edit`, '')), '0');
});

test('gid que não é número não entra na URL buscada pelo servidor', () => {
  const u = sheetUrlToCsv(`${base}/edit`, '0&tq=select%20*');
  assert.equal(gidDe(u), '0');
  assert.ok(!/tq=select/.test(u.replace('tqx=out:csv', '')), 'nada de parâmetro de consulta vindo do gid');
  assert.equal(gidDe(sheetUrlToCsv(`${base}/edit`, 'abc')), '0');
});

test('o link continua sendo validado: sem ID de planilha dá erro em português', () => {
  assert.throws(() => sheetUrlToCsv('https://exemplo.com/nada#gid=1'), /Link de planilha Google inválido/);
});
