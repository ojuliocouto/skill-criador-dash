// Testes do rate limiter de janela fixa em KV (functions/lib/rate-limit.mjs).
// GRAVE 1 e 2: barrar relay/SSRF anonimo do preview Meta e brute force da senha.
//
// Estrategia: KV fake em memoria (get/put com expirationTtl) + relogio (now)
// controlado, para provar: estoura no limite, libera na janela seguinte, e
// devolve { ok: true } quando nao ha KV (deploy sem cache nao pode quebrar).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rateLimit, clientIp } from '../functions/lib/rate-limit.mjs';

// KV fake em memoria com suporte a expirationTtl. Guarda { value, expiresAt }
// e expira via um relogio injetado (para nao depender de tempo real no teste).
function fakeKV(clock) {
  const map = new Map();
  const now = () => (typeof clock.t === 'number' ? clock.t : Date.now() / 1000);
  return {
    async get(k) {
      const rec = map.get(k);
      if (!rec) return null;
      if (rec.expiresAt != null && now() >= rec.expiresAt) {
        map.delete(k);
        return null;
      }
      return rec.value;
    },
    async put(k, v, opts = {}) {
      const ttl = opts && opts.expirationTtl;
      map.set(k, {
        value: String(v),
        expiresAt: ttl != null ? now() + ttl : null,
      });
    },
    _map: map,
  };
}

// Relogio injetado no rate limiter via opcao `nowSec` (deterministico).
function at(t) {
  return t;
}

test('rateLimit: sem KV (env.DASHBOARD_CACHE ausente) -> { ok: true } e nao quebra', async () => {
  const r = await rateLimit({}, 'ip:1.2.3.4', { limit: 5, windowSec: 60 });
  assert.equal(r.ok, true);
});

test('rateLimit: conta as chamadas na janela e estoura ao passar do limite', async () => {
  const clock = { t: 1000 };
  const env = { DASHBOARD_CACHE: fakeKV(clock) };
  const opts = { limit: 3, windowSec: 60, nowSec: () => clock.t };

  const r1 = await rateLimit(env, 'ip:a', opts);
  assert.equal(r1.ok, true);
  assert.equal(r1.remaining, 2);

  const r2 = await rateLimit(env, 'ip:a', opts);
  assert.equal(r2.ok, true);
  assert.equal(r2.remaining, 1);

  const r3 = await rateLimit(env, 'ip:a', opts);
  assert.equal(r3.ok, true);
  assert.equal(r3.remaining, 0);

  // 4a chamada estoura: ok=false e Retry-After > 0.
  const r4 = await rateLimit(env, 'ip:a', opts);
  assert.equal(r4.ok, false);
  assert.equal(r4.remaining, 0);
  assert.ok(r4.retryAfter > 0, 'deve informar Retry-After em segundos');
  assert.ok(r4.retryAfter <= 60, 'Retry-After nao passa do tamanho da janela');
});

test('rateLimit: chaves diferentes tem contadores independentes', async () => {
  const clock = { t: 2000 };
  const env = { DASHBOARD_CACHE: fakeKV(clock) };
  const opts = { limit: 1, windowSec: 60, nowSec: () => clock.t };

  const a1 = await rateLimit(env, 'ip:a', opts);
  assert.equal(a1.ok, true);
  const a2 = await rateLimit(env, 'ip:a', opts);
  assert.equal(a2.ok, false, 'segunda chamada de ip:a estoura');

  // Outra chave (outro IP) nao e afetada.
  const b1 = await rateLimit(env, 'ip:b', opts);
  assert.equal(b1.ok, true, 'ip:b tem contador proprio');
});

test('rateLimit: libera na janela seguinte (contador zera quando a janela vira)', async () => {
  const clock = { t: 3000 };
  const env = { DASHBOARD_CACHE: fakeKV(clock) };
  const opts = { limit: 1, windowSec: 60, nowSec: () => clock.t };

  const r1 = await rateLimit(env, 'ip:a', opts);
  assert.equal(r1.ok, true);
  const r2 = await rateLimit(env, 'ip:a', opts);
  assert.equal(r2.ok, false, 'estourou dentro da mesma janela');

  // Avanca o relogio para a proxima janela: a chave da janela anterior nao conta.
  clock.t += 60;
  const r3 = await rateLimit(env, 'ip:a', opts);
  assert.equal(r3.ok, true, 'nova janela zera o contador');
});

test('rateLimit: a chave gravada no KV inclui prefixo rl: e o numero da janela', async () => {
  const clock = { t: 6000 }; // janela = floor(6000/60) = 100
  const kv = fakeKV(clock);
  const env = { DASHBOARD_CACHE: kv };
  await rateLimit(env, 'ip:zz', { limit: 5, windowSec: 60, nowSec: () => clock.t });
  const chaves = [...kv._map.keys()];
  assert.equal(chaves.length, 1);
  assert.match(chaves[0], /^rl:ip:zz:100$/);
});

test('rateLimit: grava com expirationTtl = windowSec (contador expira sozinho)', async () => {
  const clock = { t: 9000 };
  const kv = fakeKV(clock);
  const env = { DASHBOARD_CACHE: kv };
  await rateLimit(env, 'k', { limit: 5, windowSec: 120, nowSec: () => clock.t });
  const rec = [...kv._map.values()][0];
  assert.equal(rec.expiresAt, 9000 + 120, 'TTL deve ser a janela em segundos');
});

test('rateLimit: falha de KV (get/put lancam) nao derruba o request -> ok:true', async () => {
  const kvQuebrado = {
    async get() { throw new Error('KV down'); },
    async put() { throw new Error('KV down'); },
  };
  const r = await rateLimit({ DASHBOARD_CACHE: kvQuebrado }, 'k', { limit: 5, windowSec: 60 });
  assert.equal(r.ok, true, 'em erro de infra, nao punir o usuario legitimo');
});

test('clientIp: le CF-Connecting-IP; sem header -> "unknown"', () => {
  const comIp = new Request('https://x/', { headers: { 'CF-Connecting-IP': '9.9.9.9' } });
  assert.equal(clientIp(comIp), '9.9.9.9');

  const semIp = new Request('https://x/');
  assert.equal(clientIp(semIp), 'unknown');
});
