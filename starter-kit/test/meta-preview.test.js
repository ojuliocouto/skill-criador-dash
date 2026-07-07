// Testes do endpoint de PREVIEW do conector Meta Ads (POST /api/connectors/meta-ads).
// Foco nos gates de seguranca do preview (GRAVE 2):
//  1. Se env.ADMIN_TOKEN estiver setado, o preview exige o header x-admin-token
//     (senao o preview seria um relay anonimo da Graph API, sem auth nem rate limit).
//  2. O erro cru da Graph API NUNCA vaza no preview: a resposta e uma mensagem
//     generica PT-BR, para o endpoint nao virar oraculo de validacao de token/conta.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { onRequest as metaAds } from '../functions/api/connectors/meta-ads.js';

// Response fake minima compativel com o que o handler usa (ok/status/json).
function fakeResponse({ ok = true, status = 200, json = null } = {}) {
  return { ok, status, async text() { return ''; }, async json() { return json; } };
}

// Executa fn com globalThis.fetch trocado pelo stub; restaura no finally.
async function comFetchStub(stub, fn) {
  const original = globalThis.fetch;
  const contador = { chamadas: 0 };
  globalThis.fetch = async (...args) => { contador.chamadas += 1; return stub(...args); };
  try { return await fn(contador); } finally { globalThis.fetch = original; }
}

function ctx(method, { body, headers = {}, env = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (body != null) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (!init.headers['content-type']) init.headers['content-type'] = 'application/json';
  }
  return { request: new Request('https://x/api/connectors/meta-ads', init), env };
}

