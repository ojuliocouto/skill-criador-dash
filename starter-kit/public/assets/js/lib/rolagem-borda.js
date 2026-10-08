// Aviso de "tem mais pro lado" num controle que rola por dentro (3.7.1, D12): os atalhos de período e as
// abas, no celular. A borda esmaecida diz que há mais itens além do que se vê. A conta é pura e tem teste;
// o DOM só liga as classes `rola-esq` e `rola-dir`, que o CSS transforma em borda esmaecida.

const FOLGA = 2; // px: o navegador arredonda scrollLeft e larguras; sem folga o aviso piscaria à toa

/** @returns {{esquerda:boolean, direita:boolean}} há conteúdo escondido de cada lado? */
export function bordasDeRolagem({ scrollLeft, clientWidth, scrollWidth }) {
  const sobra = scrollWidth - clientWidth;
  if (!(sobra > FOLGA)) return { esquerda: false, direita: false };
  return { esquerda: scrollLeft > FOLGA, direita: scrollLeft < sobra - FOLGA };
}

/** Liga o aviso no elemento e devolve a função que desliga. */
export function ligarBordas(el) {
  if (!el || typeof el.addEventListener !== 'function') return () => {};
  const atualizar = () => {
    const b = bordasDeRolagem(el);
    el.classList.toggle('rola-esq', b.esquerda);
    el.classList.toggle('rola-dir', b.direita);
  };
  el.addEventListener('scroll', atualizar, { passive: true });
  window.addEventListener('resize', atualizar);
  const obs = typeof ResizeObserver === 'function' ? new ResizeObserver(atualizar) : null;
  if (obs) obs.observe(el);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(atualizar).catch(() => {});
  atualizar();
  return () => { el.removeEventListener('scroll', atualizar); window.removeEventListener('resize', atualizar); if (obs) obs.disconnect(); };
}
