// Efeito 3, "números de roleta": ao trocar período ou filtro, cada dígito do indicador rola na
// vertical do antigo ao novo (como o NumberFlow), no lugar da contagem. ESM.
//
// O texto final do indicador continua no DOM o tempo todo (só fica transparente), então leitor
// de tela e quem copia veem o valor certo. Por cima vai uma roleta aria-hidden, em posição
// absoluta, que não empurra nada. Só transform e opacity animam. Com movimento reduzido nem
// começa. Um temporizador garante o estado final mesmo com a aba em segundo plano.

import { menosMovimento, textoDaContagem, CURVA } from './movimento.js';

/** Duração do rolar de cada dígito (ms). Espelha --dur-roleta do efeitos.css. */
export const DURACAO_DA_ROLETA = 640;
/** Comprimento da tira antiga (duas voltas de 0 a 9). A roleta atual usa só duas células (tiraDoDigito). */
export const CELULAS_DA_TIRA = 20;
const PASSO_DO_ATRASO = 26;
const TETO_DO_ATRASO = 6;

const ehDigito = (c) => c >= '0' && c <= '9';

/** 1 quando o valor subiu (a roleta anda pra cima), -1 quando desceu. Igual ou inválido: 1. */
export function direcaoDaRoleta(antes, depois) {
  const a = Number(antes);
  const d = Number(depois);
  return Number.isFinite(a) && Number.isFinite(d) && d < a ? -1 : 1;
}

/** Posição da tira onde a roleta começa e onde termina, andando na direção pedida. */
export function caminhoDoDigito(de, para, direcao) {
  if (direcao >= 0) {
    const passos = para >= de ? para - de : para + 10 - de;
    return { inicio: de, fim: de + passos };
  }
  const passos = de >= para ? de - para : de + 10 - para;
  return { inicio: de + 10, fim: de + 10 - passos };
}

/**
 * A tira de UMA casa: só o dígito que sai e o que entra, um em cima do outro, e a tira anda meia
 * altura. Nada de dígito de passagem (o 5 e o 6 entre o 4 e o 0 só embaralhavam). Subindo, o novo
 * entra por baixo; descendo, por cima. `de` e `para` são o deslocamento (% da tira) do começo ao fim.
 */
export function tiraDoDigito(velho, novo, direcao) {
  return direcao >= 0
    ? { celulas: [velho, novo], de: 0, para: -50 }
    : { celulas: [novo, velho], de: -50, para: 0 };
}

/**
 * Um item por caractere do texto NOVO, alinhado pela direita com o antigo:
 *   'fixo' (símbolo, separador ou dígito igual), 'rola' (dígito que mudou: de -> para),
 *   'novo' (dígito que não existia no texto antigo).
 */
export function planoDaRoleta(antes, depois) {
  const a = String(antes == null ? '' : antes);
  const d = String(depois == null ? '' : depois);
  const plano = [];
  for (let i = 0; i < d.length; i++) {
    const ch = d[i];
    const j = a.length - (d.length - i);
    const velho = j >= 0 ? a[j] : '';
    if (!ehDigito(ch)) { plano.push({ ch, tipo: 'fixo' }); continue; }
    if (velho === ch) plano.push({ ch, tipo: 'fixo' });
    else if (ehDigito(velho)) plano.push({ ch, tipo: 'rola', de: Number(velho), para: Number(ch) });
    else plano.push({ ch, tipo: 'novo', para: Number(ch) });
  }
  return plano;
}

/** Espera de cada coluna pra começar: a da direita (índice 0) sai primeiro. */
export function atrasoDoDigito(indiceDaDireita) {
  return Math.min(Math.max(0, indiceDaDireita), TETO_DO_ATRASO) * PASSO_DO_ATRASO;
}

// ---------------------------------------------------------------- DOM

function montarRoleta(plano, direcao) {
  const roleta = document.createElement('span');
  roleta.className = 'kpi__roleta';
  roleta.setAttribute('aria-hidden', 'true');
  roleta.innerHTML = plano.map((c) => {
    if (c.tipo === 'rola') {
      const { celulas } = tiraDoDigito(c.de, c.para, direcao);
      return `<span class="rd rd--col" data-tipo="rola"><span class="rd__tira">${celulas.map((n) => `<span class="rd__cel">${n}</span>`).join('')}</span></span>`;
    }
    if (c.tipo === 'novo') return `<span class="rd rd--col" data-tipo="novo"><span class="rd__cel">${c.ch}</span></span>`;
    return `<span class="rd rd--fixo">${c.ch === ' ' ? '&nbsp;' : c.ch}</span>`;
  }).join('');
  return roleta;
}

/**
 * Rola os indicadores cujo valor mudou. `antes` são os valores numéricos na tela antes da troca
 * (um por .kpi, NaN pro que não tem número). Chamar depois que o corpo novo já está no DOM.
 */
export function rolarIndicadores(raiz, antes) {
  if (!raiz || menosMovimento() || typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return;
  raiz.querySelectorAll('.kpi').forEach((kpi, i) => {
    if (kpi.dataset.contaValor == null) return;
    const alvo = kpi.querySelector('.kpi__value');
    const novo = Number(kpi.dataset.contaValor);
    const velho = antes ? Number(antes[i]) : NaN;
    if (!alvo || !Number.isFinite(novo) || !Number.isFinite(velho) || velho === novo) return;
    const formato = kpi.dataset.contaFormato || 'number';
    const plano = planoDaRoleta(textoDaContagem(velho, formato, 1), alvo.textContent);
    if (!plano.some((c) => c.tipo !== 'fixo')) return;
    const direcao = direcaoDaRoleta(velho, novo);
    const roleta = montarRoleta(plano, direcao);
    alvo.classList.add('is-contando');
    alvo.appendChild(roleta);
    let ultimo = 0;
    const colunas = [...roleta.children];
    colunas.forEach((col, idx) => {
      const item = plano[idx];
      if (item.tipo === 'fixo') return;
      const daDireita = plano.length - 1 - idx;
      const atraso = atrasoDoDigito(daDireita);
      ultimo = Math.max(ultimo, atraso);
      if (item.tipo === 'rola') {
        const tira = col.firstElementChild;
        const { de, para } = tiraDoDigito(item.de, item.para, direcao);
        const y = (pct) => `translateY(${pct}%)`;
        tira.style.transform = y(para);
        tira.animate([{ transform: y(de) }, { transform: y(para) }],
          { duration: DURACAO_DA_ROLETA, delay: atraso, easing: CURVA.saida, fill: 'backwards' });
      } else {
        col.animate([{ opacity: 0, transform: `translateY(${direcao * 70}%)` }, { opacity: 1, transform: 'none' }],
          { duration: DURACAO_DA_ROLETA, delay: atraso, easing: CURVA.saida, fill: 'backwards' });
      }
    });
    const fechar = () => { roleta.remove(); alvo.classList.remove('is-contando'); };
    setTimeout(fechar, DURACAO_DA_ROLETA + ultimo + 120);
  });
}
