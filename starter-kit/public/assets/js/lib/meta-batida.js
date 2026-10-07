// Efeito 5, "meta batida": o momento mais marcante do painel, UMA vez por cruzamento. No instante
// em que a barra da meta cruza 100% (na troca de período ou no Atualizar): a barra fecha e um
// clarão percorre ela; o cartão inteiro acende na cor da marca e uma faixa de luz atravessa o
// cartão de ponta a ponta; o número dá um pulso de escala; o selo "Meta batida" entra com peso
// (vem grande e assenta). Tudo em ~1,9 s, só transform e opacity, sem filtro nem gradiente.
// Não repete a cada redesenho enquanto a meta continua batida. ESM.
//
// O selo já está no HTML do indicador sempre que a meta está batida (estado final); aqui ele só
// ganha a entrada. Camadas do efeito saem do DOM no fim, o cartão volta ao normal. Sem movimento:
// nada acontece e o selo simplesmente está lá.

import { menosMovimento, CURVA } from './movimento.js';

/**
 * Tempos do marco (ms, contados do instante em que o corpo novo entra no DOM; a barra leva ~640).
 * onda = a luz do cartão e a faixa que o atravessa; clarao = o brilho que corre pela barra;
 * pulso = a escala do número; selo = a entrada do selo.
 */
export const TEMPOS_DO_MARCO = Object.freeze({
  ondaAtraso: 520, onda: 1400,
  claraoAtraso: 560, clarao: 760,
  pulsoAtraso: 780, pulso: 640,
  seloAtraso: 900, selo: 560,
});

/** Quando o último trecho do marco termina (ms). */
export const DURACAO_TOTAL_DO_MARCO = Math.max(...[['ondaAtraso', 'onda'], ['claraoAtraso', 'clarao'], ['pulsoAtraso', 'pulso'], ['seloAtraso', 'selo']].map(([a, d]) => TEMPOS_DO_MARCO[a] + TEMPOS_DO_MARCO[d]));

/** true só quando a meta estava ABAIXO de 100% e passou a 100% ou mais. Sem partida, não. */
export function cruzouMeta(antes, depois) {
  if (antes == null || depois == null) return false;
  const a = Number(antes);
  const d = Number(depois);
  if (!Number.isFinite(a) || !Number.isFinite(d)) return false;
  return a < 1 && d >= 1;
}

/** Raio do círculo que, saindo de `origem`, cobre um cartão `caixa` inteiro (até o canto mais longe). */
export function raioDaOnda(caixa, origem) {
  const dx = Math.max(origem.x, caixa.w - origem.x);
  const dy = Math.max(origem.y, caixa.h - origem.y);
  return Math.hypot(dx, dy);
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
  const ambos = { fill: 'both' };

  // Camada do cartão: a luz cobre tudo, a faixa (corpo mais fraco, ponta mais forte) atravessa.
  const onda = el('kpi__onda');
  onda.setAttribute('aria-hidden', 'true');
  const luz = el('kpi__onda-luz', onda);
  const passa = el('kpi__onda-passa', onda);
  el('kpi__onda-faixa', passa);
  el('kpi__onda-frente', passa);
  cartao.prepend(onda);
  luz.animate([{ opacity: 0 }, { opacity: 0.34, offset: 0.35 }, { opacity: 0 }], { duration: T.onda, delay: T.ondaAtraso, easing: 'linear', ...ambos });
  passa.animate([
    { transform: 'translateX(-100%)', opacity: 0 },
    { transform: 'translateX(-30%)', opacity: 1, offset: 0.2 },
    { transform: 'translateX(120%)', opacity: 1, offset: 0.8 },
    { transform: 'translateX(180%)', opacity: 0 },
  ], { duration: T.onda, delay: T.ondaAtraso, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', ...ambos });

  // Barra: um clarão corre por ela e ela engrossa um instante.
  const trilha = preenchimento.parentElement;
  const clarao = el('kpi__goal-clarao', trilha);
  clarao.setAttribute('aria-hidden', 'true');
  clarao.animate([{ transform: 'translateX(-110%)', opacity: 0 }, { transform: 'translateX(40%)', opacity: 0.95, offset: 0.35 }, { transform: 'translateX(380%)', opacity: 0 }],
    { duration: T.clarao, delay: T.claraoAtraso, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', ...ambos });
  trilha.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(1.9)', offset: 0.3 }, { transform: 'scaleY(1)' }],
    { duration: T.clarao, delay: T.claraoAtraso, easing: CURVA.saida });

  // Número: pulso de escala. Selo: entra grande, assenta com um repique.
  const valor = cartao.querySelector('.kpi__value');
  if (valor) valor.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.16)', offset: 0.35 }, { transform: 'scale(0.98)', offset: 0.7 }, { transform: 'scale(1)' }],
    { duration: T.pulso, delay: T.pulsoAtraso, easing: CURVA.saida });
  const selo = cartao.querySelector('.kpi__selo');
  if (selo) {
    selo.animate([
      { transform: 'scale(1.9)', opacity: 0 },
      { transform: 'scale(0.9)', opacity: 1, offset: 0.55 },
      { transform: 'scale(1.07)', opacity: 1, offset: 0.8 },
      { transform: 'scale(1)', opacity: 1 },
    ], { duration: T.selo, delay: T.seloAtraso, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)', fill: 'backwards' });
  }
  const texto = cartao.querySelector('.kpi__goal-text');
  if (texto) texto.animate([{ transform: 'translateY(4px)', opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: 360, delay: T.seloAtraso - 80, easing: CURVA.saida, fill: 'backwards' });

  setTimeout(() => { onda.remove(); clarao.remove(); }, DURACAO_TOTAL_DO_MARCO + 200);
  return true;
}
