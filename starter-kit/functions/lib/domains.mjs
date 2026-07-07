// Lista canonica de dominios de dashboard PARA O SERVIDOR (Pages Functions).
// Sem rede, sem estado, sem DOM: ESM puro, testavel em node:test.
//
// FRONTEIRA (Cloudflare Pages): o browser NAO pode importar deste arquivo. O
// Pages serve so `public/` como raiz, entao um import do navegador para
// functions/lib/domains.mjs vira /functions/lib/domains.mjs no site = 404. Por
// isso o BROWSER tem a sua propria copia em public/assets/js/domains.mjs, e o
// SERVIDOR usa esta. As duas listas DEVEM ser IDENTICAS; o teste
// test/domains-parity.test.js falha se divergirem.
//
// Usado pela validacao de POST em functions/api/dashboards.js. Adicionar um
// dominio novo = registrar a chave AQUI e na copia do browser (public/assets/js/
// domains.mjs) + criar o template; a validacao do servidor deriva daqui.

/** @type {ReadonlyArray<string>} Chaves de dominio validas, em ordem estavel. */
export const DOMAINS = Object.freeze(['marketing', 'vendas', 'suporte']);

/**
 * Diz se `id` e um dominio de dashboard valido.
 * @param {unknown} id
 * @returns {boolean}
 */
export function isDomain(id) {
  return typeof id === 'string' && DOMAINS.includes(id);
}
