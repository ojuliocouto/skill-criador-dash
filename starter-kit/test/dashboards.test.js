import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../functions/api/dashboards.js';

test('slugify: nome comum vira slug com hífens', () => {
  assert.equal(slugify('Meu Dash de Marketing'), 'meu-dash-de-marketing');
});

test('slugify: remove acento, barra e caracteres especiais', () => {
  const s = slugify('Vendas Julho/Ção');
  assert.equal(s, 'vendas-julho-cao');
  assert.ok(!/[áàâãäéèêëíìîïóòôõöúùûüçñ/]/i.test(s), 'não deve conter acento nem barra');
});

test('slugify: colapsa e apara hífens', () => {
  assert.equal(slugify('  ---Olá   Mundo!!!---  '), 'ola-mundo');
});

test('slugify: string vazia gera fallback não vazio', () => {
  assert.equal(slugify(''), 'dashboard');
  assert.equal(slugify('   '), 'dashboard');
  assert.equal(slugify('!!!'), 'dashboard');
  assert.equal(slugify(null), 'dashboard');
  assert.equal(slugify(undefined), 'dashboard');
});
