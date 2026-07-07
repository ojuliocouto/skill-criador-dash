// Testa o roteamento PURO do cliente de API (public/assets/js/lib/api-client.js).
// Sem rede real: stub de globalThis.fetch que registra a chamada e devolve uma
// Response controlada. sessionStorage tambem e stubado (nao existe no Node).
// Tudo restaurado no finally de cada teste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchDataForSource,
  getDashboard,
} from '../public/assets/js/lib/api-client.js';

// Cria um stub de fetch que captura a ultima chamada e devolve a Response dada.
// `respond` pode ser uma Response pronta ou uma funcao (url, init) => Response.
function stubFetch(respond) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    const r = typeof respond === 'function' ? respond(String(url), init || {}) : respond;
    return r;
  };
  return {
    calls,
    restore() { globalThis.fetch = original; },
  };
}

// sessionStorage minimo em memoria.
function stubSessionStorage(initial = {}) {
  const original = globalThis.sessionStorage;
  const store = new Map(Object.entries(initial));
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  return {
    restore() { globalThis.sessionStorage = original; },
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// ---- fetchDataForSource: roteamento por tipo de fonte ----

test('fetchDataForSource: sheets chama /api/connectors/sheets com url e gid', async () => {
  const f = stubFetch(jsonResponse({ columns: [], rows: [] }));
  try {
    await fetchDataForSource({ type: 'sheets', url: 'https://docs/x', gid: '7' });
    assert.equal(f.calls.length, 1);
    const u = new URL(f.calls[0].url, 'https://base');
    assert.equal(u.pathname, '/api/connectors/sheets');
    assert.equal(u.searchParams.get('url'), 'https://docs/x');
    assert.equal(u.searchParams.get('gid'), '7');
  } finally {
    f.restore();
  }
});

test('fetchDataForSource: sheets sem gid usa gid=0', async () => {
  const f = stubFetch(jsonResponse({ columns: [], rows: [] }));
  try {
    await fetchDataForSource({ type: 'sheets', url: 'https://docs/y' });
    const u = new URL(f.calls[0].url, 'https://base');
    assert.equal(u.searchParams.get('gid'), '0');
  } finally {
    f.restore();
  }
});

test('fetchDataForSource: csv faz POST /api/connectors/csv com o corpo', async () => {
  const f = stubFetch(jsonResponse({ columns: [], rows: [] }));
  try {
    await fetchDataForSource({ type: 'csv', data: 'a,b\n1,2' });
    assert.equal(f.calls.length, 1);
    const u = new URL(f.calls[0].url, 'https://base');
    assert.equal(u.pathname, '/api/connectors/csv');
    assert.equal(f.calls[0].init.method, 'POST');
    assert.equal(f.calls[0].init.body, 'a,b\n1,2');
  } finally {
    f.restore();
  }
});

test('fetchDataForSource: meta chama /api/connectors/meta-ads?id=', async () => {
  const f = stubFetch(jsonResponse({ columns: [], rows: [] }));
  const ss = stubSessionStorage(); // sem auth guardado
  try {
    await fetchDataForSource({ type: 'meta' }, 'dash-42');
    assert.equal(f.calls.length, 1);
    const u = new URL(f.calls[0].url, 'https://base');
    assert.equal(u.pathname, '/api/connectors/meta-ads');
    assert.equal(u.searchParams.get('id'), 'dash-42');
  } finally {
    ss.restore();
    f.restore();
  }
});

test('fetchDataForSource: tipo desconhecido lanca Error', async () => {
  const f = stubFetch(jsonResponse({}));
  try {
    await assert.rejects(
      () => fetchDataForSource({ type: 'planilha-magica' }),
      /desconhecido/i,
    );
    // nao deve ter tocado a rede
    assert.equal(f.calls.length, 0);
  } finally {
    f.restore();
  }
});

test('fetchDataForSource: sem fonte/tipo lanca Error', async () => {
  const f = stubFetch(jsonResponse({}));
  try {
    await assert.rejects(() => fetchDataForSource(null), /não configurada|configurada/i);
    await assert.rejects(() => fetchDataForSource({}), /não configurada|configurada/i);
    assert.equal(f.calls.length, 0);
  } finally {
    f.restore();
  }
});

// NOTA: fetchDataForSource NAO trata o tipo 'd1'. O modo historico usa a funcao
// dedicada fetchD1(id) (exportada a parte), fora do switch de fetchDataForSource.
// Por isso 'd1' cairia no ramo de "tipo desconhecido" acima.
test("fetchDataForSource: 'd1' nao e tratado aqui (cai em desconhecido)", async () => {
  const f = stubFetch(jsonResponse({}));
  try {
    await assert.rejects(() => fetchDataForSource({ type: 'd1' }), /desconhecido/i);
    assert.equal(f.calls.length, 0);
  } finally {
    f.restore();
  }
});

// ---- getDashboard: status, needsPassword e header de auth ----

test('getDashboard: 200 devolve o JSON do corpo', async () => {
  const f = stubFetch(jsonResponse({ id: 'd1', name: 'Meu Dash' }));
  const ss = stubSessionStorage();
  try {
    const data = await getDashboard('d1');
    assert.equal(data.id, 'd1');
    assert.equal(data.name, 'Meu Dash');
    const u = new URL(f.calls[0].url, 'https://base');
    assert.equal(u.pathname, '/api/dashboards');
    assert.equal(u.searchParams.get('id'), 'd1');
  } finally {
    ss.restore();
    f.restore();
  }
});

test('getDashboard: 401 com needsPassword lanca Error com .needsPassword true', async () => {
  const f = stubFetch(jsonResponse({ needsPassword: true, error: 'Senha necessária.' }, 401));
  const ss = stubSessionStorage();
  try {
    await assert.rejects(
      () => getDashboard('protegido'),
      (err) => {
        assert.ok(err instanceof Error);
        assert.equal(err.needsPassword, true);
        return true;
      },
    );
  } finally {
    ss.restore();
    f.restore();
  }
});

test('getDashboard: manda header x-dash-auth quando ha hash na sessao', async () => {
  const f = stubFetch(jsonResponse({ id: 'd1' }));
  const ss = stubSessionStorage({ 'dashauth:d1': 'hash-abc' });
  try {
    await getDashboard('d1');
    const headers = f.calls[0].init.headers || {};
    assert.equal(headers['x-dash-auth'], 'hash-abc');
  } finally {
    ss.restore();
    f.restore();
  }
});

test('getDashboard: sem hash na sessao nao manda x-dash-auth', async () => {
  const f = stubFetch(jsonResponse({ id: 'd1' }));
  const ss = stubSessionStorage();
  try {
    await getDashboard('d1');
    const headers = f.calls[0].init.headers || {};
    assert.equal(headers['x-dash-auth'], undefined);
  } finally {
    ss.restore();
    f.restore();
  }
});
