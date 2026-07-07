// Rate limiter de JANELA FIXA usando KV. ESM, puro o suficiente para testar com
// um stub de KV.
//
// PARA QUE SERVE (graves de seguranca):
//  1. Preview do Meta Ads (POST /api/connectors/meta-ads): sem limite, o endpoint
//     e um relay/SSRF anonimo que valida tokens em lote contra a Graph API, do IP
//     do dono. Rate limit por IP fecha o relay ilimitado.
//  2. Gate de senha (x-dash-auth): sem contador, da pra fazer brute force online
//     da senha variando o header. Rate limit por IP+id barra a forca bruta sem
//     punir o uso legitimo (so conta as TENTATIVAS ERRADAS).
//  3. Conector Sheets (GET /api/connectors/sheets): relay de fetch anonimo. Rate
//     limit por IP evita virar proxy de fetch ilimitado.
//
// STORE DO CONTADOR (NAO PODE FALHAR ABERTO): o rate limit usa
// `env.DASHBOARD_CACHE || env.DASHBOARDS_KV` como store. DASHBOARD_CACHE e um
// binding OPCIONAL (nem todo deploy vincula o KV de cache); DASHBOARDS_KV e
// OBRIGATORIO (sem ele a API ja responde 500). Antes, o rate limit usava SO o
// DASHBOARD_CACHE e, quando ele nao estava vinculado (o caminho de deploy mais
// comum), TODO o rate limit desligava em silencio -> brute force ilimitado. Com o
// fallback, o rate limit conta no DASHBOARDS_KV quando nao ha cache dedicado, e so
// libera sem contar no caso degenerado em que NENHUM dos dois existe.
//
// MODELO (janela fixa): a chave e `rl:<key>:<janela>`, onde
//   janela = floor(agoraEmSegundos / windowSec).
// Le o contador atual, incrementa e regrava com expirationTtl = windowSec (a
// chave expira sozinha quando a janela passa). Simples, sem transacao: em corrida
// o pior caso e contar de menos, o que e aceitavel para anti-abuso.

/**
 * Deriva o IP do cliente a partir do header CF-Connecting-IP (injetado pelo
 * Cloudflare). Fallback 'unknown' quando o header nao vem (ex: teste local).
 * @param {Request} request
 * @returns {string}
 */
export function clientIp(request) {
  try {
    return (request && request.headers && request.headers.get('CF-Connecting-IP')) || 'unknown';
  } catch {
    return 'unknown';
  }
}

// Limites padrao do gate de senha (brute force online): por IP+id.
export const AUTH_LIMIT = 8;
export const AUTH_WINDOW = 300; // 5 min

/**
 * Rate limit especifico do gate de senha, por IP + id de dashboard. Chame SO
 * quando a senha estiver ERRADA (senha certa nao consome o balde). Objetivo:
 * barrar brute force online sem punir o uso legitimo.
 * @param {Object} env
 * @param {Request} request
 * @param {string} id  id do dashboard alvo
 * @returns {Promise<{ ok: boolean, retryAfter?: number }>}
 */
export async function authRateLimit(env, request, id) {
  return rateLimit(env, `auth:${clientIp(request)}:${id || ''}`, { limit: AUTH_LIMIT, windowSec: AUTH_WINDOW });
}

/**
 * Aplica rate limit de janela fixa em KV.
 * @param {Object} env  ambiente das Functions. Store = env.DASHBOARD_CACHE (KV de
 *   cache, opcional) OU, em fallback, env.DASHBOARDS_KV (obrigatorio). Ver topo do
 *   arquivo: usar so o cache fazia o rate limit falhar ABERTO no deploy comum.
 * @param {string} key  identificador do balde (ex: 'meta-preview:1.2.3.4' ou 'auth:1.2.3.4:dashId')
 * @param {{ limit: number, windowSec: number, nowSec?: () => number }} opts
 *   limit      = maximo de chamadas por janela
 *   windowSec  = tamanho da janela em segundos (tambem e o TTL da chave no KV)
 *   nowSec     = relogio injetavel (segundos), so para teste; default Date.now()/1000
 * @returns {Promise<{ ok: boolean, remaining?: number, retryAfter?: number }>}
 */
export async function rateLimit(env, key, opts = {}) {
  // Store do contador: prefere o KV de cache dedicado; se ele nao estiver
  // vinculado (binding opcional), cai no DASHBOARDS_KV (obrigatorio). Assim o rate
  // limit NAO desliga em silencio quando so o cache falta. So libera sem contar no
  // caso degenerado em que NENHUM dos dois KVs existe (a API ja daria 500 antes).
  const kv = (env && env.DASHBOARD_CACHE) || (env && env.DASHBOARDS_KV);
  if (!kv) return { ok: true };

  const limit = Number(opts.limit) || 0;
  const windowSec = Number(opts.windowSec) || 60;
  const nowSec = typeof opts.nowSec === 'function' ? opts.nowSec() : Date.now() / 1000;

  const janela = Math.floor(nowSec / windowSec);
  const kvKey = `rl:${key}:${janela}`;

  try {
    const atual = Number(await kv.get(kvKey)) || 0;

    // Ja estourou: nao incrementa mais (evita empurrar o TTL pra frente a cada
    // tentativa) e devolve os segundos ate a janela virar.
    if (atual >= limit) {
      const fimDaJanela = (janela + 1) * windowSec;
      const retryAfter = Math.max(1, Math.ceil(fimDaJanela - nowSec));
      return { ok: false, remaining: 0, retryAfter };
    }

    const novo = atual + 1;
    await kv.put(kvKey, String(novo), { expirationTtl: windowSec });
    return { ok: true, remaining: Math.max(0, limit - novo) };
  } catch {
    // Falha de infra do KV nao pode derrubar o request nem punir o legitimo.
    return { ok: true };
  }
}
