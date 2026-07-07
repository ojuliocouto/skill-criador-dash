// Testes de integracao dos handlers onRequest dos conectores de REDE.
// Foco: os handlers que fazem fetch de rede (sheets, csv, meta-ads) e o
// GATE DE SEGURANCA por senha do meta-ads (espelha o teste do gate do d1).
//
// Estrategia: chamar onRequest(context) direto, usando as globais Web
// (Request/Response) ja disponiveis no Node. Quando o handler faz fetch,
// substituimos globalThis.fetch por um STUB (salvando o original e
// restaurando no finally). KV/D1 sao fakes em memoria.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { onRequest as sheets } from '../functions/api/connectors/sheets.js';
import { onRequest as csv } from '../functions/api/connectors/csv.js';
import { onRequest as metaAds } from '../functions/api/connectors/meta-ads.js';
import { onRequest as d1 } from '../functions/api/connectors/d1.js';
import { sha256Hex } from '../public/assets/js/lib/auth.js';
import { derivePasswordAuth } from '../functions/lib/auth-config.mjs';

// Deriva o bloco auth v2 (salgado) a partir do hash do cliente, como o servidor grava.
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
    async list({ prefix } = {}) {
      const keys = [];
      for (const name of map.keys()) {
        if (!prefix || name.startsWith(prefix)) keys.push({ name });
      }
      return { keys };
    },
    _map: map,
  };
}

// KV de cache fake (usado pelo rate limiter): get/put simples em memoria.
function fakeCache() {
  const map = new Map();
  return {
    async get(k) { return map.has(k) ? map.get(k) : null; },
    async put(k, v) { map.set(k, String(v)); },
    _map: map,
  };
}

// D1 fake. .prepare(sql).bind(...p).first() devolve a primeira row (ou null).
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

// Le o corpo JSON de uma Response.
async function readJSON(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Executa fn com globalThis.fetch trocado pelo stub; restaura no finally.
// Devolve o contador de chamadas ao fetch para provar se a rede foi tocada.
async function comFetchStub(stub, fn) {
  const original = globalThis.fetch;
  const contador = { chamadas: 0 };
  globalThis.fetch = async (...args) => {
    contador.chamadas += 1;
    return stub(...args);
  };
  try {
    return await fn(contador);
  } finally {
    globalThis.fetch = original;
  }
}

// Response fake minima compativel com o que os handlers usam (ok/text/json).
function fakeResponse({ ok = true, status = 200, text = '', json = null } = {}) {
  return {
    ok,
    status,
    async text() {
      return text;
    },
    async json() {
      return json;
    },
  };
}

// Monta o context {request, env} com uma Request Web real.
function ctx(method, { path, id, query = '', body, headers = {}, env = {} } = {}) {
  let qs = '';
  if (id != null) qs = `?id=${encodeURIComponent(id)}`;
  else if (query) qs = query.startsWith('?') ? query : `?${query}`;
  const url = `https://x/api/${path}${qs}`;
  const init = { method, headers: { ...headers } };
  if (body != null) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (!init.headers['content-type']) init.headers['content-type'] = 'application/json';
  }
  return { request: new Request(url, init), env };
}

// ---------------------------------------------------------------------------
// SHEETS (functions/api/connectors/sheets.js)
// ---------------------------------------------------------------------------

// 1. GET sem parametro url -> 400.
test('sheets GET sem url -> 400', async () => {
  const res = await sheets(ctx('GET', { path: 'connectors/sheets' }));
  assert.equal(res.status, 400);
  const j = await readJSON(res);
  assert.match(j.error, /url/i);
});

