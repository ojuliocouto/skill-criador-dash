// Apresentação das colunas da tabela "Dados" a partir do template. ESM, puro.
//
// A tabela mostra as colunas da FONTE (nome e valor crus). Quando a coluna está mapeada num
// slot do template, dá pra apresentar melhor sem mudar o dado:
//   - cabeçalho com o rótulo do slot ("Conversoes" na planilha vira "Conversões" na tela);
//   - data em formato brasileiro (slot de tempo do template);
//   - dinheiro com R$ (slot que declara format 'currency' ou que é somado por uma métrica em moeda).
// Coluna não mapeada fica de fora do mapa e aparece como veio.

const FORMATOS_DE_SLOT = new Set(['date', 'currency']);

// O slot é dinheiro quando ele mesmo declara, ou quando uma métrica de soma ou média em cima
// dele é moeda. Métrica de contagem não serve de pista: contar linhas de "valor" não é dinheiro.
function formatoDoSlot(template, slot) {
  if (slot.key === ((template && template.dateSlot) || 'data')) return 'date';
  if (FORMATOS_DE_SLOT.has(slot.format)) return slot.format;
  const metricas = (template && template.metrics) || [];
  const emMoeda = metricas.some((m) => m && m.column === slot.key
    && (m.agg === 'sum' || m.agg === 'avg') && m.format === 'currency');
  return emMoeda ? 'currency' : undefined;
}

/**
 * @param {object} template  template do domínio (slots, metrics, dateSlot)
 * @param {Object} colMap    slot -> coluna real
 * @param {string[]} columns colunas da fonte
 * @returns {Object<string,{label:string, format?:'date'|'currency'}>}  por nome de coluna da fonte
 */
export function apresentacaoDasColunas(template, colMap, columns) {
  const out = {};
  if (!template || !colMap) return out;
  const existentes = new Set(Array.isArray(columns) ? columns : []);
  for (const slot of (template.slots || [])) {
    const col = colMap[slot.key];
    if (!col || !existentes.has(col) || out[col]) continue;
    const meta = { label: slot.label || col };
    const format = formatoDoSlot(template, slot);
    if (format) meta.format = format;
    out[col] = meta;
  }
  return out;
}
