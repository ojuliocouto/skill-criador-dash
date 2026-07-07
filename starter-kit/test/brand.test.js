import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeLogoSrc, brandInnerHtml } from '../public/assets/js/lib/brand.js';

// --- safeLogoSrc: defesa em profundidade no cliente ---
// So aceita https:// ou data:image/. Qualquer outra coisa (javascript:, http://,
// data: nao-imagem, vazio, nao-string) vira '' (sem logo).

test('safeLogoSrc: aceita https://', () => {
  assert.equal(safeLogoSrc('https://cdn.exemplo.com/logo.png'), 'https://cdn.exemplo.com/logo.png');
});

test('safeLogoSrc: aceita data:image/', () => {
  const d = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal(safeLogoSrc(d), d);
});

test('safeLogoSrc: recusa javascript:', () => {
  assert.equal(safeLogoSrc('javascript:alert(1)'), '');
});

test('safeLogoSrc: recusa http:// (nao seguro)', () => {
  assert.equal(safeLogoSrc('http://cdn.exemplo.com/logo.png'), '');
});

test('safeLogoSrc: recusa data: nao-imagem', () => {
  assert.equal(safeLogoSrc('data:text/html,<script>alert(1)</script>'), '');
});

test('safeLogoSrc: recusa vazio, null, nao-string', () => {
  assert.equal(safeLogoSrc(''), '');
  assert.equal(safeLogoSrc(null), '');
  assert.equal(safeLogoSrc(undefined), '');
  assert.equal(safeLogoSrc(42), '');
});

test('safeLogoSrc: tolera espacos ao redor mas mantem o esquema', () => {
  assert.equal(safeLogoSrc('  https://x.com/a.png  '), 'https://x.com/a.png');
});

// --- brandInnerHtml: <img class="brand-logo"> com src seguro, senao .dot ---
// Escapa alt e src. Sem logo (ou src inseguro) -> .dot + nome. Com logo seguro
// -> img (sem o .dot) + nome.

test('brandInnerHtml: sem logo cai no .dot com o nome escapado', () => {
  const html = brandInnerHtml('Meu Dash', '');
  assert.ok(html.includes('class="dot"'), 'deve conter o .dot');
  assert.ok(!html.includes('brand-logo'), 'nao deve conter img de logo');
  assert.ok(html.includes('Meu Dash'), 'deve conter o nome');
});

test('brandInnerHtml: com logo seguro vira <img class="brand-logo"> e some o .dot', () => {
  const html = brandInnerHtml('ACME', 'https://cdn.acme.com/logo.png');
  assert.ok(html.includes('class="brand-logo"'), 'deve conter a img de logo');
  assert.ok(html.includes('src="https://cdn.acme.com/logo.png"'), 'src do logo');
  assert.ok(!html.includes('class="dot"'), 'nao deve conter o .dot quando ha logo');
});

test('brandInnerHtml: src inseguro (javascript:) NAO vira img, cai no .dot', () => {
  const html = brandInnerHtml('X', 'javascript:alert(1)');
  assert.ok(!html.includes('brand-logo'), 'nao pode virar img com src inseguro');
  assert.ok(!html.includes('javascript:'), 'nao pode injetar o src inseguro');
  assert.ok(html.includes('class="dot"'), 'deve cair no .dot');
});

test('brandInnerHtml: escapa aspas no nome (alt) contra quebra de atributo', () => {
  const html = brandInnerHtml('a" onerror="x', 'https://x.com/a.png');
  assert.ok(!html.includes('onerror="x'), 'nao pode escapar do atributo alt');
  assert.ok(html.includes('&quot;'), 'aspas devem virar entidade');
});

test('brandInnerHtml: escapa o proprio src (defesa extra)', () => {
  // Um https com aspas dentro (bizarro, mas nao pode quebrar o atributo).
  const html = brandInnerHtml('n', 'https://x.com/a".png');
  assert.ok(!html.includes('a".png"'), 'aspas do src devem ser escapadas');
});
