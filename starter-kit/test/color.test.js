import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicarAccent, contrastRatio, accentForeground, accentText,
  composite, fgForBackground, funnelBarBg, badgeSoftBg, badgeText,
  accentGraph, accentFill, THEME_SURFACES,
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

// --- Regressao: contraste medido contra o fundo COMPOSTO (nao o accent cru) ---
//
// O bug: --accent-fg (branco/preto derivado do ACCENT CRU) ficava sobre a barra
// do funil, cujo fundo REAL e --accent-graph com opacity 0.85 sobre --bg-elev-2,
// visivelmente MAIS CLARO que o accent. Pra accents mainstream (indigo etc.) o
// branco dava so ~3.68:1 e reprovava AA (13px/600 => limiar 4.5). O badge tinha
// a mesma raiz: --accent-text sobre --accent-soft composto chegava a ~4.26:1.
// O fix mede o contraste contra a cor composta VISIVEL. Estes testes travam a
// regressao pros accents mainstream E extremos, nos DOIS temas.

// composite: 100% do fg = fg; 0% = bg; espelha mixSrgb.
test('composite: alpha 1 = fg, alpha 0 = bg', () => {
  assert.equal(composite('#ffffff', '#000000', 1), '#ffffff');
  assert.equal(composite('#ffffff', '#000000', 0), '#000000');
  // 50% branco sobre preto ~ cinza medio
  assert.equal(composite('#ffffff', '#000000', 0.5), '#808080');
});

// fgForBackground escolhe a cor de MAIOR contraste contra o fundo composto.
test('fgForBackground: escolhe #000 sobre fundo claro e #fff sobre escuro', () => {
  assert.equal(fgForBackground('#eeeeee'), '#000');
  assert.equal(fgForBackground('#222222'), '#fff');
  assert.equal(fgForBackground('nao-e-hex'), '#fff'); // invalido -> fallback
});

const ACCENTS_CONTRASTE = [
  '#6366f1', // indigo mainstream
  '#7c3aed', // violeta mainstream
  '#2563eb', // azul mainstream
  '#6d28d9', // roxo padrao
  '#22d3ee', // ciano extremo (claro)
  '#f5d90a', // amarelo extremo (claro)
];

// Nucleo do fix pro funil: apos aplicarAccent, --funnel-fg tem que passar 4.5:1
// contra a barra COMPOSTA (nao contra o accent cru), nos dois temas.
for (const accent of ACCENTS_CONTRASTE) {
  test(`funnel: ${accent} --funnel-fg passa 4.5:1 sobre a barra composta (2 temas)`, () => {
    for (const isDark of [true, false]) {
      const el = fakeEl();
      aplicarAccent(el, accent, isDark);
      const fg = el._vars['--funnel-fg'];
      const barBg = funnelBarBg(accent, isDark);
      const cr = contrastRatio(fg, barBg);
      assert.ok(
        cr >= 4.5,
        `${accent} (${isDark ? 'escuro' : 'claro'}): --funnel-fg ${fg} sobre barra ${barBg} cr=${cr.toFixed(2)} < 4.5`,
      );
    }
  });
}

// Nucleo do fix pro badge: --badge-fg tem que passar 4.5:1 contra o fundo
// COMPOSTO do badge (--accent-soft sobre o card), nos dois temas.
for (const accent of ACCENTS_CONTRASTE) {
  test(`badge: ${accent} --badge-fg passa 4.5:1 sobre o accent-soft composto (2 temas)`, () => {
    for (const isDark of [true, false]) {
      const el = fakeEl();
      aplicarAccent(el, accent, isDark);
      const fg = el._vars['--badge-fg'];
      const softBg = badgeSoftBg(accent, isDark);
      const cr = contrastRatio(fg, softBg);
      assert.ok(
        cr >= 4.5,
        `${accent} (${isDark ? 'escuro' : 'claro'}): --badge-fg ${fg} sobre soft ${softBg} cr=${cr.toFixed(2)} < 4.5`,
      );
    }
  });
}

// Prova da raiz do bug: medir contra o accent CRU passava, mas contra o fundo
// COMPOSTO reprovava com a cor antiga (--accent-fg no funil). O --funnel-fg novo
// conserta. Usa indigo #6366f1 no escuro (caso citado no brief, ~3.68:1).
test('funnel: raiz do bug -- accent-fg cru reprovava sobre a barra composta, --funnel-fg conserta', () => {
  const accent = '#6366f1';
  const barBg = funnelBarBg(accent, true);
  // A cor ANTIGA (branco escolhido contra o accent cru escuro) reprova sobre a barra.
  const crAntigo = contrastRatio(accentForeground(accent), barBg);
  assert.ok(crAntigo < 4.5, `sanity: --accent-fg antigo sobre a barra deveria reprovar (cr=${crAntigo.toFixed(2)})`);
  const el = fakeEl();
  aplicarAccent(el, accent, true);
  const crNovo = contrastRatio(el._vars['--funnel-fg'], barBg);
  assert.ok(crNovo >= 4.5, `--funnel-fg novo sobre a barra cr=${crNovo.toFixed(2)} < 4.5`);
});

