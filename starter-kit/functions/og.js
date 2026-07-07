// Rota /og?id=<id>: imagem de compartilhamento (OpenGraph) do dashboard, em SVG
// branded com a cor da marca. Le a config no KV pelo id. Protegido ou nao achado
// -> imagem generica (nao vaza nome/dominio). Leitura publica, sem mutacao.
import { ogImageSvg } from './lib/og.mjs';
import { needsAuth } from './lib/auth-config.mjs';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';

  let config = null;
  let isProtected = false;
  try {
    const kv = env && env.DASHBOARDS_KV;
    if (kv && id) {
      const raw = await kv.get('dash:' + id);
      if (raw) {
        config = JSON.parse(raw);
        isProtected = needsAuth(config);
      }
    }
  } catch {
    // Qualquer falha (KV fora, JSON corrompido): cai na imagem generica.
    config = null;
    isProtected = false;
  }

  const svg = ogImageSvg(config, { id, isProtected });
  return new Response(svg, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
