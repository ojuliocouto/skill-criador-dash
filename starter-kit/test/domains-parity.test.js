// PARIDADE das duas copias de DOMAINS (fronteira Cloudflare Pages).
//
// Existe uma copia para o BROWSER (public/assets/js/domains.mjs) e outra para o
// SERVIDOR (functions/lib/domains.mjs) porque o Pages serve so public/ como raiz:
// o browser nao pode importar de functions/ (404 no runtime). As duas listas TEM
// de ser identicas, senao um dominio adicionado num lado so vira drift silencioso.
// Este teste falha se divergirem.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DOMAINS as BROWSER_DOMAINS, isDomain as browserIsDomain } from '../public/assets/js/domains.mjs';
import { DOMAINS as SERVER_DOMAINS, isDomain as serverIsDomain } from '../functions/lib/domains.mjs';

test('DOMAINS do browser e do servidor sao IDENTICOS (mesma ordem, mesmos itens)', () => {
  assert.deepEqual([...BROWSER_DOMAINS], [...SERVER_DOMAINS]);
});

test('as duas copias de DOMAINS estao congeladas (Object.freeze)', () => {
  assert.ok(Object.isFrozen(BROWSER_DOMAINS), 'browser DOMAINS congelado');
  assert.ok(Object.isFrozen(SERVER_DOMAINS), 'servidor DOMAINS congelado');
});

test('isDomain do browser e do servidor concordam para cada dominio e para invalidos', () => {
  for (const id of BROWSER_DOMAINS) {
    assert.equal(browserIsDomain(id), true, `browser aceita ${id}`);
    assert.equal(serverIsDomain(id), true, `servidor aceita ${id}`);
  }
  for (const invalido of ['financeiro', '', null, undefined, 42, {}]) {
    assert.equal(browserIsDomain(invalido), false);
    assert.equal(serverIsDomain(invalido), false);
  }
});
