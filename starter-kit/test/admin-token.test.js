// Testes da trava GLOBAL de mutacao (x-admin-token) do /api/dashboards, modelo
// FAIL-CLOSED. Regra:
//  - env.ADMIN_TOKEN setado + header x-admin-token correto -> passa.
//  - env.ADMIN_TOKEN setado + header ausente/errado -> 401 { needsAdmin: true }.
//  - env.ADMIN_TOKEN NAO setado -> 403 { adminNotConfigured: true } (mutacao bloqueada).
// O gate roda ANTES da checagem per-dashboard e NAO afeta GET (leitura publica).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { onRequest as dashboards } from '../functions/api/dashboards.js';
import { sha256Hex } from '../public/assets/js/lib/auth.js';
import { derivePasswordAuth } from '../functions/lib/auth-config.mjs';

// Deriva o bloco auth v2 (salgado) a partir do hash do cliente, como o servidor grava.
async function saltedAuth(clientHash) {
  return derivePasswordAuth(clientHash);
}

// KV fake em memoria (mesmo shape do KV real: get devolve string ou null).
function fakeKV(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    async get(k) { return map.has(k) ? map.get(k) : null; },
    async put(k, v) { map.set(k, String(v)); },
    async delete(k) { map.delete(k); },
    async list({ prefix } = {}) {
      const keys = [];
      for (const name of map.keys()) if (!prefix || name.startsWith(prefix)) keys.push({ name });
      return { keys };
    },
    _map: map,
  };
}

function ctx(method, { id, body, headers = {}, env = {} } = {}) {
  const qs = id != null ? `?id=${encodeURIComponent(id)}` : '';
  const url = `https://x/api/dashboards${qs}`;
  const init = { method, headers: { ...headers } };
  if (body != null) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (!init.headers['content-type']) init.headers['content-type'] = 'application/json';
  }
  return { request: new Request(url, init), env };
}

function makeConfig(overrides = {}) {
  return {
    name: 'Meu Dash',
    // Dominio canonico: o POST valida config.domain contra domains.mjs (fix 3).
    domain: 'vendas',
    source: { type: 'sheet', url: 'https://sheet' },
    colMap: { data: 'A', valor: 'B' },
    ...overrides,
  };
}