// 2. GET com url valida (fetch stub devolve CSV) -> 200 DataSet com columns/rows/meta.
test('sheets GET com url valida -> 200 DataSet source=sheets', async () => {
  const url = 'https://docs.google.com/spreadsheets/d/ABC123_-/edit#gid=0';
  const stub = () =>
    fakeResponse({ ok: true, status: 200, text: 'data,valor\n2026-01-01,10\n2026-01-02,20\n' });

  await comFetchStub(stub, async (contador) => {
    const res = await sheets(ctx('GET', { path: 'connectors/sheets', query: `url=${encodeURIComponent(url)}` }));
    assert.equal(res.status, 200);
    const ds = await readJSON(res);
    assert.deepEqual(ds.columns, ['data', 'valor']);
    assert.equal(ds.rows.length, 2);
    assert.deepEqual(ds.rows[0], { data: '2026-01-01', valor: '10' });
    assert.equal(ds.meta.source, 'sheets');
    assert.equal(ds.meta.rowCount, 2);
    assert.ok(ds.meta.fetchedAt, 'deve carimbar fetchedAt');
    assert.equal(contador.chamadas, 1, 'deve buscar a planilha uma vez');
  });
});

// 3. GET com url valida mas fetch !ok -> 502.
test('sheets GET com fetch !ok -> 502', async () => {
  const url = 'https://docs.google.com/spreadsheets/d/ABC123/edit';
  const stub = () => fakeResponse({ ok: false, status: 403, text: '' });

  await comFetchStub(stub, async () => {
    const res = await sheets(ctx('GET', { path: 'connectors/sheets', query: `url=${encodeURIComponent(url)}` }));
    assert.equal(res.status, 502);
    const j = await readJSON(res);
    assert.match(j.error, /planilha/i);
  });
});

// MINOR seguranca: o conector Sheets e relay de fetch anonimo. Aplica rate limit
// por IP (limit 20, window 60s). Sem CF-Connecting-IP o balde e 'unknown'.
test('sheets GET: estoura rate limit por IP -> 429 amigavel PT-BR (nao vira proxy ilimitado)', async () => {
  const url = 'https://docs.google.com/spreadsheets/d/ABC123/edit';
  const env = { DASHBOARDS_KV: fakeCache() }; // sem cache dedicado; usa o obrigatorio
  const stub = () => fakeResponse({ ok: true, status: 200, text: 'data,valor\n2026-01-01,10\n' });

  await comFetchStub(stub, async () => {
    let ultima;
    // Limite e 20; a 21a chamada dentro da janela deve estourar.
    for (let i = 0; i < 21; i += 1) {
      ultima = await sheets(
        ctx('GET', {
          path: 'connectors/sheets',
          query: `url=${encodeURIComponent(url)}`,
          headers: { 'CF-Connecting-IP': '7.7.7.7' },
          env,
        })
      );
    }
    assert.equal(ultima.status, 429, 'a 21a requisicao do mesmo IP estoura');
    assert.ok(ultima.headers.get('Retry-After'), 'devolve Retry-After');
    const j = await readJSON(ultima);
    assert.match(j.error, /aguarde/i);
    assert.equal(j.rateLimited, true);
  });
});

test('sheets GET: IPs diferentes tem baldes independentes (nao pune terceiro)', async () => {
  const url = 'https://docs.google.com/spreadsheets/d/ABC123/edit';
  const env = { DASHBOARDS_KV: fakeCache() };
  const stub = () => fakeResponse({ ok: true, status: 200, text: 'data,valor\n2026-01-01,10\n' });

  await comFetchStub(stub, async () => {
    // Esgota o IP A.
    for (let i = 0; i < 21; i += 1) {
      await sheets(ctx('GET', { path: 'connectors/sheets', query: `url=${encodeURIComponent(url)}`, headers: { 'CF-Connecting-IP': '1.1.1.1' }, env }));
    }
    // IP B na mesma janela ainda passa.
    const resB = await sheets(ctx('GET', { path: 'connectors/sheets', query: `url=${encodeURIComponent(url)}`, headers: { 'CF-Connecting-IP': '2.2.2.2' }, env }));
    assert.equal(resB.status, 200, 'IP diferente nao herda o estouro do vizinho');
  });
});

// ---------------------------------------------------------------------------
// CSV (functions/api/connectors/csv.js)
// ---------------------------------------------------------------------------

