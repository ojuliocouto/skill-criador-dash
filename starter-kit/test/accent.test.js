import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accentForeground, accentText } from '../public/assets/js/dashboard.js';

// Fundos reais dos temas (espelham --bg no main.css).
const BG_DARK = '#0c0e12';
const BG_LIGHT = '#f5f6f8';

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

// --- accentText: texto de destaque e anel de foco com contraste garantido ---

// Cobre accent padrao, claros (que o color-mix reprovava) e escuros, nos 2 temas.
const ACCENTS_TESTE = [
  '#6d28d9', // padrao (roxo)
  '#22d3ee', // ciano claro
  '#f5d90a', // amarelo claro
  '#0ea5e9', // azul medio
  '#10b981', // verde medio
  '#1e3a8a', // azul escuro
  '#111827', // quase preto
];

// O texto de destaque (--accent-text) tem que passar 4.5:1 (AA) contra o fundo
// do tema, no escuro E no claro, pra qualquer accent do wizard.
for (const accent of ACCENTS_TESTE) {
  test(`accentText: ${accent} passa 4.5:1 no escuro e no claro`, () => {
    const dark = accentText(accent, true);
    const light = accentText(accent, false);
    const crDark = _contrast(dark, BG_DARK);
    const crLight = _contrast(light, BG_LIGHT);
    assert.ok(crDark >= 4.5, `${accent} escuro: ${dark} cr=${crDark.toFixed(2)} < 4.5`);
    assert.ok(crLight >= 4.5, `${accent} claro: ${light} cr=${crLight.toFixed(2)} < 4.5`);
  });
}

// O anel de foco (reusa accentText) precisa de >=3:1 contra o fundo do tema.
for (const accent of ACCENTS_TESTE) {
  test(`accentText como focus-ring: ${accent} passa 3:1 nos 2 temas`, () => {
    const crDark = _contrast(accentText(accent, true), BG_DARK);
    const crLight = _contrast(accentText(accent, false), BG_LIGHT);
    assert.ok(crDark >= 3, `${accent} escuro focus cr=${crDark.toFixed(2)} < 3`);
    assert.ok(crLight >= 3, `${accent} claro focus cr=${crLight.toFixed(2)} < 3`);
  });
}

// Hex invalido cai no accent padrao (nunca devolve algo que reprova).
test('accentText: hex invalido usa o accent padrao e ainda passa AA', () => {
  for (const bad of ['nao-e-hex', '', null, undefined, '#12']) {
    const crDark = _contrast(accentText(bad, true), BG_DARK);
    const crLight = _contrast(accentText(bad, false), BG_LIGHT);
    assert.ok(crDark >= 4.5, `invalido escuro cr=${crDark.toFixed(2)}`);
    assert.ok(crLight >= 4.5, `invalido claro cr=${crLight.toFixed(2)}`);
  }
});

// O accent padrao cru reprova 3:1 como anel de foco no escuro (era o bug);
// o accentText derivado tem que consertar isso.
test('accentText: conserta o foco do accent padrao no escuro (era 2.72:1)', () => {
  assert.ok(_contrast('#6d28d9', BG_DARK) < 3, 'sanity: accent cru reprovava 3:1');
  assert.ok(_contrast(accentText('#6d28d9', true), BG_DARK) >= 3, 'accentText passa 3:1');
});
