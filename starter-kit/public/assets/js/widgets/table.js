// Widget tabela: tabela HTML simples, ate pageSize linhas, celulas escapadas.
// Funcao de render pura -> retorna string HTML.

import { esc } from './_util.js';
import { parseNumberBR, parseDateBR, fmtInteger, fmtCurrency } from '../lib/format.js';
import { isoParaBR } from '../lib/data-br.js';

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

// Apresentação por coluna (props.columnMeta, montado por lib/colunas.js a partir do template).
// O valor cru da fonte não muda: aqui só se decide como ele aparece.
//   format 'date':     data em dd/mm/aaaa (a hora, se vier, continua depois da data);
//   format 'currency': número com R$ e duas casas, alinhado à direita.
// Célula que não é data nem número (texto solto, vazio) aparece como veio.
function celulaData(v) {
  const cru = v == null ? '' : String(v).trim();
  const iso = parseDateBR(cru);
  if (!iso) return { num: false, txt: v };
  const hora = (cru.match(/[T ](\d{2}:\d{2})/) || [])[1];
  return { num: false, txt: hora ? `${isoParaBR(iso)} ${hora}` : isoParaBR(iso) };
}

function celulaMoeda(v) {
  const n = parseNumberBR(v);
  if (v == null || String(v).trim() === '' || !Number.isFinite(n)) return { num: false, txt: v };
  return { num: true, txt: fmtCurrency(n) };
}

function celulaDe(meta, v) {
  if (meta && meta.format === 'date') return celulaData(v);
  if (meta && meta.format === 'currency') return celulaMoeda(v);
  return celula(v);
}

/**
 * @param {{title?:string, pageSize?:number, columnMeta?:Object<string,{label?:string, format?:'date'|'currency'}>}} props
 * @param {{columns:string[], rows:Object[]}} data
 * @returns {string} HTML
 */
export function render(props = {}, data = {}) {
  const { title = '', pageSize = 50 } = props;
  const columnMeta = (props && props.columnMeta) || {};
  const metaDe = (c) => columnMeta[c];
  const titleHtml = title ? `<div class="table__title">${esc(title)}</div>` : '';
  const columns = Array.isArray(data.columns) ? data.columns : [];
  const rows = Array.isArray(data.rows) ? data.rows : [];

  if (columns.length === 0 || rows.length === 0) {
    return `<div class="table">${titleHtml}<div class="table__empty">Sem dados</div></div>`;
  }

  const numerica = columns.map((c) => rows.slice(0, pageSize).some((r) => celulaDe(metaDe(c), r[c]).num)
    && rows.slice(0, pageSize).every((r) => r[c] == null || r[c] === '' || celulaDe(metaDe(c), r[c]).num));
  // Cabeçalho: rótulo do slot quando a coluna está mapeada. O nome da coluna na fonte fica na
  // dica, pra quem precisar achar a coluna na planilha.
  const head = columns.map((c, i) => {
    const rotulo = (metaDe(c) && metaDe(c).label) || c;
    const dica = rotulo !== c ? ` title="Coluna na fonte: ${esc(c)}"` : '';
    return `<th scope="col"${numerica[i] ? ' class="num"' : ''}${dica}>${esc(rotulo)}</th>`;
  }).join('');
  // Print real (02/10/2026): a rolagem vertical interna cortava a linha no meio sem aviso.
  // Agora a tabela mostra as linhas inteiras e diz quantas são; o excesso se vê pelo filtro.
  const mostradas = Math.min(rows.length, pageSize);
  const resumo = mostradas === rows.length
    ? `Mostrando ${rows.length === 1 ? 'a única linha' : `as ${rows.length} linhas`}.`
    : `Mostrando ${mostradas} de ${rows.length} linhas. Use o filtro de período para ver as outras.`;
  const body = rows
    .slice(0, pageSize)
    .map((row) => {
      const cells = columns.map((c, i) => {
        const cel = celulaDe(metaDe(c), row[c]);
        // Coluna numérica: toda célula alinha à direita. Coluna de texto ou data: como veio,
        // a não ser que a apresentação da coluna tenha formatado (data brasileira).
        return numerica[i] ? `<td class="num">${esc(cel.txt)}</td>` : `<td>${esc(metaDe(c) && metaDe(c).format ? cel.txt : row[c])}</td>`;
      }).join('');
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
