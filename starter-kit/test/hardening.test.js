// Testes de hardening (defesa em profundidade):
// - Headers de seguranca aplicados pelo middleware a QUALQUER resposta.
// - Validacao de config.accent no servidor (rejeita valor nao-hex com 400).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { onRequest as middleware } from '../functions/_middleware.js';
import { onRequest as dashboards } from '../functions/api/dashboards.js';

// KV fake minimo (get/put/delete/list), suficiente para o handler de create.
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

function makeConfig(overrides = {}) {
  return {
    name: 'Dash Hardening',
    domain: 'exemplo.com',
    source: { type: 'sheet', url: 'https://sheet' },
    colMap: { data: 'A', valor: 'B' },
    ...overrides,
  };
}

function ctxPost(body, env) {
  return {
    request: new Request('https://x/api/dashboards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
  };
}

async function readJSON(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ---------------------------------------------------------------------------
// Headers de seguranca no middleware
// ---------------------------------------------------------------------------

test('middleware: toda resposta inclui os 3 headers de seguranca', async () => {
  const next = async () =>
    new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  const res = await middleware({
    request: new Request('https://x/api/dashboards', { method: 'GET' }),
    env: {},
    next,
  });
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
  const csp = res.headers.get('Content-Security-Policy') || '';
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self' 'unsafe-inline'/);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  assert.match(csp, /frame-ancestors 'none'/);
  // Nao pode quebrar o no-store existente.
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

// ---------------------------------------------------------------------------
// Validacao de config.accent no create()
// ---------------------------------------------------------------------------

test('dashboards POST com accent invalido (injecao CSS) -> 400', async () => {
  const kv = fakeKV();
  const res = await dashboards(
    ctxPost(makeConfig({ accent: "'); background:url(x)" }), { DASHBOARDS_KV: kv })
  );
  assert.equal(res.status, 400);
  const j = await readJSON(res);
  assert.match(j.error, /accent/i);
  // Nao deve ter persistido nada.
  assert.equal(kv._map.size, 0);
});

test('dashboards POST com accent hex valido -> 200', async () => {
  const kv = fakeKV();
  const res = await dashboards(
    ctxPost(makeConfig({ accent: '#7c3aed' }), { DASHBOARDS_KV: kv })
  );
  assert.equal(res.status, 200);
  const j = await readJSON(res);
  assert.equal(j.accent, '#7c3aed');
});

test('dashboards POST sem accent -> 200 (accent e opcional)', async () => {
  const kv = fakeKV();
  const res = await dashboards(ctxPost(makeConfig(), { DASHBOARDS_KV: kv }));
  assert.equal(res.status, 200);
});
