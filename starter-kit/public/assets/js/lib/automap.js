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
// Tamanho minimo para considerar match por token (evita casos como a coluna
// "da" casar o alias "data", ou um cabecalho vazio casar qualquer slot).
const MIN_SUBSTR = 3;

/**
 * Quebra um header CRU em tokens. Faz a segmentacao ANTES de normalizar, pra o
 * split de camelCase realmente disparar (se recebesse o header ja em minusculo,
 * nao haveria maiuscula pra quebrar). Insere separador:
 *  - camelCase: entre [a-z0-9] e [A-Z]  (ValorTotal -> Valor Total)
 *  - acronimo + palavra: entre [A-Z]+ e [A-Z][a-z]  (CPFCliente -> CPF Cliente)
 *  - letra <-> digito: entre letra e digito e vice-versa (Receita2026 -> Receita 2026)
 * So entao normaliza (minuscula, sem acento) e separa por espaco, _, -, /, ., etc.
 * Aceita header cru (com maiusculas/acento); passar algo ja normalizado tambem
 * funciona (so nao tera camelCase pra quebrar).
 * @param {string} raw header cru (aceita maiusculas e acento)
 * @returns {string[]}
 */
export function tokenize(raw) {
  return String(raw == null ? '' : raw)
    // camelCase: minuscula/digito seguido de maiuscula. ValorTotal -> Valor Total
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // acronimo seguido de palavra: sequencia de maiusculas + maiuscula/minuscula.
    // CPFCliente -> CPF Cliente (mantem o acronimo inteiro como um token)
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // fronteira letra -> digito e digito -> letra. Receita2026 -> Receita 2026
    .replace(/([a-zA-Z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-zA-Z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[\s_\-/.]+/)
    .filter(Boolean);
}

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

  // Passada 2: match por TOKEN (nao por substring embutida), so para slots ainda
  // sem coluna. O alias tem que aparecer no header como sequencia de tokens completos
  // (ou o ultimo token do alias como prefixo de um token do header). Assim 'data' casa
  // 'Data da venda' mas NAO 'Metadata'; 'total' casa 'Valor total' mas NAO 'Subtotal'.
  for (const slot of slots || []) {
    if (result[slot.key]) continue;
    for (const alias of aliasesDe(slot)) {
      if (alias.length < MIN_SUBSTR) continue;
      const aliasTokens = tokenize(alias);
      if (!aliasTokens.length) continue;
      const hit = cols.find((c) => {
        if (usados.has(c.original) || c.norm.length < MIN_SUBSTR) return false;
        // Tokeniza o header CRU (c.original), nao o normalizado: assim o split de
        // camelCase dispara (ValorTotal -> ['valor','total']). tokenize ja normaliza.
        return headerMatchesAlias(tokenize(c.original), aliasTokens);
      });
      if (hit) { result[slot.key] = hit.original; usados.add(hit.original); break; }
    }
  }

  return result;
}

/**
 * Verdadeiro se a sequencia de tokens do alias aparece nos tokens do header como
 * um run contiguo de tokens completos. O ULTIMO token do alias pode casar por prefixo
 * de um token do header (ex alias 'data' casa token 'data'; nao casa 'metadata').
 * @param {string[]} headerTokens
 * @param {string[]} aliasTokens
 * @returns {boolean}
 */
function headerMatchesAlias(headerTokens, aliasTokens) {
  const n = headerTokens.length;
  const k = aliasTokens.length;
  if (!k || k > n) return false;
  for (let i = 0; i + k <= n; i += 1) {
    let ok = true;
    for (let j = 0; j < k; j += 1) {
      const ht = headerTokens[i + j];
      const at = aliasTokens[j];
      // Tokens do meio precisam ser iguais. O ultimo token do alias casa por igualdade
      // OU por prefixo APENAS quando o sufixo restante do header for curtissimo (<=2
      // chars, cobre plural/flexao: 'venda'->'vendas', 'custo'->'custos'). Assim
      // 'data'->'database' (sufixo 'base'=4) e 'dia'->'diaria' (sufixo 'ria'=3) sao
      // rejeitados, matando os falsos positivos de prefixo.
      if (j === k - 1) {
        const prefixoOk = ht.startsWith(at) && (ht.length - at.length) <= 2;
        if (ht !== at && !prefixoOk) { ok = false; break; }
      } else if (ht !== at) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}
