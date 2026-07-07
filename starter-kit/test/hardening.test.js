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
    // Dominio canonico: o POST valida config.domain contra domains.mjs (fix 3).
    domain: 'vendas',
    source: { type: 'sheet', url: 'https://sheet' },
    colMap: { data: 'A', valor: 'B' },
    ...overrides,
  };
}

// Modelo FAIL-CLOSED: toda mutacao exige ADMIN_TOKEN no servidor + header
// x-admin-token. Estes testes focam na validacao de accent (nao no gate admin),
// entao ctxPost ja injeta o token no env e manda o header, para o POST passar o
// gate e chegar na validacao que esta sendo exercitada.
const ADMIN = 'super-token-admin';
function ctxPost(body, env) {
  return {
    request: new Request('https://x/api/dashboards', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': ADMIN },
      body: JSON.stringify(body),
    }),
    env: { ADMIN_TOKEN: ADMIN, ...env },
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
  // script-src usa HASH do inline anti-flash em vez de 'unsafe-inline' (endurecido).
  assert.match(csp, /script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
  const scriptSrc = (csp.match(/script-src[^;]*/) || [''])[0];
  assert.doesNotMatch(scriptSrc, /unsafe-inline/, "script-src nao pode ter 'unsafe-inline'");
  // style-src mantem 'unsafe-inline' (widgets usam style="..." inline em runtime).
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  assert.match(csp, /frame-ancestors 'none'/);
  // Nao pode quebrar o no-store existente.
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

// CSP: img-src permite https: e data: (logo de marca), MAS script-src segue
// endurecido (com hash, sem 'unsafe-inline'). Afrouxar imagem nao pode afrouxar script.
test('middleware CSP: img-src libera https:/data: (logo) sem afrouxar script-src', async () => {
  const next = async () =>
    new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  const res = await middleware({
    request: new Request('https://x/api/dashboards', { method: 'GET' }),
    env: {},
    next,
  });
  const csp = res.headers.get('Content-Security-Policy') || '';
  // img-src permite self, https: e data: (para o logo da marca).
  const imgSrc = (csp.match(/img-src[^;]*/) || [''])[0];
  assert.match(imgSrc, /'self'/, "img-src mantem 'self'");
  assert.match(imgSrc, /\bhttps:/, 'img-src permite https: (logo externo)');
  assert.match(imgSrc, /\bdata:/, 'img-src permite data: (logo inline)');
  // script-src NAO pode ter sido afrouxado: segue com hash e SEM 'unsafe-inline'.
  const scriptSrc = (csp.match(/script-src[^;]*/) || [''])[0];
  assert.match(scriptSrc, /'sha256-[A-Za-z0-9+/=]+'/, 'script-src mantem o hash');
  assert.doesNotMatch(scriptSrc, /unsafe-inline/, "script-src nao pode ter 'unsafe-inline'");
  assert.doesNotMatch(scriptSrc, /\bhttps:/, 'script-src nao ganhou https: por engano');
  // img-src nao pode ter escapado pra 'unsafe-inline' (nao faz sentido em img, mas garante).
  assert.match(csp, /default-src 'self'/);
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
