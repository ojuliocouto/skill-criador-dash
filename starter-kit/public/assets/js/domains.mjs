// Lista canonica de dominios de dashboard PARA O BROWSER. ESM puro.
//
// POR QUE ESTA COPIA EXISTE (fronteira Cloudflare Pages):
// O Cloudflare Pages serve SO o diretorio `public/` como raiz do site. Um import
// do browser subindo ate a pasta de Functions resolve, no navegador, para uma URL
// que NAO e asset estatico servido -> 404 -> o registry de templates
// (templates/index.js) quebra e o dashboard/wizard nao carregam. Os testes em node
// nao pegavam isso porque resolvem o arquivo em disco.
//
// FRONTEIRA: este arquivo e a UNICA FONTE do BROWSER. O servidor mantem a sua
// propria copia sob a pasta de Functions (elas sao bundladas; o import interno
// funciona no runtime). As duas listas DEVEM ser IDENTICAS: o teste
// test/domains-parity.test.js falha se divergirem, evitando drift silencioso.

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