// 4. Metodo GET -> 405 (o handler exige POST).
test('csv GET -> 405', async () => {
  const res = await csv(ctx('GET', { path: 'connectors/csv' }));
  assert.equal(res.status, 405);
  const j = await readJSON(res);
  assert.match(j.error, /POST/i);
});

// 5. POST com corpo CSV cru -> 200 DataSet source=csv.
test('csv POST com corpo CSV -> 200 DataSet source=csv', async () => {
  const corpo = 'nome;idade\nAna;30\nJoao;40\n';
  const res = await csv(
    ctx('POST', { path: 'connectors/csv', body: corpo, headers: { 'content-type': 'text/csv' } })
  );
  assert.equal(res.status, 200);
  const ds = await readJSON(res);
  // Delimitador ; detectado automaticamente.
  assert.deepEqual(ds.columns, ['nome', 'idade']);
  assert.equal(ds.rows.length, 2);
  assert.deepEqual(ds.rows[0], { nome: 'Ana', idade: '30' });
  assert.equal(ds.meta.source, 'csv');
  assert.equal(ds.meta.rowCount, 2);
});

// 6. POST com corpo vazio -> 400 (comportamento real: guarda de CSV vazio no handler).
test('csv POST vazio -> 400', async () => {
  const res = await csv(
    ctx('POST', { path: 'connectors/csv', body: '', headers: { 'content-type': 'text/csv' } })
  );
  assert.equal(res.status, 400);
  const j = await readJSON(res);
  assert.match(j.error, /vazio/i);
});

// ---------------------------------------------------------------------------
// META ADS (functions/api/connectors/meta-ads.js)
// ---------------------------------------------------------------------------

// 7. POST preview (body {token,account}) com fetch stub de insights -> 200 DataSet.
//    Modelo FAIL-CLOSED: o preview exige ADMIN_TOKEN no servidor + header x-admin-token.
test('meta-ads POST preview -> 200 DataSet', async () => {
  const insights = {
    data: [
      {
        date_start: '2026-01-01',
        campaign_name: 'Campanha A',
        spend: '100',
        impressions: '1000',
        clicks: '50',
        actions: [
          { action_type: 'lead', value: '5' },
          { action_type: 'purchase', value: '2' },
        ],
      },
    ],
  };
  const stub = () => fakeResponse({ ok: true, status: 200, json: insights });

  await comFetchStub(stub, async (contador) => {
    const res = await metaAds(
      ctx('POST', { path: 'connectors/meta-ads', body: { token: 'TK', account: 'act_123' }, headers: { 'x-admin-token': 'super-token-admin' }, env: { ADMIN_TOKEN: 'super-token-admin' } })
    );
    assert.equal(res.status, 200);
    const ds = await readJSON(res);
    assert.equal(ds.meta.source, 'meta');
    assert.equal(ds.rows.length, 1);
    assert.equal(ds.rows[0].Campanha, 'Campanha A');
    assert.equal(ds.rows[0].Leads, '5');
    assert.equal(ds.rows[0]['Conversões'], '2');
    assert.ok(ds.meta.fetchedAt, 'handler carimba fetchedAt');
    assert.equal(contador.chamadas, 1, 'deve chamar a Graph API uma vez');
  });
});

// 8. GET ?id sem env.DASHBOARDS_KV -> 500.
test('meta-ads GET ?id sem DASHBOARDS_KV -> 500', async () => {
  const res = await metaAds(ctx('GET', { path: 'connectors/meta-ads', id: 'qualquer', env: {} }));
  assert.equal(res.status, 500);
  const j = await readJSON(res);
  assert.match(j.error, /DASHBOARDS_KV/);
});