async function readJSON(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const ADMIN = 'super-token-admin';

// 1. Com ADMIN_TOKEN setado, POST sem x-admin-token -> 401 needsAdmin (nao persiste).
test('admin gate: POST sem x-admin-token -> 401 needsAdmin', async () => {
  const kv = fakeKV();
  const env = { DASHBOARDS_KV: kv, ADMIN_TOKEN: ADMIN };
  const res = await dashboards(ctx('POST', { body: makeConfig({ name: 'Novo' }), env }));
  assert.equal(res.status, 401);
  const j = await readJSON(res);
  assert.equal(j.needsAdmin, true);
  assert.equal(kv._map.size, 0, 'nao deve criar nada sem o token admin');
});

// 2. Com ADMIN_TOKEN setado, POST com x-admin-token errado -> 401 needsAdmin.
test('admin gate: POST com x-admin-token errado -> 401 needsAdmin', async () => {
  const kv = fakeKV();
  const env = { DASHBOARDS_KV: kv, ADMIN_TOKEN: ADMIN };
  const res = await dashboards(
    ctx('POST', { body: makeConfig({ name: 'Novo' }), headers: { 'x-admin-token': 'errado' }, env })
  );
  assert.equal(res.status, 401);
  assert.equal((await readJSON(res)).needsAdmin, true);
});

// 3. Com ADMIN_TOKEN setado, POST com x-admin-token correto -> passa (200 cria).
test('admin gate: POST com token correto -> 200 cria', async () => {
  const kv = fakeKV();
  const env = { DASHBOARDS_KV: kv, ADMIN_TOKEN: ADMIN };
  const res = await dashboards(
    ctx('POST', { body: makeConfig({ name: 'Novo' }), headers: { 'x-admin-token': ADMIN }, env })
  );
  assert.equal(res.status, 200);
  const j = await readJSON(res);
  assert.equal(j.id, 'novo');
  assert.ok(kv._map.has('dash:novo'));
});

// 4. Com ADMIN_TOKEN setado, DELETE sem x-admin-token -> 401 needsAdmin (nao apaga).
test('admin gate: DELETE sem x-admin-token -> 401 needsAdmin', async () => {
  const cfg = makeConfig({ id: 'apagar' });
  const kv = fakeKV({ 'dash:apagar': JSON.stringify(cfg) });
  const env = { DASHBOARDS_KV: kv, ADMIN_TOKEN: ADMIN };
  const res = await dashboards(ctx('DELETE', { id: 'apagar', env }));
  assert.equal(res.status, 401);
  assert.equal((await readJSON(res)).needsAdmin, true);
  assert.ok(kv._map.has('dash:apagar'), 'nao deve apagar sem o token admin');
});

// 5. Com ADMIN_TOKEN setado, DELETE com token correto -> passa (200 apaga).
test('admin gate: DELETE com token correto -> 200 apaga', async () => {
  const cfg = makeConfig({ id: 'apagar' });
  const kv = fakeKV({ 'dash:apagar': JSON.stringify(cfg) });
  const env = { DASHBOARDS_KV: kv, ADMIN_TOKEN: ADMIN };
  const res = await dashboards(ctx('DELETE', { id: 'apagar', headers: { 'x-admin-token': ADMIN }, env }));
  assert.equal(res.status, 200);
  assert.deepEqual(await readJSON(res), { ok: true });
  assert.equal(kv._map.has('dash:apagar'), false);
});

// 6. O gate admin roda ANTES da checagem per-dashboard, mas ainda RESPEITA a senha
//    per-dashboard: token admin correto NAO derruba a protecao por senha do alvo.
test('admin gate: token admin correto ainda respeita a senha per-dashboard', async () => {
  const hash = await sha256Hex('senha-dash');
  const original = makeConfig({ id: 'over', name: 'Original', auth: await saltedAuth(hash) });
  const kv = fakeKV({ 'dash:over': JSON.stringify(original) });
  const env = { DASHBOARDS_KV: kv, ADMIN_TOKEN: ADMIN };

  // Token admin ok, mas sem a senha do dashboard protegido -> 401 needsPassword.
  const semSenha = await dashboards(
    ctx('POST', { body: makeConfig({ id: 'over', name: 'Invasor' }), headers: { 'x-admin-token': ADMIN }, env })
  );
  assert.equal(semSenha.status, 401);
  assert.equal((await readJSON(semSenha)).needsPassword, true);
  assert.equal(JSON.parse(kv._map.get('dash:over')).name, 'Original');

  // Token admin ok + senha do dashboard ok -> sobrescreve.
  const comAmbos = await dashboards(
    ctx('POST', {
      body: makeConfig({ id: 'over', name: 'Novo', auth: { hash } }),
      headers: { 'x-admin-token': ADMIN, 'x-dash-auth': hash },
      env,
    })
  );
  assert.equal(comAmbos.status, 200);
  assert.equal(JSON.parse(kv._map.get('dash:over')).name, 'Novo');
});

// 7. FAIL-CLOSED: sem env.ADMIN_TOKEN, POST -> 403 adminNotConfigured (NAO cria).
test('sem ADMIN_TOKEN: POST -> 403 adminNotConfigured (fail-closed, nao cria)', async () => {
  const kv = fakeKV();
  const env = { DASHBOARDS_KV: kv }; // sem ADMIN_TOKEN

  const post = await dashboards(ctx('POST', { body: makeConfig({ name: 'Aberto' }), env }));
  assert.equal(post.status, 403);
  const j = await readJSON(post);
  assert.equal(j.adminNotConfigured, true);
  assert.equal(j.needsAdmin, undefined, 'NAO usa needsAdmin: colar token no cliente nao resolve');
  assert.match(j.error, /ADMIN_TOKEN/i);
  assert.equal(kv._map.size, 0, 'nao pode criar nada sem ADMIN_TOKEN no servidor');
});

// 7b. FAIL-CLOSED: sem env.ADMIN_TOKEN, DELETE -> 403 adminNotConfigured (NAO apaga).
test('sem ADMIN_TOKEN: DELETE -> 403 adminNotConfigured (fail-closed, nao apaga)', async () => {
  const cfg = makeConfig({ id: 'existe' });
  const kv = fakeKV({ 'dash:existe': JSON.stringify(cfg) });
  const env = { DASHBOARDS_KV: kv }; // sem ADMIN_TOKEN

  const del = await dashboards(ctx('DELETE', { id: 'existe', env }));
  assert.equal(del.status, 403);
  assert.equal((await readJSON(del)).adminNotConfigured, true);
  assert.ok(kv._map.has('dash:existe'), 'nao pode apagar sem ADMIN_TOKEN no servidor');
});

// 8. O gate admin NAO afeta GET, mesmo com ADMIN_TOKEN setado e sem header admin.
test('admin gate: GET nao muda com ADMIN_TOKEN setado', async () => {
  const cfg = makeConfig({ id: 'aberto', createdAt: '2026-01-01T00:00:00.000Z' });
  const kv = fakeKV({ 'dash:aberto': JSON.stringify(cfg) });
  const env = { DASHBOARDS_KV: kv, ADMIN_TOKEN: ADMIN };

  const one = await dashboards(ctx('GET', { id: 'aberto', env }));
  assert.equal(one.status, 200);
  assert.equal((await readJSON(one)).id, 'aberto');

  const all = await dashboards(ctx('GET', { env }));
  assert.equal(all.status, 200);
  assert.ok(Array.isArray(await readJSON(all)));
});
