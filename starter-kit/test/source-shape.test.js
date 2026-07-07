// Validacao de forma da fonte (functions/lib/source-shape.mjs).
// Motivacao (achado de auditoria): o POST aceitava uma fonte malformada
// (ex: csv com "csvText" no lugar de "data") e o erro so aparecia na
// renderizacao do dashboard. A validacao e ESTRITA nos tipos conhecidos
// (csv/sheets/meta) e PERMISSIVA nos desconhecidos (conector sob medida).
import test from 'node:test';
import assert from 'node:assert/strict';

import { validarFonte } from '../functions/lib/source-shape.mjs';

test('fonte sem type -> erro pedindo o campo', () => {
  assert.match(validarFonte({}), /"type"/);
  assert.match(validarFonte({ type: '' }), /"type"/);
  assert.match(validarFonte({ type: '   ' }), /"type"/);
});

test('csv exige data com o conteudo do CSV', () => {
  assert.equal(validarFonte({ type: 'csv', data: 'a,b\n1,2' }), null);
  assert.match(validarFonte({ type: 'csv' }), /"data"/);
  assert.match(validarFonte({ type: 'csv', data: '' }), /"data"/);
  assert.match(validarFonte({ type: 'csv', data: '   ' }), /"data"/);
  // O engano real que motivou a validacao: campo com outro nome.
  assert.match(validarFonte({ type: 'csv', csvText: 'a,b\n1,2' }), /"data"/);
});

test('sheets exige url da planilha', () => {
  assert.equal(validarFonte({ type: 'sheets', url: 'https://docs.google.com/spreadsheets/d/x', gid: '0' }), null);
  assert.match(validarFonte({ type: 'sheets' }), /"url"/);
  assert.match(validarFonte({ type: 'sheets', url: '' }), /"url"/);
});

test('meta exige meta.token e meta.account', () => {
  assert.equal(validarFonte({ type: 'meta', meta: { token: 't', account: 'act_1' } }), null);
  assert.match(validarFonte({ type: 'meta' }), /meta\.token|meta\.account/);
  assert.match(validarFonte({ type: 'meta', meta: { token: 't' } }), /meta\.account/);
  assert.match(validarFonte({ type: 'meta', meta: { account: 'act_1' } }), /meta\.token/);
});

test('tipo desconhecido (conector sob medida) passa sem exigir campos', () => {
  assert.equal(validarFonte({ type: 'meu-crm', endpoint: 'https://x' }), null);
  assert.equal(validarFonte({ type: 'sheet', url: 'https://sheet' }), null); // usado nos fixtures dos testes de handler
});
