// Achado 6 da auditoria de 25/10/2026 [Alto]: a raiz do site listava todo painel sem senha para qualquer um,
// e GET /api/dashboards?id=<id> devolvia o CSV inteiro (receita, colunas que o painel nem usa) e o link
// da planilha do Google. Bastava abrir a raiz para descobrir os painéis e baixar o dado bruto.
//
// Regra nova:
//  1. A LISTA de painéis exige a chave de administrador (a mesma das mutações, modelo fail-closed).
//  2. A leitura de UM painel por quem não é administrador devolve a "vista do painel": só as colunas que o
//     painel usa (as do colMap), sem o link da planilha, sem a conta do Meta. A senha do painel vale igual.
//  3. Os dados por id (planilha e histórico) saem com as mesmas colunas da vista do painel.
//  4. Com a chave de administrador, a config volta inteira (sem segredo): é o que o assistente usa para editar.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { onRequest as dashboards } from '../functions/api/dashboards.js';
import { onRequest as sheets } from '../functions/api/connectors/sheets.js';
import { onRequest as d1 } from '../functions/api/connectors/d1.js';
import { onRequest as csvConector } from '../functions/api/connectors/csv.js';
import { derivePasswordAuth } from '../functions/lib/auth-config.mjs';
import { sha256Hex } from '../public/assets/js/lib/auth.js';

const ADMIN = 'chave-do-dono';

function fakeKV(initial = {}) {
  const map = new Map(Object.entries(initial).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  return {
    async get(k) { return map.has(k) ? map.get(k) : null; },
    async put(k, v) { map.set(k, String(v)); },
    async delete(k) { map.delete(k); },
    async list({ prefix } = {}) { return { keys: [...map.keys()].filter((n) => !prefix || n.startsWith(prefix)).map((name) => ({ name })) }; },
  };
}

const CSV = [
  'Data,Canal,Investimento,Leads,Vendas,Receita,E-mail do comprador,Telefone',
  '2026-10-01,Meta Ads,100,10,2,994,ana@exemplo.com,11999990000',
  '2026-10-02,Google Ads,"1.234,50",5,1,497,"bia@exemplo.com",11888880000',
].join('\n');

const COLMAP = { data: 'Data', canal: 'Canal', investimento: 'Investimento', leads: 'Leads', conversoes: 'Vendas', receita: 'Receita' };

const PAINEL_CSV = { id: 'curso-planilhas', name: 'Curso Planilhas', domain: 'marketing', createdAt: '2026-10-01T00:00:00.000Z', colMap: COLMAP, source: { type: 'csv', data: CSV } };
const PAINEL_SHEETS = { id: 'planilha-aberta', name: 'Planilha aberta', domain: 'marketing', createdAt: '2026-10-02T00:00:00.000Z', colMap: { data: 'Data', investimento: 'Investimento', receita: 'Receita' }, source: { type: 'sheets', url: 'https://docs.google.com/spreadsheets/d/ABC123segredo/edit', gid: '7' } };
const PAINEL_META = { id: 'meta-aberto', name: 'Meta aberto', domain: 'marketing', createdAt: '2026-10-03T00:00:00.000Z', colMap: { data: 'Data', investimento: 'Investimento' }, source: { type: 'meta', meta: { token: 'EAAGsegredo', account: 'act_123', since: '2026-09-01', until: '2026-10-01' } } };

async function ambiente({ comSenha = false } = {}) {
  const protegido = { ...PAINEL_CSV, id: 'dash-0123456789abcdef', name: 'Protegido', auth: await derivePasswordAuth(await sha256Hex('s3nha')) };
  const kv = fakeKV({
    'dash:curso-planilhas': PAINEL_CSV,
    'dash:planilha-aberta': PAINEL_SHEETS,
    'dash:meta-aberto': PAINEL_META,
    ...(comSenha ? { 'dash:dash-0123456789abcdef': protegido } : {}),
  });
  return { kv, env: { DASHBOARDS_KV: kv, ADMIN_TOKEN: ADMIN } };
}

const get = (fn, url, env, headers = {}) => fn({ request: new Request(`https://painel.test${url}`, { method: 'GET', headers }), env });
const corpo = async (res) => { const t = await res.text(); try { return JSON.parse(t); } catch { return t; } };

// ---- 1. a lista ----
test('anônimo não lista: GET /api/dashboards sem a chave -> 401 needsAdmin, sem id nem nome no corpo', async () => {
  const { env } = await ambiente();
  const res = await get(dashboards, '/api/dashboards', env);
  assert.equal(res.status, 401);
  const j = await corpo(res);
  assert.equal(j.needsAdmin, true);
  const texto = JSON.stringify(j);
  assert.ok(!/curso-planilhas|Curso Planilhas|planilha-aberta|meta-aberto/.test(texto), `a resposta vazou painel: ${texto}`);
});

test('anônimo não lista: chave errada -> 401; servidor sem ADMIN_TOKEN -> 403 (fail-closed)', async () => {
  const { kv, env } = await ambiente();
  assert.equal((await get(dashboards, '/api/dashboards', env, { 'x-admin-token': 'chute' })).status, 401);
  const semChave = await get(dashboards, '/api/dashboards', { DASHBOARDS_KV: kv });
  assert.equal(semChave.status, 403);
  assert.equal((await corpo(semChave)).adminNotConfigured, true);
});

test('com a chave de administrador a lista sai como antes', async () => {
  const { env } = await ambiente();
  const res = await get(dashboards, '/api/dashboards', env, { 'x-admin-token': ADMIN });
  assert.equal(res.status, 200);
  const lista = await corpo(res);
  assert.deepEqual(lista.map((d) => d.id).sort(), ['curso-planilhas', 'meta-aberto', 'planilha-aberta']);
  assert.ok(lista.every((d) => !d.source), 'a lista nunca leva a fonte');
});

// ---- 2. a vista do painel ----
test('anônimo não baixa o CSV bruto: a vista do painel leva só as colunas do colMap', async () => {
  const { env } = await ambiente();
  const res = await get(dashboards, '/api/dashboards?id=curso-planilhas', env);
  assert.equal(res.status, 200);
  const cfg = await corpo(res);
  const texto = JSON.stringify(cfg);
  for (const bruto of ['ana@exemplo.com', 'bia@exemplo.com', 'E-mail do comprador', 'Telefone', '11999990000']) {
    assert.ok(!texto.includes(bruto), `a vista do painel vazou "${bruto}"`);
  }
  // O que o painel mostra continua lá (inclusive a Receita, que é um número do painel).
  const parsed = await corpo(await csvConector({ request: new Request('https://painel.test/api/connectors/csv', { method: 'POST', headers: { 'content-type': 'text/csv' }, body: cfg.source.data }) }));
  assert.deepEqual(parsed.columns, ['Data', 'Canal', 'Investimento', 'Leads', 'Vendas', 'Receita']);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[1].Investimento, '1.234,50', 'valor com vírgula sobrevive à poda');
  assert.equal(parsed.rows[0].Receita, '994');
  assert.deepEqual(cfg.colMap, COLMAP);
});