// 9. GET ?id de dashboard PROTEGIDO sem x-dash-auth -> 401 needsPassword
//    E a Graph API NAO e chamada (contador de fetch = 0). Espelha o gate do d1.
test('meta-ads GET protegido sem senha -> 401 e NAO chama a Graph API', async () => {
  const hash = await sha256Hex('meta-senha');
  const config = {
    name: 'Dash Meta',
    auth: await saltedAuth(hash), // formato v2 salgado (unico aceito)
    source: { meta: { token: 'SEGREDO', account: 'act_999' } },
  };
  const kv = fakeKV({ 'dash:meta1': JSON.stringify(config) });
  // Stub que, se chamado, falharia o teste (nao pode tocar a rede sem senha).
  const stub = () => fakeResponse({ ok: true, status: 200, json: { data: [] } });

  await comFetchStub(stub, async (contador) => {
    const res = await metaAds(
      ctx('GET', { path: 'connectors/meta-ads', id: 'meta1', env: { DASHBOARDS_KV: kv } })
    );
    assert.equal(res.status, 401);
    const j = await readJSON(res);
    assert.equal(j.needsPassword, true);
    assert.equal(contador.chamadas, 0, 'gate de senha deve barrar ANTES de tocar a Graph API');
  });
});

// 10. GET protegido COM x-dash-auth correto -> chama a Graph API e devolve DataSet.
test('meta-ads GET protegido com senha correta -> 200 DataSet e chama a Graph API', async () => {
  const hash = await sha256Hex('meta-senha');
  const config = {
    name: 'Dash Meta',
    auth: await saltedAuth(hash), // formato v2 salgado (unico aceito)
    source: { meta: { token: 'SEGREDO', account: 'act_999' } },
  };
  const kv = fakeKV({ 'dash:meta1': JSON.stringify(config) });
  const insights = {
    data: [{ date_start: '2026-02-01', campaign_name: 'Campanha B', spend: '30', impressions: '300', clicks: '9', actions: [] }],
  };
  const stub = () => fakeResponse({ ok: true, status: 200, json: insights });

  await comFetchStub(stub, async (contador) => {
    const res = await metaAds(
      ctx('GET', {
        path: 'connectors/meta-ads',
        id: 'meta1',
        headers: { 'x-dash-auth': hash },
        env: { DASHBOARDS_KV: kv },
      })
    );
    assert.equal(res.status, 200);
    const ds = await readJSON(res);
    assert.equal(ds.meta.source, 'meta');
    assert.equal(ds.rows.length, 1);
    assert.equal(ds.rows[0].Campanha, 'Campanha B');
    assert.equal(contador.chamadas, 1, 'com senha correta deve chamar a Graph API');
  });
});

// ---------------------------------------------------------------------------
// D1 (functions/api/connectors/d1.js): reforco
// ---------------------------------------------------------------------------

// 11. GET ?id sem env.DASHBOARD_DB -> 500.
test('d1 GET ?id sem DASHBOARD_DB -> 500', async () => {
  const res = await d1(ctx('GET', { path: 'connectors/d1', id: 'x', env: {} }));
  assert.equal(res.status, 500);
  const j = await readJSON(res);
  assert.match(j.error, /DASHBOARD_DB/);
});

// ---------------------------------------------------------------------------
// RATE LIMIT anti brute force da senha (GRAVE 2) nos conectores protegidos.
// So conta TENTATIVAS ERRADAS: a senha certa nao consome o balde. Limite 8/janela.
// ---------------------------------------------------------------------------

// 12. d1 GET protegido: 8 senhas erradas -> 401; a 9a do mesmo IP -> 429 Retry-After.
test('d1 GET protegido: brute force estoura em 429 apos o limite de senhas erradas', async () => {
  const hash = await sha256Hex('d1-brute');
  const cfg = { name: 'Hist', auth: await saltedAuth(hash) };
  const kv = fakeKV({ 'dash:hist': JSON.stringify(cfg) });
  const db = fakeD1([{ id: 1, dashboard_id: 'hist', captured_at: 'x', dataset_json: JSON.stringify({ columns: [], rows: [], meta: {} }) }]);
  const env = { DASHBOARDS_KV: kv, DASHBOARD_DB: db, DASHBOARD_CACHE: fakeCache() };
  const headers = { 'CF-Connecting-IP': '203.0.113.50', 'x-dash-auth': 'senha-errada' };

  for (let i = 0; i < 8; i++) {
    const r = await d1(ctx('GET', { path: 'connectors/d1', id: 'hist', headers, env }));
    assert.equal(r.status, 401, `tentativa errada ${i + 1} -> 401`);
    assert.equal((await readJSON(r)).needsPassword, true);
  }
  const bloqueada = await d1(ctx('GET', { path: 'connectors/d1', id: 'hist', headers, env }));
  assert.equal(bloqueada.status, 429);
  assert.ok(Number(bloqueada.headers.get('Retry-After')) > 0);
  assert.match((await readJSON(bloqueada)).error, /tentativas|aguarde/i);
});

