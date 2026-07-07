// Middleware global das Functions.
// - CORS liberado (GET/POST/DELETE/OPTIONS) + resposta a preflight OPTIONS.
// - Cache opcional em DASHBOARD_CACHE (KV) só para GET de /api/connectors/*.
// - Nunca cacheia /api/dashboards (dados mutáveis).
// - Sempre devolve Cache-Control: no-store ao browser.

// So expomos GET para cross-origin (leitura). POST/DELETE ficam de fora do CORS:
// mutacao e same-origin (as proprias paginas), entao o browser bloqueia mutacao
// cross-origin. Isso, somado a checagem de senha, protege quem muta/le dado protegido.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-dash-auth',
  'Access-Control-Max-Age': '86400',
};

const CACHE_TTL = 300; // segundos

// Headers de seguranca (defesa em profundidade) aplicados a TODAS as respostas.
// - X-Content-Type-Options: impede o browser de "adivinhar" (sniff) o tipo do conteudo.
// - X-Frame-Options: nega enquadrar as paginas em iframe (anti-clickjacking).
// - Content-Security-Policy: politica PRAGMATICA que NAO quebra o app.
//   'unsafe-inline' em script-src e style-src e NECESSARIO porque as paginas usam
//   um <script> inline (anti-flash de tema no head) e os widgets usam atributos
//   style="..." inline. Isso e uma camada extra, nao a unica protecao.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
};

function withHeaders(response, extra = {}) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries({ ...CORS, ...SECURITY_HEADERS, 'Cache-Control': 'no-store', ...extra })) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isCacheableBody(text) {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed === '' || trimmed === '[]' || trimmed === '{}') return false;
  return true;
}

// Decide se uma resposta pode ir pro cache. So cacheia JSON de verdade (200 +
// content-type application/json + corpo nao vazio). Isso impede cachear o HTML
// de fallback (SPA) que pode aparecer durante a propagacao de um deploy.
export function shouldCache(status, contentType, body) {
  return status === 200 && String(contentType || '').includes('application/json') && isCacheableBody(body);
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const method = request.method.toUpperCase();

  // Preflight CORS.
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...CORS, 'Cache-Control': 'no-store' } });
  }

  const url = new URL(request.url);
  const cache = env && env.DASHBOARD_CACHE;
  const cacheavel =
    !!cache &&
    method === 'GET' &&
    url.pathname.startsWith('/api/connectors/') &&
    !url.pathname.startsWith('/api/dashboards');

  if (!cacheavel) {
    const response = await next();
    return withHeaders(response);
  }

  // A chave inclui o header de senha: assim um pedido SEM a senha (ou com senha
  // errada) tem chave diferente, da cache MISS, cai no handler e recebe 401.
  // Sem isso, uma resposta de dado protegido cacheada vazaria pra quem nao tem a senha.
  const cacheKey = url.pathname + url.search + '|' + (request.headers.get('x-dash-auth') || '');

  // Tenta servir do cache.
  const hit = await cache.get(cacheKey);
  if (hit) {
    return withHeaders(
      new Response(hit, { status: 200, headers: { 'content-type': 'application/json' } }),
      { 'X-Cache': 'HIT' }
    );
  }

  // Miss: busca a resposta real e cacheia se valer a pena.
  const response = await next();
  const body = await response.clone().text();
  const contentType = response.headers.get('content-type') || '';

  if (shouldCache(response.status, contentType, body)) {
    try {
      await cache.put(cacheKey, body, { expirationTtl: CACHE_TTL });
    } catch {
      // Falha ao gravar cache não pode derrubar a resposta.
    }
  }

  return withHeaders(response, { 'X-Cache': 'MISS' });
}