async function readJSON(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// KV de cache fake (usado pelo rate limiter): get/put com contador em memoria.
function fakeCache() {
  const map = new Map();
  return {
    async get(k) { return map.has(k) ? map.get(k) : null; },
    async put(k, v) { map.set(k, String(v)); },
    _map: map,
  };
}

const ADMIN = 'super-token-admin';

// 1. Com ADMIN_TOKEN setado, preview sem x-admin-token -> 401 needsAdmin e NAO toca a rede.
test('preview: sem x-admin-token (com ADMIN_TOKEN setado) -> 401 e NAO chama a Graph API', async () => {
  const stub = () => fakeResponse({ ok: true, status: 200, json: { data: [] } });
  await comFetchStub(stub, async (contador) => {
    const res = await metaAds(ctx('POST', { body: { token: 'TK', account: '123' }, env: { ADMIN_TOKEN: ADMIN } }));
    assert.equal(res.status, 401);
    assert.equal((await readJSON(res)).needsAdmin, true);
    assert.equal(contador.chamadas, 0, 'gate admin deve barrar ANTES de tocar a Graph API');
  });
});

// 2. Com ADMIN_TOKEN setado, preview com x-admin-token errado -> 401 needsAdmin.
test('preview: com x-admin-token errado -> 401 needsAdmin', async () => {
  const stub = () => fakeResponse({ ok: true, status: 200, json: { data: [] } });
  await comFetchStub(stub, async () => {
    const res = await metaAds(
      ctx('POST', { body: { token: 'TK', account: '123' }, headers: { 'x-admin-token': 'errado' }, env: { ADMIN_TOKEN: ADMIN } })
    );
    assert.equal(res.status, 401);
    assert.equal((await readJSON(res)).needsAdmin, true);
  });
});

// 3. Com ADMIN_TOKEN setado, preview com x-admin-token correto -> passa (200 DataSet).
test('preview: com x-admin-token correto -> 200 DataSet', async () => {
  const insights = { data: [{ date_start: '2026-01-01', campaign_name: 'A', spend: '10', impressions: '100', clicks: '5', actions: [] }] };
  const stub = () => fakeResponse({ ok: true, status: 200, json: insights });
  await comFetchStub(stub, async (contador) => {
    const res = await metaAds(
      ctx('POST', { body: { token: 'TK', account: '123' }, headers: { 'x-admin-token': ADMIN }, env: { ADMIN_TOKEN: ADMIN } })
    );
    assert.equal(res.status, 200);
    const ds = await readJSON(res);
    assert.equal(ds.meta.source, 'meta');
    assert.equal(ds.rows.length, 1);
    assert.equal(contador.chamadas, 1);
  });
});

// 4. Sem ADMIN_TOKEN: preview segue aberto (comportamento self-serve), mas o erro
//    cru da Graph API NAO vaza -> mensagem generica PT-BR (nao vira oraculo).
test('preview: erro da Graph API nao vaza texto cru (mensagem generica)', async () => {
  const graphError = { error: { message: 'Invalid OAuth access token - Cannot parse access token', code: 190 } };
  const stub = () => fakeResponse({ ok: true, status: 200, json: graphError });
  await comFetchStub(stub, async () => {
    const res = await metaAds(ctx('POST', { body: { token: 'TK-invalido', account: '123' }, env: {} }));
    assert.equal(res.status, 400);
    const j = await readJSON(res);
    // Nao pode vazar os detalhes crus da Graph API (mensagem/codigo especificos).
    assert.doesNotMatch(j.error, /OAuth|Cannot parse|190/i, 'nao pode vazar o texto cru da Graph API');
    assert.match(j.error, /token\/conta|validar/i, 'deve ser a mensagem generica PT-BR');
  });
});

// 5. Sem ADMIN_TOKEN e sem token no corpo (erro de montagem de URL) tambem vira generico.
test('preview: falha de montagem (sem token) tambem vira mensagem generica', async () => {
  const res = await metaAds(ctx('POST', { body: { account: '123' }, env: {} }));
  assert.equal(res.status, 400);
  const j = await readJSON(res);
  assert.match(j.error, /token\/conta|validar/i);
});

// 6. RATE LIMIT (GRAVE 1): sem ADMIN_TOKEN, o preview segue aberto, MAS o rate
//    limiter por IP fecha o relay/SSRF ilimitado. Ate o limite (10) passa; a 11a
//    chamada do MESMO IP estoura -> 429 com Retry-After e NAO toca a Graph API.
test('preview: rate limit por IP estoura no limite e devolve 429 (fecha relay anonimo)', async () => {
  const insights = { data: [] };
  const stub = () => fakeResponse({ ok: true, status: 200, json: insights });
  const cache = fakeCache();
  const env = { DASHBOARD_CACHE: cache }; // sem ADMIN_TOKEN: aberto, mas com rate limit
  const headers = { 'CF-Connecting-IP': '203.0.113.7' };

  await comFetchStub(stub, async (contador) => {
    // 10 chamadas dentro do limite: todas passam e tocam a rede.
    for (let i = 0; i < 10; i++) {
      const ok = await metaAds(ctx('POST', { body: { token: 'TK', account: '123' }, headers, env }));
      assert.equal(ok.status, 200, `chamada ${i + 1} deve passar`);
    }
    assert.equal(contador.chamadas, 10);

    // 11a chamada do mesmo IP: 429, NAO chama a Graph API.
    const bloqueada = await metaAds(ctx('POST', { body: { token: 'TK', account: '123' }, headers, env }));
    assert.equal(bloqueada.status, 429);
    assert.ok(Number(bloqueada.headers.get('Retry-After')) > 0, 'deve mandar Retry-After');
    const j = await readJSON(bloqueada);
    assert.match(j.error, /tentativas|aguarde/i, 'mensagem generica PT-BR');
    assert.equal(contador.chamadas, 10, 'chamada bloqueada NAO pode tocar a Graph API');
  });
});

// 7. O rate limit e por IP: um IP estourado nao afeta outro IP.
test('preview: rate limit e por IP (outro IP nao e barrado)', async () => {
  const stub = () => fakeResponse({ ok: true, status: 200, json: { data: [] } });
  const cache = fakeCache();
  const env = { DASHBOARD_CACHE: cache };

  await comFetchStub(stub, async () => {
    // Estoura o IP A.
    for (let i = 0; i < 11; i++) {
      await metaAds(ctx('POST', { body: { token: 'TK', account: '1' }, headers: { 'CF-Connecting-IP': '198.51.100.1' }, env }));
    }
    const a = await metaAds(ctx('POST', { body: { token: 'TK', account: '1' }, headers: { 'CF-Connecting-IP': '198.51.100.1' }, env }));
    assert.equal(a.status, 429);

    // IP B ainda passa.
    const b = await metaAds(ctx('POST', { body: { token: 'TK', account: '1' }, headers: { 'CF-Connecting-IP': '198.51.100.99' }, env }));
    assert.equal(b.status, 200);
  });
});

// 8. Sem KV de cache (env.DASHBOARD_CACHE ausente): o preview NAO quebra o deploy
//    (rate limit vira no-op, o preview segue funcionando).
test('preview: sem KV de cache o preview ainda funciona (rate limit no-op)', async () => {
  const stub = () => fakeResponse({ ok: true, status: 200, json: { data: [] } });
  await comFetchStub(stub, async () => {
    const res = await metaAds(ctx('POST', { body: { token: 'TK', account: '123' }, env: {} }));
    assert.equal(res.status, 200, 'sem cache, o rate limit nao pode derrubar o preview');
  });
});
