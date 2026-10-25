// Efeito 5, "meta batida": UMA vez por cruzamento, no instante em que a barra da meta cruza 100%
// (na troca de período ou no Atualizar). 3.9: o sinal é discreto. A barra fecha na cor de "bom",
// um clarão curto corre por ela e o selo "Meta batida" entra de leve. O cartão NÃO acende nem é
// atravessado por faixa de luz (a auditoria de 25/10/2026 mediu 1,9 s de cartão tingido; a direção
// de arte da skill chama cartão tingido de tell de IA), e o número não pulsa. Só transform e
// opacity, sem filtro nem gradiente. Não repete a cada redesenho enquanto a meta continua batida.
// ESM.
//
// O selo já está no HTML do indicador sempre que a meta está batida (estado final); aqui ele só
// ganha a entrada. O clarão sai do DOM no fim. Sem movimento: nada acontece e o selo está lá.

import { menosMovimento, CURVA } from './movimento.js';

/**
 * Tempos do marco (ms, contados do instante em que o corpo novo entra no DOM; a barra leva ~640).
 * clarao = o brilho que corre pela barra quando ela fecha; selo = a entrada do selo.
 */
export const TEMPOS_DO_MARCO = Object.freeze({
  claraoAtraso: 560, clarao: 560,
  seloAtraso: 620, selo: 320,
});

/** Quando o último trecho do marco termina (ms). */
export const DURACAO_TOTAL_DO_MARCO = Math.max(TEMPOS_DO_MARCO.claraoAtraso + TEMPOS_DO_MARCO.clarao, TEMPOS_DO_MARCO.seloAtraso + TEMPOS_DO_MARCO.selo);

/** true só quando a meta estava ABAIXO de 100% e passou a 100% ou mais. Sem partida, não. */
export function cruzouMeta(antes, depois) {
  if (antes == null || depois == null) return false;
  const a = Number(antes);
  const d = Number(depois);
  if (!Number.isFinite(a) || !Number.isFinite(d)) return false;
  return a < 1 && d >= 1;
}

const el = (classe, pai) => { const e = document.createElement('span'); e.className = classe; if (pai) pai.appendChild(e); return e; };

/**
 * Toca o marco no cartão do indicador que tem a meta. Chamar com o corpo novo já no DOM.
 * @returns {boolean} true se tocou
 */
export function marcarMetaBatida(raiz) {
  if (!raiz || menosMovimento() || typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return false;
  const preenchimento = raiz.querySelector('.kpi__goal-fill.is-done');
  const cartao = preenchimento && preenchimento.closest('.kpi');
  if (!cartao) return false;
  const T = TEMPOS_DO_MARCO;

  // Barra: um clarão curto corre por ela no instante em que fecha.
  const trilha = preenchimento.parentElement;
  const clarao = el('kpi__goal-clarao', trilha);
  clarao.setAttribute('aria-hidden', 'true');
  clarao.animate([{ transform: 'translateX(-110%)', opacity: 0 }, { transform: 'translateX(40%)', opacity: 0.7, offset: 0.4 }, { transform: 'translateX(380%)', opacity: 0 }],
    { duration: T.clarao, delay: T.claraoAtraso, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both' });

  // Selo: aparece e assenta, sem repique.
  const selo = cartao.querySelector('.kpi__selo');
  if (selo) {
    selo.animate([{ transform: 'scale(0.92)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: T.selo, delay: T.seloAtraso, easing: CURVA.saida, fill: 'backwards' });
  }
  const texto = cartao.querySelector('.kpi__goal-text');
  if (texto) texto.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 240, delay: T.seloAtraso - 60, easing: CURVA.saida, fill: 'backwards' });

  setTimeout(() => { clarao.remove(); }, DURACAO_TOTAL_DO_MARCO + 200);
  return true;
}
