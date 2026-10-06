// Barra fina de progresso no topo da página. ESM, navegador.
// A página do painel já traz a barra andando no HTML (aparece antes de qualquer script). Aqui:
// terminar (quando o conteúdo chega) e recomeçar (botão Atualizar, lista recarregando).

function barra(criar) {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById('progresso');
  if (!el && criar) {
    el = document.createElement('div');
    el.id = 'progresso';
    el.className = 'progresso';
    el.setAttribute('aria-hidden', 'true');
    el.appendChild(Object.assign(document.createElement('span'), { className: 'progresso__barra' }));
    document.body.insertBefore(el, document.body.firstChild);
  }
  return el;
}

let escondendo = 0;

/** Começa (ou recomeça do zero) a barra. */
export function comecarProgresso() {
  const el = barra(true);
  if (!el) return;
  clearTimeout(escondendo);
  el.hidden = false;
  el.classList.remove('progresso--fim');
  // Trocar o miolo por um novo faz a animação começar de novo.
  const velha = el.querySelector('.progresso__barra');
  const nova = document.createElement('span');
  nova.className = 'progresso__barra';
  if (velha) velha.replaceWith(nova); else el.appendChild(nova);
}

/** Completa a barra e some com ela. */
export function terminarProgresso() {
  const el = barra(false);
  if (!el || el.hidden) return;
  el.classList.add('progresso--fim');
  clearTimeout(escondendo);
  escondendo = setTimeout(() => { el.hidden = true; }, 520);
}
