// Widget tabela: tabela HTML simples, ate pageSize linhas, celulas escapadas.
// Funcao de render pura -> retorna string HTML.

import { esc } from './_util.js';
import { parseNumberBR, fmtInteger } from '../lib/format.js';

const DUAS_CASAS = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// IDENTIFICADOR nao e quantidade. Uma planilha de controle (abertura de empresa,
// cadastro, protocolo) tem colunas que sao SO digitos mas contam um codigo, nao um
// valor: NIRE, CPF/CNPJ sem pontuacao, CEP, protocolo, matricula. Formatar essas
// como numero e errado de duas formas, e a segunda PERDE DADO:
//
//   1) separador de milhar num codigo:  NIRE 4220456789  ->  "4.220.456.789"
//   2) zero a esquerda sumindo:         PROTOCOLO 000123456  ->  "123.456"
//
// O (2) e o grave: o numero mostrado tem MENOS digitos que o da planilha, sem aviso.
// CNPJ que começa com zero (04.252.011/0001-10, comum) aparece errado na tabela.
//
// Duas guardas, por isso:
//   (a) zero a esquerda => nunca e quantidade escrita normalmente. Guarda de
//       CORRECAO, sem heuristica: reformatar perderia informacao.
//   (b) nome da coluna no vocabulario de identificador => fica texto (e alinhado
//       a esquerda, que e o certo pra codigo). Guarda HEURISTICA, por nome.
const RE_IDENTIFICADOR = /(^|[^a-z])(id|cpf|cnpj|cep|nire|rg|pis|nit|cnae|protocolo|matricula|matrícula|inscricao|inscrição|codigo|código|telefone|celular|fone|conta|agencia|agência)([^a-z]|$)/i;

/** Nome de coluna que denota codigo, nao medida. @param {string} c @returns {boolean} */
function colunaIdentificador(c) {
  return RE_IDENTIFICADOR.test(String(c == null ? '' : c));
}

/** Digito com zero a esquerda ("08010000"): formatar perderia o zero. @param {*} v @returns {boolean} */
function zeroAEsquerda(v) {
  return typeof v === 'string' && /^0\d/.test(v.trim());
}

// Célula numérica (print de 02/10/2026: "45200" cru ao lado de "1.250,00"): formato brasileiro
// e alinhada à direita. Data (01/07/2026), texto e identificador ficam como vieram.
function celula(v, coluna) {
  if (zeroAEsquerda(v) || colunaIdentificador(coluna)) return { num: false, txt: v };
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

  const numerica = columns.map((c) => rows.slice(0, pageSize).some((r) => celula(r[c], c).num)
    && rows.slice(0, pageSize).every((r) => r[c] == null || r[c] === '' || celula(r[c], c).num));
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
      const cells = columns.map((c, i) => numerica[i] ? `<td class="num">${esc(celula(row[c], c).txt)}</td>` : `<td>${esc(row[c])}</td>`).join('');
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
