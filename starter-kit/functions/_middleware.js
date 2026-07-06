// Middleware global das Functions.
// - CORS liberado (GET/POST/DELETE/OPTIONS) + resposta a preflight OPTIONS.
// - Cache opcional em DASHBOARD_CACHE (KV) só para GET de /api/connectors/*.
// - Nunca cacheia /api/dashboards (dados mutáveis).
// - Sempre devolve Cache-Control: no-store ao browser.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const CACHE_TTL = 300; // segundos

function withHeaders(response, extra = {}) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries({ ...CORS, 'Cache-Control': 'no-store', ...extra })) {
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

  const cacheKey = url.pathname + url.search;

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

  if (response.status === 200 && isCacheableBody(body)) {
    try {
      await cache.put(cacheKey, body, { expirationTtl: CACHE_TTL });
    } catch {
      // Falha ao gravar cache não pode derrubar a resposta.
    }
  }

  return withHeaders(response, { 'X-Cache': 'MISS' });
}
