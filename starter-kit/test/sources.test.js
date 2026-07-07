// Testes do registry de FONTES (public/assets/js/sources/index.js) e dos helpers
// puros de admin token do api-client (adminHeader/setAdminToken lendo localStorage).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getSource, SOURCES, sourceTypes, historyTypes } from '../public/assets/js/sources/index.js';
import {
  adminHeader,
  setAdminToken,
  saveDashboard,
  deleteDashboard,
  liveFetcherTypes,
} from '../public/assets/js/lib/api-client.js';
import { snapshotFetcherTypes } from '../workers/snapshot/src/index.js';

// Stub de fetch: captura chamadas e devolve a Response dada (ou funcao).
function stubFetch(respond) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    return typeof respond === 'function' ? respond(String(url), init || {}) : respond;
  };
  return { calls, restore() { globalThis.fetch = original; } };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Registry de fontes
// ---------------------------------------------------------------------------

test('SOURCES tem as fontes conhecidas com label e canHistory', () => {
  assert.equal(SOURCES.sheets.label, 'Google Sheets');
  assert.equal(SOURCES.sheets.canHistory, true);
  assert.equal(SOURCES.csv.label, 'CSV');
  assert.equal(SOURCES.csv.canHistory, false);
  assert.equal(SOURCES.meta.label, 'Meta Ads');
  assert.equal(SOURCES.meta.canHistory, true);
  assert.equal(SOURCES.d1.label, 'Historico (D1)');
  assert.equal(SOURCES.d1.canHistory, false);
});

test('getSource devolve o descritor pelo tipo', () => {
  assert.equal(getSource('sheets').label, 'Google Sheets');
  assert.equal(getSource('meta').canHistory, true);
});

test('getSource de tipo desconhecido devolve undefined', () => {
  assert.equal(getSource('planilha-magica'), undefined);
  assert.equal(getSource(undefined), undefined);
  assert.equal(getSource(null), undefined);
});

test('label: getSource(type)?.label cai no proprio type quando desconhecido', () => {
  // Espelha a logica do rodape do dashboard.js.
  const label = (t) => (getSource(t) && getSource(t).label) || t || 'fonte';
  assert.equal(label('sheets'), 'Google Sheets');
  assert.equal(label('meta'), 'Meta Ads');
  assert.equal(label('desconhecida'), 'desconhecida');
  assert.equal(label(''), 'fonte');
});

test('canHistory: so sheets e meta suportam historico', () => {
  const pode = (t) => !!(getSource(t) && getSource(t).canHistory);
  assert.equal(pode('sheets'), true);
  assert.equal(pode('meta'), true);
  assert.equal(pode('csv'), false);
  assert.equal(pode('d1'), false);
  assert.equal(pode('nada'), false);
});

// ---------------------------------------------------------------------------
// Paridade: registry x fetchers do api-client (live) e do Worker (snapshot)
// ---------------------------------------------------------------------------
// O "como buscar" mora em dois ambientes (browser via Functions, Worker via API
// externa), mas as CHAVES sao coladas ao registry. Estes testes garantem que
// adicionar uma fonte nova sem o fetcher correspondente quebra AQUI, nao em
// producao.

test('paridade worker: todo type com canHistory:true tem fetcher no Worker de snapshot', () => {
  const historicos = historyTypes().sort();
  const fetchers = snapshotFetcherTypes().sort();
  // Todo historico precisa de fetcher no Worker...
  for (const type of historicos) {
    assert.ok(
      fetchers.includes(type),
      `fonte '${type}' tem canHistory:true mas nao tem fetcher no Worker de snapshot`,
    );
  }
  // ...e nenhum fetcher do Worker pode ser de fonte sem canHistory (ou fora do registry).
  for (const type of fetchers) {
    assert.ok(getSource(type), `Worker tem fetcher '${type}' que nao existe no registry`);
    assert.equal(getSource(type).canHistory, true, `Worker tem fetcher '${type}' mas ele nao e canHistory`);
  }
  // Cobertura exata: os dois conjuntos batem.
  assert.deepEqual(fetchers, historicos, 'fetchers do Worker devem cobrir exatamente os historyTypes()');
});

test('paridade api-client: todo type em LIVE_FETCHERS existe no registry', () => {
  for (const type of liveFetcherTypes()) {
    assert.ok(getSource(type), `LIVE_FETCHERS tem '${type}' que nao existe no registry de fontes`);
  }
});

test('paridade api-client: todo type do registry (menos d1) tem fetcher live', () => {
  // 'd1' e servido pela funcao dedicada fetchD1(id), fora do roteamento de LIVE_FETCHERS.
  const dedicados = new Set(['d1']);
  const live = new Set(liveFetcherTypes());
  for (const type of sourceTypes()) {
    if (dedicados.has(type)) continue;
    assert.ok(live.has(type), `fonte '${type}' esta no registry mas sem fetcher live em api-client.js`);
  }
});

