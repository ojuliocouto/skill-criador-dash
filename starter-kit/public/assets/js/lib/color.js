// Helpers de cor WCAG compartilhados entre o dashboard e o wizard de config.
// ESM puro, SEM DOM (a nao ser aplicarAccent, que so escreve variaveis CSS num
// elemento ja recebido por parametro). A logica de contraste foi extraida de
// dashboard.js para um so lugar, pra o toggle de tema (theme.js) e o preview do
// wizard (config-wizard.js) recalcularem as mesmas cores derivadas.

export const DEFAULT_ACCENT = '#6d28d9';

// Fundo real de cada tema (mesmos valores de --bg no main.css). Usados para
// medir a razao de contraste do texto de accent contra o fundo do tema.
export const BG_DARK = '#0c0e12';
export const BG_LIGHT = '#f5f6f8';

// Constantes de superficie por tema (espelham as vars do main.css). Como as
// cores de texto SOBRE fundos compostos (barra do funil, badge) precisam ser
// medidas contra a cor VISIVEL do fundo (nao contra o accent cru), o color.js
// precisa saber os tons de superficie de cada tema pra recompor esse fundo.
// Mantenha em sincronia com :root e [data-theme="light"] no main.css:
//   bgElev2 = --bg-elev-2 (fundo da trilha da barra do funil)
//   card    = --bg-elev   (fundo do .card onde o badge normalmente vive)
//   text    = --text      (usado no --accent-graph = accent 70% + text 30%)
export const THEME_SURFACES = {
  dark: { bgElev2: '#1b1f27', card: '#14171d', text: '#e9ecf1' },
  light: { bgElev2: '#eef0f3', card: '#ffffff', text: '#191c22' },
};

// Opacidade da barra do funil (main.css .funnel__bar { opacity: 0.85 }).
const FUNNEL_BAR_ALPHA = 0.85;
// Peso do accent no --accent-soft (main.css: color-mix(accent 13%, transparent)).
const ACCENT_SOFT_PCT = 13;
// Peso do accent no --accent-graph (main.css: color-mix(accent 70%, text 30%)).
const ACCENT_GRAPH_PCT = 70;

// Faz o parse de um hex (#rgb ou #rrggbb) em [r,g,b]. Retorna null se invalido.
export function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// Converte [r,g,b] de volta em hex, com clamp em 0..255.
export function toHex(rgb) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return '#' + c(rgb[0]) + c(rgb[1]) + c(rgb[2]);
}

// Luminancia relativa WCAG a partir de [r,g,b].
export function luminance(rgb) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

// Razao de contraste WCAG entre dois hex. Hex invalido conta como preto.
export function contrastRatio(hexA, hexB) {
  const la = luminance(parseHex(hexA) || [0, 0, 0]) + 0.05;
  const lb = luminance(parseHex(hexB) || [0, 0, 0]) + 0.05;
  return la > lb ? la / lb : lb / la;
}

// Mistura srgb simples: pct% do accent + (100-pct)% da outra cor. Espelha o
// comportamento do color-mix(in srgb, ...) usado no CSS.
export function mixSrgb(accentHex, otherHex, pctAccent) {
  const a = parseHex(accentHex) || [0, 0, 0];
  const o = parseHex(otherHex) || [0, 0, 0];
  const t = pctAccent / 100;
  return toHex([
    a[0] * t + o[0] * (1 - t),
    a[1] * t + o[1] * (1 - t),
    a[2] * t + o[2] * (1 - t),
  ]);
}

/**
 * Cor derivada do accent para uso como TEXTO (links, badges) ou anel de foco.
 * Garante razao de contraste >= target contra o fundo do tema: no escuro clareia
 * o accent (mistura com branco) e no claro escurece (mistura com preto), iterando
 * ate a razao passar. Assim um accent claro escolhido no wizard nao vira texto
 * ilegivel. Hex invalido cai no accent padrao.
 *
 * @param {string} hex cor do accent (#rgb ou #rrggbb)
 * @param {boolean} isDark true = tema escuro (fundo BG_DARK), false = claro
 * @param {number} [target=4.5] razao de contraste minima desejada
 * @returns {string} hex de 6 digitos com contraste >= target (ou o extremo)
 */
