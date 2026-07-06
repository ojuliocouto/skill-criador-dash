import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex } from '../public/assets/js/lib/auth.js';
import { needsAuth, authOk, stripSecrets } from '../functions/api/dashboards.js';

test('sha256Hex: vetor conhecido e determinismo', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await sha256Hex('senha123'), await sha256Hex('senha123'));
  assert.notEqual(await sha256Hex('a'), await sha256Hex('b'));
});

test('needsAuth: so quando ha hash de senha', () => {
  assert.equal(needsAuth({ auth: { hash: 'x' } }), true);
  assert.equal(needsAuth({ auth: {} }), false);
  assert.equal(needsAuth({}), false);
  assert.equal(needsAuth(null), false);
});

test('authOk: sem senha sempre ok; com senha exige hash igual', () => {
  assert.equal(authOk({}, undefined), true);
  assert.equal(authOk({ auth: { hash: 'abc' } }, 'abc'), true);
  assert.equal(authOk({ auth: { hash: 'abc' } }, 'xyz'), false);
  assert.equal(authOk({ auth: { hash: 'abc' } }, ''), false);
});

test('stripSecrets: remove hash da senha e token do Meta, marca protected', () => {
  const cfg = {
    name: 'X', domain: 'marketing',
    auth: { hash: 'segredo' },
    source: { type: 'meta', meta: { token: 'EAAB-secreto', account: '123' } },
    colMap: { data: 'Data' },
  };
  const out = stripSecrets(cfg);
  assert.equal(out.auth.hash, undefined);
  assert.equal(out.source.meta.token, undefined);
  assert.equal(out.source.meta.account, '123'); // account nao e segredo
  assert.equal(out.protected, true);
  assert.equal(out.name, 'X');
  // nao muta o original
  assert.equal(cfg.auth.hash, 'segredo');
  assert.equal(cfg.source.meta.token, 'EAAB-secreto');
});

test('stripSecrets: dashboard sem senha marca protected false', () => {
  const out = stripSecrets({ name: 'Y', source: { type: 'csv', data: 'a' }, colMap: {} });
  assert.equal(out.protected, false);
});

test('stripSecrets: varre credencial em QUALQUER campo da fonte (nao so meta.token)', () => {
  const cfg = {
    name: 'X', domain: 'marketing',
    source: {
      type: 'custom',
      token: 'raiz-secreta',
      apiKey: 'ak-123',
      crm: { token: 'crm-secreto', account: 'ok-manter' },
      headers: { Authorization: 'Bearer zzz', 'X-Api-Key': 'kkk' },
      url: 'https://ok-publico',
    },
    colMap: {},
  };
  const out = stripSecrets(cfg);
  assert.equal(out.source.token, undefined);
  assert.equal(out.source.apiKey, undefined);
  assert.equal(out.source.crm.token, undefined);
  assert.equal(out.source.crm.account, 'ok-manter');       // nao-segredo preservado
  assert.equal(out.source.headers.Authorization, undefined);
  assert.equal(out.source.headers['X-Api-Key'], undefined);
  assert.equal(out.source.url, 'https://ok-publico');      // url nao e segredo
  // nao muta o original
  assert.equal(cfg.source.token, 'raiz-secreta');
});