// aplicarAccent agora seta tambem --funnel-fg e --badge-fg (alem das 4 antigas).
test('aplicarAccent: seta --funnel-fg e --badge-fg', () => {
  const el = fakeEl();
  aplicarAccent(el, '#6366f1', true);
  assert.ok(el._vars['--funnel-fg'], 'faltou --funnel-fg');
  assert.ok(el._vars['--badge-fg'], 'faltou --badge-fg');
});

// Toggle de tema recalcula as vars compostas no MESMO elemento (nao herda o tema
// anterior), igual as outras vars derivadas.
test('aplicarAccent: toggle recalcula --funnel-fg/--badge-fg pro tema novo', () => {
  const accent = '#2563eb';
  const el = fakeEl();
  aplicarAccent(el, accent, true);   // escuro
  aplicarAccent(el, accent, false);  // toggle pro claro
  const crFunnel = contrastRatio(el._vars['--funnel-fg'], funnelBarBg(accent, false));
  const crBadge = contrastRatio(el._vars['--badge-fg'], badgeSoftBg(accent, false));
  assert.ok(crFunnel >= 4.5, `pos-toggle claro funnel cr=${crFunnel.toFixed(2)} < 4.5`);
  assert.ok(crBadge >= 4.5, `pos-toggle claro badge cr=${crBadge.toFixed(2)} < 4.5`);
});

// --- Regressao GRAVE: --accent-graph (linha/barras do grafico) e --accent-text
// (links) tem que passar contraste contra a superficie do CARD (--bg-elev), nao
// so contra o fundo do tema. Antes o --accent-graph (mix 70/30 fixo do CSS) com
// accent claro no tema claro media 2.06:1 contra o card e reprovava WCAG 1.4.11
// (objeto grafico exige 3:1). accent-text media contra --bg e passava fora do
// card mas reprovava DENTRO dele no escuro. ---

const ACCENTS_GRAPH = [
  '#ffff00', // amarelo claro extremo
  '#22d3ee', // ciano claro extremo
  '#6366f1', // indigo mainstream
  '#6d28d9', // roxo padrao (mainstream)
];

for (const accent of ACCENTS_GRAPH) {
  test(`accent-graph: ${accent} passa 3:1 sobre --bg-elev do tema (2 temas)`, () => {
    for (const isDark of [true, false]) {
      const el = fakeEl();
      aplicarAccent(el, accent, isDark);
      const surface = (isDark ? THEME_SURFACES.dark : THEME_SURFACES.light).card;
      const graph = el._vars['--accent-graph-calc'];
      assert.ok(graph, `${accent} (${isDark ? 'escuro' : 'claro'}): faltou --accent-graph-calc`);
      const cr = contrastRatio(graph, surface);
      assert.ok(
        cr >= 3,
        `${accent} (${isDark ? 'escuro' : 'claro'}): --accent-graph ${graph} sobre card ${surface} cr=${cr.toFixed(2)} < 3`,
      );
    }
  });

  test(`accent-text: ${accent} passa 4.5:1 sobre --bg-elev (dentro do card, 2 temas)`, () => {
    for (const isDark of [true, false]) {
      const el = fakeEl();
      aplicarAccent(el, accent, isDark);
      const surface = (isDark ? THEME_SURFACES.dark : THEME_SURFACES.light).card;
      const txt = el._vars['--accent-text'];
      const cr = contrastRatio(txt, surface);
      assert.ok(
        cr >= 4.5,
        `${accent} (${isDark ? 'escuro' : 'claro'}): --accent-text ${txt} sobre card ${surface} cr=${cr.toFixed(2)} < 4.5`,
      );
    }
  });
}

// aplicarAccent grava --accent-graph-calc (a var que o main.css consome com
// fallback pro color-mix).
test('aplicarAccent: seta --accent-graph-calc', () => {
  const el = fakeEl();
  aplicarAccent(el, '#22d3ee', false);
  assert.ok(el._vars['--accent-graph-calc'], 'faltou --accent-graph-calc');
});

// accentGraph preserva o tom quando o mix 70/30 ja passa 3:1 (nao empurra a toa).
test('accentGraph: preserva o mix quando ja passa 3:1', () => {
  // Roxo padrao no escuro: o mix accent 70% + text 30% deve passar folgado.
  const g = accentGraph('#6d28d9', true);
  assert.notEqual(g, '#ffffff');
  assert.notEqual(g, '#000000');
});

