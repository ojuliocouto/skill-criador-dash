// Widget resumo: tabela agregada (por canal, por semana...) com linha de TOTAL em destaque.
// Função de render pura -> retorna string HTML. Recebe os dados JÁ agregados por lib/resumo.js
// (resumir), que é quem garante que cada linha e o total saem do mesmo motor de métricas.
//
// Tela estreita: cada célula leva data-label com o nome da coluna, e o CSS empilha a tabela
// em blocos (um por linha) quando o cartão fica estreito. A página nunca rola de lado.

import { esc, fmtBy } from './_util.js';
import { seletorDeOrdemHtml } from '../lib/tabela-ordena.js';

// Quantas colunas de métrica: decide em que largura do cartão a tabela vira blocos empilhados.
function classeDeTamanho(n) {
  if (n <= 4) return 'resumo--p';
  if (n <= 8) return 'resumo--m';
  return 'resumo--g';
}

const DICA = { bom: 'Melhor que o total', ruim: 'Pior que o total' };
const CLASSE_DO_TOM = { bom: ' is-good', ruim: ' is-bad' };

function celula(coluna, valor, tom) {
  if (valor == null || !Number.isFinite(valor)) {
    return `<td class="num is-vazio" data-label="${esc(coluna.label)}">sem dado</td>`;
  }
  const cls = CLASSE_DO_TOM[tom] || '';
  const dica = DICA[tom] ? ` title="${DICA[tom]}"` : '';
  return `<td class="num${cls}" data-label="${esc(coluna.label)}"${dica}>${esc(fmtBy(coluna.format, valor))}</td>`;
}

/**
 * @param {{title?:string}} props
 * @param {object} dados  saída de resumir() em lib/resumo.js
 * @returns {string} HTML
 */
export function render(props = {}, dados) {
  const { title = '' } = props || {};
  const titleHtml = title ? `<div class="resumo__title">${esc(title)}</div>` : '';
  if (!dados || !dados.ok || !Array.isArray(dados.colunas) || !dados.colunas.length) {
    return `<div class="resumo">${titleHtml}<div class="resumo__empty">Sem dados</div></div>`;
  }
  const { colunas, linhas, total, dimLabel, ocultas = [], totalDeGrupos = linhas.length } = dados;

  const head = `<th scope="col">${esc(dimLabel)}</th>` +
    colunas.map((c) => `<th scope="col" class="num">${esc(c.label)}</th>`).join('');
  const body = linhas.map((l) =>
    `<tr><th scope="row">${esc(l.label)}</th>` +
      colunas.map((c) => celula(c, l.valores[c.key], l.tons && l.tons[c.key])).join('') +
    `</tr>`).join('');
  const foot = `<tr class="resumo__total"><th scope="row">${esc(total.label)}</th>` +
    colunas.map((c) => celula(c, total.valores[c.key])).join('') + `</tr>`;

  const notas = [];
  if (linhas.some((l) => l.tons && Object.keys(l.tons).length)) {
    notas.push('Verde: melhor que o total. Vermelho: pior.');
  }
  if (totalDeGrupos > linhas.length) {
    notas.push(`Mostrando ${linhas.length} de ${totalDeGrupos} linhas. O total considera todas.`);
  }
  if (ocultas.length) {
    notas.push(`Ficou de fora por falta de coluna: ${ocultas.join(', ')}.`);
  }
  const notaHtml = notas.length ? `<p class="resumo__nota">${esc(notas.join(' '))}</p>` : '';

  return (
    `<div class="resumo ${classeDeTamanho(colunas.length)}" data-widget="resumo">` +
      titleHtml +
      seletorDeOrdemHtml([dimLabel, ...colunas.map((c) => c.label)]) +
      `<div class="resumo__scroll">` +
        `<table class="resumo__el">` +
          `<thead><tr>${head}</tr></thead>` +
          `<tbody>${body}</tbody>` +
          `<tfoot>${foot}</tfoot>` +
        `</table>` +
      `</div>` +
      notaHtml +
    `</div>`
  );
}
