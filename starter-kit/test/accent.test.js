import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accentForeground } from '../public/assets/js/dashboard.js';

// accent escuro (roxo padrao): texto branco
test('accentForeground: accent escuro (#6d28d9) devolve #fff', () => {
  assert.equal(accentForeground('#6d28d9'), '#fff');
});

// accent claro (amarelo): texto escuro pra manter contraste
test('accentForeground: amarelo (#f5d90a) devolve #111', () => {
  assert.equal(accentForeground('#f5d90a'), '#111');
});

// accent claro (ciano): texto escuro
test('accentForeground: ciano (#22d3ee) devolve #111', () => {
  assert.equal(accentForeground('#22d3ee'), '#111');
});

// hex invalido: fallback seguro pro branco (accent padrao e escuro)
test('accentForeground: hex invalido devolve #fff (fallback)', () => {
  assert.equal(accentForeground('nao-e-hex'), '#fff');
  assert.equal(accentForeground('#12'), '#fff');
  assert.equal(accentForeground('#gggggg'), '#fff');
  assert.equal(accentForeground(''), '#fff');
  assert.equal(accentForeground(null), '#fff');
  assert.equal(accentForeground(undefined), '#fff');
});

// aceita forma curta #rgb
test('accentForeground: shorthand #rgb funciona', () => {
  assert.equal(accentForeground('#000'), '#fff'); // preto -> texto branco
  assert.equal(accentForeground('#fff'), '#111'); // branco -> texto escuro
});

// --- Razao de contraste real (WCAG), nao limiar de luminancia ---

// Helpers puros pra conferir a razao de contraste do resultado escolhido.
function _lum(hex) {
  let h = hex.replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(ch[0]) + 0.7152 * lin(ch[1]) + 0.0722 * lin(ch[2]);
}
function _contrast(a, b) {
  const la = _lum(a);
  const lb = _lum(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// Accents medios/claros devem escolher texto ESCURO (#111).
// O limiar de luminancia antigo entregava #fff (ilegivel) em varios destes.
const MEDIOS_CLAROS = ['#0ea5e9', '#10b981', '#22c55e', '#f59e0b', '#f5d90a', '#22d3ee'];
for (const accent of MEDIOS_CLAROS) {
  test(`accentForeground: accent medio/claro ${accent} devolve #111`, () => {
    assert.equal(accentForeground(accent), '#111');
  });
}

// Accents escuros devem escolher texto BRANCO (#fff).
const ESCUROS = ['#6d28d9', '#1e3a8a', '#111827'];
for (const accent of ESCUROS) {
  test(`accentForeground: accent escuro ${accent} devolve #fff`, () => {
    assert.equal(accentForeground(accent), '#fff');
  });
}

// A cor escolhida deve ser a de MAIOR razao de contraste (para tom medio muito
// saturado pode nao chegar a 4.5 com nenhuma; garantimos ao menos o maior).
// Na pratica, todos os pares abaixo tambem passam de 4.5 (AA).
test('accentForeground: escolhe a cor de maior contraste e passa AA (>=4.5)', () => {
  for (const accent of [...MEDIOS_CLAROS, ...ESCUROS]) {
    const chosen = accentForeground(accent);
    const other = chosen === '#111' ? '#fff' : '#111';
    const crChosen = _contrast(accent, chosen);
    const crOther = _contrast(accent, other);
    // maior contraste dos dois
    assert.ok(
      crChosen >= crOther,
      `${accent}: escolhido ${chosen} (cr=${crChosen.toFixed(2)}) deveria ser >= outro (cr=${crOther.toFixed(2)})`
    );
    // e, para esta lista, deve alcancar AA
    assert.ok(
      crChosen >= 4.5,
      `${accent}: contraste do escolhido ${chosen} = ${crChosen.toFixed(2)} < 4.5`
    );
  }
});
