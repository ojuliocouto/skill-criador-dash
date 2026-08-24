// P5: validacao de FORMA do colMap no SERVIDOR (functions/lib/colmap-shape.mjs).
//
// Defeito que motivou (teste na pele do aluno): o POST aceitava colMap VAZIO ou
// INCOMPLETO com HTTP 200. O dashboard subia e mostrava "INVESTIMENTO R$ 0,00"
// no KPI enquanto a tabela logo abaixo trazia a linha real com o valor certo:
// numero errado com cara de numero certo. O wizard barra isso no FRONT
// (validateRequired em public/assets/js/config-wizard.js), mas a premissa da
// skill e o AGENTE montar a config e mandar por POST, caminho que nao passava
// por gate nenhum.
//
// Mesmo espirito de source-shape.mjs: ESTRITO nos dominios canonicos,
// PERMISSIVO no que esta fora da lista (o dominio ja foi validado antes).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REQUIRED_SLOTS,
  slotsObrigatorios,
  slotsFaltando,
  colunasDaFonte,
  validarColMap,
} from '../functions/lib/colmap-shape.mjs';

import { onRequest as dashboards } from '../functions/api/dashboards.js';
import { templates } from '../public/assets/js/templates/index.js';
import { DOMAINS } from '../functions/lib/domains.mjs';

// ---------------------------------------------------------------------------
// PARIDADE com os templates do browser (fronteira Cloudflare Pages: o browser
// nao pode importar de functions/, entao o servidor tem a propria copia dos
// slots obrigatorios). Se um template ganhar/perder um required, este teste cai.
// ---------------------------------------------------------------------------

test('paridade: slots required do servidor == slots required do template do browser', () => {
  for (const domain of DOMAINS) {
    const doBrowser = (templates[domain].slots || [])
      .filter((s) => s && s.required)
      .map((s) => s.key);
    const doServidor = slotsObrigatorios(domain).map((s) => s.key);
    assert.deepEqual(doServidor, doBrowser, `dominio ${domain}`);
  }
});

test('paridade: os labels do servidor batem com os do template do browser', () => {
  for (const domain of DOMAINS) {
    const labels = Object.fromEntries((templates[domain].slots || []).map((s) => [s.key, s.label]));
    for (const s of slotsObrigatorios(domain)) {
      assert.equal(s.label, labels[s.key], `label do slot ${domain}.${s.key}`);
    }
  }
});

test('REQUIRED_SLOTS cobre TODOS os dominios canonicos e esta congelado', () => {
  assert.deepEqual(Object.keys(REQUIRED_SLOTS).sort(), [...DOMAINS].sort());
  assert.ok(Object.isFrozen(REQUIRED_SLOTS));
});

// ---------------------------------------------------------------------------
// slotsFaltando / validarColMap: logica pura
// ---------------------------------------------------------------------------

test('colMap vazio -> todos os obrigatorios do dominio faltando', () => {
  assert.deepEqual(slotsFaltando('marketing', {}).map((s) => s.key), ['data', 'investimento']);
  assert.deepEqual(slotsFaltando('marketing', null).map((s) => s.key), ['data', 'investimento']);
  assert.deepEqual(slotsFaltando('vendas', {}).map((s) => s.key), ['data', 'valor']);
  assert.deepEqual(slotsFaltando('suporte', {}).map((s) => s.key), ['data', 'atendimentos']);
  assert.deepEqual(slotsFaltando('financeiro', {}).map((s) => s.key), ['data', 'entrada']);
  assert.deepEqual(slotsFaltando('estoque', {}).map((s) => s.key), ['produto', 'quantidade']);
});

test('colMap INCOMPLETO -> so o slot que falta e listado', () => {
  // O caso real: mapeou a data, esqueceu o investimento. KPI vira R$ 0,00.
  const faltando = slotsFaltando('marketing', { data: 'Data' });
  assert.deepEqual(faltando.map((s) => s.key), ['investimento']);
});

test('valor nulo, vazio ou so espaco conta como NAO mapeado', () => {
  assert.deepEqual(slotsFaltando('marketing', { data: null, investimento: '' }).map((s) => s.key), ['data', 'investimento']);
  assert.deepEqual(slotsFaltando('marketing', { data: '   ', investimento: '  ' }).map((s) => s.key), ['data', 'investimento']);
});

test('colMap completo -> nada faltando e validarColMap devolve null', () => {
  assert.deepEqual(slotsFaltando('marketing', { data: 'Data', investimento: 'Gasto' }), []);
  assert.equal(validarColMap('marketing', { data: 'Data', investimento: 'Gasto' }), null);
});

test('dominio fora da lista canonica -> permissivo (a validacao de dominio e outra)', () => {
  assert.deepEqual(slotsFaltando('inexistente', {}), []);
  assert.equal(validarColMap('inexistente', {}), null);
  assert.equal(validarColMap(null, {}), null);
});

test('mensagem de erro lista os slots que faltam, com label e key', () => {
  const msg = validarColMap('marketing', { data: 'Data' });
  assert.match(msg, /Investimento/);
  assert.match(msg, /investimento/);
  assert.doesNotMatch(msg, /\bData\b.*\bData\b/); // nao lista o que ja esta mapeado
});

// ---------------------------------------------------------------------------
// Coluna INEXISTENTE: o slot esta preenchido, mas aponta pra uma coluna que
// nao existe no CSV. Vira o mesmo zero silencioso do colMap vazio.
// ---------------------------------------------------------------------------

