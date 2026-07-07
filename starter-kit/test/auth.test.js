import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex } from '../public/assets/js/lib/auth.js';
import { needsAuth, authOk, stripSecrets } from '../functions/api/dashboards.js';
import { derivePasswordAuth, safeEqual, checkAdminToken } from '../functions/lib/auth-config.mjs';

// ROBUSTEZ (auth-config.mjs safeEqual): a comparacao deve ser tempo-constante e
// NAO fazer early-return por diferenca de comprimento (o early-return vazava o
// tamanho do segredo via timing). O resultado logico continua: true so se iguais.
test('safeEqual: comprimentos diferentes retornam false; iguais retornam true', () => {
  assert.equal(safeEqual('abc', 'abcdef'), false);   // tamanhos diferentes
  assert.equal(safeEqual('abcdef', 'abc'), false);   // ordem inversa tambem
  assert.equal(safeEqual('', 'x'), false);
  assert.equal(safeEqual('igual', 'igual'), true);   // identicos
  assert.equal(safeEqual('', ''), true);             // ambos vazios
  assert.equal(safeEqual('abc', 'abd'), false);      // mesmo tamanho, difere
});

test('safeEqual: nao faz early-return por diferenca de length (inspeciona a fonte)', () => {
  // Garante que a implementacao NAO cortou cedo por diferenca de comprimento.
  // Inspecao do codigo-fonte: o corpo da funcao nao pode conter o padrao
  // "return false" guardado por comparacao de .length (o vazamento por timing).
  const src = safeEqual.toString();
  assert.doesNotMatch(
    src,
    /\.length\s*!==[^\n]*return|length[^\n]*return\s+false/,
    'safeEqual nao pode retornar cedo por diferenca de length',
  );
  // E o comportamento continua correto para tamanhos bem diferentes.
  assert.equal(safeEqual('a', 'abcdefghijklmnop'), false);
  assert.equal(safeEqual('abcdefghijklmnop', 'a'), false);
});

// checkAdminToken: modelo FAIL-CLOSED. So e chamado nas MUTACOES (POST/DELETE de
// dashboards e POST de preview do Meta), nunca na leitura (GET). Devolve null
// (libera) so quando o servidor TEM ADMIN_TOKEN e o header x-admin-token bate.
async function statusEBody(res) {
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
function reqComToken(token) {
  const headers = token == null ? {} : { 'x-admin-token': token };
  return new Request('https://x/api/dashboards', { method: 'POST', headers });
}

test('checkAdminToken: sem ADMIN_TOKEN -> 403 adminNotConfigured (fail-closed, nao needsAdmin)', async () => {
  const res = checkAdminToken({}, reqComToken(null));
  assert.ok(res, 'sem ADMIN_TOKEN a mutacao deve ser bloqueada (nao liberada)');
  const { status, body } = await statusEBody(res);
  assert.equal(status, 403);
  assert.equal(body.adminNotConfigured, true);
  assert.equal(body.needsAdmin, undefined, 'nao usa needsAdmin: colar token no cliente nao resolve');
  assert.match(body.error, /ADMIN_TOKEN/i);
});

test('checkAdminToken: ADMIN_TOKEN setado + header correto -> libera (null)', () => {
  assert.equal(checkAdminToken({ ADMIN_TOKEN: 'segredo' }, reqComToken('segredo')), null);
});

test('checkAdminToken: ADMIN_TOKEN setado + header ausente/errado -> 401 needsAdmin', async () => {
  const ausente = await statusEBody(checkAdminToken({ ADMIN_TOKEN: 'segredo' }, reqComToken(null)));
  assert.equal(ausente.status, 401);
  assert.equal(ausente.body.needsAdmin, true);
  assert.equal(ausente.body.adminNotConfigured, undefined);

  const errado = await statusEBody(checkAdminToken({ ADMIN_TOKEN: 'segredo' }, reqComToken('outro')));
  assert.equal(errado.status, 401);
  assert.equal(errado.body.needsAdmin, true);
});

test('sha256Hex: vetor conhecido e determinismo', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await sha256Hex('senha123'), await sha256Hex('senha123'));
  assert.notEqual(await sha256Hex('a'), await sha256Hex('b'));
});

