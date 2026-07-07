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
  const bg = isDark ? BG_DARK : BG_LIGHT;
  const toward = isDark ? '#ffffff' : '#000000';
  // Se o accent puro ja passa, usa ele (mantem a cor da marca sem alterar).
  const pure = toHex(parseHex(base));
  if (contrastRatio(pure, bg) >= target) return pure;
  // Senao, mistura progressivamente na direcao do extremo (branco/preto)
  // ate o contraste alcancar o alvo.
  for (let p = 95; p >= 0; p -= 5) {
    const cand = mixSrgb(base, toward, p);
    if (contrastRatio(cand, bg) >= target) return cand;
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
 * Aplica no elemento (normalmente documentElement) as 4 variaveis CSS derivadas
 * do accent, calibradas pro tema atual:
 *   --accent      cor da marca crua
 *   --accent-fg   cor do texto SOBRE o accent (botoes, chips)
 *   --accent-text cor de destaque pra TEXTO/links, com contraste AA no tema
 *   --focus-ring  anel de foco (reusa --accent-text, passa >=3:1)
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
  // Guarda o accent escolhido pra o theme.js recalcular no toggle de tema.
  if (el.dataset) el.dataset.accent = accent;
}