test('colunasDaFonte: extrai os cabecalhos de uma fonte csv', () => {
  assert.deepEqual(colunasDaFonte({ type: 'csv', data: 'Data;Gasto\n01/01;100' }), ['Data', 'Gasto']);
});

test('colunasDaFonte: fonte sem colunas conhecidas -> null (nao da pra checar)', () => {
  assert.equal(colunasDaFonte({ type: 'sheets', url: 'https://x' }), null);
  assert.equal(colunasDaFonte({ type: 'meu-crm' }), null);
  assert.equal(colunasDaFonte(null), null);
});

test('slot apontando pra coluna que NAO existe no CSV -> erro citando a coluna', () => {
  const colunas = ['Data', 'Gasto'];
  const msg = validarColMap('marketing', { data: 'Data', investimento: 'Investimento' }, colunas);
  assert.match(msg, /Investimento/);
  assert.match(msg, /n[aã]o existe/i);
});

test('sem lista de colunas, a existencia nao e checada (so a presenca)', () => {
  assert.equal(validarColMap('marketing', { data: 'Data', investimento: 'Qualquer' }, null), null);
  assert.equal(validarColMap('marketing', { data: 'Data', investimento: 'Qualquer' }, []), null);
});

// ---------------------------------------------------------------------------
// INTEGRACAO no POST /api/dashboards
// ---------------------------------------------------------------------------

const ADMIN = 'super-token-admin';

function fakeKV(inicial = {}) {
  const map = new Map(Object.entries(inicial));
  return {
    async get(k) { return map.has(k) ? map.get(k) : null; },
    async put(k, v) { map.set(k, v); },
    async delete(k) { map.delete(k); },
    async list({ prefix = '' } = {}) {
      return { keys: [...map.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) };
    },
    _map: map,
  };
}

function ctxPost(body, env = {}) {
  return {
    request: new Request('https://x/api/dashboards', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': ADMIN },
      body: JSON.stringify(body),
    }),
    env: { ADMIN_TOKEN: ADMIN, ...env },
  };
}

async function readJSON(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const CSV_MARKETING = 'Data;Gasto;Leads\n01/01/2026;1500,50;30';

test('POST com colMap VAZIO -> 400 (nao 200) e nada gravado no KV', async () => {
  const kv = fakeKV();
  const res = await dashboards(ctxPost({
    name: 'Dash do Aluno',
    domain: 'marketing',
    source: { type: 'csv', data: CSV_MARKETING },
    colMap: {},
  }, { DASHBOARDS_KV: kv }));
  assert.equal(res.status, 400);
  const j = await readJSON(res);
  assert.match(j.error, /Data/);
  assert.match(j.error, /Investimento/);
  assert.equal(kv._map.size, 0, 'colMap vazio nao pode ser gravado');
});

test('POST com colMap INCOMPLETO -> 400 listando so o slot que falta', async () => {
  const kv = fakeKV();
  const res = await dashboards(ctxPost({
    name: 'Dash do Aluno',
    domain: 'marketing',
    source: { type: 'csv', data: CSV_MARKETING },
    colMap: { data: 'Data' },
  }, { DASHBOARDS_KV: kv }));
  assert.equal(res.status, 400);
  const j = await readJSON(res);
  assert.match(j.error, /Investimento/);
  assert.equal(kv._map.size, 0);
});

test('POST com slot apontando pra coluna inexistente no CSV -> 400', async () => {
  const kv = fakeKV();
  const res = await dashboards(ctxPost({
    name: 'Dash do Aluno',
    domain: 'marketing',
    source: { type: 'csv', data: CSV_MARKETING },
    colMap: { data: 'Data', investimento: 'Investimento' },
  }, { DASHBOARDS_KV: kv }));
  assert.equal(res.status, 400);
  const j = await readJSON(res);
  assert.match(j.error, /n[aã]o existe/i);
  assert.equal(kv._map.size, 0);
});

test('POST com colMap COMPLETO e colunas reais -> 200 e grava', async () => {
  const kv = fakeKV();
  const res = await dashboards(ctxPost({
    name: 'Dash do Aluno',
    domain: 'marketing',
    source: { type: 'csv', data: CSV_MARKETING },
    colMap: { data: 'Data', investimento: 'Gasto', leads: 'Leads' },
  }, { DASHBOARDS_KV: kv }));
  assert.equal(res.status, 200);
  assert.equal(kv._map.size, 1);
});

test('GRUPO (kind:group) nao tem colMap e segue passando', async () => {
  const kv = fakeKV();
  const res = await dashboards(ctxPost({
    name: 'Grupo',
    kind: 'group',
    tabs: [{ id: 'a', label: 'A' }],
  }, { DASHBOARDS_KV: kv }));
  assert.equal(res.status, 200);
});

test('conector sob medida (sem colunas conhecidas) exige presenca, nao existencia', async () => {
  const kv = fakeKV();
  const ok = await dashboards(ctxPost({
    name: 'CRM',
    domain: 'vendas',
    source: { type: 'meu-crm', endpoint: 'https://x' },
    colMap: { data: 'A', valor: 'B' },
  }, { DASHBOARDS_KV: kv }));
  assert.equal(ok.status, 200);

  const kv2 = fakeKV();
  const ruim = await dashboards(ctxPost({
    name: 'CRM',
    domain: 'vendas',
    source: { type: 'meu-crm', endpoint: 'https://x' },
    colMap: { data: 'A' },
  }, { DASHBOARDS_KV: kv2 }));
  assert.equal(ruim.status, 400);
  assert.equal(kv2._map.size, 0);
});
