import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monograma, subtituloDoPainel, acoesHtml } from '../public/assets/js/lib/barra-topo.js';

// A barra do topo é a primeira coisa que o dono vê. Marca com monograma (quando não há
// logotipo), subtítulo dizendo o que é o painel e ações com ícone.

test('monograma: iniciais das duas primeiras palavras, em maiúscula', () => {
  assert.equal(monograma('Studio Equilíbrio - Anúncios'), 'SE');
  assert.equal(monograma('padaria'), 'P');
  assert.equal(monograma('  ótica central  '), 'ÓC');
});

test('monograma: ignora símbolo e número solto; vazio vira D de Dashboard', () => {
  assert.equal(monograma('- 2026 Vendas'), 'V');
  assert.equal(monograma(''), 'D');
  assert.equal(monograma(null), 'D');
});

test('subtítulo: diz a área do painel; área desconhecida não inventa nome', () => {
  assert.equal(subtituloDoPainel('marketing'), 'Painel de marketing');
  assert.equal(subtituloDoPainel('vendas'), 'Painel de vendas');
  assert.equal(subtituloDoPainel('financeiro'), 'Painel financeiro');
  assert.equal(subtituloDoPainel('area-nova'), 'Painel');
  assert.equal(subtituloDoPainel(undefined), 'Painel');
});

test('ações: copiar link, reconfigurar e meus painéis, cada uma com ícone e texto', () => {
  const html = acoesHtml({ id: 'estudio-pilates' });
  assert.match(html, /data-copiar-link/);
  assert.match(html, /href="\/config\.html\?id=estudio-pilates"/);
  assert.match(html, /Reconfigurar/);
  assert.match(html, /href="\/"/);
  assert.match(html, /Meus painéis/);
  assert.equal((html.match(/<svg /g) || []).length, 3, 'um ícone por ação');
  assert.equal((html.match(/class="btn-texto"/g) || []).length, 3, 'texto separado pra sumir no celular');
  assert.ok(!/aria-hidden="true"[^>]*>[^<]*<\/a>/.test(html));
});

test('ações: grupo de abas não tem reconfigurar', () => {
  const html = acoesHtml({ id: 'g1', grupo: true });
  assert.ok(!/Reconfigurar/.test(html));
  assert.match(html, /Meus painéis/);
});

test('ações: id com caractere perigoso sai codificado, nunca cru', () => {
  const html = acoesHtml({ id: '"><script>alert(1)</script>' });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('id=%22%3E%3Cscript%3E'), 'o id entra codificado na URL');
});