test('anônimo não pega o link da planilha nem a conta do Meta', async () => {
  const { env } = await ambiente();
  const planilha = await corpo(await get(dashboards, '/api/dashboards?id=planilha-aberta', env));
  assert.equal(planilha.source.type, 'sheets');
  assert.ok(!JSON.stringify(planilha).includes('ABC123segredo'), 'o link da planilha não sai para anônimo');
  assert.equal(planilha.source.url, undefined);
  const meta = await corpo(await get(dashboards, '/api/dashboards?id=meta-aberto', env));
  assert.deepEqual(meta.source, { type: 'meta' });
});

test('com a chave de administrador o GET devolve a config inteira (o assistente edita com ela), sem segredo', async () => {
  const { env } = await ambiente();
  const cfg = await corpo(await get(dashboards, '/api/dashboards?id=curso-planilhas', env, { 'x-admin-token': ADMIN }));
  assert.equal(cfg.source.data, CSV);
  const planilha = await corpo(await get(dashboards, '/api/dashboards?id=planilha-aberta', env, { 'x-admin-token': ADMIN }));
  assert.equal(planilha.source.url, PAINEL_SHEETS.source.url);
  const meta = await corpo(await get(dashboards, '/api/dashboards?id=meta-aberto', env, { 'x-admin-token': ADMIN }));
  assert.equal(meta.source.meta.account, 'act_123');
  assert.equal(meta.source.meta.token, undefined, 'o token do Meta nunca sai');
});

