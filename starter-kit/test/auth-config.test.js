// Testes da função pura safeEqual do módulo de autenticação de dashboard.
// Só lógica pura: comparação de strings. Sem rede, sem KV, sem estado global.
import test from 'node:test';
import assert from 'node:assert/strict';

import { safeEqual } from '../functions/lib/auth-config.mjs';

test('safeEqual: strings iguais devolve true', () => {
  assert.equal(safeEqual('senha123', 'senha123'), true);
});

test('safeEqual: tamanhos diferentes devolve false', () => {
  assert.equal(safeEqual('abc', 'abcd'), false);
});

test('safeEqual: mesmo tamanho e conteúdo diferente devolve false', () => {
  assert.equal(safeEqual('abcd', 'abce'), false);
});

// Documentação do contrato de timing: safeEqual é tempo-constante no CONTEÚDO,
// não no tamanho. Quando os dois lados têm o mesmo comprimento, a comparação
// varre todos os caracteres com XOR acumulado (não retorna cedo no primeiro
// caractere diferente), então o tempo não vaza ONDE eles diferem. Já para
// comprimentos diferentes ela retorna cedo (return false), ou seja, o tamanho
// da string PODE vazar por timing: isso é aceito de propósito (o hash guardado
// tem tamanho fixo conhecido, então o comprimento não é segredo).
test('safeEqual: tempo-constante no conteúdo (retorna cedo só em tamanho diferente)', () => {
  // Mesmo tamanho: compara conteúdo inteiro, diferença no início ou no fim dá false.
  assert.equal(safeEqual('Xbcd', 'abcd'), false); // difere no primeiro char
  assert.equal(safeEqual('abcX', 'abcd'), false); // difere no último char
  // Tamanho diferente: retorno antecipado, sempre false.
  assert.equal(safeEqual('a', 'aaaaaaaa'), false);
});
