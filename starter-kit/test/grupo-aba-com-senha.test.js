// Peças puras do grupo com abas: "a última vale" (corrida entre abas) e o HTML do pedido de senha na aba.
// A prova no navegador está em scripts/test-grupo-no-navegador.cjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { criarUltimaVale } from '../public/assets/js/lib/ultima-vale.js';
import { pedidoDeSenhaDaAbaHtml } from '../public/assets/js/lib/senha-na-aba.js';

test('ultima-vale: a primeira carga vale enquanto não vem outra', () => {
  const nova = criarUltimaVale();
  const a = nova();
  assert.equal(a(), true);
});

test('ultima-vale: uma carga nova invalida a anterior e só a nova vale', () => {
  const nova = criarUltimaVale();
  const a = nova();
  const b = nova();
  assert.equal(a(), false, 'a carga antiga não pode mais desenhar');
  assert.equal(b(), true);
  const c = nova();
  assert.equal(b(), false);
  assert.equal(c(), true);
});

test('ultima-vale: dois guardas são independentes', () => {
  const g1 = criarUltimaVale();
  const g2 = criarUltimaVale();
  const a = g1();
  g2();
  assert.equal(a(), true);
});

test('senha na aba: o HTML tem campo de senha, botão e área de erro anunciada', () => {
  const h = pedidoDeSenhaDaAbaHtml();
  assert.match(h, /type="password"/);
  assert.match(h, /id="abaSenhaBtn"/);
  assert.match(h, /id="abaSenhaErro" role="alert"><\/p>/, 'sem erro na primeira vez');
  assert.match(h, /aria-label="Senha do painel desta aba"/, 'o campo tem nome acessível, não só placeholder');
});

test('senha na aba: depois de uma tentativa errada diz "Senha incorreta"', () => {
  assert.match(pedidoDeSenhaDaAbaHtml({ jaTentou: true }), /Senha incorreta\. Tente de novo\./);
});

test('senha na aba: o texto não tem travessão nem o beco sem saída antigo', () => {
  const h = pedidoDeSenhaDaAbaHtml({ jaTentou: true });
  assert.ok(!/[—–]/.test(h));
  assert.ok(!/n[ãa]o pode ser embutida/.test(h));
});
