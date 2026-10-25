// Lado do navegador do achado 6 (3.9.0): a lista de painéis manda a chave de administrador guardada,
// avisa quando falta a chave, e o painel de planilha pede os dados por id (o link fica no servidor).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listDashboards, getDashboard, fetchDataForSource } from '../public/assets/js/lib/api-client.js';

function stubFetch(respond) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init: init || {} }); return respond(String(url)); };
  return { calls, restore() { globalThis.fetch = original; } };
}
function stubStorage(nome, inicial = {}) {
  const original = globalThis[nome];
  const mapa = new Map(Object.entries(inicial));
  globalThis[nome] = { getItem: (k) => (mapa.has(k) ? mapa.get(k) : null), setItem: (k, v) => mapa.set(k, String(v)), removeItem: (k) => mapa.delete(k) };
  return { restore() { globalThis[nome] = original; } };
}
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

test('listDashboards manda a chave de administrador guardada', async () => {
  const ls = stubStorage('localStorage', { 'cd-admin-token': 'chave-do-dono' });
  const f = stubFetch(() => json([]));
  try {
    await listDashboards();
    assert.equal(f.calls[0].init.headers['x-admin-token'], 'chave-do-dono');
  } finally { f.restore(); ls.restore(); }
});

test('listDashboards sem a chave: o erro sai marcado (needsAdmin ou adminNotConfigured) para a tela pedir a chave', async () => {
  const ls = stubStorage('localStorage');
  let f = stubFetch(() => json({ needsAdmin: true, error: 'Token de administrador necessário ou incorreto.' }, 401));
  try {
    await assert.rejects(listDashboards(), (e) => e.needsAdmin === true);
  } finally { f.restore(); }
  f = stubFetch(() => json({ adminNotConfigured: true, error: 'ADMIN_TOKEN não configurado no servidor.' }, 403));
  try {
    await assert.rejects(listDashboards(), (e) => e.adminNotConfigured === true);
  } finally { f.restore(); ls.restore(); }
});

test('getDashboard manda a chave guardada (o assistente edita com a config inteira)', async () => {
  const ls = stubStorage('localStorage', { 'cd-admin-token': 'chave-do-dono' });
  const ss = stubStorage('sessionStorage');
  const f = stubFetch(() => json({ id: 'x' }));
  try {
    await getDashboard('x');
    assert.equal(f.calls[0].init.headers['x-admin-token'], 'chave-do-dono');
  } finally { f.restore(); ss.restore(); ls.restore(); }
});

test('painel de planilha sem o link (vista do painel): os dados vêm por /api/connectors/sheets?id=', async () => {
  const ss = stubStorage('sessionStorage', { 'dashauth:p1': 'hash-da-senha' });
  const f = stubFetch(() => json({ columns: [], rows: [] }));
  try {
    await fetchDataForSource({ type: 'sheets' }, 'p1');
    const u = new URL(f.calls[0].url, 'https://base');
    assert.equal(u.pathname, '/api/connectors/sheets');
    assert.equal(u.searchParams.get('id'), 'p1');
    assert.equal(u.searchParams.get('url'), null, 'nenhum link vai na URL');
    assert.equal(f.calls[0].init.headers['x-dash-auth'], 'hash-da-senha', 'painel com senha manda a senha');
  } finally { f.restore(); ss.restore(); }
});
