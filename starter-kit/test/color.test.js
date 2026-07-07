import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicarAccent, contrastRatio, accentForeground, accentText,
  BG_DARK, BG_LIGHT, DEFAULT_ACCENT,
} from '../public/assets/js/lib/color.js';

// Elemento falso: implementa so o que aplicarAccent usa (style.setProperty/
// getPropertyValue e dataset). Sem DOM real, roda em node:test.
function fakeEl() {
  const vars = {};
  return {
    dataset: {},
    style: {
      setProperty(name, value) { vars[name] = String(value); },
      getPropertyValue(name) { return vars[name] || ''; },
    },
    _vars: vars,
  };
}

// aplicarAccent seta as 4 variaveis e grava dataset.accent.
test('aplicarAccent: seta as 4 variaveis CSS e grava dataset.accent', () => {
  const el = fakeEl();
  aplicarAccent(el, '#6d28d9', true);
  assert.equal(el._vars['--accent'], '#6d28d9');
  assert.ok(el._vars['--accent-fg']);
  assert.ok(el._vars['--accent-text']);
  assert.ok(el._vars['--focus-ring']);
  assert.equal(el.dataset.accent, '#6d28d9');
});

// Hex invalido cai no accent padrao.
test('aplicarAccent: hex invalido usa o accent padrao', () => {
  const el = fakeEl();
  aplicarAccent(el, 'nao-e-hex', false);
  assert.equal(el._vars['--accent'], DEFAULT_ACCENT);
  assert.equal(el.dataset.accent, DEFAULT_ACCENT);
});

// Elemento sem style nao quebra.
test('aplicarAccent: elemento invalido nao lanca', () => {
  assert.doesNotThrow(() => aplicarAccent(null, '#6d28d9', true));
  assert.doesNotThrow(() => aplicarAccent({}, '#6d28d9', true));
});

// --- Regressao central: alternar tema mantem contraste em AMBOS os temas ---
//
// O bug era: aplicar o accent so no tema inicial e, ao trocar de tema pelo
// toggle, nao recalcular --accent-text/--focus-ring. Aqui simulamos os dois
// temas (isDark true/false) via aplicarAccent e afirmamos que, apos aplicar em
// CADA tema, --accent-text passa 4.5:1 e --focus-ring passa 3:1 contra o fundo
// daquele tema. Isso trava a regressao: nenhum tema pode ficar com contraste do
// tema anterior.
const ACCENTS = [
  DEFAULT_ACCENT, // padrao (roxo escuro)
  '#22d3ee',      // ciano claro extremo
  '#f5d90a',      // amarelo claro extremo
];

for (const accent of ACCENTS) {
  test(`aplicarAccent: ${accent} mantem contraste ao alternar tema (claro e escuro)`, () => {
    for (const isDark of [true, false]) {
      const el = fakeEl();
      aplicarAccent(el, accent, isDark);
      const bg = isDark ? BG_DARK : BG_LIGHT;
      const txt = el._vars['--accent-text'];
      const ring = el._vars['--focus-ring'];
      const crText = contrastRatio(txt, bg);
      const crRing = contrastRatio(ring, bg);
      assert.ok(
        crText >= 4.5,
        `${accent} (${isDark ? 'escuro' : 'claro'}): --accent-text ${txt} cr=${crText.toFixed(2)} < 4.5`,
      );
      assert.ok(
        crRing >= 3,
        `${accent} (${isDark ? 'escuro' : 'claro'}): --focus-ring ${ring} cr=${crRing.toFixed(2)} < 3`,
      );
    }
  });
}

// Simula explicitamente o toggle: aplica no tema A, depois no tema B no MESMO
// elemento, e confere que o segundo tema tem contraste correto (nao herdou o A).
test('aplicarAccent: toggle escuro->claro recalcula e passa contraste no claro', () => {
  const el = fakeEl();
  aplicarAccent(el, '#22d3ee', true);  // tema escuro primeiro
  aplicarAccent(el, '#22d3ee', false); // toggle pro claro (reusa dataset.accent)
  const crText = contrastRatio(el._vars['--accent-text'], BG_LIGHT);
  const crRing = contrastRatio(el._vars['--focus-ring'], BG_LIGHT);
  assert.ok(crText >= 4.5, `pos-toggle claro: accent-text cr=${crText.toFixed(2)} < 4.5`);
  assert.ok(crRing >= 3, `pos-toggle claro: focus-ring cr=${crRing.toFixed(2)} < 3`);
});

// --accent-fg (texto sobre a barra de accent, usado no funnel__value) passa AA.
test('aplicarAccent: --accent-fg passa AA (>=4.5) contra o proprio accent', () => {
  for (const accent of ACCENTS) {
    const el = fakeEl();
    aplicarAccent(el, accent, true);
    const fg = el._vars['--accent-fg'];
    const cr = contrastRatio(fg, accent);
    assert.ok(cr >= 4.5, `${accent}: --accent-fg ${fg} sobre accent cr=${cr.toFixed(2)} < 4.5`);
  }
});

// Sanidade: accentForeground e accentText continuam coerentes via color.js.
test('accentForeground/accentText coerentes no modulo compartilhado', () => {
  assert.equal(accentForeground('#6d28d9'), '#fff');
  assert.equal(accentForeground('#f5d90a'), '#111');
  assert.ok(contrastRatio(accentText('#6d28d9', true), BG_DARK) >= 4.5);
});
