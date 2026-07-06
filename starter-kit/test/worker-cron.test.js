// Teste do handler scheduled (cron) do Worker de snapshot do modo histórico.
// Único caminho de runtime do modo histórico e antes sem cobertura.
//
// Estratégia: montar KV e D1 fakes em memória, stubar o globalThis.fetch (para o
// Worker rodar sem rede real) e chamar worker.scheduled(event, env, ctx) direto.
// O fetch original é salvo e restaurado no finally de cada caso.
//
// Casos cobertos:
//  1. Fontes sheets e meta geram INSERT no D1 (2 snapshots), com dashboard_id
//     certo e dataset_json parseável (columns/rows).
//  2. Fonte csv NÃO gera snapshot (é estática, pulada).
//  3. Config corrompida NÃO gera snapshot e NÃO lança (as outras continuam).
//  4. Erro numa fonte (sheets com fetch !ok) não derruba as demais: a fonte
//     meta ainda grava (try/catch por dashboard).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import worker from '../workers/snapshot/src/index.js';

// ---------------------------------------------------------------------------
// Helpers de infra fake
// ---------------------------------------------------------------------------

// KV fake em memória. list({prefix}) devolve {keys:[{name}]}; get devolve
// string JSON ou null, igual ao KV real.
function fakeKV(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    async list({ prefix } = {}) {
      const keys = [];
      for (const name of map.keys()) {
        if (!prefix || name.startsWith(prefix)) keys.push({ name });
      }
      return { keys };
    },
    async get(name) {
      return map.has(name) ? map.get(name) : null;
    },
  };
}

// D1 fake: registra cada INSERT (sql + params) num array pra inspeção.
function fakeD1() {
  const inserts = [];
  return {
    inserts,
    prepare(sql) {
      return {
        _sql: sql,
        _params: [],
        bind(...p) {
          this._params = p;
          return this;
        },
        async run() {
          inserts.push({ sql: this._sql, params: this._params });
          return { success: true };
        },
      };
    },
  };
}

// CSV de exemplo que o gviz devolveria para a fonte sheets.
const SHEETS_CSV = 'Data,Campanha,Investimento\n2026-07-01,Camp A,100\n2026-07-02,Camp B,200\n';

// JSON de insights de exemplo que a Graph API devolveria para a fonte meta.
const META_JSON = {
  data: [
    {
      date_start: '2026-07-01',
      campaign_name: 'Meta Camp',
      spend: '50',
      impressions: '1000',
      clicks: '80',
      actions: [
        { action_type: 'lead', value: '7' },
        { action_type: 'purchase', value: '3' },
      ],
    },
  ],
};

