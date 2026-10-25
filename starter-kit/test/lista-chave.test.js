// Raiz do site sem a chave de administrador (3.9.0, achado 6): a lista de painéis passou a exigir a chave.
// A página não pode quebrar nem ficar vazia: ela explica e pede a chave ali mesmo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pedidoDeChaveDaListaHtml } from '../public/assets/js/lib/lista-chave.js';

test('sem a chave: explica que a lista é de quem administra, que o link abre direto, e pede a chave com rótulo', () => {
  const html = pedidoDeChaveDaListaHtml();
  assert.match(html, /só de quem administra/);
  assert.match(html, /link/);
  assert.match(html, /<label[^>]*for="chaveLista"/);
  assert.match(html, /<input[^>]*id="chaveLista"[^>]*type="password"/);
  assert.match(html, /ADMIN_TOKEN/);
  assert.match(html, /\.dev\.vars/);
  assert.match(html, /id="chaveListaBtn"/);
});

test('chave que não confere: a mensagem aparece no lugar do erro', () => {
  assert.match(pedidoDeChaveDaListaHtml({ motivo: 'Essa chave não confere.' }), /role="alert"[^>]*>Essa chave não confere\./);
});

test('servidor sem ADMIN_TOKEN: diz o que fazer no servidor, sem campo (colar chave aqui não resolve)', () => {
  const html = pedidoDeChaveDaListaHtml({ semConfig: true });
  assert.match(html, /ainda não tem chave de administrador/);
  assert.match(html, /wrangler pages secret put ADMIN_TOKEN/);
  assert.ok(!/<input/.test(html));
});

test('a lista trata o pedido de chave em vez de mostrar erro, e guarda a chave só depois de conferida', () => {
  const fonte = readFileSync(new URL('../public/assets/js/index-page.js', import.meta.url), 'utf8');
  assert.match(fonte, /err\.needsAdmin \|\| err\.adminNotConfigured/);
  assert.match(fonte, /checarChaveAdmin\(valor\)/);
  const iChecar = fonte.indexOf('checarChaveAdmin(valor)');
  const iGuardar = fonte.indexOf('setAdminToken(valor)');
  assert.ok(iChecar > 0 && iGuardar > iChecar, 'confere antes de guardar');
});
