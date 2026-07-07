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
      ctx('POST', { path: 'connectors/meta-ads', body: { token: 'TK', account: 'act_123' } })
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
