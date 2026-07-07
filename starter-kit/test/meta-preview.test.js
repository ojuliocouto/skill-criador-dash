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
