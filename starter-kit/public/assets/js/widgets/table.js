// Widget tabela: tabela HTML simples, ate pageSize linhas, celulas escapadas.
// Funcao de render pura -> retorna string HTML.

import { esc } from './_util.js';

/**
 * @param {{title?:string, pageSize?:number}} props
 * @param {{columns:string[], rows:Object[]}} data
 * @returns {string} HTML
 */
export function render(props = {}, data = {}) {
  const { title = '', pageSize = 50 } = props;
  const titleHtml = title ? `<div class="table__title">${esc(title)}</div>` : '';
  const columns = Array.isArray(data.columns) ? data.columns : [];
  const rows = Array.isArray(data.rows) ? data.rows : [];

  if (columns.length === 0 || rows.length === 0) {
    return `<div class="table">${titleHtml}<div class="table__empty">Sem dados</div></div>`;
  }

  const head = columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('');
  const body = rows
    .slice(0, pageSize)
    .map((row) => {
      const cells = columns.map((c) => `<td>${esc(row[c])}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return (
    `<div class="table">` +
      titleHtml +
      `<div class="table__scroll">` +
        `<table class="table__el">` +
          `<thead><tr>${head}</tr></thead>` +
          `<tbody>${body}</tbody>` +
        `</table>` +
      `</div>` +
    `</div>`
  );
}
