// Fundo vivo na cor da marca: a parte pura (cores e intensidade). ESM, sem DOM.
//
// O fundo são duas manchas largas (a cor da marca e uma segunda cor) e algumas curvas finas,
// derivando devagar atrás do conteúdo. Os cartões têm superfície sólida, então o texto DENTRO
// deles não muda. O que precisa de conta é o texto que fica direto sobre o fundo da página
// (rótulo de filtro, rodapé, subtítulo): a intensidade das manchas é calibrada pra que ele
// mantenha contraste AA (4,5:1) no PIOR momento, com as duas manchas uma em cima da outra.
// As curvas são traço fino de 1,5 px: não entram nessa conta (não formam fundo atrás de uma
// letra), e por isso têm intensidade própria e baixa.

import {
  parseHex, toHex, mixSrgb, composite, contrastRatio, accentText, accentFill,
  BG_DARK, BG_LIGHT, THEME_SURFACES, DEFAULT_ACCENT,
} from './color.js';

// Intensidade máxima no centro de cada mancha (o resto dela cai até zero) e piso de presença.
// No escuro o fundo é mais profundo; no claro, sutil mas perceptível.
export const INTENSIDADE = Object.freeze({ dark: 0.2, light: 0.14, piso: 0.05, linhaDark: 0.24, linhaLight: 0.24 });

// Texto que aparece direto sobre o fundo da página. Mesmos valores de --text-dim e
// --text-faint do main.css nos dois temas (há teste de paridade em test/fundo-cor.test.js).
export const TEXTO_SOBRE_O_FUNDO = Object.freeze({
  dark: ['#99a1ae', '#8b93a4'],
  light: ['#586173', '#5b6270'],
});

const ALVO = 4.5;

function paraHsl([r, g, b]) {
  const R = r / 255; const G = g / 255; const B = b / 255;
  const max = Math.max(R, G, B); const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return [h * 60, s, l];
}

function deHsl([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/**
 * Cor vizinha da cor da marca (matiz girado um pouco): dá profundidade à segunda mancha sem
 * virar arco-íris. Cinza não tem matiz pra girar: clareia ou escurece um degrau.
 */
export function corVizinha(hex) {
  const rgb = parseHex(hex) || parseHex(DEFAULT_ACCENT);
  const [h, s, l] = paraHsl(rgb);
  if (s < 0.08) return toHex(deHsl([h, s, l > 0.5 ? l - 0.18 : l + 0.18]));
  return toHex(deHsl([(h + 28) % 360, s, l]));
}

/** Cor do fundo da página no pior momento: as duas manchas sobrepostas, no centro das duas. */
export function piorFundo(p, isDark) {
  const base = isDark ? BG_DARK : BG_LIGHT;
  return composite(p.b, composite(p.a, base, p.alfaA || 0), p.alfaB || 0);
}

const arredondar = (n) => Math.round(n * 1000) / 1000;

/**
 * @param {string} accent   cor da marca
 * @param {string} [accent2] segunda cor (opcional)
 * @param {boolean} isDark
 * @returns {{a:string, b:string, linha:string, alfaA:number, alfaB:number, alfaLinha:number}}
 */
export function parametrosDoFundo(accent, accent2, isDark) {
  const a = toHex(parseHex(accent) || parseHex(DEFAULT_ACCENT));
  const b = parseHex(accent2) ? toHex(parseHex(accent2)) : corVizinha(a);
  // A curva usa a cor da marca já ajustada pra aparecer sobre o fundo do tema.
  const linha = accentFill(a, isDark);
  const teto = isDark ? INTENSIDADE.dark : INTENSIDADE.light;
  const alfaLinha = isDark ? INTENSIDADE.linhaDark : INTENSIDADE.linhaLight;
  const textos = TEXTO_SOBRE_O_FUNDO[isDark ? 'dark' : 'light'];
  let escolhido = { a, b, linha, alfaA: 0, alfaB: 0, alfaLinha };
  for (let k = 40; k >= 0; k -= 1) {
    const f = k / 40;
    const p = { a, b, linha, alfaA: arredondar(teto * f), alfaB: arredondar(teto * 0.75 * f), alfaLinha };
    const pior = piorFundo(p, isDark);
    if (textos.every((t) => contrastRatio(t, pior) >= ALVO)) { escolhido = p; break; }
  }
  return escolhido;
}

/**
 * Cor de TEXTO na cor da marca (links) que passa em 4,5:1 também sobre o pior momento do
 * fundo. Parte do accentText de sempre (fundo liso e cartão) e só empurra mais pro extremo
 * legível quando o fundo tingido derruba o contraste.
 */
export function textoDeMarcaSobreFundo(accent, accent2, isDark) {
  const base = accentText(parseHex(accent) ? accent : DEFAULT_ACCENT, isDark);
  const pior = piorFundo(parametrosDoFundo(accent, accent2, isDark), isDark);
  const liso = isDark ? BG_DARK : BG_LIGHT;
  const cartao = (isDark ? THEME_SURFACES.dark : THEME_SURFACES.light).card;
  const passa = (c) => contrastRatio(c, pior) >= ALVO && contrastRatio(c, liso) >= ALVO && contrastRatio(c, cartao) >= ALVO;
  if (passa(base)) return base;
  const extremo = isDark ? '#ffffff' : '#000000';
  for (let pct = 95; pct >= 0; pct -= 5) {
    const cand = mixSrgb(base, extremo, pct);
    if (passa(cand)) return cand;
  }
  return extremo;
}

function rgba(hex, alfa) {
  const [r, g, b] = parseHex(hex) || [0, 0, 0];
  return `rgba(${r}, ${g}, ${b}, ${arredondar(Math.max(0, Math.min(1, alfa)))})`;
}

/** Variáveis CSS do fundo (cor já com a transparência calibrada). */
export function variaveisDoFundo(p) {
  return {
    '--fundo-a': rgba(p.a, p.alfaA),
    '--fundo-b': rgba(p.b, p.alfaB),
    '--fundo-linha': rgba(p.linha, p.alfaLinha),
  };
}
