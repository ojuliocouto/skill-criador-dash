// Camada de métricas pura. ESM, importável no browser e no node:test.
// Não sabe de fonte de dados nem de render. Recebe linhas cruas (string) do
// DataSet + o mapa de slots semânticos -> colunas reais, e devolve números.
import { parseNumberBR, parseDateBR } from './format.js';

/**
 * @typedef {Object} MetricDef
 * @property {string} key
 * @property {string} [label]
 * @property {'sum'|'avg'|'count'|'countDistinct'|'ratio'|'derived'} agg
 * @property {string} [column]   slot semântico (chave do colMap) para sum/avg/count/countDistinct
 * @property {[string,string]} [ratioOf]  [numeradorKey, denominadorKey] para agg 'ratio'
 * @property {function} [compute] (ctx) => number   para agg 'derived'
 */

// Descobre se existe uma coluna com o nome EXATO `name` no dataset, olhando as
// chaves da primeira linha (as linhas do DataSet compartilham as mesmas chaves).
// Serve pra permitir passar coluna direta pelo nome real, sem mascarar slot.
function datasetHasColumn(rows, name) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const first = rows[0];
  return first != null && Object.prototype.hasOwnProperty.call(first, name);
}

// Resolve o nome de coluna real a partir do slot semântico.
// Ordem de resolução:
//   1) se o slot está mapeado no colMap, usa a coluna mapeada;
//   2) senão, se existe uma coluna com esse nome EXATO no dataset, usa o próprio
//      nome (permite passar coluna direta);
//   3) caso contrário, retorna null (slot ausente, não inventa coluna).
// Antes, o passo 3 caía de volta no próprio nome do slot, acoplando nome de slot
// a nome de coluna e mascarando slots não mapeados. Agora null sinaliza ausência.
function resolveColumn(slot, colMap, rows) {
  if (!slot) return null;
  if (colMap && Object.prototype.hasOwnProperty.call(colMap, slot)) return colMap[slot];
  if (datasetHasColumn(rows, slot)) return slot;
  return null;
}

// Valor cru de uma linha para um slot. Retorna '' se coluna ausente/nula.
// `rows` é o dataset inteiro (usado só pra checar existência de coluna direta).
function cellRaw(row, slot, colMap, rows) {
  const col = resolveColumn(slot, colMap, rows);
  if (col == null) return '';
  const v = row[col];
  return v == null ? '' : v;
}

function isNonEmpty(v) {
  return String(v).trim() !== '';
}

/**
 * Calcula uma métrica a partir das linhas + colMap.
 * @param {MetricDef} def
 * @param {Object[]} rows
 * @param {Object} colMap
 * @param {Object} [computed]  mapa key->valor já calculado (usado por ratio/derived)
 * @returns {number}
 */
export function computeMetric(def, rows, colMap, computed = {}) {
  // Guarda de robustez: sem def ou sem linhas válidas, retorna valor seguro.
  if (!def) return 0;
  rows = Array.isArray(rows) ? rows : [];
  switch (def.agg) {
    case 'sum': {
      let acc = 0;
      for (const row of rows) {
        const n = parseNumberBR(cellRaw(row, def.column, colMap, rows));
        if (Number.isFinite(n)) acc += n;
      }
      return acc;
    }
    case 'avg': {
      let acc = 0;
      let count = 0;
      for (const row of rows) {
        const n = parseNumberBR(cellRaw(row, def.column, colMap, rows));
        if (Number.isFinite(n)) {
          acc += n;
          count += 1;
        }
      }
      return count ? acc / count : 0;
    }
    case 'count': {
      let count = 0;
      for (const row of rows) {
        if (isNonEmpty(cellRaw(row, def.column, colMap, rows))) count += 1;
      }
      return count;
    }
    case 'countDistinct': {
      const set = new Set();
      for (const row of rows) {
        const v = cellRaw(row, def.column, colMap, rows);
        if (isNonEmpty(v)) set.add(String(v).trim());
      }
      return set.size;
    }
    case 'ratio': {
      const [numKey, denKey] = def.ratioOf || [];
      const num = Number(computed[numKey]) || 0;
      const den = Number(computed[denKey]) || 0;
      return den === 0 ? 0 : num / den;
    }
    case 'derived': {
      if (typeof def.compute !== 'function') return 0;
      const out = def.compute({ rows, colMap, computed });
      return Number.isFinite(out) ? out : 0;
    }
    default:
      return 0;
  }
}

/**
 * Calcula todas as métricas em ordem, acumulando os resultados em `computed`
 * para que ratio/derived enxerguem as métricas base. A ordem do array já deve
 * respeitar as dependências (base antes de derivadas).
 * @param {MetricDef[]} defs
 * @param {Object[]} rows
 * @param {Object} colMap
 * @returns {{ [key: string]: number }}
 */
export function computeAll(defs, rows, colMap) {
  const computed = {};
  for (const def of defs) {
    computed[def.key] = computeMetric(def, rows, colMap, computed);
  }
  return computed;
}

// Agrega um array de números conforme o agg pedido.
function aggregate(values, agg) {
  if (agg === 'count') return values.length;
  if (agg === 'avg') return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  if (agg === 'countDistinct') return new Set(values).size;
  // 'sum' (padrão)
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Agrupa por um slot de dimensão e agrega os valores de outro slot.
 * Ordena por value desc. Se valueSlot for null/ausente e agg='count', conta linhas.
 * Chaves de dimensão vazias são descartadas.
 * @returns {{ key: string, value: number }[]}
 */
export function groupBy(rows, colMap, dimensionSlot, valueSlot, agg = 'sum') {
  const buckets = new Map(); // key -> array de números (ou contagem)
  const safeRows = Array.isArray(rows) ? rows : [];
  for (const row of safeRows) {
    const dim = cellRaw(row, dimensionSlot, colMap, safeRows);
    if (!isNonEmpty(dim)) continue;
    const key = String(dim).trim();
    if (!buckets.has(key)) buckets.set(key, []);
    if (valueSlot == null && agg === 'count') {
      // apenas marca presença da linha; o count usa o tamanho do array
      buckets.get(key).push(1);
    } else {
      const n = parseNumberBR(cellRaw(row, valueSlot, colMap, safeRows));
      if (Number.isFinite(n)) buckets.get(key).push(n);
    }
  }
  const out = [];
  for (const [key, values] of buckets) {
    out.push({ key, value: aggregate(values, agg) });
  }
  out.sort((a, b) => b.value - a.value);
  return out;
}

/**
 * Série temporal: agrupa por data normalizada (YYYY-MM-DD) e agrega os valores.
 * Ordena por data asc. Linhas com data inválida são descartadas.
 * @returns {{ date: string, value: number }[]}
 */
export function timeSeries(rows, colMap, dateSlot, valueSlot, agg = 'sum') {
  const buckets = new Map(); // 'YYYY-MM-DD' -> array de números
  const safeRows = Array.isArray(rows) ? rows : [];
  for (const row of safeRows) {
    const iso = parseDateBR(cellRaw(row, dateSlot, colMap, safeRows));
    if (!iso) continue;
    if (!buckets.has(iso)) buckets.set(iso, []);
    if (valueSlot == null && agg === 'count') {
      buckets.get(iso).push(1);
    } else {
      const n = parseNumberBR(cellRaw(row, valueSlot, colMap, safeRows));
      if (Number.isFinite(n)) buckets.get(iso).push(n);
    }
  }
  const out = [];
  for (const [date, values] of buckets) {
    out.push({ date, value: aggregate(values, agg) });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}