export function accentText(hex, isDark, target = 4.5) {
  const base = parseHex(hex) ? hex : DEFAULT_ACCENT;
  // Mede contra o fundo do tema (--bg) E contra a superficie do CARD (--bg-elev)
  // e exige >=target nos DOIS. Links vivem tanto sobre --bg quanto DENTRO de
  // cards; conforme o tema, a pior superficie muda (no escuro o card e mais
  // claro e reprova o texto claro; no claro o --bg e mais escuro que o card e
  // reprova o texto escuro). Garantir os dois cobre link em qualquer lugar.
  const S = isDark ? THEME_SURFACES.dark : THEME_SURFACES.light;
  const bg = isDark ? BG_DARK : BG_LIGHT;
  const card = S.card;
  const passes = (c) => contrastRatio(c, bg) >= target && contrastRatio(c, card) >= target;
  const toward = isDark ? '#ffffff' : '#000000';
  // Se o accent puro ja passa nos dois, usa ele (mantem a cor da marca).
  const pure = toHex(parseHex(base));
  if (passes(pure)) return pure;
  // Senao, mistura progressivamente na direcao do extremo (branco/preto)
  // ate o contraste alcancar o alvo em ambas as superficies.
  for (let p = 95; p >= 0; p -= 5) {
    const cand = mixSrgb(base, toward, p);
    if (passes(cand)) return cand;
  }
  return toward; // nem o extremo puro passou (nao deve acontecer)
}

/**
 * Decide a cor do texto que fica SOBRE o accent (fundo de botao, chip ativo).
 * Em vez de um limiar de luminancia (que reprova WCAG em accents de tom medio),
 * calcula a razao de contraste REAL do accent contra texto escuro (#111) e
 * contra texto branco (#fff) e devolve a cor de MAIOR contraste. Empate ou
 * dominio do escuro devolve '#111'. Hex invalido cai no fallback '#fff'
 * (o accent padrao e escuro).
 *
 * @param {string} hex cor do accent (#rgb ou #rrggbb)
 * @returns {'#111'|'#fff'}
 */
export function accentForeground(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return '#fff';
  // Razao de contraste do accent contra texto escuro (#111) e branco (#fff).
  const crBlack = contrastRatio(hex, '#111');
  const crWhite = contrastRatio(hex, '#fff');
  // Escolhe a cor com MAIOR razao de contraste (empate favorece o escuro).
  return crBlack >= crWhite ? '#111' : '#fff';
}

/**
 * Compoe fgHex sobre bgHex com opacidade alpha (0..1) e devolve a cor OPACA
 * resultante em hex. Espelha o que o navegador pinta quando um elemento com
 * background semi-transparente (opacity/alpha) fica sobre um fundo solido:
 * resultado = fg*alpha + bg*(1-alpha). Reusa mixSrgb (pctAccent = alpha*100).
 *
 * @param {string} fgHex cor de cima (com "transparencia" simulada por alpha)
 * @param {string} bgHex cor de baixo (fundo solido)
 * @param {number} alpha opacidade de fgHex, 0..1
 * @returns {string} hex de 6 digitos da cor visivel composta
 */
export function composite(fgHex, bgHex, alpha) {
  const a = Math.max(0, Math.min(1, Number(alpha)));
  return mixSrgb(fgHex, bgHex, a * 100);
}

/**
 * Escolhe a cor de texto (#000 ou #fff) de MAIOR contraste contra um fundo JA
 * COMPOSTO (cor visivel, opaca). Diferente de accentForeground, que mede contra
 * o accent cru: aqui o bg ja e a cor real pintada na tela (ex: barra do funil
 * composta). Usa os extremos PUROS (#000/#fff) de proposito: em fundos de tom
 * medio (accents mainstream sobre a barra) so o extremo puro alcanca AA 4.5:1;
 * um "quase-preto" como #111 fica ~0.2 abaixo e reprova. Empate favorece o
 * branco. Hex invalido cai em '#fff'.
 *
 * @param {string} bgHex fundo composto (opaco) onde o texto vai aparecer
 * @returns {'#000'|'#fff'}
 */
export function fgForBackground(bgHex) {
  if (!parseHex(bgHex)) return '#fff';
  const crBlack = contrastRatio(bgHex, '#000');
  const crWhite = contrastRatio(bgHex, '#fff');
  return crWhite >= crBlack ? '#fff' : '#000';
}

/**
 * Cor VISIVEL da barra do funil pro accent/tema dados. A barra usa
 * --accent-graph (accent 70% + text 30%) com opacity 0.85 sobre --bg-elev-2,
 * entao a cor real e mais clara que o accent cru. Compoe tudo e devolve o hex.
 *
 * @param {string} accentHex accent da marca
 * @param {boolean} isDark tema escuro?
 * @returns {string} hex da cor composta da barra
 */
export function funnelBarBg(accentHex, isDark) {
  const S = isDark ? THEME_SURFACES.dark : THEME_SURFACES.light;
  const graph = mixSrgb(accentHex, S.text, ACCENT_GRAPH_PCT);
  return composite(graph, S.bgElev2, FUNNEL_BAR_ALPHA);
}