// Monta um fetch stub. As respostas são configuráveis por host, pra simular
// tanto sucesso quanto erro (!ok) por fonte.
function makeFetchStub({ sheetsOk = true, metaOk = true } = {}) {
  const calls = [];
  async function fetchStub(url) {
    calls.push(String(url));
    const u = String(url);
    if (u.includes('docs.google.com')) {
      if (!sheetsOk) return new Response('forbidden', { status: 403 });
      return new Response(SHEETS_CSV, { status: 200 });
    }
    if (u.includes('graph.facebook.com')) {
      if (!metaOk) {
        return new Response(JSON.stringify({ error: { message: 'token inválido' } }), { status: 400 });
      }
      return new Response(JSON.stringify(META_JSON), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  }
  fetchStub.calls = calls;
  return fetchStub;
}

// Configs de dashboard para popular o KV.
const CFG_SHEETS = JSON.stringify({
  id: 'dash-sheets',
  source: { type: 'sheets', url: 'https://docs.google.com/spreadsheets/d/ABC123/edit', gid: '0' },
});
const CFG_META = JSON.stringify({
  id: 'dash-meta',
  source: { type: 'meta', meta: { token: 'tok', account: '99988877', since: '2026-07-01', until: '2026-07-02' } },
});
const CFG_CSV = JSON.stringify({
  id: 'dash-csv',
  source: { type: 'csv', columns: ['A'], rows: [{ A: '1' }] },
});
const CFG_CORROMPIDA = '{ isto nao e json valido ';

const EVENT = {};
const CTX = { waitUntil() {} };

// ---------------------------------------------------------------------------
// Caso 1 + 2 + 3: sheets e meta gravam; csv e corrompida são puladas.
// ---------------------------------------------------------------------------
test('scheduled: grava sheets e meta, pula csv e config corrompida', async () => {
  const env = {
    DASHBOARDS_KV: fakeKV({
      'dash:sheets': CFG_SHEETS,
      'dash:meta': CFG_META,
      'dash:csv': CFG_CSV,
      'dash:corrompida': CFG_CORROMPIDA,
    }),
    DASHBOARD_DB: fakeD1(),
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = makeFetchStub({ sheetsOk: true, metaOk: true });
  try {
    // Não deve lançar mesmo com a config corrompida presente.
    await worker.scheduled(EVENT, env, CTX);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const inserts = env.DASHBOARD_DB.inserts;

  // Caso 1 + 2 + 3: exatamente 2 snapshots (sheets + meta). csv e corrompida fora.
  assert.equal(inserts.length, 2, 'esperado exatamente 2 INSERTs (sheets + meta)');

  // Indexa por dashboard_id (params: [dashboard_id, capturedAt, dataset_json]).
  const porId = new Map(inserts.map((ins) => [ins.params[0], ins]));

  // Caso 1: dashboard_id certo para cada fonte.
  assert.ok(porId.has('dash-sheets'), 'snapshot de sheets deve existir');
  assert.ok(porId.has('dash-meta'), 'snapshot de meta deve existir');

  // Caso 2: csv não gera snapshot.
  assert.ok(!porId.has('dash-csv'), 'csv não deve gerar snapshot');

  // Caso 3: config corrompida não gera snapshot.
  assert.ok(!porId.has('dash-corrompida'), 'config corrompida não deve gerar snapshot');

  // Caso 1: dataset_json parseável com columns/rows para sheets.
  const dsSheets = JSON.parse(porId.get('dash-sheets').params[2]);
  assert.ok(Array.isArray(dsSheets.columns), 'dataset sheets deve ter columns array');
  assert.ok(Array.isArray(dsSheets.rows), 'dataset sheets deve ter rows array');
  assert.deepEqual(dsSheets.columns, ['Data', 'Campanha', 'Investimento']);
  assert.equal(dsSheets.rows.length, 2, 'CSV de exemplo tem 2 linhas de dados');

  // Caso 1: dataset_json parseável com columns/rows para meta.
  const dsMeta = JSON.parse(porId.get('dash-meta').params[2]);
  assert.ok(Array.isArray(dsMeta.columns), 'dataset meta deve ter columns array');
  assert.ok(Array.isArray(dsMeta.rows), 'dataset meta deve ter rows array');
  assert.equal(dsMeta.rows.length, 1, 'JSON de insights de exemplo tem 1 linha');
  assert.equal(dsMeta.rows[0].Campanha, 'Meta Camp');
});

// ---------------------------------------------------------------------------
// Caso 4: erro numa fonte (sheets !ok) não derruba as demais (meta ainda grava).
// ---------------------------------------------------------------------------
test('scheduled: falha no fetch da sheets não impede o snapshot da meta', async () => {
  const env = {
    DASHBOARDS_KV: fakeKV({
      'dash:sheets': CFG_SHEETS,
      'dash:meta': CFG_META,
    }),
    DASHBOARD_DB: fakeD1(),
  };

  const originalFetch = globalThis.fetch;
  // sheets responde !ok (403); meta responde ok.
  globalThis.fetch = makeFetchStub({ sheetsOk: false, metaOk: true });
  try {
    // O try/catch por dashboard deve engolir a falha da sheets sem lançar.
    await worker.scheduled(EVENT, env, CTX);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const inserts = env.DASHBOARD_DB.inserts;
  const ids = inserts.map((ins) => ins.params[0]);

  // A sheets falhou (fetch !ok -> throw), então não gravou.
  assert.ok(!ids.includes('dash-sheets'), 'sheets com erro não deve gravar snapshot');

  // A meta continua e grava normalmente: prova o try/catch por dashboard.
  assert.ok(ids.includes('dash-meta'), 'meta deve gravar mesmo com a sheets falhando');
  assert.equal(inserts.length, 1, 'apenas o snapshot de meta deve existir');
});
