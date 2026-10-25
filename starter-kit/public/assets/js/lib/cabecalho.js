// Cabeçalho de marca do dashboard: faixa no topo do corpo com o nome do painel, o rótulo do
// domínio e o período dos dados. ESM, puro: monta string HTML já escapada.
//
// O logo da config entra quando passa em safeLogoSrc (https ou data:image). Ele vai sobre uma
// plaquinha clara porque a maioria dos logos é desenhada pra fundo claro: no tema escuro, sem a
// plaquinha, um logo escuro sumiria. 3.9: a faixa não é mais um bloco preto; é o título da página.

import { esc } from './html.js';
import { safeLogoSrc } from './brand.js';
import { dateBounds } from './filters.js';
import { isoParaBR } from './data-br.js';

/**
 * Menor e maior data das linhas, em formato brasileiro.
 * @returns {{de:string, ate:string}|null}  null sem coluna de data ou sem data válida
 */
export function periodoDosDados(rows, colMap, dateSlot) {
  const col = colMap && colMap[dateSlot];
  if (!col) return null;
  const { min, max } = dateBounds(rows || [], col);
  if (!min || !max) return null;
  return { de: isoParaBR(min), ate: isoParaBR(max) };
}

/**
 * Forma curta pro celular, onde o rótulo "Período dos dados" some: 'Dados de 05/09 a 04/10' quando
 * as duas datas são do mesmo ano; com anos diferentes, as datas longas. Um dia só: 'Dados de 04/10'.
 * O "Dados de" separa o período da planilha do filtro aplicado (que aparece no botão Filtros).
 */
export function textoDoPeriodoCurto(periodo) {
  if (!periodo || !periodo.de || !periodo.ate) return '';
  const ano = (d) => String(d).slice(6);
  const dm = (d) => String(d).slice(0, 5);
  if (periodo.de === periodo.ate) return `Dados de ${dm(periodo.de)}`;
  if (ano(periodo.de) !== ano(periodo.ate)) return `Dados de ${textoDoPeriodo(periodo)}`;
  return `Dados de ${dm(periodo.de)} a ${dm(periodo.ate)}`;
}

// Ícone do botão Filtros (celular): três linhas que encurtam, o desenho comum de filtro.
const ICONE_FILTROS = '<svg class="filtros-abrir__icone" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M2.5 4.5h11M4.5 8h7M6.5 11.5h3"/></svg>';

/**
 * Botão que mostra e esconde a barra de filtros no celular (lib/filtros-celular.js liga o clique;
 * celular.css esconde a barra enquanto ele está fechado). No computador ele não aparece.
 */
export function botaoDeFiltrosHtml() {
  return `<button class="filtros-abrir" type="button" aria-controls="filterbar" aria-expanded="false">${ICONE_FILTROS}<span class="filtros-abrir__rotulo">Filtros</span></button>`;
}

/** '05/09/2026 a 04/10/2026'; um dia só mostra só o dia; sem período, ''. */
export function textoDoPeriodo(periodo) {
  if (!periodo || !periodo.de || !periodo.ate) return '';
  return periodo.de === periodo.ate ? periodo.de : `${periodo.de} a ${periodo.ate}`;
}

// Ícone fixo do botão Atualizar (texto do código, nunca dado da pessoa). Gira enquanto busca.
const ICONE_ATUALIZAR = '<svg class="dados-estado__icone" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89"/><path d="M13.5 2.5v2.9h-2.9"/></svg>';

/**
 * Idade dos números e o botão Atualizar. Vai dentro da faixa; onde não há faixa (aba de um
 * grupo), vai solta acima dos filtros (`solto`).
 * @param {{texto?:string, solto?:boolean}} [p]  texto: "Atualizado há 3 min" (lib/atualizado.js)
 * @returns {string}
 */
export function estadoDosDadosHtml({ texto = '', solto = false } = {}) {
  return (
    `<div class="dados-estado${solto ? ' dados-estado--solto' : ''}">` +
      `<span class="dados-estado__texto" id="dashatualizado" role="status">${esc(texto)}</span>` +
      `<button class="dados-estado__botao" id="dashatualizar" type="button">${ICONE_ATUALIZAR}<span class="dados-estado__rotulo">Atualizar</span></button>` +
    `</div>`
  );
}

/**
 * @param {{nome?:string, dominio?:string, periodo?:{de:string,ate:string}|null, logo?:unknown, logoFundo?:'claro'|'escuro', dados?:{texto?:string}|null}} p
 *   logoFundo 'escuro': logo claro (medido no envio) vai numa placa escura, senão sumiria na placa branca.
 *   dados: quando vem, a faixa ganha a idade dos números e o botão Atualizar.
 * @returns {string} HTML da faixa
 */
export function cabecalhoHtml({ nome, dominio, periodo, logo, logoFundo, dados } = {}) {
  const titulo = nome || 'Dashboard';
  const src = safeLogoSrc(logo);
  // alt vazio: o nome do painel já está escrito ao lado, repetir seria ruído no leitor de tela.
  const logoHtml = src
    ? `<span class="faixa__logo${logoFundo === 'escuro' ? ' faixa__logo--escuro' : ''}"><img class="faixa__logo-img" alt="" src="${esc(src)}" /></span>`
    : '';
  const dominioHtml = dominio ? `<p class="faixa__dominio">${esc(dominio)}</p>` : '';
  const texto = textoDoPeriodo(periodo);
  // A forma curta só aparece no celular (celular.css); o leitor de tela lê a longa.
  const periodoHtml = texto
    ? `<div class="faixa__periodo">` +
        `<span class="faixa__periodo-rotulo">Período dos dados</span>` +
        `<span class="faixa__periodo-valor" id="dashperiodo">${esc(texto)}</span>` +
        `<span class="faixa__periodo-curto" aria-hidden="true">${esc(textoDoPeriodoCurto(periodo))}</span>` +
      `</div>`
    : '';
  return (
    `<div class="faixa">` +
      `<div class="faixa__marca">` +
        logoHtml +
        `<div class="faixa__textos">` +
          `<h1 class="faixa__nome">${esc(titulo)}</h1>` +
          dominioHtml +
        `</div>` +
      `</div>` +
      (dados ? `<div class="faixa__lado">${periodoHtml}${estadoDosDadosHtml(dados)}${botaoDeFiltrosHtml()}</div>` : periodoHtml) +
    `</div>`
  );
}
