// Lógica pura do modo histórico (snapshots no Cloudflare D1).
// Sem rede, sem D1, sem estado global, sem dependências externas. Testável em node:test.
//
// Ideia: em vez de ler a fonte ao vivo a cada acesso, um cron tira "fotos"
// (snapshots) do DataSet e guarda no D1. O dashboard lê o snapshot mais recente.
// Isso dá histórico e não depende de a fonte estar no ar na hora do acesso.
//
// IMPORTANTE: este módulo não usa Date. O carimbo captured_at (ISO) é
// responsabilidade de quem chama (handler/worker), que passa a data pronta.
// Assim as funções ficam determinísticas e fáceis de testar.

const TABLE = 'snapshots';

// Limite default seguro para listagem de histórico (usado quando o limit
// informado não é um inteiro positivo válido, evitando gerar `LIMIT NaN`).
const DEFAULT_LIST_LIMIT = 100;

// Validação compartilhada do dashboardId. Mesma regra do insert, reusada por
// latest/list para não haver assimetria (antes só o insert validava).
function assertDashboardId(dashboardId) {
  if (!dashboardId || !String(dashboardId).trim()) {
    throw new Error('Informe o dashboardId para gravar o snapshot.');
  }
}

/**
 * Monta o INSERT parametrizado de um snapshot no D1.
 * Não executa nada: só devolve o SQL e os params, na ordem posicional dos '?'.
 * @param {string} dashboardId  id do dashboard (chave lógica do snapshot)
 * @param {string} capturedAt   data da captura em ISO (ex: 2026-07-06T10:00:00.000Z)
 * @param {Object} dataset      DataSet completo (Contrato 1) a serializar em JSON
 * @returns {{ sql: string, params: Array }}
 * @throws {Error} se dashboardId ou dataset faltarem
 */
export function insertSnapshotSQL(dashboardId, capturedAt, dataset) {
  assertDashboardId(dashboardId);
  if (dataset == null || typeof dataset !== 'object') {
    throw new Error('Informe o dataset (dados capturados) para gravar o snapshot.');
  }
  const sql =
    `INSERT INTO ${TABLE} (dashboard_id, captured_at, dataset_json) VALUES (?, ?, ?)`;
  const params = [String(dashboardId), String(capturedAt), JSON.stringify(dataset)];
  return { sql, params };
}

/**
 * Monta o SELECT do snapshot mais recente de um dashboard.
 * Ordena por captured_at desc e pega só o primeiro.
 * @param {string} dashboardId
 * @returns {{ sql: string, params: Array }}
 * @throws {Error} se dashboardId faltar ou for vazio (mesma validação do insert)
 */
export function latestSnapshotSQL(dashboardId) {
  assertDashboardId(dashboardId);
  const sql =
    `SELECT id, dashboard_id, captured_at, dataset_json FROM ${TABLE} ` +
    `WHERE dashboard_id = ? ORDER BY captured_at DESC LIMIT 1`;
  return { sql, params: [String(dashboardId)] };
}

/**
 * Monta o SELECT do histórico de capturas de um dashboard (mais recentes primeiro).
 * Devolve só metadados (id e captured_at), sem o payload, para listagem leve.
 * @param {string} dashboardId
 * @param {number} [limit=100]  inteiro positivo; valor inválido cai no default 100
 * @returns {{ sql: string, params: Array }}
 * @throws {Error} se dashboardId faltar ou for vazio (mesma validação do insert)
 */
export function listSnapshotsSQL(dashboardId, limit = DEFAULT_LIST_LIMIT) {
  assertDashboardId(dashboardId);
  // Sanitiza o limit: só aceita inteiro POSITIVO. Number('abc')/undefined viram
  // NaN e gerariam `LIMIT NaN` (SQL inválido no D1); 0, negativos e não-inteiros
  // (1.5, Infinity) também não fazem sentido como LIMIT. Em qualquer desses casos
  // cai no default seguro, garantindo que params[1] é sempre inteiro positivo.
  const n = Number(limit);
  const safeLimit =
    Number.isInteger(n) && n > 0 ? n : DEFAULT_LIST_LIMIT;
  const sql =
    `SELECT id, captured_at FROM ${TABLE} ` +
    `WHERE dashboard_id = ? ORDER BY captured_at DESC LIMIT ?`;
  return { sql, params: [String(dashboardId), safeLimit] };
}

/**
 * Reidrata um DataSet a partir de uma linha do D1.
 * Faz JSON.parse do dataset_json e valida que tem columns/rows (Contrato 1).
 * @param {{ dataset_json: string }|null|undefined} dbRow
 * @returns {Object} DataSet
 * @throws {Error} se não houver linha, se o JSON for inválido ou não tiver o formato de DataSet
 */
