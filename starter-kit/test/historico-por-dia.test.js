// Achado 9 da auditoria de 25/10/2026 [Médio]: o modo histórico não guardava histórico. O cron gravava a
// foto inteira de hora em hora, sem limpeza, e o painel lia só a última foto. Com o Meta (janela de 30 dias)
// o dia 31 sumia do painel do mesmo jeito que sumia da fonte, e o banco crescia 24 fotos por dia.
//
// 3.9.0: o histórico guarda UM registro por painel e por dia (tabela snapshot_dias):
//  - cada foto nova substitui os dias que ela cobre (do primeiro ao último dia que a fonte trouxe);
//  - o dia que saiu da janela da fonte fica no banco (é isso que faz o histórico);
//  - retenção: dias mais velhos que HISTORICO_DIAS (400 por padrão) são apagados; as fotos antigas da
//    tabela snapshots (até a 3.8) também;
//  - o painel lê a série inteira (ou um período com ?de=&ate=), não a última foto.
//
// O teste roda o SQL de verdade num SQLite em memória (node:sqlite), com o db/schema.sql do kit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import worker from '../workers/snapshot/src/index.js';
import { onRequest as d1 } from '../functions/api/connectors/d1.js';
import { diaDaLinha, corteDoHistorico, DIAS_DE_HISTORICO } from '../functions/lib/snapshots.mjs';

const SCHEMA = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');

// D1 de verdade o bastante: prepare/bind/run/all/first/batch sobre SQLite (batch é transação, como no D1).
function d1EmMemoria() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  const preparar = (sql) => {
    let params = [];
    const st = {
      bind(...p) { params = p; return st; },
      async run() { db.prepare(sql).run(...params); return { success: true }; },
      async all() { return { results: db.prepare(sql).all(...params) }; },
      async first() { return db.prepare(sql).get(...params) || null; },
    };
    return st;
  };
  return {
    db,
    prepare: preparar,
    async batch(stmts) {
      db.exec('BEGIN');
      try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    contar(tabela) { return db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get().n; },
  };
}

function kv(obj) {
  const m = new Map(Object.entries(obj).map(([k, v]) => [k, JSON.stringify(v)]));
  return { async get(k) { return m.has(k) ? m.get(k) : null; }, async list({ prefix } = {}) { return { keys: [...m.keys()].filter((n) => !prefix || n.startsWith(prefix)).map((name) => ({ name })) }; } };
}

// Dia relativo a hoje (UTC), no formato da Graph API.
const dia = (deslocamento) => new Date(Date.now() + deslocamento * 86400000).toISOString().slice(0, 10);
const linhaMeta = (d, gasto) => ({ date_start: d, campaign_name: 'Campanha', spend: String(gasto), impressions: '1000', clicks: '10', inline_link_clicks: '8' });

const CFG = { id: 'hist-meta', name: 'Hist', domain: 'marketing', storage: 'd1', colMap: { data: 'Data', investimento: 'Investimento' }, source: { type: 'meta', meta: { token: 't', account: '1' } } };

async function rodarCron(env, linhas, extraEnv = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: linhas }), { status: 200 });
  try { await worker.scheduled({}, { ...env, ...extraEnv }, {}); } finally { globalThis.fetch = original; }
}
async function lerPainel(env, qs = '') {
  const res = await d1({ request: new Request(`https://p.test/api/connectors/d1?id=hist-meta${qs}`), env });
  assert.equal(res.status, 200, `leitura do histórico respondeu ${res.status}`);
  return res.json();
}
const gastoPorDia = (ds) => Object.fromEntries(ds.rows.map((r) => [r.Data, r.Investimento]));

test('diaDaLinha: lê data ISO e data brasileira; texto que não é data vira null', () => {
  assert.equal(diaDaLinha('2026-10-25'), '2026-10-25');
  assert.equal(diaDaLinha('2026-10-25T13:00:00Z'), '2026-10-25');
  assert.equal(diaDaLinha('25/10/2026'), '2026-10-25');
  assert.equal(diaDaLinha('5/1/2026'), '2026-01-05');
  assert.equal(diaDaLinha('31/02/2026'), null);
  assert.equal(diaDaLinha('Total'), null);
  assert.equal(diaDaLinha(''), null);
});

test('corteDoHistorico: hoje menos N dias; o padrão é 400', () => {
  assert.equal(corteDoHistorico('2026-10-25T10:00:00.000Z', 30), '2026-09-25');
  assert.equal(DIAS_DE_HISTORICO, 400);
});

test('histórico de verdade: o dia que sai da janela da fonte continua no painel, e a foto nova corrige os dias que cobre', async () => {
  const banco = d1EmMemoria();
  const env = { DASHBOARDS_KV: kv({ 'dash:hist-meta': CFG }), DASHBOARD_DB: banco };
  await rodarCron(env, [linhaMeta(dia(-3), 100), linhaMeta(dia(-2), 200), linhaMeta(dia(-1), 300)]);
  // Dia seguinte: a janela andou (o dia -3 saiu da fonte), o dia -2 foi corrigido pela atribuição e o 0 entrou.
  await rodarCron(env, [linhaMeta(dia(-2), 250), linhaMeta(dia(-1), 300), linhaMeta(dia(0), 50)]);
  const ds = await lerPainel(env);
  assert.deepEqual(gastoPorDia(ds), { [dia(-3)]: '100', [dia(-2)]: '250', [dia(-1)]: '300', [dia(0)]: '50' });
  assert.deepEqual(ds.rows.map((r) => r.Data), [dia(-3), dia(-2), dia(-1), dia(0)], 'série em ordem de data');
  assert.equal(ds.meta.source, 'meta');
  assert.equal(ds.meta.historico.dias, 4);
  assert.equal(ds.meta.historico.de, dia(-3));
});

