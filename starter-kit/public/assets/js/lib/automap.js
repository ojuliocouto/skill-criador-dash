// Auto-mapeamento de slots semanticos para colunas reais da planilha.
// Funcoes puras, sem estado. ESM, roda no browser e no node:test.

/**
 * Normaliza um cabecalho para comparacao: minusculas, sem acento,
 * espacos colapsados e sem espacos nas pontas.
 * @param {string} s
 * @returns {string}
 */
export function normalizeHeader(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Casa os slots de um template contra as colunas de um DataSet.
 * Para cada slot, normaliza seus aliases e compara com as colunas normalizadas.
 * Casa se um alias for igual ao header OU estiver contido nele (ou vice-versa).
 * Primeiro match vence. Uma coluna ja usada nao casa de novo. Sem match = null.
 * @param {{key:string, aliases:string[]}[]} slots
 * @param {string[]} columns
 * @returns {{ [slotKey:string]: string|null }}
 */
// Tamanho minimo para considerar match por SUBSTRING (evita casos como a coluna
// "da" casar o alias "data", ou um cabecalho vazio casar qualquer slot).
const MIN_SUBSTR = 3;

export function autoMap(slots, columns) {
  // Descarta colunas com header vazio: nunca devem casar (planilha Google costuma
  // exportar uma coluna vazia no fim, e o bug antigo fazia ela casar o 1o slot).
  const cols = (columns || [])
    .map((c) => ({ original: c, norm: normalizeHeader(c) }))
    .filter((c) => c.norm !== '');
  const usados = new Set();
  const result = {};
  for (const slot of slots || []) result[slot.key] = null;

  const aliasesDe = (slot) => (slot.aliases || []).map((a) => normalizeHeader(a)).filter(Boolean);

  // Passada 1: match EXATO (tem prioridade sobre substring, evita roubar coluna
  // que outro slot casa exatamente).
  for (const slot of slots || []) {
    for (const alias of aliasesDe(slot)) {
      const hit = cols.find((c) => !usados.has(c.original) && c.norm === alias);
      if (hit) { result[slot.key] = hit.original; usados.add(hit.original); break; }
    }
  }

  // Passada 2: match por SUBSTRING (bidirecional), so para slots ainda sem coluna,
  // e so quando os dois lados tem tamanho suficiente pra evitar match espurio.
  for (const slot of slots || []) {
    if (result[slot.key]) continue;
    for (const alias of aliasesDe(slot)) {
      if (alias.length < MIN_SUBSTR) continue;
      const hit = cols.find((c) => {
        if (usados.has(c.original) || c.norm.length < MIN_SUBSTR) return false;
        return c.norm.includes(alias) || alias.includes(c.norm);
      });
      if (hit) { result[slot.key] = hit.original; usados.add(hit.original); break; }
    }
  }

  return result;
}