export function rowToDataSet(dbRow) {
  if (dbRow == null) {
    throw new Error('Nenhum snapshot encontrado.');
  }
  let parsed;
  try {
    parsed = JSON.parse(dbRow.dataset_json);
  } catch {
    throw new Error('Snapshot inválido: o conteúdo salvo não é um JSON válido.');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray(parsed.columns) ||
    !Array.isArray(parsed.rows)
  ) {
    throw new Error('Snapshot inválido: formato de DataSet incorreto (faltam columns/rows).');
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Histórico por dia (3.9.0, achado 9 da auditoria de 25/10/2026)
//
// Até a 3.8 o cron gravava a foto INTEIRA da fonte a cada hora (tabela snapshots), sem limpeza, e o
// painel lia só a última foto: o "histórico" era um cache da fonte. Com o Meta (janela de 30 dias), o dia
// 31 sumia do painel junto com a fonte, e o banco crescia 24 fotos por dia.
//
// Agora o histórico guarda UM registro por painel e por dia (tabela snapshot_dias, chave dashboard_id +
// dia). Cada foto nova:
//   1. apaga os dias que ela cobre (do primeiro ao último dia com dado na foto) e o grupo "sem data";
//   2. grava um registro por dia que trouxe (as linhas daquele dia, em JSON);
//   3. apaga os dias mais velhos que a retenção (DIAS_DE_HISTORICO) e as fotos antigas da tabela snapshots.
// Tudo num db.batch(), que no D1 é uma transação: ou grava a foto inteira ou nada.
// O dia que saiu da janela da fonte fica no banco: é isso que faz o histórico.
// ---------------------------------------------------------------------------

const DIAS = 'snapshot_dias';

/** Retenção padrão do histórico, em dias (o Worker aceita HISTORICO_DIAS para trocar). */
export const DIAS_DE_HISTORICO = 400;

const ISO_DIA = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/;
const BR_DIA = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

function diaValido(a, m, d) {
  const data = new Date(Date.UTC(a, m - 1, d));
  if (data.getUTCFullYear() !== a || data.getUTCMonth() !== m - 1 || data.getUTCDate() !== d) return null;
  return `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Dia (AAAA-MM-DD) de um valor de data da fonte: ISO (2026-10-25, com ou sem hora) ou brasileiro
 * (25/10/2026). Qualquer outra coisa (Total, texto, data impossível) vira null.
 * @param {*} valor
 * @returns {string|null}
 */
export function diaDaLinha(valor) {
  const v = String(valor == null ? '' : valor).trim();
  let m = ISO_DIA.exec(v);
  if (m) return diaValido(Number(m[1]), Number(m[2]), Number(m[3]));
  m = BR_DIA.exec(v);
  if (m) return diaValido(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

/**
 * Primeiro dia que ainda fica no histórico: a data de `agoraIso` menos `dias`.
 * @param {string} agoraIso  data da captura em ISO
 * @param {number} [dias]
 * @returns {string} AAAA-MM-DD
 */
export function corteDoHistorico(agoraIso, dias = DIAS_DE_HISTORICO) {
  const n = Number(dias);
  const total = Number.isInteger(n) && n > 0 ? n : DIAS_DE_HISTORICO;
  const base = new Date(String(agoraIso));
  if (Number.isNaN(base.getTime())) throw new Error('Informe a data da captura (ISO) para calcular a retenção do histórico.');
  return new Date(base.getTime() - total * 86400000).toISOString().slice(0, 10);
}

/**
 * Separa as linhas do DataSet por dia, pela coluna de data. Linha sem data reconhecível vai para o
 * grupo de dia '' (ele pertence sempre à foto mais nova).
 * @param {{rows?:object[]}} dataset
 * @param {string|null} colunaData
 * @returns {Array<{dia:string, rows:object[]}>} em ordem de dia ('' por último)
 */
export function separarPorDia(dataset, colunaData) {
  const grupos = new Map();
  for (const r of (dataset && Array.isArray(dataset.rows) ? dataset.rows : [])) {
    const d = (colunaData && diaDaLinha(r && r[colunaData])) || '';
    if (!grupos.has(d)) grupos.set(d, []);
    grupos.get(d).push(r);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    .map(([d, rows]) => ({ dia: d, rows }));
}

/**
 * Os comandos (SQL + params) que gravam uma foto no histórico por dia. Não executa nada.
 * @param {string} dashboardId
 * @param {string} capturedAt  ISO
 * @param {string} fonte       tipo da fonte (sheets, meta)
 * @param {{columns?:string[], rows?:object[]}} dataset
 * @param {string|null} colunaData  coluna de data das linhas (colMap.data)
 * @param {{dias?:number}} [opts]   retenção em dias
 * @returns {Array<{sql:string, params:Array}>}
 */
export function gravarDiasSQL(dashboardId, capturedAt, fonte, dataset, colunaData, { dias = DIAS_DE_HISTORICO } = {}) {
  assertDashboardId(dashboardId);
  if (dataset == null || typeof dataset !== 'object') {
    throw new Error('Informe o dataset (dados capturados) para gravar o snapshot.');
  }
  const id = String(dashboardId);
  const colunas = JSON.stringify(Array.isArray(dataset.columns) ? dataset.columns : []);
  const grupos = separarPorDia(dataset, colunaData);
  const comData = grupos.filter((g) => g.dia !== '');
  const cmds = [];
  if (comData.length) {
    cmds.push({
      sql: `DELETE FROM ${DIAS} WHERE dashboard_id = ? AND dia <> '' AND dia >= ? AND dia <= ?`,
      params: [id, comData[0].dia, comData[comData.length - 1].dia],
    });
  }
  cmds.push({ sql: `DELETE FROM ${DIAS} WHERE dashboard_id = ? AND dia = ''`, params: [id] });
  for (const g of grupos) {
    cmds.push({
      sql: `INSERT INTO ${DIAS} (dashboard_id, dia, captured_at, fonte, columns_json, rows_json) VALUES (?, ?, ?, ?, ?, ?)`,
      params: [id, g.dia, String(capturedAt), String(fonte || ''), colunas, JSON.stringify(g.rows)],
    });
  }
  cmds.push({ sql: `DELETE FROM ${DIAS} WHERE dashboard_id = ? AND dia <> '' AND dia < ?`, params: [id, corteDoHistorico(capturedAt, dias)] });
  // Fotos inteiras da 3.8 em diante não são mais gravadas: as antigas saem (eram até 24 por dia).
  cmds.push({ sql: `DELETE FROM ${TABLE} WHERE dashboard_id = ?`, params: [id] });
  return cmds;
}

const DIA_PARAM = /^\d{4}-\d{2}-\d{2}$/;

/**
 * SELECT da série por dia de um painel, opcionalmente num período (dias AAAA-MM-DD, inclusive).
 * O grupo sem data ('') sempre entra.
 * @param {string} dashboardId
 * @param {{de?:string, ate?:string}} [periodo]
 * @returns {{ sql: string, params: Array }}
 */
export function serieSQL(dashboardId, { de, ate } = {}) {
  assertDashboardId(dashboardId);
  for (const v of [de, ate]) {
    if (v != null && v !== '' && !DIA_PARAM.test(String(v))) throw new Error('Período inválido: use datas no formato AAAA-MM-DD.');
  }
  let sql = `SELECT dia, captured_at, fonte, columns_json, rows_json FROM ${DIAS} WHERE dashboard_id = ?`;
  const params = [String(dashboardId)];
  if (de) { sql += ` AND (dia = '' OR dia >= ?)`; params.push(String(de)); }
  if (ate) { sql += ` AND (dia = '' OR dia <= ?)`; params.push(String(ate)); }
  sql += ' ORDER BY dia';
  return { sql, params };
}

/**
 * Junta os registros por dia num DataSet só (Contrato 1). Colunas: as da captura mais nova, depois as
 * que só existiam em dias antigos. Linhas: em ordem de dia, o grupo sem data por último.
 * @param {Array<{dia:string, captured_at:string, fonte:string, columns_json:string, rows_json:string}>} linhas
 * @returns {{columns:string[], rows:object[], meta:object}}
 */
export function diasParaDataSet(linhas) {
  const lista = Array.isArray(linhas) ? linhas.slice() : [];
  const ordenadas = lista.slice().sort((a, b) => String(b.captured_at).localeCompare(String(a.captured_at)));
  const columns = [];
  for (const l of ordenadas) {
    let cols = [];
    try { cols = JSON.parse(l.columns_json); } catch { cols = []; }
    for (const c of Array.isArray(cols) ? cols : []) if (!columns.includes(c)) columns.push(c);
  }
  lista.sort((a, b) => (a.dia === '' ? 1 : b.dia === '' ? -1 : String(a.dia).localeCompare(String(b.dia))));
  const rows = [];
  for (const l of lista) {
    let r = [];
    try { r = JSON.parse(l.rows_json); } catch { throw new Error('Snapshot inválido: o conteúdo salvo não é um JSON válido.'); }
    if (Array.isArray(r)) rows.push(...r);
  }
  const datados = lista.filter((l) => l.dia !== '').map((l) => l.dia);
  const maisNova = ordenadas[0] || {};
  return {
    columns,
    rows,
    meta: {
      source: maisNova.fonte || null,
      fetchedAt: maisNova.captured_at || null,
      rowCount: rows.length,
      historico: { dias: datados.length, de: datados[0] || null, ate: datados[datados.length - 1] || null },
    },
  };
}
