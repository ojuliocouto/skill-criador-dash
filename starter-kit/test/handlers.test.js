// Testes de integracao dos handlers Cloudflare Pages Functions.
// Foco: cobertura dos handlers (antes sem testes) e, principalmente, os
// GATES DE SEGURANCA (senha por dashboard, strip de segredos, isolamento de cache).
//
// Estrategia: montar KV/D1/Cache fakes em memoria e chamar onRequest(context)
// direto, usando as globais Web (Request/Response) ja disponiveis no Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { onRequest as dashboards } from '../functions/api/dashboards.js';
import { onRequest as d1 } from '../functions/api/connectors/d1.js';
import { onRequest as middleware } from '../functions/_middleware.js';
import { sha256Hex } from '../public/assets/js/lib/auth.js';
import { authOk, derivePasswordAuth } from '../functions/lib/auth-config.mjs';

// Deriva o bloco auth v2 (salgado) a partir do hash que o cliente enviaria no
// header. Usado para semear o KV fake no formato ja gravado pelo servidor.
async function saltedAuth(clientHash) {
  return derivePasswordAuth(clientHash);
}

// ---------------------------------------------------------------------------
// Helpers de infra fake
// ---------------------------------------------------------------------------

// KV fake em memoria. get devolve string ou null (igual ao KV real).
function fakeKV(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    async get(k) {
      return map.has(k) ? map.get(k) : null;
    },
    async put(k, v) {
      map.set(k, String(v));
    },
    async delete(k) {
      map.delete(k);
    },
    async list({ prefix } = {}) {
      const keys = [];
      for (const name of map.keys()) {
        if (!prefix || name.startsWith(prefix)) keys.push({ name });
      }
      return { keys };
    },
    // Exposto so pros testes: espiar o estado interno.
    _map: map,
  };
}

// D1 fake. .prepare(sql).bind(...p).first() devolve a primeira row (ou null).
// .run() e no-op. Suficiente pro d1.js, que so faz first().
function fakeD1(rows = []) {
  return {
    prepare() {
      return {
        bind() {
          return {
            async first() {
              return rows.length ? rows[0] : null;
            },
            async run() {
              return { success: true };
            },
          };
        },
      };
    },
  };
}

// Cache fake em memoria (KV-like: get/put). Guarda em Map.
function fakeCache(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    async get(k) {
      return map.has(k) ? map.get(k) : null;
    },
    async put(k, v) {
      map.set(k, String(v));
    },
    _map: map,
  };
}

// Monta o context {request, env}. url = https://x/api/...?id=...
// path: caminho apos /api/ (ex: 'dashboards' ou 'connectors/d1').
function ctx(method, { path = 'dashboards', id, body, headers = {}, env = {} } = {}) {
  const qs = id != null ? `?id=${encodeURIComponent(id)}` : '';
  const url = `https://x/api/${path}${qs}`;
  const init = { method, headers: { ...headers } };
  if (body != null) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (!init.headers['content-type']) init.headers['content-type'] = 'application/json';
  }
  return { request: new Request(url, init), env };
}

// Monta uma config valida de dashboard (com ou sem senha).
function makeConfig(overrides = {}) {
  return {
    name: 'Meu Dash',
    domain: 'exemplo.com',
    source: { type: 'sheet', url: 'https://sheet' },
    colMap: { data: 'A', valor: 'B' },
    ...overrides,
  };
}