/**
 * Cor VISIVEL do fundo do badge pro accent/tema dados. O badge usa
 * --accent-soft (accent 13% sobre transparente) e normalmente vive dentro de um
 * .card (--bg-elev), o fundo mais claro entre os possiveis: calibrar contra ele
 * garante contraste tambem sobre --bg e --bg-elev-2 (mais escuros/claros o
 * suficiente pra so ajudar). Compoe accent 13% sobre o card e devolve o hex.
 *
 * @param {string} accentHex accent da marca
 * @param {boolean} isDark tema escuro?
 * @returns {string} hex da cor composta do fundo do badge
 */
export function badgeSoftBg(accentHex, isDark) {
  const S = isDark ? THEME_SURFACES.dark : THEME_SURFACES.light;
  return composite(accentHex, S.card, ACCENT_SOFT_PCT / 100);
}

/**
 * Cor de TEXTO do badge: mantem o tom da marca (nao vira branco/preto chapado
 * como um botao), mas garante >=target contra o fundo COMPOSTO do badge. Parte
 * do accent e mistura progressivamente na direcao do extremo legivel (branco no
 * escuro, preto no claro) ate a razao passar. Mesma tecnica do accentText, mas
 * medida contra o fundo composto do badge, nao contra o fundo do tema.
 *
 * @param {string} hex accent da marca
 * @param {boolean} isDark tema escuro?
 * @param {number} [target=4.5] razao minima desejada
 * @returns {string} hex com contraste >= target sobre o fundo do badge
 */
export function badgeText(hex, isDark, target = 4.5) {
  const base = parseHex(hex) ? hex : DEFAULT_ACCENT;
  const bg = badgeSoftBg(base, isDark);
  const toward = isDark ? '#ffffff' : '#000000';
  const pure = toHex(parseHex(base));
  if (contrastRatio(pure, bg) >= target) return pure;
  for (let p = 95; p >= 0; p -= 5) {
    const cand = mixSrgb(base, toward, p);
    if (contrastRatio(cand, bg) >= target) return cand;
  }
  return toward;
}

/**
 * Cor da LINHA/BARRAS do grafico (--accent-graph). Parte do mix atual do CSS
 * (accent 70% + text 30%), a mesma cor que o main.css calcula. Se essa cor ja
 * tem contraste >= target (3:1 pra objeto grafico, WCAG 1.4.11) contra a
 * superficie onde o grafico e desenhado (--bg-elev, o fundo do .card), mantem
 * (preserva o tom da marca). Senao empurra progressivamente na direcao do
 * extremo legivel (escurece no claro, clareia no escuro) ate passar 3:1. Nao
 * vira preto/branco chapado a nao ser que nada antes disso passe.
 *
 * @param {string} hex accent da marca (#rgb ou #rrggbb)
 * @param {boolean} isDark tema escuro?
 * @param {number} [target=3] razao minima desejada (objeto grafico = 3:1)
 * @returns {string} hex com contraste >= target sobre --bg-elev do tema
 */
export function accentGraph(hex, isDark, target = 3) {
  const base = parseHex(hex) ? hex : DEFAULT_ACCENT;
  const S = isDark ? THEME_SURFACES.dark : THEME_SURFACES.light;
  const surface = S.card; // --bg-elev, superficie do card onde o grafico e pintado
  // Cor "crua" do grafico: o mesmo mix que o CSS faz (accent 70% + text 30%).
  const graph = mixSrgb(base, S.text, ACCENT_GRAPH_PCT);
  if (contrastRatio(graph, surface) >= target) return graph;
  // Nao passou: empurra o graph na direcao do extremo legivel do tema
  // (branco no escuro, preto no claro) ate alcancar o alvo. Preserva o
  // maximo do tom (comeca com pouca mistura).
  const toward = isDark ? '#ffffff' : '#000000';
  for (let p = 5; p <= 100; p += 5) {
    const cand = mixSrgb(toward, graph, p);
    if (contrastRatio(cand, surface) >= target) return cand;
  }
  return toward;
}

/**
 * Cor de PREENCHIMENTO solido derivada do accent, pra elementos que pintam o
 * accent CRU e precisam se destacar da superficie atras deles: a barra de
 * progresso da meta (.kpi__goal-fill, objeto grafico que carrega dado, WCAG
 * 1.4.11) e os decorativos de marca (.kpi::before, .dot). Diferente do
 * accentGraph (que mistura accent 70% + text 30% e mede contra --bg-elev, o
 * fundo do card), aqui parte do accent PURO e mede contra --bg-elev-2, a
 * superficie imediatamente atras desses elementos (a trilha da meta, a borda do
 * card). Se o accent puro ja tem >=target, mantem o tom da marca; senao empurra
 * progressivamente na direcao do extremo legivel do tema (clareia no escuro,
 * escurece no claro) ate passar. Assim o accent padrao escuro nao some no fundo
 * escuro e o accent claro nao some no fundo claro.
 *
 * @param {string} hex accent da marca (#rgb ou #rrggbb)
 * @param {boolean} isDark tema escuro?
 * @param {number} [target=3] razao minima desejada (objeto grafico = 3:1)
 * @returns {string} hex com contraste >= target sobre --bg-elev-2 do tema
 */
