// P7: vazamento do nome do cliente pelo ID do dashboard protegido.
//
// A listagem publica ja foi endurecida para NAO devolver name/domain/accent de
// dashboard com senha, mas o `id` continuava sendo o slug do nome. Ou seja:
// criar "Sigiloso Cliente" com senha e chamar GET /api/dashboards anonimo
// devolvia {"id":"sigiloso-cliente","protected":true}, e "Faturamento Acme
// Janeiro" virava faturamento-acme-janeiro na cara de qualquer visitante.
//
// FIX: quando o POST traz bloco `auth` (dashboard protegido), o id passa a ser
// OPACO e aleatorio, desacoplado do nome. Dashboard sem senha nao muda nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  slugify,
  temSenha,
  gerarIdOpaco,
  resolverId,
  onRequest as dashboards,
} from '../functions/api/dashboards.js';
import { derivePasswordAuth } from '../functions/lib/auth-config.mjs';

const ADMIN = 'super-token-admin';
const adminHeaders = (extra = {}) => ({ 'x-admin-token': ADMIN, ...extra });

function fakeKV(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    async get(k) { return map.has(k) ? map.get(k) : null; },
    async put(k, v) { map.set(k, String(v)); },
    async delete(k) { map.delete(k); },
    async list({ prefix } = {}) {
      const keys = [];
      for (const name of map.keys()) if (!prefix || name.startsWith(prefix)) keys.push({ name });
      return { keys };
    },
    _map: map,
  };
}

function ctx(method, { id, body, headers = {}, env = {} } = {}) {
  const qs = id != null ? `?id=${encodeURIComponent(id)}` : '';
  const init = { method, headers: { ...headers } };
  if (body != null) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (!init.headers['content-type']) init.headers['content-type'] = 'application/json';
  }
  return { request: new Request(`https://x/api/dashboards${qs}`, init), env };
}

function makeConfig(overrides = {}) {
  return {
    name: 'Meu Dash',
    domain: 'vendas',
    source: { type: 'sheet', url: 'https://sheet' },
    colMap: { data: 'A', valor: 'B' },
    ...overrides,
  };
}