// Le o corpo JSON de uma Response.
async function readJSON(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ---------------------------------------------------------------------------
// DASHBOARDS (functions/api/dashboards.js)
// ---------------------------------------------------------------------------

// 1. POST sem name/domain/source/colMap -> 400.
test('dashboards POST sem campos obrigatorios -> 400', async () => {
  const env = { DASHBOARDS_KV: fakeKV() };
  const res = await dashboards(ctx('POST', { body: {}, env }));
  assert.equal(res.status, 400);
  const j = await readJSON(res);
  assert.match(j.error, /obrigat/i);
});

// 2. POST valido -> 200, gera id (slug) e createdAt; resposta NAO expoe auth.hash.
test('dashboards POST valido -> 200 gera slug/createdAt, salga a senha e nao vaza auth', async () => {
  const kv = fakeKV();
  const hash = await sha256Hex('segredo');
  const res = await dashboards(
    ctx('POST', { body: makeConfig({ name: 'Café da Manhã', auth: { hash } }), env: { DASHBOARDS_KV: kv } })
  );
  assert.equal(res.status, 200);
  const j = await readJSON(res);
  assert.equal(j.id, 'cafe-da-manha'); // slug com acento removido
  assert.ok(j.createdAt, 'deve gerar createdAt');
  // Gate de seguranca: nenhum material de auth vaza pro cliente.
  assert.equal(j.auth, undefined);
  assert.equal(j.protected, true);
  // Persistido no KV JA SALGADO: nunca o hash cru que o header carrega.
  const stored = JSON.parse(kv._map.get('dash:cafe-da-manha'));
  assert.equal(stored.auth.hash, undefined, 'nao pode gravar o hash cru reenviavel');
  assert.ok(stored.auth.salt && stored.auth.verifier, 'grava salt + verifier');
  assert.equal(stored.auth.algo, 'PBKDF2-SHA256');
  assert.notEqual(stored.auth.verifier, hash, 'verifier != hash do header');
  // O verifier salgado autentica o header original, mas nao a si mesmo.
  assert.equal(await authOk(stored, hash), true);
  assert.equal(await authOk(stored, stored.auth.verifier), false);
});

// 3. GET ?id de dashboard existente NAO protegido -> 200 com a config.
test('dashboards GET ?id nao protegido -> 200 com a config', async () => {
  const cfg = makeConfig({ id: 'aberto', createdAt: '2026-01-01T00:00:00.000Z' });
  const kv = fakeKV({ 'dash:aberto': JSON.stringify(cfg) });
  const res = await dashboards(ctx('GET', { id: 'aberto', env: { DASHBOARDS_KV: kv } }));
  assert.equal(res.status, 200);
  const j = await readJSON(res);
  assert.equal(j.id, 'aberto');
  assert.equal(j.name, 'Meu Dash');
  assert.equal(j.protected, false);
});

// 4. GET ?id inexistente -> 404.
test('dashboards GET ?id inexistente -> 404', async () => {
  const kv = fakeKV();
  const res = await dashboards(ctx('GET', { id: 'nao-existe', env: { DASHBOARDS_KV: kv } }));
  assert.equal(res.status, 404);
});

// 5. GET protegido: sem header -> 401 needsPassword; com hash correto -> 200.
test('dashboards GET protegido: sem senha 401 needsPassword, com senha 200', async () => {
  const hash = await sha256Hex('minha-senha');
  // Config JA gravada: no formato v2 salgado (o unico aceito), como o servidor grava.
  const cfg = makeConfig({ id: 'sec', auth: await saltedAuth(hash) });
  const kv = fakeKV({ 'dash:sec': JSON.stringify(cfg) });

  const semSenha = await dashboards(ctx('GET', { id: 'sec', env: { DASHBOARDS_KV: kv } }));
  assert.equal(semSenha.status, 401);
  const j1 = await readJSON(semSenha);
  assert.equal(j1.needsPassword, true);

  const comSenha = await dashboards(
    ctx('GET', { id: 'sec', headers: { 'x-dash-auth': hash }, env: { DASHBOARDS_KV: kv } })
  );
  assert.equal(comSenha.status, 200);
  const j2 = await readJSON(comSenha);
  assert.equal(j2.id, 'sec');
  assert.equal(j2.auth && j2.auth.hash, undefined); // ainda sem vazar hash
});

// 6. DELETE protegido: sem senha 401; com senha 200 {ok:true} e chave sai do KV.
test('dashboards DELETE protegido: gate de senha e remocao', async () => {
  const hash = await sha256Hex('del-senha');
  const cfg = makeConfig({ id: 'apagar', auth: await saltedAuth(hash) });
  const kv = fakeKV({ 'dash:apagar': JSON.stringify(cfg) });

  const semSenha = await dashboards(ctx('DELETE', { id: 'apagar', env: { DASHBOARDS_KV: kv } }));
  assert.equal(semSenha.status, 401);
  assert.equal((await readJSON(semSenha)).needsPassword, true);
  assert.ok(kv._map.has('dash:apagar'), 'nao deve apagar sem senha');

  const comSenha = await dashboards(
    ctx('DELETE', { id: 'apagar', headers: { 'x-dash-auth': hash }, env: { DASHBOARDS_KV: kv } })
  );
  assert.equal(comSenha.status, 200);
  assert.deepEqual(await readJSON(comSenha), { ok: true });
  assert.equal(kv._map.has('dash:apagar'), false, 'chave deve sair do KV');
});

// 7. POST sobrescrevendo (mesmo id) protegido: sem senha 401 (nao sobrescreve); com senha 200.
test('dashboards POST sobrescrever protegido: gate de senha', async () => {
  const hash = await sha256Hex('over-senha');
  const original = makeConfig({ id: 'over', name: 'Original', auth: await saltedAuth(hash) });
  const kv = fakeKV({ 'dash:over': JSON.stringify(original) });

  // Tenta sobrescrever sem senha (config nova ate sem auth, tentando "tomar" o id).
  const semSenha = await dashboards(
    ctx('POST', { body: makeConfig({ id: 'over', name: 'Invasor' }), env: { DASHBOARDS_KV: kv } })
  );
  assert.equal(semSenha.status, 401);
  assert.equal((await readJSON(semSenha)).needsPassword, true);
  // Nao sobrescreveu: continua o original.
  assert.equal(JSON.parse(kv._map.get('dash:over')).name, 'Original');

  // Com senha correta, sobrescreve.
  const comSenha = await dashboards(
    ctx('POST', {
      body: makeConfig({ id: 'over', name: 'Novo', auth: { hash } }),
      headers: { 'x-dash-auth': hash },
      env: { DASHBOARDS_KV: kv },
    })
  );
  assert.equal(comSenha.status, 200);
  assert.equal(JSON.parse(kv._map.get('dash:over')).name, 'Novo');
});

// 8. GET sem id (listAll) -> 200 array; itens sem auth.hash e com `protected` correto.
test('dashboards GET listAll -> 200 array sem hash, com flag protected', async () => {
  const hash = await sha256Hex('x');
  const kv = fakeKV({
    'dash:a': JSON.stringify(makeConfig({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' })),
    'dash:b': JSON.stringify(makeConfig({ id: 'b', createdAt: '2026-02-01T00:00:00.000Z', auth: await saltedAuth(hash) })),
  });
  const res = await dashboards(ctx('GET', { env: { DASHBOARDS_KV: kv } }));
  assert.equal(res.status, 200);
  const arr = await readJSON(res);
  assert.ok(Array.isArray(arr));
  assert.equal(arr.length, 2);
  for (const item of arr) {
    assert.equal(item.auth && item.auth.hash, undefined, 'nenhum item pode vazar hash');
  }
  const byId = Object.fromEntries(arr.map((x) => [x.id, x]));
  assert.equal(byId.a.protected, false);
  assert.equal(byId.b.protected, true);
});

// ---------------------------------------------------------------------------
// CONECTOR D1 (functions/api/connectors/d1.js)
// ---------------------------------------------------------------------------

// 9. GET protegido sem senha -> 401 (nao le D1); com senha correta + snapshot -> 200 DataSet reidratado.
test('d1 GET protegido: gate de senha antes de ler D1, depois reidrata DataSet', async () => {
  const hash = await sha256Hex('d1-senha');
  const cfg = makeConfig({ id: 'hist', auth: await saltedAuth(hash) });
  const kv = fakeKV({ 'dash:hist': JSON.stringify(cfg) });

  const dataset = { columns: ['data', 'valor'], rows: [{ data: '2026-01-01', valor: 10 }], meta: { fonte: 'x' } };
  // Se o gate falhar, este D1 seria lido e o teste de 401 nao provaria nada.
  // Por isso montamos um D1 com dado, mas esperamos 401 sem senha.
  const db = fakeD1([{ id: 1, dashboard_id: 'hist', captured_at: '2026-01-01T00:00:00.000Z', dataset_json: JSON.stringify(dataset) }]);
  const env = { DASHBOARDS_KV: kv, DASHBOARD_DB: db };

  const semSenha = await d1(ctx('GET', { path: 'connectors/d1', id: 'hist', env }));
  assert.equal(semSenha.status, 401);
  assert.equal((await readJSON(semSenha)).needsPassword, true);

  const comSenha = await d1(ctx('GET', { path: 'connectors/d1', id: 'hist', headers: { 'x-dash-auth': hash }, env }));
  assert.equal(comSenha.status, 200);
  const ds = await readJSON(comSenha);
  assert.deepEqual(ds.columns, ['data', 'valor']);
  assert.deepEqual(ds.rows, [{ data: '2026-01-01', valor: 10 }]);
  assert.deepEqual(ds.meta, { fonte: 'x' });
});

// 10. GET sem snapshot (first()->null) e dashboard nao protegido -> 404.
test('d1 GET sem snapshot e dashboard aberto -> 404', async () => {
  const cfg = makeConfig({ id: 'vazio' });
  const kv = fakeKV({ 'dash:vazio': JSON.stringify(cfg) });
  const db = fakeD1([]); // first() -> null
  const env = { DASHBOARDS_KV: kv, DASHBOARD_DB: db };
  const res = await d1(ctx('GET', { path: 'connectors/d1', id: 'vazio', env }));
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// MIDDLEWARE (functions/_middleware.js)
// ---------------------------------------------------------------------------

// 11. OPTIONS -> 204 e Allow-Methods NAO inclui POST nem DELETE (so GET, OPTIONS).
test('middleware OPTIONS -> 204 e CORS so libera GET/OPTIONS (mutacao fora do CORS)', async () => {
  const res = await middleware({ request: new Request('https://x/api/dashboards', { method: 'OPTIONS' }), env: {}, next: async () => new Response('nao deveria chamar') });
  assert.equal(res.status, 204);
  const methods = res.headers.get('Access-Control-Allow-Methods') || '';
  assert.match(methods, /GET/);
  assert.match(methods, /OPTIONS/);
  assert.doesNotMatch(methods, /POST/);
  assert.doesNotMatch(methods, /DELETE/);
});

// 12. A chave de cache separa por senha: dado protegido cacheado com senha A
//     NAO pode ser servido pra senha B (deve chamar next de novo).
test('middleware: cache separa por senha (nao vaza dado protegido entre senhas)', async () => {
  const cache = fakeCache();
  let chamadas = 0;
  // next fake: conta chamadas e devolve JSON application/json cacheavel.
  const next = async () => {
    chamadas += 1;
    return new Response(JSON.stringify({ secreto: 'dado', chamada: chamadas }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const env = { DASHBOARD_CACHE: cache };
  const mk = (auth) =>
    middleware({
      request: new Request('https://x/api/connectors/algo?id=z', { method: 'GET', headers: { 'x-dash-auth': auth } }),
      env,
      next,
    });

  // Primeiro GET com senha A: MISS, chama next, cacheia sob a chave da senha A.
  const a1 = await mk('A');
  assert.equal(a1.status, 200);
  assert.equal(a1.headers.get('X-Cache'), 'MISS');
  assert.equal(chamadas, 1);

  // Segundo GET com senha A: HIT, nao chama next de novo.
  const a2 = await mk('A');
  assert.equal(a2.headers.get('X-Cache'), 'HIT');
  assert.equal(chamadas, 1, 'mesma senha deve servir do cache');

  // GET com senha B (diferente): NAO pode servir o cache de A -> MISS, chama next.
  const b1 = await mk('B');
  assert.equal(b1.headers.get('X-Cache'), 'MISS');
  assert.equal(chamadas, 2, 'senha diferente nao pode reaproveitar cache de outra senha');
});