// 13. Senha CERTA nunca e barrada, mesmo depois de varias tentativas erradas: o
//     contador so conta as erradas, entao o uso legitimo nao toma 429.
test('d1 GET: senha correta nao consome o balde (uso legitimo nao toma 429)', async () => {
  const hash = await sha256Hex('d1-ok');
  const cfg = { name: 'Hist', auth: await saltedAuth(hash) };
  const kv = fakeKV({ 'dash:hist': JSON.stringify(cfg) });
  const dataset = { columns: ['a'], rows: [{ a: 1 }], meta: {} };
  const db = fakeD1([{ id: 1, dashboard_id: 'hist', captured_at: 'x', dataset_json: JSON.stringify(dataset) }]);
  const env = { DASHBOARDS_KV: kv, DASHBOARD_DB: db, DASHBOARD_CACHE: fakeCache() };
  const ip = '203.0.113.51';

  // 5 tentativas erradas (abaixo do limite 8).
  for (let i = 0; i < 5; i++) {
    const r = await d1(ctx('GET', { path: 'connectors/d1', id: 'hist', headers: { 'CF-Connecting-IP': ip, 'x-dash-auth': 'errada' }, env }));
    assert.equal(r.status, 401);
  }
  // Senha certa passa (e nao e barrada mesmo com erradas antes).
  const ok = await d1(ctx('GET', { path: 'connectors/d1', id: 'hist', headers: { 'CF-Connecting-IP': ip, 'x-dash-auth': hash }, env }));
  assert.equal(ok.status, 200);
  // Muitas mais senhas certas seguidas nunca estouram (nao consomem o balde).
  for (let i = 0; i < 20; i++) {
    const r = await d1(ctx('GET', { path: 'connectors/d1', id: 'hist', headers: { 'CF-Connecting-IP': ip, 'x-dash-auth': hash }, env }));
    assert.equal(r.status, 200, 'senha certa nunca toma 429');
  }
});

// 14. meta-ads GET protegido: brute force da senha tambem estoura em 429.
test('meta-ads GET protegido: brute force da senha estoura em 429', async () => {
  const hash = await sha256Hex('meta-brute');
  const cfg = { name: 'Meta', auth: await saltedAuth(hash), source: { meta: { token: 'X', account: 'act_1' } } };
  const kv = fakeKV({ 'dash:m': JSON.stringify(cfg) });
  const env = { DASHBOARDS_KV: kv, DASHBOARD_CACHE: fakeCache() };
  const headers = { 'CF-Connecting-IP': '203.0.113.60', 'x-dash-auth': 'errada' };
  // Stub que falharia o teste se a rede fosse tocada sem senha.
  const stub = () => fakeResponse({ ok: true, status: 200, json: { data: [] } });

  await comFetchStub(stub, async (contador) => {
    for (let i = 0; i < 8; i++) {
      const r = await metaAds(ctx('GET', { path: 'connectors/meta-ads', id: 'm', headers, env }));
      assert.equal(r.status, 401);
    }
    const bloqueada = await metaAds(ctx('GET', { path: 'connectors/meta-ads', id: 'm', headers, env }));
    assert.equal(bloqueada.status, 429);
    assert.equal(contador.chamadas, 0, 'brute force nunca toca a Graph API');
  });
});