// --- Regressao: --accent-fill-calc (barra de progresso da meta, objeto grafico
// WCAG 1.4.11; + decorativos de marca .kpi::before/.dot e borda de foco do
// input) tem que passar >=3:1 contra --bg-elev-2, a superficie imediatamente
// atras desses elementos. Antes esses pontos pintavam o accent CRU: o accent
// padrao #6d28d9 media so 2.32:1 no escuro (reprova) e accents claros extremos
// (#ffff00 1.11, #ffffff 1.14, #22d3ee 1.35) sumiam no tema claro. ---

const ACCENTS_FILL = [
  '#6d28d9', // roxo padrao (reprovava CRU no escuro)
  '#ffff00', // amarelo claro extremo (sumia CRU no claro)
  '#22d3ee', // ciano claro extremo
  '#ffffff', // branco extremo
  '#6366f1', // indigo mainstream
];

for (const accent of ACCENTS_FILL) {
  test(`accent-fill: ${accent} --accent-fill-calc passa 3:1 sobre --bg-elev-2 (2 temas)`, () => {
    for (const isDark of [true, false]) {
      const el = fakeEl();
      aplicarAccent(el, accent, isDark);
      const surface = (isDark ? THEME_SURFACES.dark : THEME_SURFACES.light).bgElev2;
      const fill = el._vars['--accent-fill-calc'];
      assert.ok(fill, `${accent} (${isDark ? 'escuro' : 'claro'}): faltou --accent-fill-calc`);
      const cr = contrastRatio(fill, surface);
      assert.ok(
        cr >= 3,
        `${accent} (${isDark ? 'escuro' : 'claro'}): --accent-fill-calc ${fill} sobre --bg-elev-2 ${surface} cr=${cr.toFixed(2)} < 3`,
      );
    }
  });
}

// Prova da raiz do bug: o accent CRU reprovava 3:1 sobre --bg-elev-2 (accent
// padrao no escuro, accent claro no claro), e o --accent-fill-calc conserta.
test('accent-fill: raiz do bug -- accent cru reprovava sobre --bg-elev-2, --accent-fill-calc conserta', () => {
  // roxo padrao no escuro: cru ~2.32:1 (reprova)
  const darkSurf = THEME_SURFACES.dark.bgElev2;
  assert.ok(
    contrastRatio('#6d28d9', darkSurf) < 3,
    `sanity: #6d28d9 cru sobre --bg-elev-2 escuro deveria reprovar (cr=${contrastRatio('#6d28d9', darkSurf).toFixed(2)})`,
  );
  const elDark = fakeEl();
  aplicarAccent(elDark, '#6d28d9', true);
  assert.ok(contrastRatio(elDark._vars['--accent-fill-calc'], darkSurf) >= 3);
  // branco extremo no claro: cru ~1.14:1 (reprova)
  const lightSurf = THEME_SURFACES.light.bgElev2;
  assert.ok(
    contrastRatio('#ffffff', lightSurf) < 3,
    `sanity: #ffffff cru sobre --bg-elev-2 claro deveria reprovar (cr=${contrastRatio('#ffffff', lightSurf).toFixed(2)})`,
  );
  const elLight = fakeEl();
  aplicarAccent(elLight, '#ffffff', false);
  assert.ok(contrastRatio(elLight._vars['--accent-fill-calc'], lightSurf) >= 3);
});

// aplicarAccent grava --accent-fill-calc.
test('aplicarAccent: seta --accent-fill-calc', () => {
  const el = fakeEl();
  aplicarAccent(el, '#22d3ee', false);
  assert.ok(el._vars['--accent-fill-calc'], 'faltou --accent-fill-calc');
});

// accentFill preserva o tom da marca quando o accent puro ja passa 3:1.
test('accentFill: preserva o accent puro quando ja passa 3:1', () => {
  // indigo #6366f1 no escuro contra --bg-elev-2 escuro deve passar folgado.
  const f = accentFill('#6366f1', true);
  assert.notEqual(f, '#ffffff');
  assert.notEqual(f, '#000000');
});

// badgeText mantem o TOM da marca (nao vira branco/preto chapado) quando o
// proprio accent ja passa: garante que nao viramos tudo em #fff/#111.
test('badgeText: preserva o tom da marca quando o accent ja passa o contraste', () => {
  // Amarelo claro no tema claro: fundo do badge e quase branco, o accent puro
  // provavelmente nao passa e recalibra escurecendo; ainda assim nao e preto puro.
  const fg = badgeText('#6d28d9', false); // roxo no claro
  assert.notEqual(fg, '#000000');
  assert.notEqual(fg, '#ffffff');
});
