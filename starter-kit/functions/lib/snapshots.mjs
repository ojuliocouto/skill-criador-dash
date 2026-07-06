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
  if (!dashboardId || !String(dashboardId).trim()) {
    throw new Error('Informe o dashboardId para gravar o snapshot.');
  }
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
 */
export function latestSnapshotSQL(dashboardId) {
  const sql =
    `SELECT id, dashboard_id, captured_at, dataset_json FROM ${TABLE} ` +
    `WHERE dashboard_id = ? ORDER BY captured_at DESC LIMIT 1`;
  return { sql, params: [String(dashboardId)] };
}

/**
 * Monta o SELECT do histórico de capturas de um dashboard (mais recentes primeiro).
 * Devolve só metadados (id e captured_at), sem o payload, para listagem leve.
 * @param {string} dashboardId
 * @param {number} [limit=100]
 * @returns {{ sql: string, params: Array }}
 */
export function listSnapshotsSQL(dashboardId, limit = 100) {
  const sql =
    `SELECT id, captured_at FROM ${TABLE} ` +
    `WHERE dashboard_id = ? ORDER BY captured_at DESC LIMIT ?`;
  return { sql, params: [String(dashboardId), limit] };
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
