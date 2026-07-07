// Trava de regressão do CSS e dos HTML: anti-cara-de-IA + acessibilidade.
// Lê os arquivos como texto (não interpreta CSS), só verifica presença/ausência.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const readPublic = (rel) => readFileSync(join(root, 'public', rel), 'utf8');

const css = readPublic('assets/css/main.css');

test('CSS: sem radial-gradient (evita glow cara-de-IA)', () => {
  assert.ok(!css.includes('radial-gradient('), 'nao deve conter radial-gradient(');
});

test('CSS: contem tokens de acessibilidade e tema', () => {
  assert.ok(css.includes(':focus-visible'), 'precisa de :focus-visible');
  assert.ok(css.includes('[data-theme="light"]'), 'precisa de tema claro');
  assert.ok(css.includes('--accent-fg'), 'precisa do token --accent-fg');
  assert.ok(css.includes('prefers-reduced-motion'), 'precisa respeitar reduced-motion');
  assert.ok(css.includes('tabular-nums'), 'precisa de tabular-nums para numeros');
});

// Anti-"cara de IA": tipografia PROPRIA self-hosted (nao a fonte default do
// sistema, que le como template) + numeros em mono tabular de ferramenta.
test('CSS: fonte propria (Geist) self-hosted via @font-face same-origin', () => {
  assert.ok(css.includes('@font-face'), 'precisa declarar @font-face');
  assert.ok(css.includes('Geist-Variable.woff2'), 'precisa referenciar a Geist Sans local');
  assert.ok(css.includes('GeistMono-Variable.woff2'), 'precisa referenciar a Geist Mono local');
  assert.ok(css.includes("font-display: swap"), 'font-display: swap pra nao piscar em branco');
  // Os arquivos de fonte tem que existir de verdade (senao o @font-face aponta pro vazio).
  for (const f of ['Geist-Variable.woff2', 'GeistMono-Variable.woff2']) {
    const buf = readFileSync(join(root, 'public', 'assets', 'fonts', f));
    assert.equal(buf.slice(0, 4).toString('latin1'), 'wOF2', `${f} precisa ser um woff2 valido`);
  }
});

test('CSS: numeros (KPI/funil/ranking) em mono tabular', () => {
  assert.ok(css.includes('--font-mono'), 'precisa do token --font-mono');
  assert.ok(
    /\.kpi__value[^{]*\{[^}]*var\(--font-mono\)/.test(css) || /\.kpi__value,[^{]*var\(--font-mono\)/.test(css) || css.includes('.kpi .kpi-value, .kpi__value { font-family: var(--font-mono)'),
    'o valor do KPI precisa usar var(--font-mono)',
  );
});

// Identidade visual: classe do logo e cor secundaria no fundo suave.
test('CSS: tem .brand-logo com limites de tamanho', () => {
  assert.ok(/\.brand-logo\s*\{/.test(css), 'precisa da classe .brand-logo');
  assert.ok(css.includes('max-height: 28px'), '.brand-logo precisa limitar a altura');
  assert.ok(css.includes('object-fit: contain'), '.brand-logo precisa de object-fit: contain');
});

test('CSS: area do grafico usa a cor secundaria (--accent-2-soft) com fallback', () => {
  assert.ok(css.includes('--accent-2-soft'), 'precisa do token --accent-2-soft');
  assert.ok(
    /\.chart__area\s*\{[^}]*var\(--accent-2-soft, var\(--accent-soft\)\)/.test(css),
    '.chart__area precisa tingir com var(--accent-2-soft, var(--accent-soft))',
  );
});

const htmlFiles = ['index.html', 'dashboard.html', 'config.html'];

for (const file of htmlFiles) {
  test(`HTML ${file}: script anti-flash de tema + lib/theme.js`, () => {
    const html = readPublic(file);
    assert.ok(html.includes('cd-theme'), `${file} precisa do script inline anti-flash (cd-theme)`);
    assert.ok(html.includes('lib/theme.js'), `${file} precisa incluir lib/theme.js`);
  });
}
