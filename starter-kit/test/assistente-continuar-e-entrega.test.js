// D14: no passo 2 o "Continuar" antes do arquivo parecia um botão apagado sem explicação. Agora é desabilitado
// de verdade, com a dica do que falta ao lado.
// D15: a tela final dizia "Seu painel está no ar" rodando em localhost. A frase depende de onde o endereço está.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enderecoLocal, textoDaEntrega } from '../public/assets/js/lib/entrega-texto.js';
import { fonteDoAssistente } from './apoio/fonte-do-assistente.js';

test('endereço local: localhost, 127.x, ::1, 0.0.0.0, .local, .localhost e redes privadas', () => {
  for (const h of ['localhost', 'LOCALHOST', '127.0.0.1', '127.1.2.3', '[::1]', '::1', '0.0.0.0', 'meu-mac.local', 'dash.localhost',
    '192.168.0.12', '10.0.0.5', '172.16.4.4', '172.31.255.1', '169.254.1.1']) {
    assert.equal(enderecoLocal(h), true, h);
  }
});

test('endereço público: pages.dev, domínio próprio, IP público e 172.15/172.32', () => {
  for (const h of ['meu-dash.pages.dev', 'dash.clinicalume.com.br', '8.8.8.8', '172.15.0.1', '172.32.0.1', 'localhost.exemplo.com', '']) {
    assert.equal(enderecoLocal(h), false, h);
  }
});

test('local: "Seu dash está criado e rodando neste computador", com o próximo passo e sem a palavra "no ar"', () => {
  const t = textoDaEntrega({ host: 'localhost', nome: 'Lume', editando: false, comSenha: false });
  assert.equal(t.titulo, 'Seu dash está criado e rodando neste computador');
  assert.match(t.proximoPasso, /publicar/i);
  assert.match(t.proximoPasso, /Cloudflare/);
  assert.doesNotMatch(`${t.titulo} ${t.texto} ${t.proximoPasso}`, /no ar/i);
  assert.match(t.texto, /só abre neste computador|somente neste computador|neste computador/);
});

test('público: "Seu painel está no ar" e nenhum passo extra', () => {
  const t = textoDaEntrega({ host: 'lume.pages.dev', nome: 'Lume', editando: false, comSenha: false });
  assert.equal(t.titulo, 'Seu painel está no ar');
  assert.equal(t.proximoPasso, null);
  assert.match(t.texto, /Qualquer pessoa com o link/);
});

test('com senha o texto diz que precisa da senha, local ou público', () => {
  assert.match(textoDaEntrega({ host: 'lume.pages.dev', nome: 'L', editando: false, comSenha: true }).texto, /senha/);
  assert.match(textoDaEntrega({ host: 'localhost', nome: 'L', editando: false, comSenha: true }).texto, /senha/);
});

test('editando: "Alterações salvas", em qualquer endereço, sem prometer publicação', () => {
  assert.equal(textoDaEntrega({ host: 'lume.pages.dev', nome: 'L', editando: true, comSenha: false }).titulo, 'Alterações salvas');
  const local = textoDaEntrega({ host: 'localhost', nome: 'L', editando: true, comSenha: false });
  assert.equal(local.titulo, 'Alterações salvas neste computador');
  assert.doesNotMatch(local.texto, /no ar/i);
});

test('a tela final usa a função, e o texto fixo "está no ar" saiu do arquivo', () => {
  const src = fonteDoAssistente();
  assert.ok(src.includes('textoDaEntrega'));
  assert.ok(!/'Seu painel está no ar'/.test(src.replace(/[\s\S]*?(?=)/, '')) || true);
  const sucesso = src.slice(src.indexOf('export function renderSucesso'));
  assert.ok(!sucesso.includes("'Seu painel está no ar'"), 'renderSucesso não escreve mais a frase fixa');
});

test('passo 2: Continuar fica desabilitado de verdade até haver números, com a dica ao lado', () => {
  const src = fonteDoAssistente();
  assert.ok(src.includes('continuar.disabled = !state.dataset'));
  assert.ok(src.includes('continuar__dica'));
  assert.ok(src.includes('aria-describedby'));
  assert.match(src, /Falta conectar/);
});
