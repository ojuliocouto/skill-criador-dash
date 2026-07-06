// Cliente único de API. Todas as chamadas ao backend (Functions) passam por aqui.
// Puro fetch, sem dependências. ESM.

async function jsonOrThrow(res) {
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Erro ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// ---- Dashboards (config no KV) ----
export async function listDashboards() {
  return jsonOrThrow(await fetch('/api/dashboards'));
}
export async function getDashboard(id) {
  return jsonOrThrow(await fetch(`/api/dashboards?id=${encodeURIComponent(id)}`));
}
export async function saveDashboard(config) {
  return jsonOrThrow(await fetch('/api/dashboards', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(config),
  }));
}
export async function deleteDashboard(id) {
  return jsonOrThrow(await fetch(`/api/dashboards?id=${encodeURIComponent(id)}`, { method: 'DELETE' }));
}

// ---- Conectores (fontes de dados) -> devolvem DataSet {columns, rows, meta} ----
export async function fetchSheet(url, gid = '0') {
  const qs = new URLSearchParams({ url, gid });
  return jsonOrThrow(await fetch(`/api/connectors/sheets?${qs}`));
}
export async function uploadCsv(text) {
  return jsonOrThrow(await fetch('/api/connectors/csv', {
    method: 'POST',
    headers: { 'content-type': 'text/csv' },
    body: text,
  }));
}

// Busca o DataSet de acordo com o source salvo na config.
export async function fetchDataForSource(source) {
  if (!source || !source.type) throw new Error('Fonte de dados não configurada.');
  if (source.type === 'sheets') return fetchSheet(source.url, source.gid || '0');
  if (source.type === 'csv') return uploadCsv(source.data || '');
  throw new Error(`Tipo de fonte desconhecido: ${source.type}`);
}
