// Widget ranking: barras horizontais ordenadas desc, largura proporcional ao maior.
// Funcao de render pura -> retorna string HTML.

import { esc, fmtBy } from './_util.js';

/**
 * @param {{title?:string, format?:string}} props
 * @param {{key:string, value:number}[]} items
 * @returns {string} HTML
 */
export function render(props = {}, items) {
  const { title = '', format = 'number' } = props;
  const titleHtml = title ? `<div class="ranking__title">${esc(title)}</div>` : '';
  const list = Array.isArray(items) ? items.slice() : [];

  if (list.length === 0) {
    return `<div class="ranking">${titleHtml}<div class="ranking__empty">Sem dados</div></div>`;
  }

  list.sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
  const maxVal = Math.max(...list.map((it) => Number(it.value) || 0), 0);

  const rows = list.map((it) => {
    const val = Number(it.value) || 0;
    const width = maxVal > 0 ? (val / maxVal) * 100 : 0;
    return (
      `<div class="ranking__row">` +
        `<div class="ranking__key" title="${esc(it.key)}">${esc(it.key)}</div>` +
        `<div class="ranking__bar-wrap">` +
          `<div class="ranking__bar" style="width:${round(width)}%"></div>` +
        `</div>` +
        `<div class="ranking__value">${esc(fmtBy(format, val))}</div>` +
      `</div>`
    );
  });

  return `<div class="ranking">${titleHtml}${rows.join('')}</div>`;
}

function round(n) {
  return Math.round(n * 100) / 100;
}
