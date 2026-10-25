// Dash do Meta Ads criado antes da 3.8.0 (ou da 3.9.0): o colMap foi salvo quando o conector ainda não
// trazia a coluna Resultados (ou a Receita). Aqui ela é ligada na hora de desenhar, sem regravar a config e sem mexer no
// que a pessoa escolheu. ESM, puro (roda no navegador e no node:test).

// Slot do template de Marketing -> coluna que o conector Meta entrega desde a 3.8.0 (Resultados) e a
// 3.9.0 (Receita, de action_values).
export const COLUNAS_NOVAS_DA_META = Object.freeze({ resultados: 'Resultados', receita: 'Receita' });

// Colunas que o conector só manda quando existe o dado (a Receita só vem quando a conta tem compra). Sem o
// DataSet em mãos (esqueleto) elas não são ligadas: ligar seria prometer um número que talvez não exista.
const SO_COM_O_DADO = new Set(['receita']);

/**
 * Devolve um colMap novo com as colunas da 3.8.0 ligadas, só para fonte Meta Ads.
 * - Slot já ligado pela pessoa: fica como está.
 * - Com o DataSet em mãos: só liga se a coluna veio de verdade (snapshot antigo do modo histórico
 *   não tem a coluna, e ligar ali viraria um zero falso).
 * - Sem DataSet (esqueleto de carregamento): confia no tipo da fonte.
 * @param {object} colMap
 * @param {{source?:{type?:string}, dataset?:{columns?:string[], meta?:{source?:string}}}} [ctx]
 * @returns {object}
 */
export function completarColMapDaMeta(colMap, { source, dataset } = {}) {
  const base = colMap && typeof colMap === 'object' ? colMap : {};
  const daMeta = (source && source.type === 'meta') || (dataset && dataset.meta && dataset.meta.source === 'meta');
  if (!daMeta) return base;
  const colunas = dataset && Array.isArray(dataset.columns) ? dataset.columns : null;
  let out = base;
  for (const [slot, coluna] of Object.entries(COLUNAS_NOVAS_DA_META)) {
    if (base[slot]) continue;
    if (colunas && !colunas.includes(coluna)) continue;
    if (!colunas && SO_COM_O_DADO.has(slot)) continue;
    if (out === base) out = { ...base };
    out[slot] = coluna;
  }
  return out;
}
