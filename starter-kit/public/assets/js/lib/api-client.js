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
// Guarda/le o hash de senha do dashboard na sessao (nao persiste entre abas).
const AUTH_KEY = (id) => `dashauth:${id}`;
export function setDashboardAuth(id, hash) {
  try { sessionStorage.setItem(AUTH_KEY(id), hash); } catch { /* ignora */ }
}

export async function getDashboard(id) {
  const headers = {};
  let stored = null;
  try { stored = sessionStorage.getItem(AUTH_KEY(id)); } catch { /* ignora */ }
  if (stored) headers['x-dash-auth'] = stored;
  const res = await fetch(`/api/dashboards?id=${encodeURIComponent(id)}`, { headers });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (res.status === 401 && data && data.needsPassword) {
    const e = new Error(data.error || 'Senha necessária.');
    e.needsPassword = true;
    throw e;
  }
  if (!res.ok) throw new Error((data && (data.error || data.message)) || `Erro ${res.status}`);
  return data;
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

// Meta Ads: preview no wizard (token transiente no corpo, nao gravado ainda).
export async function previewMeta(params) {
  return jsonOrThrow(await fetch('/api/connectors/meta-ads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params || {}),
  }));
}
// Meta Ads: dados de um dashboard ja salvo (token fica no servidor, buscado por id).
export async function fetchMetaById(id) {
  return jsonOrThrow(await fetch(`/api/connectors/meta-ads?id=${encodeURIComponent(id)}`));
}

// Modo historico: le o snapshot mais recente gravado pelo cron no D1.
export async function fetchD1(id) {
  return jsonOrThrow(await fetch(`/api/connectors/d1?id=${encodeURIComponent(id)}`));
}

// Busca o DataSet de acordo com o source salvo na config.
// `id` e necessario para o conector Meta (o token e resolvido no servidor por id).
export async function fetchDataForSource(source, id) {
  if (!source || !source.type) throw new Error('Fonte de dados não configurada.');
  if (source.type === 'sheets') return fetchSheet(source.url, source.gid || '0');
  if (source.type === 'csv') return uploadCsv(source.data || '');
  if (source.type === 'meta') return fetchMetaById(id);
  throw new Error(`Tipo de fonte desconhecido: ${source.type}`);
}