async function readJSON(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Hash SHA-256 em hex, igual ao que o wizard manda no header x-dash-auth.
const HASH_SENHA = 'a'.repeat(64);

// Palavras do nome que JAMAIS podem aparecer no id de um dashboard protegido.
function vazaNome(id, nome) {
  const partes = slugify(nome).split('-').filter((p) => p.length >= 3);
  return partes.some((p) => String(id).includes(p));
}

// ---------------------------------------------------------------------------
// Unidade: geracao do id (logica pura, sem rede nem KV)
// ---------------------------------------------------------------------------

test('temSenha: reconhece o payload do wizard ({hash}) e o formato gravado ({verifier})', () => {
  assert.equal(temSenha({ auth: { hash: HASH_SENHA } }), true, 'payload do wizard');
  assert.equal(temSenha({ auth: { salt: 's', verifier: 'v', iterations: 100000 } }), true, 'formato v2 gravado');
  assert.equal(temSenha({}), false, 'sem bloco auth');
  assert.equal(temSenha({ auth: {} }), false, 'bloco auth vazio nao e senha');
  assert.equal(temSenha(null), false);
});

test('gerarIdOpaco: id aleatorio, seguro como chave KV e sem colisao pratica', () => {
  const a = gerarIdOpaco();
  const b = gerarIdOpaco();
  assert.match(a, /^dash-[0-9a-f]{32}$/, 'formato opaco com 128 bits de entropia');
  assert.notEqual(a, b, 'duas chamadas nunca devolvem o mesmo id');
  assert.match(a, /^[a-z0-9-]+$/, 'so caractere seguro para virar chave KV');
});

test('resolverId: dashboard SEM senha continua com slug legivel do nome', () => {
  assert.equal(resolverId({ name: 'Vendas Time Comercial' }), 'vendas-time-comercial');
});

test('resolverId: dashboard SEM senha respeita o id que o cliente mandou (sanitizado)', () => {
  assert.equal(resolverId({ name: 'X', id: 'meu-dash-2026' }), 'meu-dash-2026');
  assert.equal(resolverId({ name: 'X', id: '../../Evil ID!!' }), 'evil-id');
});

test('resolverId: dashboard COM senha NAO deriva o id do nome', () => {
  const nome = 'Faturamento Acme Janeiro';
  const id = resolverId({ name: nome, auth: { hash: HASH_SENHA } });
  assert.match(id, /^dash-[0-9a-f]{32}$/, 'id opaco');
  assert.ok(!vazaNome(id, nome), `o id "${id}" nao pode conter pedaco do nome "${nome}"`);
});

test('resolverId: dois protegidos com o MESMO nome geram ids diferentes', () => {
  const cfg = { name: 'Sigiloso Cliente', auth: { hash: HASH_SENHA } };
  assert.notEqual(resolverId(cfg), resolverId(cfg), 'id aleatorio, nao funcao do nome');
});

test('resolverId: sobrescrever protegido que JA existe preserva o id (link nao muda)', () => {
  // eraProtegido:true modela editar um dashboard que JA era protegido (o
  // registro atual daquele id ja tinha bloco auth). So nesse caso o id opaco
  // se preserva; ver o teste de rotacao abaixo para o caso contrario.
  const id = resolverId(
    { name: 'Sigiloso Cliente', id: 'dash-' + 'f'.repeat(32), auth: { hash: HASH_SENHA } },
    { existe: true, eraProtegido: true }
  );
  assert.equal(id, 'dash-' + 'f'.repeat(32));
});

// ---------------------------------------------------------------------------
// P7 RODADA 2 (auditoria independente reprovou o fix anterior): criar JA com
// senha gera id opaco (correto), mas PROTEGER DEPOIS um dashboard que ja
// existia publico mantinha o slug legivel (ex: "sigiloso-cliente-alfa"), e o
// nome do cliente continuava vazando na listagem publica. FIX: ao adicionar
// bloco `auth` num dashboard que ainda NAO tinha (eraProtegido:false), o id
// rotaciona pro formato opaco, o registro migra no KV (grava no novo, apaga o
// antigo) e a resposta devolve o id novo pro cliente saber o link novo.
// ---------------------------------------------------------------------------

test('resolverId: dashboard que JA existe SEM senha e agora chega COM senha NAO preserva o slug (rotaciona)', () => {
  // eraProtegido:false = o registro que hoje existe com esse id ainda NAO tem
  // auth (esta sendo protegido agora nesta chamada). Preservar o slug aqui
  // reintroduziria o vazamento que o id opaco existe pra fechar.
  const id = resolverId(
    { name: 'Sigiloso Cliente', id: 'sigiloso-cliente', auth: { hash: HASH_SENHA } },
    { existe: true, eraProtegido: false }
  );
  assert.match(id, /^dash-[0-9a-f]{32}$/, 'rotaciona pro formato opaco em vez de preservar o slug');
  assert.ok(!vazaNome(id, 'Sigiloso Cliente'), `id "${id}" vazou o nome`);
});

test('POST: dashboard publico que ganha senha rotaciona o id, migra o KV e devolve o id novo', async () => {
  const kv = fakeKV();
  const env = { DASHBOARDS_KV: kv, ADMIN_TOKEN: ADMIN };

  // 1) cria PUBLICO, sem senha: nasce com slug legivel (comportamento de hoje).
  const r1 = await dashboards(
    ctx('POST', { body: makeConfig({ name: 'Sigiloso Cliente' }), headers: adminHeaders(), env })
  );
  assert.equal(r1.status, 200);
  const j1 = await readJSON(r1);
  assert.equal(j1.id, 'sigiloso-cliente');
  assert.ok(kv._map.has('dash:sigiloso-cliente'));

  // 2) PROTEGE DEPOIS: POST com o MESMO id, agora com bloco auth novo.
  const r2 = await dashboards(
    ctx('POST', {
      body: makeConfig({ name: 'Sigiloso Cliente', id: 'sigiloso-cliente', auth: { hash: HASH_SENHA } }),
      headers: adminHeaders(),
      env,
    })
  );
  assert.equal(r2.status, 200);
  const j2 = await readJSON(r2);
  assert.notEqual(j2.id, 'sigiloso-cliente', 'o id precisa mudar ao ganhar senha');
  assert.match(j2.id, /^dash-[0-9a-f]{32}$/, 'id novo no formato opaco');
  assert.ok(!vazaNome(j2.id, 'Sigiloso Cliente'), `id novo "${j2.id}" vazou o nome`);

  // 3) migracao no KV: o registro ANTIGO (slug legivel) tem que ter sumido, e
  // so o NOVO (opaco) pode existir. Nao pode sobrar registro orfao.
  assert.ok(!kv._map.has('dash:sigiloso-cliente'), 'o registro antigo (slug legivel) foi apagado');
  assert.ok(kv._map.has(`dash:${j2.id}`), 'o registro novo (opaco) existe');
  assert.equal([...kv._map.keys()].length, 1, 'nao pode sobrar registro orfao no KV');

  // 4) o id ANTIGO nao responde MAIS com dado nenhum (404, nem sequer pede senha).
  const rOld = await dashboards(ctx('GET', { id: 'sigiloso-cliente', env: { DASHBOARDS_KV: kv } }));
  assert.equal(rOld.status, 404, 'id antigo nao pode mais existir');

  // 5) listagem anonima: nao sobra nome nenhum, e o unico id listado e o novo (opaco).
  const rList = await dashboards(ctx('GET', { env: { DASHBOARDS_KV: kv } }));
  const lista = await readJSON(rList);
  assert.equal(lista.length, 1, 'so um registro deve existir apos a migracao');
  assert.equal(lista[0].protected, true);
  assert.equal(lista[0].id, j2.id);
  assert.ok(!/sigiloso|cliente/i.test(JSON.stringify(lista)), 'listagem publica nao pode vazar o nome');

  // 6) com a senha certa, o dashboard novo abre normalmente pelo id novo.
  const rGet = await dashboards(
    ctx('GET', { id: j2.id, headers: { 'x-dash-auth': HASH_SENHA }, env: { DASHBOARDS_KV: kv } })
  );
  assert.equal(rGet.status, 200, 'com a senha certa o dashboard novo abre pelo id novo');
});

test('POST: proteger dashboard publico que ja existe SEM id explicito no corpo nao rotaciona (nao ha id pra migrar)', async () => {
  // Sem `id` no corpo, o POST cria um dashboard NOVO (o wizard de "editar" sempre
  // manda o id de volta); confirma que este caminho nao quebra e continua
  // gerando um dashboard protegido novo e independente, sem tocar em nenhum
  // registro anterior porque nao ha id pedido pra resolver contra o KV.
  const kv = fakeKV();
  const env = { DASHBOARDS_KV: kv, ADMIN_TOKEN: ADMIN };
  await dashboards(ctx('POST', { body: makeConfig({ name: 'Outro Cliente' }), headers: adminHeaders(), env }));
  const res = await dashboards(
    ctx('POST', { body: makeConfig({ name: 'Outro Cliente Protegido', auth: { hash: HASH_SENHA } }), headers: adminHeaders(), env })
  );
  assert.equal(res.status, 200);
  const j = await readJSON(res);
  assert.match(j.id, /^dash-[0-9a-f]{32}$/);
  assert.ok(kv._map.has('dash:outro-cliente'), 'o dashboard publico original nao foi tocado');
  assert.ok(kv._map.has(`dash:${j.id}`), 'o dashboard novo, protegido, foi criado');
});

test('resolverId: na CRIACAO de protegido, id escolhido pelo cliente nao vaza o nome', () => {
  // Sem esta trava, bastaria um POST com id:"sigiloso-cliente" para reintroduzir
  // o vazamento por fora do wizard. Na criacao (o id ainda nao existe no KV) o
  // id do cliente e ignorado e o servidor gera o opaco.
  const id = resolverId(
    { name: 'Sigiloso Cliente', id: 'sigiloso-cliente', auth: { hash: HASH_SENHA } },
    { existe: false }
  );
  assert.match(id, /^dash-[0-9a-f]{32}$/);
  assert.ok(!vazaNome(id, 'Sigiloso Cliente'));
});

// ---------------------------------------------------------------------------
// Integracao: POST + listagem publica (o caminho exato do defeito relatado)
// ---------------------------------------------------------------------------

test('POST protegido: o id devolvido nao revela o nome, nem a chave gravada no KV', async () => {
  const kv = fakeKV();
  const res = await dashboards(
    ctx('POST', {
      body: makeConfig({ name: 'Sigiloso Cliente', auth: { hash: HASH_SENHA } }),
      headers: adminHeaders(),
      env: { DASHBOARDS_KV: kv, ADMIN_TOKEN: ADMIN },
    })
  );
  assert.equal(res.status, 200);
  const j = await readJSON(res);
  assert.equal(j.protected, true, 'segue protegido');
  assert.ok(!vazaNome(j.id, 'Sigiloso Cliente'), `id "${j.id}" vazou o nome`);
  assert.ok(!kv._map.has('dash:sigiloso-cliente'), 'a chave KV nao pode ser o slug do nome');
  const chaves = [...kv._map.keys()].join(' ');
  assert.ok(!/sigiloso|cliente/i.test(chaves), `chaves do KV vazaram o nome: ${chaves}`);
});

test('GET listagem anonima: nenhum id de dashboard protegido revela o nome', async () => {
  const kv = fakeKV();
  const env = { DASHBOARDS_KV: kv, ADMIN_TOKEN: ADMIN };
  for (const nome of ['Sigiloso Cliente', 'Faturamento Acme Janeiro']) {
    const r = await dashboards(
      ctx('POST', { body: makeConfig({ name: nome, auth: { hash: HASH_SENHA } }), headers: adminHeaders(), env })
    );
    assert.equal(r.status, 200, `POST de "${nome}" deve passar`);
  }
  // Publico de controle: continua legivel na landing.
  await dashboards(
    ctx('POST', { body: makeConfig({ name: 'Vendas Time Comercial' }), headers: adminHeaders(), env })
  );

  // Listagem ANONIMA: sem x-admin-token e sem x-dash-auth.
  const res = await dashboards(ctx('GET', { env: { DASHBOARDS_KV: kv } }));
  assert.equal(res.status, 200);
  const lista = await readJSON(res);
  const corpo = JSON.stringify(lista);
  assert.ok(!/sigiloso/i.test(corpo), `listagem publica vazou "Sigiloso": ${corpo}`);
  assert.ok(!/acme/i.test(corpo), `listagem publica vazou "Acme": ${corpo}`);
  assert.ok(!/faturamento/i.test(corpo), `listagem publica vazou "Faturamento": ${corpo}`);

  // Regressao do endurecimento anterior: protegido sai so com id + protected.
  const protegidos = lista.filter((d) => d.protected);
  assert.equal(protegidos.length, 2);
  for (const p of protegidos) {
    assert.deepEqual(Object.keys(p).sort(), ['id', 'protected'], 'protegido so expoe id e protected');
    assert.match(p.id, /^dash-[0-9a-f]{32}$/);
  }

  // Dashboard SEM senha nao pode ter sido afetado: nome e id legiveis seguem.
  const publico = lista.find((d) => !d.protected);
  assert.equal(publico.name, 'Vendas Time Comercial');
  assert.equal(publico.id, 'vendas-time-comercial');
});

test('sobrescrever dashboard protegido com a senha certa mantem o MESMO id', async () => {
  const auth = await derivePasswordAuth(HASH_SENHA);
  const id = 'dash-' + '1234567890abcdef'.repeat(2);
  const antigo = makeConfig({ name: 'Sigiloso Cliente', id, auth, createdAt: '2026-01-01T00:00:00.000Z' });
  const kv = fakeKV({ [`dash:${id}`]: JSON.stringify(antigo) });
  const res = await dashboards(
    ctx('POST', {
      body: makeConfig({ name: 'Sigiloso Cliente Renomeado', id, auth: { hash: HASH_SENHA } }),
      headers: adminHeaders({ 'x-dash-auth': HASH_SENHA }),
      env: { DASHBOARDS_KV: kv, ADMIN_TOKEN: ADMIN },
    })
  );
  assert.equal(res.status, 200);
  const j = await readJSON(res);
  assert.equal(j.id, id, 'o link de um dashboard existente nao pode mudar na edicao');
  assert.equal([...kv._map.keys()].length, 1, 'nao pode criar um segundo registro orfao');
});

test('dashboard sem senha nao regride: id legivel derivado do nome', async () => {
  const kv = fakeKV();
  const res = await dashboards(
    ctx('POST', {
      body: makeConfig({ name: 'Marketing Trafego Pago' }),
      headers: adminHeaders(),
      env: { DASHBOARDS_KV: kv, ADMIN_TOKEN: ADMIN },
    })
  );
  assert.equal(res.status, 200);
  assert.equal((await readJSON(res)).id, 'marketing-trafego-pago');
  assert.ok(kv._map.has('dash:marketing-trafego-pago'));
});

test('dashboard sem senha com acento: slug legivel e sem acento (cobertura que saiu de handlers)', async () => {
  const kv = fakeKV();
  const res = await dashboards(
    ctx('POST', {
      body: makeConfig({ name: 'Café da Manhã' }),
      headers: adminHeaders(),
      env: { DASHBOARDS_KV: kv, ADMIN_TOKEN: ADMIN },
    })
  );
  assert.equal(res.status, 200);
  assert.equal((await readJSON(res)).id, 'cafe-da-manha');
  assert.ok(kv._map.has('dash:cafe-da-manha'));
});
