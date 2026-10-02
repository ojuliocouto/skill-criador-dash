// Widget tabela: tabela HTML simples, ate pageSize linhas, celulas escapadas.
// Funcao de render pura -> retorna string HTML.

import { esc } from './_util.js';
import { parseNumberBR, fmtInteger } from '../lib/format.js';

const DUAS_CASAS = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Célula numérica (print de 02/10/2026: "45200" cru ao lado de "1.250,00"): formato brasileiro
// e alinhada à direita. Data (01/07/2026) e texto não são número e ficam como vieram.
function celula(v) {
  const n = parseNumberBR(v);
  if (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(n))) {
    const temDecimal = typeof v === 'string' ? /,\d/.test(v) : !Number.isInteger(v);
    return { num: true, txt: temDecimal ? DUAS_CASAS.format(n) : fmtInteger(n) };
  }
  return { num: false, txt: v };
}

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

  const numerica = columns.map((c) => rows.slice(0, pageSize).some((r) => celula(r[c]).num)
    && rows.slice(0, pageSize).every((r) => r[c] == null || r[c] === '' || celula(r[c]).num));
  const head = columns.map((c, i) => `<th scope="col"${numerica[i] ? ' class="num"' : ''}>${esc(c)}</th>`).join('');
  // Print real (02/10/2026): a rolagem vertical interna cortava a linha no meio sem aviso.
  // Agora a tabela mostra as linhas inteiras e diz quantas são; o excesso se vê pelo filtro.
  const mostradas = Math.min(rows.length, pageSize);
  const resumo = mostradas === rows.length
    ? `Mostrando ${rows.length === 1 ? 'a única linha' : `as ${rows.length} linhas`}.`
    : `Mostrando ${mostradas} de ${rows.length} linhas. Use o filtro de período para ver as outras.`;
  const body = rows
    .slice(0, pageSize)
    .map((row) => {
      const cells = columns.map((c, i) => numerica[i] ? `<td class="num">${esc(celula(row[c]).txt)}</td>` : `<td>${esc(row[c])}</td>`).join('');
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
      `<div class="table__rodape">` +
        `<span class="table__resumo">${esc(resumo)}</span>` +
        `<span class="table__arrasta">Arraste para o lado para ver todas as colunas.</span>` +
      `</div>` +
    `</div>`
  );
}
