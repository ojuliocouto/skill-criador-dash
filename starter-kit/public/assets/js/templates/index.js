// Registro de templates de dominio. ESM.

import { template as marketing } from './marketing.js';
import { template as vendas } from './vendas.js';

export const templates = { marketing, vendas };

/**
 * Retorna o template pelo id, ou undefined se nao existir.
 * @param {string} id
 * @returns {object|undefined}
 */
export function getTemplate(id) {
  return templates[id];
}
