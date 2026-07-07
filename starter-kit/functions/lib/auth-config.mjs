// Modulo neutro de autenticacao de dashboard (ESM, puro em logica, usa Web Crypto).
// Vive fora da camada de config para que os conectores (d1, meta-ads) possam
// checar protecao por senha SEM depender de functions/api/dashboards.js
// (elimina o acoplamento do conector pra cima).
//
// MODELO DE SENHA (v2, salgado + PBKDF2):
//  - O cliente calcula sha256Hex(senha) e envia esse hash no header x-dash-auth
//    (a senha em texto puro nunca trafega alem do TLS).
//  - Ao DEFINIR a senha, o servidor gera um sal aleatorio por dashboard e guarda
//    `auth = { salt, verifier, iterations, algo: 'PBKDF2-SHA256' }`, onde
//    verifier = base64(PBKDF2(hashRecebidoDoCliente, salt, iterations, SHA-256)).
//    NUNCA guardamos o hash cru que o header envia: um dump do KV traz so o
//    verifier salgado, que NAO e reenviavel no header e mata rainbow table.
//  - Ao AUTENTICAR, o servidor recomputa PBKDF2(headerRecebido, salt, iterations)
//    e compara com o verifier guardado em tempo constante.
//
// FORMATO UNICO (sem legado): so o formato v2 salgado e aceito. Como isto e um
// template/skill (cada pessoa faz deploy do zero, NAO existe dashboard legado
// gravado em producao), NAO ha fallback para o formato antigo `{ hash }` (SHA-256
// cru), que era uma credencial reenviavel em texto no KV. Um config antigo com
// `{ hash }` e tratado como invalido (nega acesso) em vez de aceitar o hash cru.
//
// LIMITACAO CONHECIDA (ver README): o header x-dash-auth carrega sha256(senha) e
// NAO ha rate limit no servidor (modelo de senha compartilhada). Implementar rate
// limit exigiria storage (KV/D1) por IP/dashboard e esta fora do escopo aqui.

// Numero de iteracoes padrao do PBKDF2 ao definir uma senha nova.
export const DEFAULT_PBKDF2_ITERATIONS = 100000;

// Comparacao de strings em tempo constante (nao vaza onde diferem via timing).
export function safeEqual(a, b) {
  const x = String(a == null ? '' : a);
  const y = String(b == null ? '' : b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

// ---- Helpers base64 <-> bytes (Web Crypto devolve ArrayBuffer) ----
function bytesToBase64(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

function utf8Bytes(text) {
  return new TextEncoder().encode(String(text == null ? '' : text));
}

// Sal aleatorio em base64 (16 bytes = 128 bits).
function randomSaltBase64() {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return bytesToBase64(salt.buffer);
}

/**
 * Deriva o verifier PBKDF2-SHA256 a partir do hash que o cliente envia no header.
 * @param {string} clientHash  sha256Hex(senha) recebido do cliente
 * @param {string} saltB64     sal em base64
 * @param {number} iterations  numero de iteracoes
 * @returns {Promise<string>}  verifier em base64
 */
async function derivePbkdf2Base64(clientHash, saltB64, iterations) {
  const key = await crypto.subtle.importKey(
    'raw',
    utf8Bytes(clientHash),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const saltBytes = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    key,
    256
  );
  return bytesToBase64(bits);
}

/**
 * Monta o bloco `auth` salgado para GRAVAR, a partir do hash enviado pelo cliente.
 * Gera um sal aleatorio novo por dashboard. NUNCA guarda o hash cru.
 * @param {string} clientHash  sha256Hex(senha) que o cliente manda no header
 * @param {number} [iterations]
 * @returns {Promise<{ salt: string, verifier: string, iterations: number, algo: string }>}
 */
export async function derivePasswordAuth(clientHash, iterations = DEFAULT_PBKDF2_ITERATIONS) {
  const salt = randomSaltBase64();
  const verifier = await derivePbkdf2Base64(clientHash, salt, iterations);
  return { salt, verifier, iterations, algo: 'PBKDF2-SHA256' };
}

/** Indica se o dashboard exige senha para ser aberto (formato v2 salgado). */
export function needsAuth(config) {
  const a = config && config.auth;
  if (!a) return false;
  return !!a.verifier;
}

/**
 * Confere se o hash de senha fornecido bate com o guardado (ou se nao ha senha).
 * ASSINCRONA: o formato v2 recomputa PBKDF2 salgado. Todos os chamadores ja rodam
 * em handlers async, entao basta usar `await authOk(...)`.
 * @param {Object} config
 * @param {string} providedHash  o valor recebido no header x-dash-auth
 * @returns {Promise<boolean>}
 */
export async function authOk(config, providedHash) {
  if (!needsAuth(config)) return true;
  if (typeof providedHash !== 'string' || !providedHash) return false;
  const a = config.auth;
  // So o formato v2 (salgado + PBKDF2) e aceito: recomputa e compara com o verifier
  // em tempo constante. Nao ha fallback para o formato legado `{ hash }` (SHA-256
  // cru reenviavel): um config antigo sem verifier ja e negado por needsAuth acima.
  if (!a.salt) return false;
  const iterations = Number(a.iterations) || DEFAULT_PBKDF2_ITERATIONS;
  let computed;
  try {
    computed = await derivePbkdf2Base64(providedHash, a.salt, iterations);
  } catch {
    return false;
  }
  return safeEqual(computed, a.verifier);
}

/**
 * Trava global opcional de mutacao. Se env.ADMIN_TOKEN estiver definido, exige o
 * header x-admin-token igual a ele (comparacao em tempo constante). Devolve uma
 * Response 401 quando o token esta definido mas o header falta/nao bate; devolve
 * null (segue o fluxo) quando o token nao esta definido ou o header confere.
 *
 * Vive aqui (modulo neutro de auth) e nao no handler de config para que os
 * conectores (meta-ads, d1) possam usar a trava SEM importar de dashboards.js.
 * @param {Object} env
 * @param {Request} request
 * @returns {Response|null}
 */
export function checkAdminToken(env, request) {
  const adminToken = env && env.ADMIN_TOKEN;
  if (!adminToken) return null; // sem token configurado: instancia aberta (comportamento atual).
  const provided = request.headers.get('x-admin-token') || '';
  if (safeEqual(provided, adminToken)) return null;
  return new Response(
    JSON.stringify({ error: 'Token de administrador necessário ou incorreto.', needsAdmin: true }),
    { status: 401, headers: { 'content-type': 'application/json' } }
  );
}
