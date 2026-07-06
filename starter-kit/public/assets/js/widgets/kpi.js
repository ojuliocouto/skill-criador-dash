// Widget KPI: card com label, valor formatado e hint opcional.
// Funcao de render pura -> retorna string HTML.

import { esc, fmtBy } from './_util.js';

/**
 * @param {{label:string, format?:string, hint?:string}} props
 * @param {number} value
 * @returns {string} HTML
 */
export function render(props = {}, value) {
  const { label = '', format = 'number', hint } = props;
  const valor = fmtBy(format, value);
  const hintHtml = hint
    ? `<div class="kpi__hint">${esc(hint)}</div>`
    : '';
  return (
    `<div class="kpi">` +
      `<div class="kpi__label">${esc(label)}</div>` +
      `<div class="kpi__value">${esc(valor)}</div>` +
      hintHtml +
    `</div>`
  );
}
