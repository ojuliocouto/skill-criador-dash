// Modulo neutro de autenticacao de dashboard (ESM, puro, sem rede nem KV).
// Vive fora da camada de config para que os conectores (d1, meta-ads) possam
// checar protecao por senha SEM depender de functions/api/dashboards.js
// (elimina o acoplamento do conector pra cima).

// Comparacao de strings em tempo constante (nao vaza onde diferem via timing).
export function safeEqual(a, b) {
  const x = String(a == null ? '' : a);
  const y = String(b == null ? '' : b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/** Indica se o dashboard exige senha para ser aberto. */
export function needsAuth(config) {
  return !!(config && config.auth && config.auth.hash);
}

/** Confere se o hash de senha fornecido bate com o guardado (ou se nao ha senha). */
export function authOk(config, providedHash) {
  if (!needsAuth(config)) return true;
  return typeof providedHash === 'string' && safeEqual(providedHash, config.auth.hash);
}
