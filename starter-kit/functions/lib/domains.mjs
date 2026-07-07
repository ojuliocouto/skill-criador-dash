// Lista canonica de dominios de dashboard, compartilhada entre o front-end
// (registry de templates em public/assets/js/templates/index.js) e o servidor
// (validacao de POST em functions/api/dashboards.js). Sem rede, sem estado,
// sem DOM: ESM puro, testavel em node:test.
//
// UNICA FONTE DA VERDADE dos dominios. Adicionar um dominio novo = adicionar o
// template + registrar a chave AQUI; a validacao do servidor deriva daqui e nao
// precisa ser editada em paralelo (elimina o enum hardcoded que dava drift).
//
// Manter em functions/lib para casar com a convencao dos outros modulos
// compartilhados (sheets-url.mjs, csv.mjs, auth-config.mjs): logica neutra que
// tanto as Pages Functions quanto o browser importam sem puxar dependencia de
// runtime especifico (o registry de templates carrega codigo de widget/format
// pensado pro browser; o servidor so precisa da lista de chaves).

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
