import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaDoPainel, trilhaHtml, acoesHtml } from '../public/assets/js/lib/barra-topo.js';

// A barra do topo é uma trilha ("Meus painéis / Nome  Área") com um grupo único de utilidades
// à direita. Nada de avatar com iniciais nem fileira de botões contornados iguais.

test('área: nome curto pra etiqueta; área desconhecida não inventa etiqueta', () => {
  assert.equal(areaDoPainel('marketing'), 'Marketing');
  assert.equal(areaDoPainel('financeiro'), 'Financeiro');
  assert.equal(areaDoPainel('area-nova'), '');
  assert.equal(areaDoPainel(undefined), '');
});

test('trilha: o caminho de volta vem antes do nome, com ícone, texto e separador', () => {
  const html = trilhaHtml();
  assert.match(html, /<a class="trilha-volta" href="\/"/);
  assert.match(html, /Meus painéis/);
  assert.match(html, /class="trilha-sep" aria-hidden="true"/);
  assert.equal((html.match(/<svg /g) || []).length, 1);
});

test('utilidades: copiar link e reconfigurar, cada uma com ícone e texto', () => {
  const html = acoesHtml({ id: 'estudio-pilates' });
  assert.match(html, /data-copiar-link/);
  assert.match(html, /href="\/config\.html\?id=estudio-pilates"/);
  assert.match(html, /Reconfigurar/);
  assert.equal((html.match(/<svg /g) || []).length, 2, 'um ícone por utilidade');
  assert.equal((html.match(/class="btn-texto"/g) || []).length, 2, 'texto separado pra sumir no celular');
  assert.ok(!/Meus painéis/.test(html), 'a volta mora na trilha, não vira botão');
});

test('utilidades: grupo de abas não tem reconfigurar', () => {
  const html = acoesHtml({ id: 'g1', grupo: true });
  assert.ok(!/Reconfigurar/.test(html));
  assert.match(html, /data-copiar-link/);
});

test('utilidades: id com caractere perigoso sai codificado, nunca cru', () => {
  const html = acoesHtml({ id: '"><script>alert(1)</script>' });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('id=%22%3E%3Cscript%3E'), 'o id entra codificado na URL');
});
