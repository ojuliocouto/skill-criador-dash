// Conector Meta Ads (Facebook/Instagram) via Graph API.
// A logica pura (montar URL, mapear resposta) vive em ../../lib/meta.mjs.
//
// Dois modos:
//  - POST (preview): recebe { token, account, since, until } no corpo. Usado pelo
//    wizard antes de salvar. O token NAO e gravado aqui, so usado na hora.
//  - GET ?id=<dashboardId>: le a config no KV, pega o token guardado em
//    source.meta e busca os dados. O token fica SO no servidor, nunca vai pro browser.

import { buildInsightsUrl, mapInsightsToDataSet } from '../../lib/meta.mjs';
import { needsAuth, authOk } from '../../lib/auth-config.mjs';
import { checkAdminToken } from '../dashboards.js';

const JSON_HEADERS = { 'content-type': 'application/json' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const erro = (mensagem, status) => json({ error: mensagem }, status);

// Mensagem generica de preview: NAO repassa o texto cru da Graph API para o
// cliente, senao o endpoint vira um oraculo de validacao de token/conta (qualquer
// um testaria tokens roubados e leria a resposta detalhada da Meta).
const PREVIEW_ERRO_GENERICO = 'Nao foi possivel validar o token/conta do Meta Ads. Confira o access token e o id da conta e tente de novo.';

async function fetchMeta({ token, account, since, until } = {}) {
  const url = buildInsightsUrl({ token, accountId: account, since, until });
  const res = await fetch(url);
  const body = await res.json();
  const ds = mapInsightsToDataSet(body); // lanca Error se a Graph API devolver {error}
  ds.meta = ds.meta || {};
  ds.meta.fetchedAt = new Date().toISOString();
  return ds;
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  try {
    if (method === 'POST') {
      // AUTORIZACAO do preview: se ADMIN_TOKEN estiver setado no env, exige o header
      // x-admin-token (mesma logica das mutacoes de dashboards). Sem essa trava, o
      // preview seria um relay anonimo da Graph API, sem auth nem rate limit.
      const adminGate = checkAdminToken(env, request);
      if (adminGate) return adminGate;

      let body;
      try { body = await request.json(); } catch { return erro('Corpo invalido. Envie token e account.', 400); }
      // No preview, mapeia QUALQUER falha para uma mensagem generica: nao vaza o
      // texto cru da Graph API (que revelaria se o token/conta e valido).
      try {
        return json(await fetchMeta(body));
      } catch {
        return erro(PREVIEW_ERRO_GENERICO, 400);
      }
    }

    if (method === 'GET') {
      const { searchParams } = new URL(request.url);
      const id = searchParams.get('id');
      if (!id) return erro('Parametro "id" e obrigatorio.', 400);
      const kv = env && env.DASHBOARDS_KV;
      if (!kv) return erro('Binding DASHBOARDS_KV nao configurado.', 500);
      const raw = await kv.get(`dash:${id}`);
      if (!raw) return erro('Dashboard nao encontrado.', 404);
      let config;
      try { config = JSON.parse(raw); } catch { return erro('Configuracao corrompida.', 500); }
      // Protecao por senha: dashboard protegido exige a senha tambem para os DADOS.
      if (needsAuth(config) && !(await authOk(config, request.headers.get('x-dash-auth') || ''))) {
        return json({ error: 'Senha necessária ou incorreta.', needsPassword: true }, 401);
      }
      const m = config.source && config.source.meta;
      if (!m || !m.token) return erro('Este dashboard nao tem conector Meta Ads configurado.', 400);
      return json(await fetchMeta(m));
    }

    return erro(`Metodo ${method} nao suportado.`, 405);
  } catch (e) {
    return erro(e && e.message ? e.message : 'Falha ao consultar o Meta Ads.', 502);
  }
}
