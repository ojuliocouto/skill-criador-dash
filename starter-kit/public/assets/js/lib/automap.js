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
export function autoMap(slots, columns) {
  const cols = (columns || []).map((c) => ({ original: c, norm: normalizeHeader(c) }));
  const usados = new Set();
  const result = {};

  for (const slot of slots || []) {
    const aliases = (slot.aliases || []).map((a) => normalizeHeader(a));
    let escolhida = null;

    for (const alias of aliases) {
      if (!alias) continue;
      const hit = cols.find((c) => {
        if (usados.has(c.original)) return false;
        return c.norm === alias || c.norm.includes(alias) || alias.includes(c.norm);
      });
      if (hit) {
        escolhida = hit.original;
        break;
      }
    }

    if (escolhida) usados.add(escolhida);
    result[slot.key] = escolhida;
  }

  return result;
}
