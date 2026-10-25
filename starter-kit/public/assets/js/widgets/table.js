// Widget tabela: tabela HTML simples, ate pageSize linhas, celulas escapadas.
// Funcao de render pura -> retorna string HTML.

import { SEM_DADOS_NO_PERIODO } from '../lib/estado-vazio.js';
import { esc } from './_util.js';
import { parseNumberBR, parseDateBR, fmtInteger, fmtCurrency } from '../lib/format.js';
import { isoParaBR } from '../lib/data-br.js';
import { seletorDeOrdemHtml } from '../lib/tabela-ordena.js';

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

// Quantas colunas: decide em que largura do cartão a tabela vira um cartão por linha (como a resumida).
function classeDeTamanho(n) {
  if (n <= 4) return 'table--p';
  if (n <= 8) return 'table--m';
  return 'table--g';
}

/**
 * @param {{title?:string, pageSize?:number, columnMeta?:Object<string,{label?:string, format?:'date'|'currency'}>}} props
 * @param {{columns:string[], rows:Object[]}} data
 * @returns {string} HTML
 */
// Teto de linhas que entram no HTML (3.9): acima disso o navegador do celular sofre. As que passam do
// teto ficam fora e a tabela diz isso; as mais recentes são as que entram.
export const TETO_DE_LINHAS = 5000;
const milhar = (n) => fmtInteger(n);

// Mais recentes primeiro (3.9, achado 8 da auditoria de 25/10/2026): antes a tabela mostrava as 50
// linhas MAIS ANTIGAS da fonte. Coluna de data mapeada (columnMeta format 'date') ordena da mais nova
// para a mais velha; empate e linha sem data mantêm a ordem da fonte (linha sem data vai para o fim).
function maisRecentesPrimeiro(rows, columns, metaDe) {
  const col = columns.find((c) => metaDe(c) && metaDe(c).format === 'date');
  if (!col) return { linhas: rows, porData: false };
  const comIso = rows.map((r, i) => ({ r, i, iso: parseDateBR(r[col] == null ? '' : String(r[col]).trim()) }));
  comIso.sort((a, b) => {
    if (!a.iso || !b.iso) return a.iso === b.iso ? a.i - b.i : (a.iso ? -1 : 1);
    return a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : a.i - b.i;
  });
  return { linhas: comIso.map((x) => x.r), porData: true };
}

export function render(props = {}, data = {}) {
  const { title = '', pageSize = 50 } = props;
  const columnMeta = (props && props.columnMeta) || {};
  const metaDe = (c) => columnMeta[c];
  const titleHtml = title ? `<div class="table__title">${esc(title)}</div>` : '';
  const columns = Array.isArray(data.columns) ? data.columns : [];
  const todas = Array.isArray(data.rows) ? data.rows : [];

  if (columns.length === 0 || todas.length === 0) {
    return `<div class="table">${titleHtml}<div class="table__empty">${esc(SEM_DADOS_NO_PERIODO)}</div></div>`;
  }

  const { linhas: ordenadas, porData } = maisRecentesPrimeiro(todas, columns, metaDe);
  const rows = ordenadas.slice(0, TETO_DE_LINHAS);
  const amostra = rows.slice(0, pageSize);
  const numerica = columns.map((c) => amostra.some((r) => celulaDe(metaDe(c), r[c]).num)
    && amostra.every((r) => r[c] == null || r[c] === '' || celulaDe(metaDe(c), r[c]).num));
  // Cabeçalho: rótulo do slot quando a coluna está mapeada. O nome da coluna na fonte fica na
  // dica, pra quem precisar achar a coluna na planilha.
  const rotuloDe = (c) => (metaDe(c) && metaDe(c).label) || c;
  const head = columns.map((c, i) => {
    const rotulo = rotuloDe(c);
    const dica = rotulo !== c ? ` title="Coluna na fonte: ${esc(c)}"` : '';
    return `<th scope="col"${numerica[i] ? ' class="num"' : ''}${dica}>${esc(rotulo)}</th>`;
  }).join('');
  // Print real (02/10/2026): a rolagem vertical interna cortava a linha no meio sem aviso. A tabela
  // mostra as linhas inteiras e diz quantas são. 3.9: TODAS as linhas (até o teto) entram na tabela; as
  // que passam do corte ficam escondidas (data-corte) até "Mostrar mais", e ordenar pelo cabeçalho mexe
  // no conjunto inteiro (lib/tabela-ordena.js refaz o corte na ordem nova).
  const mostradas = Math.min(rows.length, pageSize);
  const ordem = porData ? ', as mais recentes primeiro' : '';
  const teto = todas.length > rows.length
    ? ` A tabela carrega as ${milhar(rows.length)} mais recentes; use o filtro de período para ver as outras.`
    : '';
  const resumo = mostradas === todas.length
    ? `Mostrando ${todas.length === 1 ? 'a única linha' : `as ${milhar(todas.length)} linhas`}${ordem}.`
    : `Mostrando ${milhar(mostradas)} de ${milhar(todas.length)} linhas${ordem}.${teto}`;
  const body = rows
    .map((row, n) => {
      const cells = columns.map((c, i) => {
        const cel = celulaDe(metaDe(c), row[c]);
        // Coluna numérica: toda célula alinha à direita. Coluna de texto ou data: como veio,
        // a não ser que a apresentação da coluna tenha formatado (data brasileira).
        return numerica[i] ? `<td class="num">${esc(cel.txt)}</td>` : `<td>${esc(metaDe(c) && metaDe(c).format ? cel.txt : row[c])}</td>`;
      }).join('');
      // style inline: no celular a linha vira cartão com display:grid, que passaria por cima do [hidden].
      return n < pageSize ? `<tr>${cells}</tr>` : `<tr data-corte style="display:none">${cells}</tr>`;
    })
    .join('');
  const faltam = rows.length - mostradas;
  const passo = Math.min(pageSize, faltam);
  const mais = faltam > 0
    ? `<button class="btn ghost table__mais" type="button" data-mostrar-mais="${esc(pageSize)}">Mostrar mais ${esc(milhar(passo))}</button>`
    : '';

  return (
    `<div class="table ${classeDeTamanho(columns.length)}">` +
      titleHtml +
      seletorDeOrdemHtml(columns.map(rotuloDe)) +
      `<div class="table__scroll">` +
        `<table class="table__el" data-visiveis="${esc(mostradas)}">` +
          `<thead><tr>${head}</tr></thead>` +
          `<tbody>${body}</tbody>` +
        `</table>` +
      `</div>` +
      `<div class="table__rodape">` +
        `<span class="table__resumo">${esc(resumo)}</span>` +
        mais +
        `<span class="table__arrasta">Arraste para o lado para ver todas as colunas.</span>` +
      `</div>` +
    `</div>`
  );
}
