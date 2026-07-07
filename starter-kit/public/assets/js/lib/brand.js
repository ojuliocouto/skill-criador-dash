// Helpers de identidade visual (logo) compartilhados entre a topbar do dashboard
// (dashboard.js) e a lista (index-page.js). ESM puro, sem DOM: monta string HTML
// ja escapada. O backend tambem valida o logo; aqui e defesa em profundidade no
// cliente, pra nunca renderizar um src perigoso mesmo que algo escape do servidor.

import { esc } from './html.js';

/**
 * Valida o src do logo NO CLIENTE. So aceita imagem por https ou data URI de
 * imagem (^https:// ou ^data:image/). Qualquer outra coisa (javascript:, http://
 * sem TLS, data: nao-imagem, vazio, nao-string) devolve '' = sem logo.
 *
 * @param {unknown} src src candidato vindo da config
 * @returns {string} o src seguro (trim) ou '' se nao passar
 */
export function safeLogoSrc(src) {
  if (typeof src !== 'string') return '';
  const s = src.trim();
  if (/^https:\/\//i.test(s)) return s;
  if (/^data:image\//i.test(s)) return s;
  return '';
}

/**
 * Monta o conteudo INTERNO do .brand: quando ha um logo seguro, um
 * <img class="brand-logo"> no lugar do .dot; senao, o .dot de sempre. O nome
 * (usado tambem como alt do logo) e sempre escapado, e o src do logo passa por
 * safeLogoSrc + esc (defesa extra) antes de entrar no atributo.
 *
 * @param {string} name  nome do dashboard (vira o alt do logo e o texto do .name)
 * @param {unknown} logo src do logo vindo da config (pode ser invalido)
 * @returns {string} HTML do interior do .brand (mark do logo/dot + .name)
 */
export function brandInnerHtml(name, logo) {
  const safe = safeLogoSrc(logo);
  const nome = name || 'Dashboard';
  const mark = safe
    ? `<img class="brand-logo" alt="${esc(nome)}" src="${esc(safe)}" />`
    : `<span class="dot"></span>`;
  return `${mark}<span class="name">${esc(nome)}</span>`;
}
