// Aplica a marca do painel num elemento: as cores calibradas de sempre (aplicarAccent) mais o
// fundo vivo na cor dela. ESM. Só escreve variáveis CSS no elemento recebido.
//
// É o que o painel, o botão de alternar modo e a prévia do assistente chamam, pra que cor,
// modo e fundo andem sempre juntos.

import { aplicarAccent, accentText, DEFAULT_ACCENT } from './color.js';
import { parametrosDoFundo, variaveisDoFundo, textoDeMarcaSobreFundo } from './fundo-cor.js';

/**
 * @param {HTMLElement} el      elemento alvo (documentElement ou um trecho com cor própria)
 * @param {string} accent       cor da marca
 * @param {boolean} isDark      modo escuro?
 * @param {string} [accent2]    segunda cor; undefined mantém a que já estava no elemento
 */
export function aplicarMarca(el, accent, isDark, accent2) {
  if (!el || !el.style) return;
  aplicarAccent(el, accent, isDark, accent2);
  const cor = (el.dataset && el.dataset.accent) || DEFAULT_ACCENT;
  const segunda = (el.dataset && el.dataset.accent2) || '';
  // Fundo vivo: cores já com a transparência calibrada pelo contraste do texto.
  const vars = variaveisDoFundo(parametrosDoFundo(cor, segunda, isDark));
  for (const [nome, valor] of Object.entries(vars)) el.style.setProperty(nome, valor);
  // Texto na cor da marca (links) precisa passar também sobre o fundo tingido.
  const texto = textoDeMarcaSobreFundo(cor, segunda, isDark);
  el.style.setProperty('--accent-text', texto);
  el.style.setProperty('--focus-ring', texto);
  // "Olá," da saudação: a folha da saudação é escura nos dois modos.
  el.style.setProperty('--saud-ola', accentText(cor, true));
}
