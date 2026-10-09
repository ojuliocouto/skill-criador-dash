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
  assert.match(h, /<label[^>]*for="abaSenha"[^>]*>Senha do painel desta aba<\/label>/, 'o campo tem rótulo visível ligado a ele, não só placeholder');
});

test('senha na aba: depois de uma tentativa errada diz "Senha incorreta"', () => {
  assert.match(pedidoDeSenhaDaAbaHtml({ jaTentou: true }), /Senha incorreta\. Tente de novo\./);
});

test('senha na aba: o texto não tem travessão nem o beco sem saída antigo', () => {
  const h = pedidoDeSenhaDaAbaHtml({ jaTentou: true });
  assert.ok(!/[—–]/.test(h));
  assert.ok(!/n[ãa]o pode ser embutida/.test(h));
});

// 3.7.3: a tela de senha da página tinha só o placeholder "Senha" (some ao digitar, leitor de tela anuncia mal).
// O campo precisa de rótulo ligado por `for`/`id`, visível, e o placeholder não pode ser o único nome.
import { pedidoDeSenhaDaPaginaHtml } from '../public/assets/js/lib/senha-na-aba.js';

function rotuloLigadoAoCampo(h, idDoCampo) {
  const campo = h.match(new RegExp(`<input[^>]*id="${idDoCampo}"[^>]*>`));
  assert.ok(campo, `campo #${idDoCampo} existe`);
  const rotulo = h.match(new RegExp(`<label[^>]*for="${idDoCampo}"[^>]*>([^<]+)</label>`));
  assert.ok(rotulo, `há um <label for="${idDoCampo}"> visível (não só placeholder)`);
  assert.match(rotulo[1], /senha/i, 'o rótulo diz que é a senha');
  return campo[0];
}

test('senha da página: o campo tem <label for> visível, além do placeholder', () => {
  const h = pedidoDeSenhaDaPaginaHtml();
  const campo = rotuloLigadoAoCampo(h, 'pwInput');
  assert.match(campo, /type="password"/);
  assert.match(campo, /autocomplete="current-password"/);
  assert.match(h, /<h1[^>]*>Dashboard protegido<\/h1>/, 'a página da senha não tem outro título: o título dela é o h1');
  assert.match(h, /id="pwBtn"/);
  assert.match(h, /id="pwErr"[^>]*role="alert"/, 'a mensagem de erro é anunciada');
});

test('senha da página: senha recusada na tentativa anterior mostra o aviso; primeira vez, não', () => {
  assert.match(pedidoDeSenhaDaPaginaHtml({ jaTentou: true }), />Senha incorreta\. Tente de novo\.</);
  assert.doesNotMatch(pedidoDeSenhaDaPaginaHtml({ jaTentou: false }), /Senha incorreta/);
});

test('senha na aba: o rótulo também é visível e ligado ao campo (não só aria-label)', () => {
  rotuloLigadoAoCampo(pedidoDeSenhaDaAbaHtml(), 'abaSenha');
});
