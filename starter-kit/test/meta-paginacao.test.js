// Conector Meta Ads 3.8.0: paginação da Graph API (paging.next) com teto de páginas.
//
// Causa do bug: o conector fazia UM fetch e ignorava paging.next. Com time_increment=1 e nível de
// campanha, cada página traz só parte das linhas (padrão de 25): o painel ficava truncado e o total errado.
// Paginação oficial: https://developers.facebook.com/docs/graph-api/results (cursor; "next" é o link da
// próxima página e some na última).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildInsightsUrl, buscarTodasAsPaginas, TETO_DE_PAGINAS, LINHAS_POR_PAGINA,
} from '../functions/lib/meta.mjs';
import { onRequest as metaAds } from '../functions/api/connectors/meta-ads.js';
import worker from '../workers/snapshot/src/index.js';

const BASE = 'https://graph.facebook.com/v25.0/act_1/insights';
const pag = (n) => `${BASE}?access_token=TK&after=CURSOR${n}`;
const linha = (dia, spend, leads) => ({
  date_start: dia, campaign_name: 'C', spend: String(spend), impressions: '10', clicks: '1',
  actions: [{ action_type: 'lead', value: String(leads) }],
});

// Graph fake com 3 páginas: a 1 e a 2 trazem paging.next, a 3 não.
function grafo3Paginas() {
  const paginas = {
    1: { data: [linha('2026-10-01', 10, 1), linha('2026-10-02', 20, 2)], paging: { cursors: { after: 'A' }, next: pag(2) } },
    2: { data: [linha('2026-10-03', 30, 3), linha('2026-10-04', 40, 4)], paging: { cursors: { after: 'B' }, next: pag(3) } },
    3: { data: [linha('2026-10-05', 50, 5)], paging: { cursors: { before: 'B' } } },
  };
  const chamadas = [];
  const fetchFn = async (url) => {
    chamadas.push(String(url));
    const m = String(url).match(/after=CURSOR(\d)/);
    const n = m ? Number(m[1]) : 1;
    return new Response(JSON.stringify(paginas[n]), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetchFn, chamadas };
}

test('URL pede results, cost_per_result, limite por página e a atribuição unificada (igual ao Gerenciador)', () => {
  const qs = new URL(buildInsightsUrl({ token: 'TK', accountId: '1' })).searchParams;
  const fields = qs.get('fields').split(',');
  for (const f of ['campaign_name', 'spend', 'impressions', 'clicks', 'actions', 'results', 'cost_per_result', 'date_start']) {
    assert.ok(fields.includes(f), `fields tem ${f}`);
  }
  assert.equal(qs.get('limit'), String(LINHAS_POR_PAGINA));
  assert.equal(qs.get('use_unified_attribution_setting'), 'true');
});

test('paginação: 3 páginas somam as 5 linhas, na ordem, e param na página sem next', async () => {
  const { fetchFn, chamadas } = grafo3Paginas();
  const json = await buscarTodasAsPaginas(pag(1).replace('&after=CURSOR1', ''), fetchFn);
  assert.equal(chamadas.length, 3);
  assert.deepEqual(json.data.map((d) => d.date_start), ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
  assert.equal(json.paginas, 3);
});

test('paginação: teto de páginas estoura com mensagem clara (e pública, sem o texto cru da Meta)', async () => {
  let n = 0;
  const infinito = async () => {
    n += 1;
    return new Response(JSON.stringify({ data: [linha('2026-10-01', 1, 1)], paging: { next: pag((n % 9) + 1) + `&p=${n}` } }), { status: 200 });
  };
  await assert.rejects(
    () => buscarTodasAsPaginas(BASE, infinito, { tetoDePaginas: 4 }),
    (e) => {
      assert.match(e.message, /mais de 4 páginas/);
      assert.match(e.message, /Encurte o período/);
      assert.equal(e.publico, true);
      return true;
    }
  );
  assert.equal(n, 4, 'não passa do teto');
});

test('paginação: teto padrão existe e é razoável', () => {
  assert.ok(Number.isInteger(TETO_DE_PAGINAS) && TETO_DE_PAGINAS >= 10 && TETO_DE_PAGINAS <= 100);
  assert.ok(LINHAS_POR_PAGINA >= 100 && LINHAS_POR_PAGINA <= 500);
});

test('paginação: erro da Graph no meio (página 2) vira erro claro, com a página, e nada de dado pela metade', async () => {
  let n = 0;
  const fetchFn = async () => {
    n += 1;
    if (n === 1) return new Response(JSON.stringify({ data: [linha('2026-10-01', 1, 1)], paging: { next: pag(2) } }), { status: 200 });
    return new Response(JSON.stringify({ error: { message: 'Please reduce the amount of data', code: 1, type: 'OAuthException' } }), { status: 500 });
  };
  await assert.rejects(
    () => buscarTodasAsPaginas(BASE, fetchFn),
    (e) => {
      assert.match(e.message, /página 2/);
      assert.equal(e.publico, true);
      assert.ok(!e.message.includes('access_token'), 'nunca põe a URL (com o token) na mensagem');
      assert.match(String(e.cause && e.cause.message), /reduce the amount of data/, 'o texto cru fica só na causa (log do servidor)');
      return true;
    }
  );
});

test('paginação: limite de chamadas da Meta no meio (código 17) diz pra esperar', async () => {
  let n = 0;
  const fetchFn = async () => {
    n += 1;
    if (n === 1) return new Response(JSON.stringify({ data: [], paging: { next: pag(2) } }), { status: 200 });
    return new Response(JSON.stringify({ error: { message: 'User request limit reached', code: 17 } }), { status: 400 });
  };
  await assert.rejects(() => buscarTodasAsPaginas(BASE, fetchFn), /limite de chamadas.*minutos/i);
});

test('paginação: erro na página 1 segue como erro comum (o handler esconde o texto da Meta)', async () => {
  const fetchFn = async () => new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token' } }), { status: 400 });
  await assert.rejects(() => buscarTodasAsPaginas(BASE, fetchFn), (e) => {
    assert.match(e.message, /Invalid OAuth/);
    assert.notEqual(e.publico, true);
    return true;
  });
});

test('paginação: resposta que não é JSON no meio vira erro claro', async () => {
  let n = 0;
  const fetchFn = async () => {
    n += 1;
    if (n === 1) return new Response(JSON.stringify({ data: [], paging: { next: pag(2) } }), { status: 200 });
    return new Response('<html>502 Bad Gateway</html>', { status: 502 });
  };
  await assert.rejects(() => buscarTodasAsPaginas(BASE, fetchFn), /página 2/);
});

test('paginação: só segue next da própria Graph API (link de outro host é recusado)', async () => {
  const fetchFn = async () => new Response(JSON.stringify({ data: [], paging: { next: 'https://evil.example.com/x' } }), { status: 200 });
  await assert.rejects(() => buscarTodasAsPaginas(BASE, fetchFn), /fora da Graph API/);
});

test('paginação: next repetido não entra em laço', async () => {
  let n = 0;
  const fetchFn = async () => { n += 1; return new Response(JSON.stringify({ data: [], paging: { next: pag(2) } }), { status: 200 }); };
  await assert.rejects(() => buscarTodasAsPaginas(BASE, fetchFn), /repetiu/);
  assert.ok(n <= 3);
});

// ---------------------------------------------------------------------------
// Caminho real: handler do Pages e Worker do modo histórico seguem as páginas.
// ---------------------------------------------------------------------------
async function comFetch(fetchFn, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = fetchFn;
  try { return await fn(); } finally { globalThis.fetch = original; }
}

test('handler: POST preview soma as 3 páginas (5 linhas) e não para na primeira', async () => {
  const { fetchFn, chamadas } = grafo3Paginas();
  await comFetch(fetchFn, async () => {
    const req = new Request('https://x/api/connectors/meta-ads', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': 'adm' },
      body: JSON.stringify({ token: 'TK', account: '1' }),
    });
    const res = await metaAds({ request: req, env: { ADMIN_TOKEN: 'adm' } });
    assert.equal(res.status, 200);
    const ds = await res.json();
    assert.equal(ds.rows.length, 5);
    assert.equal(ds.rows.reduce((s, r) => s + Number(r.Leads), 0), 15);
    assert.equal(chamadas.length, 3);
  });
});

test('handler: erro no meio da paginação devolve a mensagem clara (não a genérica de token)', async () => {
  let n = 0;
  const fetchFn = async () => {
    n += 1;
    if (n === 1) return new Response(JSON.stringify({ data: [linha('2026-10-01', 1, 1)], paging: { next: pag(2) } }), { status: 200 });
    return new Response(JSON.stringify({ error: { message: 'Service temporarily unavailable', code: 2 } }), { status: 503 });
  };
  await comFetch(fetchFn, async () => {
    const req = new Request('https://x/api/connectors/meta-ads', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': 'adm' },
      body: JSON.stringify({ token: 'TK', account: '1' }),
    });
    const res = await metaAds({ request: req, env: { ADMIN_TOKEN: 'adm' } });
    assert.equal(res.status, 502);
    const j = await res.json();
    assert.match(j.error, /página 2/);
    assert.ok(!/Service temporarily/.test(j.error), 'o texto cru da Meta não vai pro navegador');
  });
});

