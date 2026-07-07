import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc } from '../public/assets/js/lib/html.js';

test('esc: escapa os cinco caracteres perigosos', () => {
  assert.equal(esc('&'), '&amp;');
  assert.equal(esc('<'), '&lt;');
  assert.equal(esc('>'), '&gt;');
  assert.equal(esc('"'), '&quot;');
  assert.equal(esc("'"), '&#39;');
});

test('esc: escapa uma string com todos juntos preservando a ordem', () => {
  assert.equal(
    esc(`<a href='x' title="y">a & b</a>`),
    '&lt;a href=&#39;x&#39; title=&quot;y&quot;&gt;a &amp; b&lt;/a&gt;',
  );
});

test('esc: & so vira &amp; uma vez (sem dupla escapada)', () => {
  assert.equal(esc('a & b'), 'a &amp; b');
  assert.equal(esc('&lt;'), '&amp;lt;');
});

test('esc: null e undefined viram string vazia', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
});

test('esc: valores nao-string sao convertidos', () => {
  assert.equal(esc(0), '0');
  assert.equal(esc(1234), '1234');
  assert.equal(esc(false), 'false');
  assert.equal(esc(true), 'true');
});

// Guard de seguranca: o antigo esc de index-page.js NAO escapava aspa simples,
// o que abria XSS quando o valor caia em atributo com aspas simples. Agora
// index-page importa da fonte unica; garantimos que a aspa simples e escapada.
test('index-page: usa esc de lib/html.js e escapa aspa simples', async () => {
  const src = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../public/assets/js/index-page.js', import.meta.url), 'utf8'),
  );
  assert.ok(
    /import\s*\{\s*esc\s*\}\s*from\s*['"]\.\/lib\/html\.js['"]/.test(src),
    'index-page importa esc de ./lib/html.js',
  );
  assert.ok(
    !/function\s+esc\s*\(/.test(src),
    'index-page nao redefine esc localmente',
  );
  // A funcao compartilhada escapa aspa simples.
  assert.equal(esc("O'Brien"), 'O&#39;Brien');
});
