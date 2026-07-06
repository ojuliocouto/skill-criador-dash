import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accentForeground } from '../public/assets/js/dashboard.js';

// accent escuro (roxo padrao): texto branco
test('accentForeground: accent escuro (#6d28d9) devolve #fff', () => {
  assert.equal(accentForeground('#6d28d9'), '#fff');
});

// accent claro (amarelo): texto escuro pra manter contraste
test('accentForeground: amarelo (#f5d90a) devolve #111', () => {
  assert.equal(accentForeground('#f5d90a'), '#111');
});

// accent claro (ciano): texto escuro
test('accentForeground: ciano (#22d3ee) devolve #111', () => {
  assert.equal(accentForeground('#22d3ee'), '#111');
});

// hex invalido: fallback seguro pro branco (accent padrao e escuro)
test('accentForeground: hex invalido devolve #fff (fallback)', () => {
  assert.equal(accentForeground('nao-e-hex'), '#fff');
  assert.equal(accentForeground('#12'), '#fff');
  assert.equal(accentForeground('#gggggg'), '#fff');
  assert.equal(accentForeground(''), '#fff');
  assert.equal(accentForeground(null), '#fff');
  assert.equal(accentForeground(undefined), '#fff');
});

// aceita forma curta #rgb
test('accentForeground: shorthand #rgb funciona', () => {
  assert.equal(accentForeground('#000'), '#fff'); // preto -> texto branco
  assert.equal(accentForeground('#fff'), '#111'); // branco -> texto escuro
});
