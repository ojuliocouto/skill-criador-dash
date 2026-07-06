// Hash SHA-256 em hex. Usado para proteger o dashboard com senha (opcional),
// sem guardar a senha em texto puro. Funciona no browser e no node (Web Crypto).
// A senha nunca trafega nem e gravada em texto puro: so o hash.

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text == null ? '' : text));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
