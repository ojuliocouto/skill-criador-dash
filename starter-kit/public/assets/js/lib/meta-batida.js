// Efeito 5, "meta batida": no instante em que a barra da meta cruza 100% (na troca de período ou
// no Atualizar) acontece um marco, UMA vez: a barra completa, uma onda na cor da marca atravessa
// o cartão do número e o selo "Meta batida" entra. Não repete a cada redesenho enquanto a meta
// continua batida. ESM.
//
// O selo já está no HTML do indicador sempre que a meta está batida (estado final); aqui ele só
// ganha a entrada. Onda e selo animam por transform e opacity. Sem movimento: nada acontece e o
// selo simplesmente está lá.

import { menosMovimento, CURVA } from './movimento.js';

/** Tempos do marco (ms): a barra leva ~640, a onda espera ela chegar. */
export const TEMPOS_DO_MARCO = Object.freeze({ ondaAtraso: 520, onda: 1000, seloAtraso: 600, selo: 520 });

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

/**
 * Toca o marco no cartão do indicador que tem a meta. Chamar com o corpo novo já no DOM.
 * @returns {boolean} true se tocou
 */
export function marcarMetaBatida(raiz) {
  if (!raiz || menosMovimento() || typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return false;
  const preenchimento = raiz.querySelector('.kpi__goal-fill.is-done');
  const cartao = preenchimento && preenchimento.closest('.kpi');
  if (!cartao) return false;
  const caixa = cartao.getBoundingClientRect();
  const trilha = preenchimento.parentElement.getBoundingClientRect();
  // A onda nasce na ponta da barra, que acabou de fechar.
  const origem = { x: trilha.right - caixa.left, y: trilha.top - caixa.top + trilha.height / 2 };
  const raio = raioDaOnda({ w: caixa.width, h: caixa.height }, origem);
  const tamanho = Math.ceil(raio * 2);

  const onda = document.createElement('span');
  onda.className = 'kpi__onda';
  onda.setAttribute('aria-hidden', 'true');
  const disco = document.createElement('span');
  disco.className = 'kpi__onda-disco';
  const anel = document.createElement('span');
  anel.className = 'kpi__onda-anel';
  const eco = document.createElement('span');
  eco.className = 'kpi__onda-anel kpi__onda-anel--eco';
  for (const el of [disco, anel, eco]) {
    Object.assign(el.style, { width: `${tamanho}px`, height: `${tamanho}px`, left: `${origem.x - tamanho / 2}px`, top: `${origem.y - tamanho / 2}px` });
  }
  onda.append(disco, anel, eco);
  cartao.prepend(onda);

  const { ondaAtraso, onda: dur, seloAtraso, selo: durSelo } = TEMPOS_DO_MARCO;
  const frente = (pico) => [{ transform: 'scale(0.02)', opacity: 0 }, { transform: 'scale(0.06)', opacity: pico, offset: 0.05 }, { transform: 'scale(1)', opacity: 0 }];
  disco.animate(frente(0.32), { duration: dur, delay: ondaAtraso, easing: CURVA.saida, fill: 'both' });
  anel.animate(frente(1), { duration: dur, delay: ondaAtraso, easing: CURVA.saida, fill: 'both' });
  eco.animate(frente(0.6), { duration: dur, delay: ondaAtraso + 150, easing: CURVA.saida, fill: 'both' });
  const selo = cartao.querySelector('.kpi__selo');
  if (selo) {
    selo.animate([{ transform: 'scale(0.4)', opacity: 0 }, { transform: 'scale(1.08)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: durSelo, delay: seloAtraso, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', fill: 'backwards' });
  }
  const valor = cartao.querySelector('.kpi__goal-text');
  if (valor) valor.animate([{ transform: 'translateY(4px)', opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: 360, delay: seloAtraso - 80, easing: CURVA.saida, fill: 'backwards' });
  setTimeout(() => onda.remove(), ondaAtraso + dur + 300);
  return true;
}
