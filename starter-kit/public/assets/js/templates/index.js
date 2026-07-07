// Registro de templates de dominio. ESM.

import { template as marketing } from './marketing.js';
import { template as vendas } from './vendas.js';
import { template as suporte } from './suporte.js';
import { DOMAINS } from '../../../../functions/lib/domains.mjs';

const byId = { marketing, vendas, suporte };

// Contrato: as chaves deste registry sao EXATAMENTE os dominios canonicos de
// domains.mjs (a fonte da verdade que o servidor tambem valida). Montamos o
// registry a partir de DOMAINS para que um dominio adicionado la, sem template
// correspondente aqui, falhe cedo e alto em vez de virar uma config gravavel
// que quebra so na hora de renderizar.
export const templates = Object.fromEntries(
  DOMAINS.map((id) => {
    const tpl = byId[id];
    if (!tpl) throw new Error(`Dominio "${id}" listado em domains.mjs nao tem template correspondente.`);
    return [id, tpl];
  }),
);

// Reexporta a lista canonica para quem precisa so das chaves (ex: wizard),
// mantendo domains.mjs como unico ponto de definicao.
export { DOMAINS } from '../../../../functions/lib/domains.mjs';

/**
 * Retorna o template pelo id, ou undefined se nao existir.
 * @param {string} id
 * @returns {object|undefined}
 */
export function getTemplate(id) {
  return templates[id];
}