export function accentFill(hex, isDark, target = 3) {
  const base = parseHex(hex) ? hex : DEFAULT_ACCENT;
  const S = isDark ? THEME_SURFACES.dark : THEME_SURFACES.light;
  const surface = S.bgElev2; // --bg-elev-2, superficie atras da fill/decorativos
  const pure = toHex(parseHex(base));
  // Se o accent puro ja passa, mantem a cor da marca.
  if (contrastRatio(pure, surface) >= target) return pure;
  // Senao, empurra o accent na direcao do extremo legivel do tema (branco no
  // escuro, preto no claro) ate alcancar o alvo. Preserva o maximo do tom
  // (comeca com pouca mistura).
  const toward = isDark ? '#ffffff' : '#000000';
  for (let p = 5; p <= 100; p += 5) {
    const cand = mixSrgb(toward, base, p);
    if (contrastRatio(cand, surface) >= target) return cand;
  }
  return toward;
}

/**
 * Aplica no elemento (normalmente documentElement) as variaveis CSS derivadas
 * do accent, calibradas pro tema atual:
 *   --accent      cor da marca crua
 *   --accent-fg   cor do texto SOBRE o accent cru (botoes, chips solidos)
 *   --accent-text cor de destaque pra TEXTO/links, com contraste AA no tema
 *   --focus-ring  anel de foco (reusa --accent-text, passa >=3:1)
 *   --accent-fill-calc  accent solido recalibrado pra >=3:1 contra --bg-elev-2:
 *                 usado na barra de progresso da meta (objeto grafico) e nos
 *                 decorativos de marca (.kpi::before, .dot, borda de :focus), que
 *                 pintavam o accent CRU e sumiam com accent muito escuro/claro
 *   --funnel-fg   texto SOBRE a barra do funil (fundo COMPOSTO, mais claro que
 *                 o accent cru): #111/#fff de maior contraste, garante >=4.5:1
 *   --badge-fg    texto do badge SOBRE o --accent-soft composto: tom da marca
 *                 recalibrado pra >=4.5:1 (nao vira branco/preto chapado)
 * Tambem grava o accent em el.dataset.accent pra o theme.js reachar no toggle.
 *
 * @param {HTMLElement} el elemento alvo (ex: document.documentElement)
 * @param {string} hex cor do accent
 * @param {boolean} isDark true = tema escuro
 */
export function aplicarAccent(el, hex, isDark) {
  if (!el || !el.style) return;
  const accent = parseHex(hex) ? hex : DEFAULT_ACCENT;
  const txt = accentText(accent, isDark);
  el.style.setProperty('--accent', accent);
  el.style.setProperty('--accent-fg', accentForeground(accent));
  el.style.setProperty('--accent-text', txt);
  el.style.setProperty('--focus-ring', txt);
  // Cor da linha/barras do grafico: calibrada pra >=3:1 (WCAG 1.4.11, objeto
  // grafico) contra a superficie do card (--bg-elev), pra a serie nao sumir
  // quando o accent e claro sobre fundo claro. Preserva o tom quando ja passa.
  // Grava em --accent-graph-calc; o main.css usa
  // --accent-graph: var(--accent-graph-calc, <mix fallback>). Nao setamos
  // --accent-graph direto pra evitar auto-referencia da custom property.
  el.style.setProperty('--accent-graph-calc', accentGraph(accent, isDark));
  // Accent solido calibrado (>=3:1 contra --bg-elev-2) pra barra de progresso da
  // meta (objeto grafico, WCAG 1.4.11) e decorativos de marca (.kpi::before,
  // .dot, borda de foco do input): pintavam o accent CRU e sumiam quando o accent
  // era muito escuro (fundo escuro) ou muito claro (fundo claro). O main.css usa
  // var(--accent-fill-calc, var(--accent)).
  el.style.setProperty('--accent-fill-calc', accentFill(accent, isDark));
  // Texto sobre a barra do funil: mede contra a cor VISIVEL (composta) da barra,
  // nao contra o accent cru (que e mais escuro e levava a branco reprovando AA).
  el.style.setProperty('--funnel-fg', fgForBackground(funnelBarBg(accent, isDark)));
  // Texto do badge: tom da marca recalibrado contra o --accent-soft composto.
  el.style.setProperty('--badge-fg', badgeText(accent, isDark));
  // Guarda o accent escolhido pra o theme.js recalcular no toggle de tema.
  if (el.dataset) el.dataset.accent = accent;
}
