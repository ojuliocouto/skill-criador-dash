// Abrir o link de um painel com senha NÃO gasta o limite de tentativas erradas.
//
// Achado da prova no ar de 08/10/2026: o limite de 8 tentativas erradas por IP e por painel (5 min) também contava a
// abertura normal do link, que chega SEM senha nenhuma (é assim que o painel descobre que precisa pedir a senha). Com
// 8 aberturas em 5 minutos (uma equipe atrás do mesmo roteador, ou os scripts de prova abrindo o painel em 3 perfis),
// a abertura seguinte voltava 429 e o painel mostrava "Muitas tentativas" no lugar do campo de senha, mesmo para quem
// tinha a senha certa. Tentativa errada de verdade (senha digitada) continua contando e continua barrando.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { onRequest as dashboards } from '../functions/api/dashboards.js';
import { sha256Hex } from '../public/assets/js/lib/auth.js';
import { derivePasswordAuth } from '../functions/lib/auth-config.mjs';

const ADMIN = 'token-admin-do-teste';

function fakeKV(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    async get(k) { return map.has(k) ? map.get(k) : null; },
    async put(k, v) { map.set(k, String(v)); },
    async delete(k) { map.delete(k); },
    async list({ prefix } = {}) { return { keys: [...map.keys()].filter((n) => !prefix || n.startsWith(prefix)).map((name) => ({ name })) }; },
    _map: map,
  };
}
function ctx(method, { id, body, headers = {}, env = {} } = {}) {
  const qs = id != null ? `?id=${encodeURIComponent(id)}` : '';
  const init = { method, headers: { ...headers } };
  if (body != null) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
  return { request: new Request(`https://x/api/dashboards${qs}`, init), env };
}
async function painelProtegido(senha) {
  const hash = await sha256Hex(senha);
  const cfg = {
    id: 'dash-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'Painel Sigiloso', domain: 'marketing',
    source: { type: 'csv', data: 'Data,Canal,Investimento,Leads\n2026-09-05,Instagram,"850,00",38' },
    colMap: { data: 'Data', canal: 'Canal', investimento: 'Investimento', leads: 'Leads' },
    auth: await derivePasswordAuth(hash),
  };
  const kv = fakeKV({ [`dash:${cfg.id}`]: JSON.stringify(cfg) });
  return { cfg, hash, kv, env: { DASHBOARDS_KV: kv, DASHBOARD_CACHE: fakeKV(), ADMIN_TOKEN: ADMIN } };
}
const IP = { 'CF-Connecting-IP': '198.51.100.77' };

test('GET sem senha nenhuma, 20 vezes seguidas: sempre 401 needsPassword, nunca 429', async () => {
  const { cfg, env } = await painelProtegido('abertura-sem-limite');
  for (let i = 1; i <= 20; i++) {
    const r = await dashboards(ctx('GET', { id: cfg.id, headers: IP, env }));
    assert.equal(r.status, 401, `abertura ${i}`);
    assert.equal((await r.json()).needsPassword, true, `abertura ${i} pede a senha`);
  }
});

test('depois de muitas aberturas sem senha, a senha certa entra (200)', async () => {
  const { cfg, hash, env } = await painelProtegido('abertura-sem-limite');
  for (let i = 0; i < 12; i++) await dashboards(ctx('GET', { id: cfg.id, headers: IP, env }));
  const r = await dashboards(ctx('GET', { id: cfg.id, headers: { ...IP, 'x-dash-auth': hash }, env }));
  assert.equal(r.status, 200);
});

test('a abertura sem senha continua pedindo a senha (401) mesmo com o limite de erradas já estourado', async () => {
  const { cfg, hash, env } = await painelProtegido('abertura-sem-limite');
  for (let i = 0; i < 8; i++) assert.equal((await dashboards(ctx('GET', { id: cfg.id, headers: { ...IP, 'x-dash-auth': 'errada' }, env }))).status, 401);
  assert.equal((await dashboards(ctx('GET', { id: cfg.id, headers: { ...IP, 'x-dash-auth': 'errada' }, env }))).status, 429, 'a 9a senha errada barra');
  const abertura = await dashboards(ctx('GET', { id: cfg.id, headers: IP, env }));
  assert.equal(abertura.status, 401, 'a tela de senha ainda abre');
  const certa = await dashboards(ctx('GET', { id: cfg.id, headers: { ...IP, 'x-dash-auth': hash }, env }));
  assert.equal(certa.status, 200, 'e a senha certa entra');
});

test('tentativa ERRADA de verdade continua contando: 8 passam em 401 e a 9a toma 429', async () => {
  const { cfg, env } = await painelProtegido('abertura-sem-limite');
  for (let i = 1; i <= 8; i++) assert.equal((await dashboards(ctx('GET', { id: cfg.id, headers: { ...IP, 'x-dash-auth': 'errada-' + i }, env }))).status, 401, `errada ${i}`);
  const r = await dashboards(ctx('GET', { id: cfg.id, headers: { ...IP, 'x-dash-auth': 'errada-9' }, env }));
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('Retry-After')) > 0);
});

test('aberturas sem senha NÃO deixam a tentativa errada seguinte mais perto do bloqueio', async () => {
  const { cfg, env } = await painelProtegido('abertura-sem-limite');
  for (let i = 0; i < 30; i++) await dashboards(ctx('GET', { id: cfg.id, headers: IP, env }));
  for (let i = 1; i <= 8; i++) assert.equal((await dashboards(ctx('GET', { id: cfg.id, headers: { ...IP, 'x-dash-auth': 'errada-' + i }, env }))).status, 401, `errada ${i} depois de 30 aberturas`);
});

test('POST e DELETE sem a senha do painel: 401 needsPassword, sem gastar o limite', async () => {
  const { cfg, hash, env } = await painelProtegido('abertura-sem-limite');
  const adm = { ...IP, 'x-admin-token': ADMIN };
  const novo = { id: cfg.id, name: 'Painel Sigiloso', domain: 'marketing', source: cfg.source, colMap: cfg.colMap };
  for (let i = 0; i < 12; i++) {
    const p = await dashboards(ctx('POST', { body: novo, headers: adm, env }));
    assert.equal(p.status, 401, `POST ${i + 1}`);
    const d = await dashboards(ctx('DELETE', { id: cfg.id, headers: adm, env }));
    assert.equal(d.status, 401, `DELETE ${i + 1}`);
  }
  const ok = await dashboards(ctx('GET', { id: cfg.id, headers: { ...IP, 'x-dash-auth': hash }, env }));
  assert.equal(ok.status, 200);
});