test('needsAuth: protegido so no formato v2 (verifier); legado nao conta', () => {
  assert.equal(needsAuth({ auth: { verifier: 'v', salt: 's', iterations: 100000 } }), true); // v2 salgado
  assert.equal(needsAuth({ auth: { hash: 'x' } }), false); // legado nao e mais reconhecido
  assert.equal(needsAuth({ auth: {} }), false);
  assert.equal(needsAuth({}), false);
  assert.equal(needsAuth(null), false);
});

// authOk agora e ASSINCRONA (o formato v2 recomputa PBKDF2 salgado).
test('authOk: sem senha sempre ok', async () => {
  assert.equal(await authOk({}, undefined), true);
  assert.equal(await authOk(null, 'qualquer'), true);
});

// Fallback legado REMOVIDO: um config antigo `{ hash }` (SHA-256 cru reenviavel)
// nao autentica ninguem. needsAuth({hash}) e false, entao authOk libera como
// "sem senha" (nao ha verifier para checar); o que NUNCA acontece e aceitar o
// hash cru como credencial valida (o caminho reenviavel foi eliminado).
test('authOk (legado removido): hash cru nunca e aceito como credencial', async () => {
  // Como o legado nao e mais reconhecido, `{ hash }` cai no ramo "sem senha".
  // O importante: enviar o proprio hash cru NAO garante mais acesso a nada v2.
  assert.equal(await authOk({ auth: { hash: 'abc' } }, 'abc'), true);  // tratado como sem senha
  assert.equal(await authOk({ auth: { hash: 'abc' } }, 'xyz'), true);  // idem: legado ignorado
});

test('authOk (v2 salgado): aceita o header correto e rejeita o errado', async () => {
  const clientHash = await sha256Hex('senha-forte');
  const auth = await derivePasswordAuth(clientHash);
  // Bloco gravado e salgado + verifier, NUNCA o hash cru enviado no header.
  assert.equal(auth.hash, undefined);
  assert.ok(auth.salt && auth.verifier);
  assert.notEqual(auth.verifier, clientHash, 'verifier nao pode ser o hash reenviavel');
  assert.equal(auth.algo, 'PBKDF2-SHA256');
  assert.ok(auth.iterations >= 100000);

  assert.equal(await authOk({ auth }, clientHash), true);          // header correto
  assert.equal(await authOk({ auth }, clientHash + '0'), false);   // header errado
  assert.equal(await authOk({ auth }, ''), false);                 // header vazio
});

test('authOk (v2): dump do config NAO expoe nada reenviavel no header', async () => {
  const clientHash = await sha256Hex('outra-senha');
  const auth = await derivePasswordAuth(clientHash);
  // Simula um dump do KV: quem tem o verifier NAO consegue autenticar reenviando-o.
  assert.equal(await authOk({ auth }, auth.verifier), false);
});

test('stripSecrets: remove bloco auth (salt/verifier/iterations) e token do Meta, marca protected', () => {
  const cfg = {
    name: 'X', domain: 'marketing',
    auth: { salt: 'c2FsdA==', verifier: 'dmVyaWZpZXI=', iterations: 100000, algo: 'PBKDF2-SHA256' },
    source: { type: 'meta', meta: { token: 'EAAB-secreto', account: '123' } },
    colMap: { data: 'Data' },
  };
  const out = stripSecrets(cfg);
  // O bloco auth inteiro some: sal, verifier e iterations tambem sao segredos.
  assert.equal(out.auth, undefined);
  assert.equal(out.source.meta.token, undefined);
  assert.equal(out.source.meta.account, '123'); // account nao e segredo
  assert.equal(out.protected, true);
  assert.equal(out.name, 'X');
  // nao muta o original
  assert.equal(cfg.auth.verifier, 'dmVyaWZpZXI=');
  assert.equal(cfg.auth.salt, 'c2FsdA==');
  assert.equal(cfg.source.meta.token, 'EAAB-secreto');
});

test('stripSecrets: bloco auth legado (hash cru) e removido e NAO conta como protegido', () => {
  const cfg = { name: 'Z', auth: { hash: 'segredo' }, source: { type: 'csv', data: 'a' }, colMap: {} };
  const out = stripSecrets(cfg);
  assert.equal(out.auth, undefined);            // o hash cru nunca vai pro browser
  assert.equal(out.protected, false);           // legado nao e mais reconhecido como senha
  assert.equal(cfg.auth.hash, 'segredo');       // nao muta original
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