test('dia que some de dentro do período da foto nova sai do histórico (a foto nova manda no período que cobre)', async () => {
  const banco = d1EmMemoria();
  const env = { DASHBOARDS_KV: kv({ 'dash:hist-meta': CFG }), DASHBOARD_DB: banco };
  await rodarCron(env, [linhaMeta(dia(-3), 100), linhaMeta(dia(-2), 200), linhaMeta(dia(-1), 300)]);
  await rodarCron(env, [linhaMeta(dia(-3), 100), linhaMeta(dia(-1), 300)]);
  assert.deepEqual(Object.keys(gastoPorDia(await lerPainel(env))), [dia(-3), dia(-1)]);
});

test('o cron de hora em hora não faz o banco crescer: 24 rodadas, um registro por dia', async () => {
  const banco = d1EmMemoria();
  const env = { DASHBOARDS_KV: kv({ 'dash:hist-meta': CFG }), DASHBOARD_DB: banco };
  const linhas = [linhaMeta(dia(-2), 10), linhaMeta(dia(-1), 20), linhaMeta(dia(0), 30)];
  for (let h = 0; h < 24; h++) await rodarCron(env, linhas);
  assert.equal(banco.contar('snapshot_dias'), 3);
  assert.equal(banco.contar('snapshots'), 0, 'a tabela de fotos inteiras não recebe mais nada');
});

test('retenção: dia mais velho que HISTORICO_DIAS é apagado, e as fotos antigas (até a 3.8) também', async () => {
  const banco = d1EmMemoria();
  banco.db.prepare('INSERT INTO snapshots (dashboard_id, captured_at, dataset_json) VALUES (?, ?, ?)').run('hist-meta', '2026-01-01T00:00:00.000Z', '{"columns":[],"rows":[]}');
  const env = { DASHBOARDS_KV: kv({ 'dash:hist-meta': CFG }), DASHBOARD_DB: banco };
  await rodarCron(env, [linhaMeta(dia(-40), 1), linhaMeta(dia(-10), 2)]);
  await rodarCron(env, [linhaMeta(dia(-1), 3)], { HISTORICO_DIAS: '30' });
  assert.deepEqual(Object.keys(gastoPorDia(await lerPainel(env))), [dia(-10), dia(-1)]);
  assert.equal(banco.contar('snapshots'), 0);
});

test('consulta por período: ?de=&ate= devolve só os dias pedidos', async () => {
  const banco = d1EmMemoria();
  const env = { DASHBOARDS_KV: kv({ 'dash:hist-meta': CFG }), DASHBOARD_DB: banco };
  await rodarCron(env, [linhaMeta(dia(-3), 1), linhaMeta(dia(-2), 2), linhaMeta(dia(-1), 3)]);
  const ds = await lerPainel(env, `&de=${dia(-2)}&ate=${dia(-2)}`);
  assert.deepEqual(Object.keys(gastoPorDia(ds)), [dia(-2)]);
  const res = await d1({ request: new Request('https://p.test/api/connectors/d1?id=hist-meta&de=ontem'), env });
  assert.equal(res.status, 400, 'data fora do formato AAAA-MM-DD é recusada');
});

test('planilha: dia pela coluna de data do colMap (formato brasileiro) e linha sem data fica uma vez só', async () => {
  const banco = d1EmMemoria();
  const cfg = { id: 'hist-meta', name: 'P', domain: 'marketing', storage: 'd1', colMap: { data: 'Dia', investimento: 'Gasto' }, source: { type: 'sheets', url: 'https://docs.google.com/spreadsheets/d/ABC/edit' } };
  const env = { DASHBOARDS_KV: kv({ 'dash:hist-meta': cfg }), DASHBOARD_DB: banco };
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('Dia,Gasto\n01/10/2026,10\n02/10/2026,20\nTotal,30\n', { status: 200 });
    await worker.scheduled({}, env, {});
    globalThis.fetch = async () => new Response('Dia,Gasto\n02/10/2026,25\n03/10/2026,40\nTotal,65\n', { status: 200 });
    await worker.scheduled({}, env, {});
  } finally { globalThis.fetch = original; }
  const ds = await lerPainel(env);
  assert.deepEqual(ds.rows.map((r) => `${r.Dia}=${r.Gasto}`), ['01/10/2026=10', '02/10/2026=25', '03/10/2026=40', 'Total=65']);
});

test('banco antigo (só a tabela snapshots) continua abrindo pela última foto', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, dashboard_id TEXT NOT NULL, captured_at TEXT NOT NULL, dataset_json TEXT NOT NULL)');
  db.prepare('INSERT INTO snapshots (dashboard_id, captured_at, dataset_json) VALUES (?, ?, ?)').run('hist-meta', '2026-10-01T00:00:00.000Z', JSON.stringify({ columns: ['Data', 'Investimento'], rows: [{ Data: '2026-10-01', Investimento: '9' }], meta: { source: 'meta' } }));
  const banco = { prepare: (sql) => { let p = []; const st = { bind(...x) { p = x; return st; }, async all() { return { results: db.prepare(sql).all(...p) }; }, async first() { return db.prepare(sql).get(...p) || null; }, async run() { db.prepare(sql).run(...p); return {}; } }; return st; } };
  const ds = await lerPainel({ DASHBOARDS_KV: kv({ 'dash:hist-meta': CFG }), DASHBOARD_DB: banco });
  assert.equal(ds.rows[0].Investimento, '9');
});
