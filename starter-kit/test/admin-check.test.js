// Checagem da chave de administrador ANTES de a pessoa preencher o assistente inteiro.
// Antes, o aviso "este ambiente exige um token" só aparecia depois de clicar em criar.
//
// POST /api/admin-check não muta nada e responde só dois booleanos:
//   adminConfigurado: o servidor tem ADMIN_TOKEN?
//   tokenConfere:     o header x-admin-token bate com ele?
// Não vira oráculo fácil: tentativa errada conta por IP e, estourado o limite, a resposta é
// 429 até a janela virar, inclusive pra chave certa.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { onRequest as adminCheck } from '../functions/api/admin-check.js';
import { CHECK_LIMIT, CHECK_WINDOW } from '../functions/lib/admin-check.mjs';
import { rateLimit, rateLimitEstourado } from '../functions/lib/rate-limit.mjs';
import { interpretarChecagem } from '../public/assets/js/lib/admin-check.js';
import { checarChaveAdmin } from '../public/assets/js/lib/api-client.js';

function fakeKV() {
  const map = new Map();
  return {
    async get(k) { return map.has(k) ? map.get(k) : null; },
    async put(k, v) { map.set(k, String(v)); },
    async delete(k) { map.delete(k); },
    async list() { return { keys: [...map.keys()].map((name) => ({ name })) }; },
    _map: map,
  };
}

function pedido(env, { token, method = 'POST', ip = '1.2.3.4' } = {}) {
  const headers = { 'CF-Connecting-IP': ip };
  if (token != null) headers['x-admin-token'] = token;
  return adminCheck({ request: new Request('https://x/api/admin-check', { method, headers }), env });
}

const SEGREDO = 'segredo-de-teste-123';

test('servidor sem ADMIN_TOKEN: diz que não está configurado e não confere nada', async () => {
  const res = await pedido({ DASHBOARDS_KV: fakeKV() }, { token: 'qualquer' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { adminConfigurado: false, tokenConfere: false });
});

test('servidor com ADMIN_TOKEN e pedido sem chave: precisa de chave', async () => {
  const kv = fakeKV();
  const res = await pedido({ DASHBOARDS_KV: kv, ADMIN_TOKEN: SEGREDO });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { adminConfigurado: true, tokenConfere: false });
  assert.equal(kv._map.size, 0, 'pedido sem chave não gasta tentativa');
});

test('chave certa confere; chave errada não confere', async () => {
  const env = { DASHBOARDS_KV: fakeKV(), ADMIN_TOKEN: SEGREDO };
  assert.deepEqual(await (await pedido(env, { token: SEGREDO })).json(), { adminConfigurado: true, tokenConfere: true });
  assert.deepEqual(await (await pedido(env, { token: 'errada' })).json(), { adminConfigurado: true, tokenConfere: false });
});

test('a resposta nunca carrega a chave, o tamanho dela nem nada além dos dois campos', async () => {
  const env = { DASHBOARDS_KV: fakeKV(), ADMIN_TOKEN: SEGREDO };
  for (const token of [SEGREDO, 'errada', undefined]) {
    const res = await pedido(env, { token });
    const texto = await res.text();
    assert.ok(!texto.includes(SEGREDO), 'a chave não volta na resposta');
    assert.deepEqual(Object.keys(JSON.parse(texto)).sort(), ['adminConfigurado', 'tokenConfere']);
  }
});

test('não muta nenhum painel: só grava o contador de tentativas', async () => {
  const kv = fakeKV();
  await kv.put('dash:existente', '{"id":"existente"}');
  const env = { DASHBOARDS_KV: kv, ADMIN_TOKEN: SEGREDO };
  await pedido(env, { token: 'errada' });
  await pedido(env, { token: SEGREDO });
  const chaves = [...kv._map.keys()];
  assert.equal(kv._map.get('dash:existente'), '{"id":"existente"}');
  assert.deepEqual(chaves.filter((k) => !k.startsWith('rl:')), ['dash:existente']);
});

test('anti força bruta: depois do limite de erros responde 429, até pra chave certa', async () => {
  const env = { DASHBOARDS_KV: fakeKV(), ADMIN_TOKEN: SEGREDO };
  for (let i = 0; i < CHECK_LIMIT; i += 1) {
    const res = await pedido(env, { token: `chute-${i}` });
    assert.equal(res.status, 200, `tentativa ${i + 1} ainda dentro do limite`);
  }
  const bloqueada = await pedido(env, { token: 'mais-um-chute' });
  assert.equal(bloqueada.status, 429);
  assert.ok(Number(bloqueada.headers.get('Retry-After')) >= 1);
  const corpo = await bloqueada.json();
  assert.equal(corpo.rateLimited, true);
  assert.ok(!('tokenConfere' in corpo), 'bloqueado não diz se a chave confere');
  const certa = await pedido(env, { token: SEGREDO });
  assert.equal(certa.status, 429, 'com o limite estourado nem a chave certa é confirmada');
});