test('painel com senha: sem a senha nada sai, nem para quem tem o link', async () => {
  const { env } = await ambiente({ comSenha: true });
  const res = await get(dashboards, '/api/dashboards?id=dash-0123456789abcdef', env);
  assert.equal(res.status, 401);
  const texto = JSON.stringify(await corpo(res));
  assert.ok(!texto.includes('994') && !texto.includes('Receita'), 'nenhum dado sai sem a senha');
  const comSenha = await corpo(await get(dashboards, '/api/dashboards?id=dash-0123456789abcdef', env, { 'x-dash-auth': await sha256Hex('s3nha') }));
  assert.ok(!JSON.stringify(comSenha).includes('ana@exemplo.com'), 'com a senha, ainda só a vista do painel');
});

// ---- 3. os dados por id ----
async function comPlanilha(fn) {
  const original = globalThis.fetch;
  const pedidos = [];
  globalThis.fetch = async (url) => { pedidos.push(String(url)); return new Response('Data,Investimento,Receita,CPF do aluno\n2026-10-01,100,994,123.456.789-00\n', { status: 200 }); };
  try { return await fn(pedidos); } finally { globalThis.fetch = original; }
}

test('planilha por id: o servidor lê o link guardado e devolve só as colunas do painel', async () => {
  const { env } = await ambiente();
  await comPlanilha(async (pedidos) => {
    const res = await get(sheets, '/api/connectors/sheets?id=planilha-aberta', env);
    assert.equal(res.status, 200);
    const ds = await corpo(res);
    assert.deepEqual(ds.columns, ['Data', 'Investimento', 'Receita']);
    assert.ok(!JSON.stringify(ds).includes('123.456.789-00'), 'coluna fora do painel não sai');
    assert.match(pedidos[0], /ABC123segredo/, 'o servidor usou o link guardado');
    assert.match(pedidos[0], /gid=7/, 'e a aba guardada');
  });
});

test('planilha por id: painel com senha exige a senha; id que não é planilha dá 400', async () => {
  const kv = fakeKV({ 'dash:p': { ...PAINEL_SHEETS, id: 'p', auth: await derivePasswordAuth(await sha256Hex('x')) }, 'dash:curso-planilhas': PAINEL_CSV });
  await comPlanilha(async (pedidos) => {
    const sem = await get(sheets, '/api/connectors/sheets?id=p', { DASHBOARDS_KV: kv });
    assert.equal(sem.status, 401);
    assert.equal(pedidos.length, 0, 'sem a senha nem busca a planilha');
    const com = await get(sheets, '/api/connectors/sheets?id=p', { DASHBOARDS_KV: kv }, { 'x-dash-auth': await sha256Hex('x') });
    assert.equal(com.status, 200);
    assert.equal((await get(sheets, '/api/connectors/sheets?id=curso-planilhas', { DASHBOARDS_KV: kv })).status, 400);
    assert.equal((await get(sheets, '/api/connectors/sheets?id=nao-existe', { DASHBOARDS_KV: kv })).status, 404);
  });
});

test('histórico (D1) por id: a série sai só com as colunas do painel', async () => {
  const { kv } = await ambiente();
  const linha = { dashboard_id: 'planilha-aberta', dia: '2026-10-01', captured_at: '2026-10-01T10:00:00.000Z', fonte: 'sheets', columns_json: JSON.stringify(['Data', 'Investimento', 'Receita', 'CPF do aluno']), rows_json: JSON.stringify([{ Data: '2026-10-01', Investimento: '100', Receita: '994', 'CPF do aluno': '123.456.789-00' }]) };
  const legado = { id: 1, dashboard_id: 'planilha-aberta', captured_at: '2026-10-01T10:00:00.000Z', dataset_json: JSON.stringify({ columns: ['Data', 'Investimento', 'Receita', 'CPF do aluno'], rows: [{ Data: '2026-10-01', Investimento: '100', Receita: '994', 'CPF do aluno': '123.456.789-00' }], meta: { source: 'sheets' } }) };
  const db = {
    prepare(sql) {
      return {
        bind() { return this; },
        async all() { return { results: /snapshot_dias/.test(sql) ? [linha] : [legado] }; },
        async first() { return /snapshot_dias/.test(sql) ? linha : legado; },
        async run() { return { success: true }; },
      };
    },
  };
  const res = await get(d1, '/api/connectors/d1?id=planilha-aberta', { DASHBOARDS_KV: kv, DASHBOARD_DB: db });
  assert.equal(res.status, 200);
  const ds = await corpo(res);
  assert.ok(!ds.columns.includes('CPF do aluno'));
  assert.ok(!JSON.stringify(ds).includes('123.456.789-00'));
  assert.equal(ds.rows[0].Receita, '994');
});