test('worker: snapshot da Meta grava as 5 linhas das 3 páginas', async () => {
  const { fetchFn } = grafo3Paginas();
  const inserts = [];
  const env = {
    DASHBOARDS_KV: {
      async list() { return { keys: [{ name: 'dash:m' }] }; },
      async get() { return JSON.stringify({ id: 'm', source: { type: 'meta', meta: { token: 'TK', account: '1' } } }); },
    },
    // 3.9.0: o Worker grava por dia num db.batch (tabela snapshot_dias).
    DASHBOARD_DB: {
      prepare(sql) { return { sql, bind(...p) { this.p = p; return this; }, async run() { inserts.push({ sql, params: this.p }); return { success: true }; } }; },
      async batch(stmts) { for (const s of stmts) await s.run(); return []; },
    },
  };
  const log = console.log;
  console.log = () => {};
  try {
    await comFetch(fetchFn, () => worker.scheduled({}, env, { waitUntil() {} }));
  } finally { console.log = log; }
  const dias = inserts.filter((i) => /^INSERT INTO snapshot_dias/.test(i.sql));
  assert.ok(dias.length >= 1);
  const linhas = dias.reduce((s, i) => s + JSON.parse(i.params[5]).length, 0);
  assert.equal(linhas, 5, 'as 5 linhas das 3 páginas, repartidas por dia');
});
