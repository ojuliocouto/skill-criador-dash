// Lógica pura de parse de CSV, compartilhada pelos conectores.
// Sem rede, sem estado global, sem dependências externas. Testável em node:test.
// Respeita o Contrato 1 (DataSet parcial): devolve { columns, rows } com valores
// crus em string. A normalização de número e data é responsabilidade da camada
// de métricas, não do conector.

/**
 * Detecta o delimitador analisando apenas a primeira linha do texto.
 * Conta as ocorrências de vírgula, ponto e vírgula e tabulação; o que aparecer
 * mais vezes vence. Empate ou ausência de separador cai no default vírgula.
 * @param {string} text
 * @returns {','|';'|'\t'}
 */
export function detectDelimiter(text) {
  if (!text) return ',';
  // Primeira linha, tolerando \r\n e \n.
  const firstLine = String(text).split(/\r\n|\n/, 1)[0] || '';
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestCount = 0;
  for (const delim of candidates) {
    let count = 0;
    for (const ch of firstLine) {
      if (ch === delim) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = delim;
    }
  }
  return best;
}

/**
 * Faz o parse de um texto CSV para o formato tabular do DataSet.
 * Suporta campos entre aspas duplas com delimitador e quebra de linha dentro,
 * aspas escapadas ("") e as terminações \r\n e \n. A primeira linha vira os
 * cabeçalhos (columns). Cada linha seguinte vira um objeto { [coluna]: valor }.
 * Linhas totalmente vazias são descartadas.
 * @param {string} text
 * @param {{ delimiter?: string }} [opts]
 * @returns {{ columns: string[], rows: Object[] }}
 */
export function parseCSV(text, opts = {}) {
  const raw = text == null ? '' : String(text);
  if (raw.trim() === '') {
    return { columns: [], rows: [] };
  }

  const delimiter = opts.delimiter || detectDelimiter(raw);
  const records = tokenize(raw, delimiter);

  if (records.length === 0) {
    return { columns: [], rows: [] };
  }

  const columns = records[0].map((c) => c.trim());
  const rows = [];

  for (let i = 1; i < records.length; i++) {
    const fields = records[i];
    // Descarta linhas totalmente vazias (todos os campos vazios após trim).
    const isEmpty = fields.every((f) => f.trim() === '');
    if (isEmpty) continue;

    const row = {};
    for (let c = 0; c < columns.length; c++) {
      row[columns[c]] = fields[c] !== undefined ? fields[c] : '';
    }
    rows.push(row);
  }

  return { columns, rows };
}

/**
 * Quebra o texto CSV numa lista de registros (cada registro é uma lista de
 * campos), respeitando aspas duplas. Máquina de estados char a char.
 * @param {string} text
 * @param {string} delimiter
 * @returns {string[][]}
 */
function tokenize(text, delimiter) {
  const records = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  const pushField = () => {
    record.push(field);
    field = '';
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  while (i < len) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Aspa escapada ("") vira uma aspa literal.
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      i++;
      continue;
    }
    if (ch === '\r') {
      // Trata \r\n como uma única quebra de registro.
      if (text[i + 1] === '\n') i++;
      pushRecord();
      i++;
      continue;
    }
    if (ch === '\n') {
      pushRecord();
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  // Último registro pendente (arquivo sem quebra de linha final).
  if (field !== '' || record.length > 0) {
    pushRecord();
  }

  return records;
}
