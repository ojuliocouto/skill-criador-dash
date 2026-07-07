import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, fmtBy } from '../public/assets/js/widgets/_util.js';

test('esc: escapa os cinco caracteres perigosos de HTML', () => {
  assert.equal(esc('&'), '&amp;');
  assert.equal(esc('<'), '&lt;');
  assert.equal(esc('>'), '&gt;');
  assert.equal(esc('"'), '&quot;');
  assert.equal(esc("'"), '&#39;');
});

test('esc: escapa uma string combinando varios caracteres na ordem certa', () => {
  assert.equal(
    esc('<a href="x" title=\'y\'>Tom & Jerry</a>'),
    '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;Tom &amp; Jerry&lt;/a&gt;',
  );
});

test('esc: & e escapado primeiro, sem dupla escapada das entidades', () => {
  // Se & nao fosse tratado antes, o < viraria &amp;lt; (dupla escapada).
  assert.equal(esc('a < b & c'), 'a &lt; b &amp; c');
});

test('esc: null e undefined viram string vazia', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
});

test('esc: valores nao string sao convertidos com String()', () => {
  assert.equal(esc(0), '0');
  assert.equal(esc(123), '123');
  assert.equal(esc(false), 'false');
});

test('esc: string sem caracteres especiais passa inalterada', () => {
  assert.equal(esc('texto simples'), 'texto simples');
});

test('fmtBy: currency formata no padrao BR com R$', () => {
  assert.equal(fmtBy('currency', 1234.5), 'R$ 1.234,50');
});

test('fmtBy: number formata com separador de milhar BR', () => {
  assert.equal(fmtBy('number', 1234.5), '1.234,5');
});

test('fmtBy: percent multiplica por 100 e adiciona %', () => {
  assert.equal(fmtBy('percent', 0.5), '50,00%');
});

test('fmtBy: integer arredonda e nao usa casas decimais', () => {
  assert.equal(fmtBy('integer', 1234.5), '1.235');
});

test('fmtBy: formato desconhecido cai no default (number)', () => {
  assert.equal(fmtBy('formato-inexistente', 1234.5), '1.234,5');
  assert.equal(fmtBy(undefined, 1234.5), '1.234,5');
});
