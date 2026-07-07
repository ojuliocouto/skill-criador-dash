// Conectores de 2a onda (CRM e Hotmart) ainda não implementados.
// Garante que respondem 501 com JSON { error: ... } e não vazam stub silencioso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest as crmOnRequest } from '../functions/api/connectors/crm.js';
import { onRequest as hotmartOnRequest } from '../functions/api/connectors/hotmart.js';

// Monta um context fake mínimo no formato que o Pages Functions passa pro handler.
function fakeContext(path) {
  return { request: new Request(`https://x${path}`), env: {} };
}

test('conector CRM responde 501 com JSON { error }', async () => {
  const res = await crmOnRequest(fakeContext('/api/connectors/crm'));
  assert.equal(res.status, 501);
  assert.match(res.headers.get('content-type') || '', /application\/json/);
  const body = await res.json();
  assert.equal(typeof body.error, 'string');
  assert.ok(body.error.length > 0);
});

test('conector Hotmart responde 501 com JSON { error }', async () => {
  const res = await hotmartOnRequest(fakeContext('/api/connectors/hotmart'));
  assert.equal(res.status, 501);
  assert.match(res.headers.get('content-type') || '', /application\/json/);
  const body = await res.json();
  assert.equal(typeof body.error, 'string');
  assert.ok(body.error.length > 0);
});