// ---------------------------------------------------------------------------
// Admin token: adminHeader/setAdminToken lendo localStorage
// ---------------------------------------------------------------------------

// localStorage minimo em memoria (nao existe no Node).
function stubLocalStorage(initial = {}) {
  const original = globalThis.localStorage;
  const store = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  return {
    store,
    restore() { globalThis.localStorage = original; },
  };
}

test('adminHeader sem token guardado devolve {}', () => {
  const ls = stubLocalStorage();
  try {
    assert.deepEqual(adminHeader(), {});
  } finally {
    ls.restore();
  }
});

test('adminHeader devolve x-admin-token quando ha token guardado', () => {
  const ls = stubLocalStorage({ 'cd-admin-token': 'segredo-123' });
  try {
    assert.deepEqual(adminHeader(), { 'x-admin-token': 'segredo-123' });
  } finally {
    ls.restore();
  }
});

test('setAdminToken grava e adminHeader passa a devolver o header', () => {
  const ls = stubLocalStorage();
  try {
    assert.deepEqual(adminHeader(), {});
    setAdminToken('tok-abc');
    assert.equal(ls.store.get('cd-admin-token'), 'tok-abc');
    assert.deepEqual(adminHeader(), { 'x-admin-token': 'tok-abc' });
  } finally {
    ls.restore();
  }
});

test('setAdminToken com valor vazio remove o token guardado', () => {
  const ls = stubLocalStorage({ 'cd-admin-token': 'antigo' });
  try {
    setAdminToken('');
    assert.equal(ls.store.has('cd-admin-token'), false);
    assert.deepEqual(adminHeader(), {});
  } finally {
    ls.restore();
  }
});

test('adminHeader e resiliente a ausencia de localStorage (devolve {})', () => {
  const original = globalThis.localStorage;
  delete globalThis.localStorage;
  try {
    assert.deepEqual(adminHeader(), {});
  } finally {
    globalThis.localStorage = original;
  }
});

// ---------------------------------------------------------------------------
// saveDashboard/deleteDashboard: mandam x-admin-token e propagam needsAdmin
// ---------------------------------------------------------------------------

test('saveDashboard sem token guardado NAO manda x-admin-token', async () => {
  const ls = stubLocalStorage();
  const f = stubFetch(jsonResponse({ id: 'x' }));
  try {
    await saveDashboard({ name: 'X' });
    assert.equal(f.calls[0].init.headers['x-admin-token'], undefined);
  } finally {
    f.restore(); ls.restore();
  }
});

test('saveDashboard COM token guardado manda x-admin-token', async () => {
  const ls = stubLocalStorage({ 'cd-admin-token': 'tok-9' });
  const f = stubFetch(jsonResponse({ id: 'x' }));
  try {
    await saveDashboard({ name: 'X' });
    assert.equal(f.calls[0].init.headers['x-admin-token'], 'tok-9');
    assert.equal(f.calls[0].init.method, 'POST');
  } finally {
    f.restore(); ls.restore();
  }
});

test('saveDashboard em 401 needsAdmin lanca Error com .needsAdmin true', async () => {
  const ls = stubLocalStorage();
  const f = stubFetch(jsonResponse({ needsAdmin: true, error: 'precisa token' }, 401));
  try {
    await assert.rejects(
      () => saveDashboard({ name: 'X' }),
      (err) => { assert.equal(err.needsAdmin, true); return true; },
    );
  } finally {
    f.restore(); ls.restore();
  }
});

test('deleteDashboard COM token guardado manda x-admin-token e DELETE', async () => {
  const ls = stubLocalStorage({ 'cd-admin-token': 'tok-del' });
  const f = stubFetch(jsonResponse({ ok: true }));
  try {
    await deleteDashboard('meu-id');
    assert.equal(f.calls[0].init.method, 'DELETE');
    assert.equal(f.calls[0].init.headers['x-admin-token'], 'tok-del');
    const u = new URL(f.calls[0].url, 'https://base');
    assert.equal(u.searchParams.get('id'), 'meu-id');
  } finally {
    f.restore(); ls.restore();
  }
});

test('deleteDashboard em 401 needsAdmin lanca Error com .needsAdmin true', async () => {
  const ls = stubLocalStorage();
  const f = stubFetch(jsonResponse({ needsAdmin: true }, 401));
  try {
    await assert.rejects(
      () => deleteDashboard('id'),
      (err) => { assert.equal(err.needsAdmin, true); return true; },
    );
  } finally {
    f.restore(); ls.restore();
  }
});
