// Sugestão de modo (claro ou escuro) pro painel, a partir do logotipo e da cor da marca.
// ESM, puro. A pessoa decide: a sugestão só vem marcada no assistente, com o motivo.
//
// Regras, nesta ordem:
//   1. logotipo de traço claro (o assistente mediu e gravou logoFundo 'escuro') pede fundo escuro;
//   2. cor de marca escura e sóbria (azul-marinho, grafite, verde-garrafa) sugere escuro;
//   3. cor clara demais (amarelo, pastel, ciano) some no branco: sugere escuro;
//   4. o resto é cor viva, que destaca mais sobre fundo claro.

import { parseHex, luminance, DEFAULT_ACCENT } from './color.js';

// Luminância relativa (0 preto, 1 branco). Abaixo disto a cor é escura; acima de CLARA, some no branco.
const ESCURA_ATE = 0.08;
const CLARA_A_PARTIR_DE = 0.4;

const MOTIVOS = {
  logo: 'O seu logotipo é de traço claro: ele aparece melhor sobre fundo escuro.',
  escura: 'A cor da sua marca é escura e sóbria: ela combina com o modo escuro.',
  clara: 'A cor da sua marca é bem clara: ela aparece mais sobre fundo escuro.',
  viva: 'A cor da sua marca é viva: ela se destaca mais sobre fundo claro.',
};

/**
 * @param {{accent?:string, logoFundo?:string}} [p]
 * @returns {{modo:'claro'|'escuro', motivo:string}}
 */
export function sugerirModo({ accent, logoFundo } = {}) {
  if (logoFundo === 'escuro') return { modo: 'escuro', motivo: MOTIVOS.logo };
  const rgb = parseHex(accent) || parseHex(DEFAULT_ACCENT);
  const l = luminance(rgb);
  if (l <= ESCURA_ATE) return { modo: 'escuro', motivo: MOTIVOS.escura };
  if (l >= CLARA_A_PARTIR_DE) return { modo: 'escuro', motivo: MOTIVOS.clara };
  return { modo: 'claro', motivo: MOTIVOS.viva };
}
