// Transições de mais impacto: a troca de modo claro e escuro. ESM, navegador.
//
// Melhoria progressiva: onde o navegador tem transição de página (View Transitions), o modo novo
// abre num círculo a partir do botão. Onde não tem, um véu na cor do fundo novo aparece, o modo
// troca por baixo e o véu some (só opacity). Com "reduzir movimento" a troca é imediata.
// Em qualquer caminho `aplicar` roda exatamente uma vez.

import { menosMovimento, DURACAO } from './movimento.js';
import { BG_DARK, BG_LIGHT } from './color.js';

export function temTransicaoDePagina() {
  return typeof document !== 'undefined' && typeof document.startViewTransition === 'function';
}

/**
 * @param {HTMLElement|null} origem   de onde o círculo abre (o botão)
 * @param {boolean} vaiProEscuro      o modo novo é o escuro?
 * @param {()=>void} aplicar          troca o modo de verdade
 */
export function revelarModo(origem, vaiProEscuro, aplicar) {
  if (menosMovimento()) { aplicar(); return; }
  const root = document.documentElement;
  const caixa = origem && origem.getBoundingClientRect ? origem.getBoundingClientRect() : null;
  const x = caixa ? caixa.left + caixa.width / 2 : window.innerWidth / 2;
  const y = caixa ? caixa.top + caixa.height / 2 : 0;

  if (temTransicaoDePagina()) {
    const raio = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    root.style.setProperty('--modo-x', `${Math.round(x)}px`);
    root.style.setProperty('--modo-y', `${Math.round(y)}px`);
    root.style.setProperty('--modo-raio', `${Math.ceil(raio)}px`);
    root.classList.add('modo-trocando');
    const fim = () => {
      root.classList.remove('modo-trocando');
      for (const v of ['--modo-x', '--modo-y', '--modo-raio']) root.style.removeProperty(v);
    };
    let feito = false;
    const umaVez = () => { if (!feito) { feito = true; aplicar(); } };
    try {
      const transicao = document.startViewTransition(umaVez);
      transicao.finished.then(fim, fim);
      // Se a transição for pulada antes de rodar a troca (aba escondida), a troca acontece assim mesmo.
      transicao.ready.catch(umaVez);
    } catch {
      umaVez();
      fim();
    }
    return;
  }

  const veu = document.createElement('div');
  veu.className = 'modo-veu';
  veu.style.background = vaiProEscuro ? BG_DARK : BG_LIGHT;
  document.body.appendChild(veu);
  const cobre = Math.round(DURACAO.modo * 0.3);
  const some = DURACAO.modo - cobre;
  if (typeof veu.animate === 'function') veu.animate([{ opacity: 0 }, { opacity: 1 }], { duration: cobre, easing: 'ease-in', fill: 'forwards' });
  setTimeout(() => {
    aplicar();
    if (typeof veu.animate === 'function') veu.animate([{ opacity: 1 }, { opacity: 0 }], { duration: some, easing: 'ease-out', fill: 'forwards' });
    setTimeout(() => veu.remove(), some + 30);
  }, cobre);
}
