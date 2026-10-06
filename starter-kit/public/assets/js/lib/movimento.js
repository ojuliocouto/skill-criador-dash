// Movimento do assistente e do painel: a parte pura (contagem, deslize do marcador, direção)
// e dois ajudantes de DOM bem pequenos. ESM.
//
// Regras da casa: só transform e opacity animam (e stroke-dashoffset no gráfico); durações
// curtas; com prefers-reduced-motion tudo aparece no estado final na hora; nada depende de a
// animação terminar pra funcionar.

import { fmtCurrency, fmtNumber, fmtPercent, fmtInteger } from './format.js';

// Espelha os tokens --dur-* do main.css (o JS precisa do número pra animar pela API do navegador).
// revelar: a cortina da saudação e a abertura do painel; modo: a troca de modo claro e escuro.
export const DURACAO = Object.freeze({ toque: 140, troca: 200, entrada: 360, contagem: 600, revelar: 560, modo: 520 });
export const CURVA = Object.freeze({ saida: 'cubic-bezier(0.22, 1, 0.36, 1)', vaiVolta: 'cubic-bezier(0.65, 0, 0.35, 1)' });

/** Saída rápida e chegada suave (cúbica). Fora de 0..1 é aparado. */
export function suavizar(t) {
  const x = Math.min(1, Math.max(0, Number(t) || 0));
  return 1 - (1 - x) ** 3;
}

/** Valor do indicador num ponto da contagem. No fim é EXATAMENTE o valor final. */
export function valorDaContagem(final, progresso) {
  if (!Number.isFinite(final)) return final;
  if (progresso >= 1) return final;
  return final * suavizar(progresso);
}

function formatar(formato, valor) {
  switch (formato) {
    case 'currency': return fmtCurrency(valor);
    case 'percent': return fmtPercent(valor);
    case 'integer': return fmtInteger(valor);
    default: return fmtNumber(valor);
  }
}

/** Texto de um quadro da contagem, no formato do indicador. */
export function textoDaContagem(final, formato, progresso) {
  const v = valorDaContagem(final, progresso);
  return formatar(formato, formato === 'integer' && progresso < 1 ? Math.round(v) : v);
}

/** Valor de um indicador a caminho de `de` até `para`. No fim é EXATAMENTE `para`. */
export function valorEntre(de, para, progresso) {
  if (!Number.isFinite(para)) return para;
  if (progresso >= 1) return para;
  const partida = Number.isFinite(de) ? de : 0;
  return partida + (para - partida) * suavizar(progresso);
}

/** Texto de um quadro da contagem entre dois valores (mudança de filtro), no formato do indicador. */
export function textoDaContagemEntre(de, para, formato, progresso) {
  const v = valorEntre(de, para, progresso);
  return formatar(formato, formato === 'integer' && progresso < 1 ? Math.round(v) : v);
}

/**
 * Transform que faz um marcador JÁ posicionado em `para` parecer estar em `de` (origem no
 * canto de cima à esquerda). Animar dele até 'none' é o deslize, sem mexer em largura.
 */
export function transformDoMarcador(de, para) {
  const ok = (r) => r && [r.left, r.top, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0;
  if (!ok(de) || !ok(para)) return 'none';
  const dx = de.left - para.left;
  const dy = de.top - para.top;
  const sx = de.width / para.width;
  const sy = de.height / para.height;
  if (dx === 0 && dy === 0 && sx === 1 && sy === 1) return 'none';
  const n = (v) => Math.round(v * 1000) / 1000;
  return `translate(${n(dx)}px, ${n(dy)}px) scale(${n(sx)}, ${n(sy)})`;
}

/** Com movimento reduzido toda duração vira zero. */
export function duracao(ms, reduzido) {
  return reduzido ? 0 : ms;
}

/** Avançar desliza pra um lado, voltar pro outro. */
export function direcaoDoPasso(de, para) {
  return Number(para) < Number(de) ? 'tras' : 'frente';
}

// ---- DOM ----

/** A pessoa pediu menos movimento no sistema? Sem matchMedia (node), responde que sim. */
export function menosMovimento() {
  try {
    return typeof window === 'undefined' || !window.matchMedia
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return true; }
}

/** Anima pela API do navegador quando dá; devolve null sem movimento (o estado final já vale). */
export function animar(el, quadros, opcoes) {
  if (!el || typeof el.animate !== 'function' || menosMovimento()) return null;
  try {
    return el.animate(quadros, { easing: CURVA.saida, ...opcoes });
  } catch { return null; }
}
