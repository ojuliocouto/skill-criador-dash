// Logica pura de filtragem de dados do dashboard. ESM, sem DOM, testavel em
// node:test. A fiacao de UI (montar controles, ouvir eventos, re-renderizar) vive
// no dashboard.js e delega para estas funcoes.
//
// Um estado de filtro tem a forma:
//   { from: 'AAAA-MM-DD'|null, to: 'AAAA-MM-DD'|null, dims: { <slot>: <valor>|'' } }
// Periodo vazio (from/to null) = todo o periodo. Dimensao vazia ('') = "Todos".

import { parseDateBR } from './format.js';

/**
 * Slots que sao DIMENSOES (categoricas): nem o eixo de tempo (template.dateSlot),
 * nem colunas numericas (que sao base de alguma metrica, ex investimento, valor).
 * Sobra o que da pra filtrar por igualdade: canal, vendedor, produto, status...
 * @param {object} template
 * @returns {{key:string, label:string}[]}
 */
export function dimensionSlots(template) {
  const dateSlot = (template && template.dateSlot) || 'data';
  const numeric = new Set();
  for (const m of (template && template.metrics) || []) {
    // Metrica base agrega uma coluna crua (m.column aponta pro slot numerico).
    if (m && m.column) numeric.add(m.column);
  }
  return ((template && template.slots) || [])
    .filter((s) => s && s.key !== dateSlot && !numeric.has(s.key))
    .map((s) => ({ key: s.key, label: s.label || s.key }));
}

/**
 * Valores distintos de uma coluna, na ordem de aparicao, ignorando vazio/nulo.
 * @param {object[]} rows
 * @param {string} col
 * @returns {string[]}
 */
export function distinctValues(rows, col) {
  const seen = new Set();
  const out = [];
  for (const r of rows || []) {
    const v = r && r[col];
    if (v == null || String(v).trim() === '') continue;
    const s = String(v);
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}

/**
 * Menor e maior data (ISO 'AAAA-MM-DD') presentes na coluna, ou nulls.
 * @param {object[]} rows
 * @param {string} col
 * @returns {{min:string|null, max:string|null}}
 */
export function dateBounds(rows, col) {
  let min = null;
  let max = null;
  for (const r of rows || []) {
    const iso = parseDateBR(r && r[col]);
    if (!iso) continue;
    if (min === null || iso < min) min = iso;
    if (max === null || iso > max) max = iso;
  }
  return { min, max };
}

/**
 * Estado inicial: periodo todo, nenhuma dimensao selecionada.
 * @returns {{from:null, to:null, dims:object}}
 */
export function emptyFilterState() {
  return { from: null, to: null, dims: {} };
}

/**
 * Aplica o filtro as linhas. Periodo [from,to] (ISO, INCLUSIVO) sobre a coluna de
 * data do template; igualdade exata (string) para cada dimensao com valor. Todas
 * as condicoes sao AND. Linha sem data valida sai quando ha filtro de periodo.
 * @param {object[]} rows
 * @param {object} colMap  slot -> coluna real
 * @param {object} template
 * @param {object|null} state
 * @returns {object[]}
 */
export function applyFilters(rows, colMap, template, state) {
  if (!state) return rows || [];
  const dateSlot = (template && template.dateSlot) || 'data';
  const dateCol = (colMap && colMap[dateSlot]) || dateSlot;
  const dims = state.dims || {};
  const from = state.from || null;
  const to = state.to || null;
  const hasPeriod = !!(from || to);
  const activeDims = Object.keys(dims).filter((k) => dims[k] != null && dims[k] !== '');

  if (!hasPeriod && !activeDims.length) return rows || [];

  return (rows || []).filter((r) => {
    if (hasPeriod) {
      const iso = parseDateBR(r[dateCol]);
      if (!iso) return false;
      if (from && iso < from) return false;
      if (to && iso > to) return false;
    }
    for (const slot of activeDims) {
      const col = (colMap && colMap[slot]) || slot;
      if (String(r[col]) !== String(dims[slot])) return false;
    }
    return true;
  });
}
