// Campos novos da config (tema, saudacao, saudacaoLigada, fundoAnimado): o servidor valida a
// forma no mesmo padrão dos que já existem (tipo, tamanho, valores aceitos, sem HTML), e a
// ausência deles não muda nada num painel antigo.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validarAparencia, MODOS_ACEITOS, LIMITE_DA_SAUDACAO } from '../functions/lib/aparencia-shape.mjs';
import { onRequest as dashboards } from '../functions/api/dashboards.js';

test('validarAparencia: config sem os campos novos passa (painel antigo)', () => {
  assert.equal(validarAparencia({}), null);
  assert.equal(validarAparencia({ name: 'x', accent: '#2563eb' }), null);
  assert.equal(validarAparencia(null), null);
});

test('tema: só claro, escuro ou auto', () => {
  assert.deepEqual([...MODOS_ACEITOS].sort(), ['auto', 'claro', 'escuro']);
  for (const tema of ['claro', 'escuro', 'auto', '', null, undefined]) assert.equal(validarAparencia({ tema }), null, String(tema));
  for (const tema of ['dark', 'light', 'CLARO', 'claro"><script>', 1, true, {}, ['claro']]) {
    assert.match(validarAparencia({ tema }) || '', /modo/i, JSON.stringify(tema));
  }
});

test('saudacao: texto curto, sem sinal de tag e sem quebra de linha', () => {
  for (const saudacao of ['Carla', 'time do Studio Equilíbrio', 'x'.repeat(LIMITE_DA_SAUDACAO), '', null, undefined]) {
    assert.equal(validarAparencia({ saudacao }), null, JSON.stringify(saudacao));
  }
  for (const saudacao of ['x'.repeat(LIMITE_DA_SAUDACAO + 1), '<b>Carla</b>', 'a > b', 'Carla\nSouza', 'a\u0000b', 42, {}, ['Carla'], true]) {
    assert.match(validarAparencia({ saudacao }) || '', /cumprimenta/i, JSON.stringify(saudacao));
  }
  assert.equal(LIMITE_DA_SAUDACAO, 40);
});

test('saudacaoLigada e fundoAnimado: só verdadeiro ou falso', () => {
  for (const v of [true, false, null, undefined]) {
    assert.equal(validarAparencia({ saudacaoLigada: v }), null);
    assert.equal(validarAparencia({ fundoAnimado: v }), null);
  }
  for (const v of ['false', 'sim', 0, 1, {}, []]) {
    assert.match(validarAparencia({ saudacaoLigada: v }) || '', /saudação/i, JSON.stringify(v));
    assert.match(validarAparencia({ fundoAnimado: v }) || '', /fundo/i, JSON.stringify(v));
  }
});

test('as mensagens dizem o que fazer e não têm travessão', () => {
  const msgs = [validarAparencia({ tema: 'x' }), validarAparencia({ saudacao: '<' }), validarAparencia({ saudacaoLigada: 'x' }), validarAparencia({ fundoAnimado: 'x' })];
  for (const m of msgs) {
    assert.ok(m && m.length > 20);
    assert.ok(!m.includes(String.fromCharCode(8212)));
    assert.match(m, /Use|use|precisa/);
  }
});

// ---------- no POST de verdade ----------

function fakeKV() {
  const map = new Map();
  return {
    async get(k) { return map.has(k) ? map.get(k) : null; },
    async put(k, v) { map.set(k, String(v)); },
    async delete(k) { map.delete(k); },
    async list() { return { keys: [...map.keys()].map((name) => ({ name })) }; },
    _map: map,
  };
}
const ADMIN = 'chave-de-teste';
const base = {
  name: 'Painel de teste', domain: 'vendas',
  source: { type: 'csv', data: 'Data,Valor\n01/07/2026,10' },
  colMap: { data: 'Data', valor: 'Valor' },
};
async function postar(extra, kv = fakeKV()) {
  const res = await dashboards({
    request: new Request('https://x/api/dashboards', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': ADMIN }, body: JSON.stringify({ ...base, ...extra }),
    }),
    env: { ADMIN_TOKEN: ADMIN, DASHBOARDS_KV: kv },
  });
  return { status: res.status, corpo: JSON.parse(await res.text()), kv };
}

test('POST: grava os campos novos válidos e devolve na config', async () => {
  const { status, corpo, kv } = await postar({ tema: 'escuro', saudacao: 'Carla', saudacaoLigada: true, fundoAnimado: false });
  assert.equal(status, 200);
  assert.equal(corpo.tema, 'escuro');
  assert.equal(corpo.saudacao, 'Carla');
  assert.equal(corpo.saudacaoLigada, true);
  assert.equal(corpo.fundoAnimado, false);
  assert.equal(kv._map.size, 1);
});

test('POST: campo novo inválido devolve 400 e não grava nada', async () => {
  for (const extra of [{ tema: 'dark' }, { saudacao: '<img src=x onerror=alert(1)>' }, { saudacao: 'x'.repeat(41) }, { saudacaoLigada: 'nao' }, { fundoAnimado: 1 }]) {
    const { status, corpo, kv } = await postar(extra);
    assert.equal(status, 400, JSON.stringify(extra));
    assert.ok(corpo.error);
    assert.equal(kv._map.size, 0);
  }
});

test('POST: painel sem os campos novos continua sendo aceito e gravado como antes', async () => {
  const { status, corpo } = await postar({});
  assert.equal(status, 200);
  for (const campo of ['tema', 'saudacao', 'saudacaoLigada', 'fundoAnimado']) assert.equal(corpo[campo], undefined);
});

test('POST: grupo também pode escolher o modo e a saudação', async () => {
  const res = await dashboards({
    request: new Request('https://x/api/dashboards', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': ADMIN },
      body: JSON.stringify({ kind: 'group', name: 'Grupo', tabs: [{ id: 'a', label: 'A' }], tema: 'lixo' }),
    }),
    env: { ADMIN_TOKEN: ADMIN, DASHBOARDS_KV: fakeKV() },
  });
  assert.equal(res.status, 400);
});
