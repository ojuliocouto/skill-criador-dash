// Cliente único de API. Todas as chamadas ao backend (Functions) passam por aqui.
// Puro fetch, sem dependências. ESM.

import { getSource } from '../sources/index.js';

// ---- Admin token (trava global opcional de mutacao) ----
// Se o operador setar env.ADMIN_TOKEN, os POST/DELETE de /api/dashboards exigem
// o header x-admin-token. O dono guarda o token no localStorage (chave abaixo) e
// o cliente passa a mandar o header automaticamente. Sem token guardado, nada
// muda (instancia aberta continua aberta).
const ADMIN_TOKEN_KEY = 'cd-admin-token';

// Guarda o admin token no localStorage (chamado pelo wizard apos um 401 needsAdmin).
export function setAdminToken(t) {
  try {
    if (t) localStorage.setItem(ADMIN_TOKEN_KEY, t);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch { /* ignora */ }
}

// Devolve { 'x-admin-token': ... } quando ha token guardado, senao {}.
export function adminHeader() {
  try {
    const t = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (t) return { 'x-admin-token': t };
  } catch { /* ignora */ }
  return {};
}

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
// Le a Response de uma mutacao. Em 401 needsAdmin, lanca um Error com a flag
// .needsAdmin marcada, para o wizard oferecer o campo de admin token e reenviar.
async function mutationOrThrow(res) {
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (res.status === 401 && data && data.needsAdmin) {
    const e = new Error(data.error || 'Este ambiente exige um token de administrador.');
    e.needsAdmin = true;
    throw e;
  }
  if (!res.ok) throw new Error((data && (data.error || data.message)) || `Erro ${res.status}`);
  return data;
}

export async function saveDashboard(config) {
  return mutationOrThrow(await fetch('/api/dashboards', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...adminHeader() },
    body: JSON.stringify(config),
  }));
}
export async function deleteDashboard(id) {
  return mutationOrThrow(await fetch(`/api/dashboards?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { ...adminHeader() },
  }));
}

// Header de senha (se houver) para os endpoints de DADOS por id (D1, Meta).
function authHeader(id) {
  try {
    const h = sessionStorage.getItem(AUTH_KEY(id));
    if (h) return { 'x-dash-auth': h };
  } catch { /* ignora */ }
  return {};
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
  return jsonOrThrow(await fetch(`/api/connectors/meta-ads?id=${encodeURIComponent(id)}`, { headers: authHeader(id) }));
}

// Modo historico: le o snapshot mais recente gravado pelo cron no D1.
export async function fetchD1(id) {
  return jsonOrThrow(await fetch(`/api/connectors/d1?id=${encodeURIComponent(id)}`, { headers: authHeader(id) }));
}

// Handlers de fetch por tipo de fonte. Cada fonte nova = 1 entrada aqui + 1
// entrada no registry (sources/index.js). O 'd1' nao entra aqui: o modo
// historico usa a funcao dedicada fetchD1(id), fora deste roteamento.
const FETCHERS = {
  sheets: (source) => fetchSheet(source.url, source.gid || '0'),
  csv: (source) => uploadCsv(source.data || ''),
  meta: (source, id) => fetchMetaById(id),
};

// Busca o DataSet de acordo com o source salvo na config.
// `id` e necessario para o conector Meta (o token e resolvido no servidor por id).
// O registry (getSource) valida que o tipo existe; o FETCHERS faz a chamada.
export async function fetchDataForSource(source, id) {
  if (!source || !source.type) throw new Error('Fonte de dados não configurada.');
  const fetcher = getSource(source.type) && FETCHERS[source.type];
  if (!fetcher) throw new Error(`Tipo de fonte desconhecido: ${source.type}`);
  return fetcher(source, id);
}