test('chave certa não gasta tentativa; o limite é por IP', async () => {
  const kv = fakeKV();
  const env = { DASHBOARDS_KV: kv, ADMIN_TOKEN: SEGREDO };
  for (let i = 0; i < CHECK_LIMIT + 5; i += 1) {
    assert.equal((await pedido(env, { token: SEGREDO })).status, 200);
  }
  for (let i = 0; i < CHECK_LIMIT; i += 1) await pedido(env, { token: 'x', ip: '9.9.9.9' });
  assert.equal((await pedido(env, { token: 'x', ip: '9.9.9.9' })).status, 429);
  assert.equal((await pedido(env, { token: SEGREDO, ip: '1.2.3.4' })).status, 200, 'outro IP segue livre');
});

test('só aceita POST, e a chave nunca vem pela URL', async () => {
  const env = { DASHBOARDS_KV: fakeKV(), ADMIN_TOKEN: SEGREDO };
  assert.equal((await pedido(env, { method: 'GET', token: SEGREDO })).status, 405);
  const pelaUrl = await adminCheck({
    request: new Request(`https://x/api/admin-check?token=${SEGREDO}&x-admin-token=${SEGREDO}`, { method: 'POST' }), env,
  });
  assert.deepEqual(await pelaUrl.json(), { adminConfigurado: true, tokenConfere: false });
});

test('rateLimitEstourado: só lê; vira verdadeiro quando o contador chega no limite', async () => {
  const env = { DASHBOARDS_KV: fakeKV() };
  const opts = { limit: 2, windowSec: CHECK_WINDOW, nowSec: () => 1000 };
  assert.deepEqual(await rateLimitEstourado(env, 'k', opts), { estourado: false });
  assert.equal(env.DASHBOARDS_KV._map.size, 0, 'consultar não grava');
  await rateLimit(env, 'k', opts);
  assert.equal((await rateLimitEstourado(env, 'k', opts)).estourado, false);
  await rateLimit(env, 'k', opts);
  const r = await rateLimitEstourado(env, 'k', opts);
  assert.equal(r.estourado, true);
  assert.ok(r.retryAfter >= 1);
  assert.deepEqual(await rateLimitEstourado({}, 'k', opts), { estourado: false }, 'sem KV não bloqueia');
});

// ---------- cliente ----------

test('interpretarChecagem: traduz a resposta nos estados que a tela usa', () => {
  assert.equal(interpretarChecagem(200, { adminConfigurado: false, tokenConfere: false }), 'sem-config');
  assert.equal(interpretarChecagem(200, { adminConfigurado: true, tokenConfere: false }), 'precisa');
  assert.equal(interpretarChecagem(200, { adminConfigurado: true, tokenConfere: true }), 'confere');
  assert.equal(interpretarChecagem(429, { rateLimited: true }), 'espere');
  assert.equal(interpretarChecagem(404, {}), 'indisponivel');
  assert.equal(interpretarChecagem(500, {}), 'indisponivel');
  assert.equal(interpretarChecagem(200, null), 'indisponivel');
  assert.equal(interpretarChecagem(200, { raw: '<html>' }), 'indisponivel');
});

function stubFetch(respond) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    return typeof respond === 'function' ? respond(String(url), init || {}) : respond;
  };
  return { calls, restore() { globalThis.fetch = original; } };
}

function stubLocalStorage(initial = {}) {
  const original = globalThis.localStorage;
  const store = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  return { store, restore() { globalThis.localStorage = original; } };
}

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('checarChaveAdmin: POST em /api/admin-check com a chave no header, nunca na URL nem no corpo', async () => {
  const ls = stubLocalStorage();
  const f = stubFetch(jsonResponse({ adminConfigurado: true, tokenConfere: true }));
  try {
    const estado = await checarChaveAdmin('minha-chave');
    assert.equal(estado, 'confere');
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url, '/api/admin-check');
    assert.equal(f.calls[0].init.method, 'POST');
    assert.equal(f.calls[0].init.headers['x-admin-token'], 'minha-chave');
    assert.ok(!f.calls[0].url.includes('minha-chave'));
    assert.equal(f.calls[0].init.body, undefined);
    assert.equal(ls.store.size, 0, 'conferir não guarda a chave');
  } finally { f.restore(); ls.restore(); }
});

test('checarChaveAdmin: sem argumento usa a chave já guardada; sem chave nenhuma, não manda header', async () => {
  const ls = stubLocalStorage({ 'cd-admin-token': 'guardada' });
  const f = stubFetch(() => jsonResponse({ adminConfigurado: true, tokenConfere: false }));
  try {
    assert.equal(await checarChaveAdmin(), 'precisa');
    assert.equal(f.calls[0].init.headers['x-admin-token'], 'guardada');
    ls.store.clear();
    await checarChaveAdmin();
    assert.equal(f.calls[1].init.headers['x-admin-token'], undefined);
  } finally { f.restore(); ls.restore(); }
});

test('checarChaveAdmin: falha de rede ou servidor antigo (404) vira "indisponivel", sem lançar erro', async () => {
  const ls = stubLocalStorage();
  const f1 = stubFetch(() => { throw new Error('rede caiu'); });
  try { assert.equal(await checarChaveAdmin('x'), 'indisponivel'); } finally { f1.restore(); }
  const f2 = stubFetch(new Response('<!doctype html>', { status: 404, headers: { 'content-type': 'text/html' } }));
  try { assert.equal(await checarChaveAdmin('x'), 'indisponivel'); } finally { f2.restore(); ls.restore(); }
});
