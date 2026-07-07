// Widget funil: barras verticais proporcionais com % de conversao entre etapas.
// Funcao de render pura -> retorna string HTML.

import { esc, fmtBy } from './_util.js';
import { fmtPercent } from '../lib/format.js';

/**
 * @param {{title?:string}} props
 * @param {{label:string, value:number}[]} steps
 * @returns {string} HTML
 */
export function render(props = {}, steps) {
  const { title = '' } = props;
  const titleHtml = title ? `<div class="funnel__title">${esc(title)}</div>` : '';
  const list = Array.isArray(steps) ? steps : [];

  if (list.length === 0) {
    return `<div class="funnel">${titleHtml}<div class="funnel__empty">Sem dados</div></div>`;
  }

  const values = list.map((s) => Number(s.value) || 0);
  const maxVal = Math.max(...values, 0);

  const rows = list.map((s, i) => {
    const val = Number(s.value) || 0;
    const width = maxVal > 0 ? (val / maxVal) * 100 : 0;
    // conversao em relacao a etapa anterior; nao divide por zero
    let convHtml = '';
    if (i > 0) {
      const prev = Number(list[i - 1].value) || 0;
      const conv = prev > 0 ? val / prev : 0;
      convHtml = `<div class="funnel__conv">${esc(fmtPercent(conv))}</div>`;
    }
    // Valor DENTRO da barra so quando ela e larga o bastante pra caber o numero
    // legivel (texto claro sobre o preenchimento). Barra curta -> valor FORA, a
    // direita da barra, em cor de texto normal: senao o numero cai sobre a trilha
    // clara e some (contraste reprova, cara de bug). Limiar ~28% da largura.
    const inside = width >= 28;
    const valueHtml = inside
      ? `<span class="funnel__value">${esc(fmtBy('number', val))}</span>`
      : `<span class="funnel__value funnel__value--out" style="left:calc(${round(width)}% + 8px)">${esc(fmtBy('number', val))}</span>`;
    return (
      `<div class="funnel__step">` +
        `<div class="funnel__label" title="${esc(s.label)}">${esc(s.label)}</div>` +
        `<div class="funnel__bar-wrap">` +
          `<div class="funnel__bar" style="width:${round(width)}%"></div>` +
          valueHtml +
        `</div>` +
        convHtml +
      `</div>`
    );
  });

  return `<div class="funnel">${titleHtml}${rows.join('')}</div>`;
}

function round(n) {
  return Math.round(n * 100) / 100;
}
