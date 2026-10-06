// Checagem da chave de administrador SEM mutar nada (POST /api/admin-check).
//
// Por que existe: o assistente só descobria que o ambiente exige chave depois de a pessoa
// preencher os quatro passos e clicar em criar. Não havia jeito limpo de perguntar antes: o
// único caminho que respondia 401/403 sem gravar era mandar uma mutação quebrada de propósito
// (DELETE sem id), o que é frágil e assusta. Esta rota responde a pergunta e só ela.
//
// O que NÃO muda: a trava das mutações (checkAdminToken em auth-config.mjs) continua igual,
// fail-closed, com 401 needsAdmin e 403 adminNotConfigured.
//
// O que a rota revela: dois booleanos. "O servidor tem ADMIN_TOKEN?" já era público (qualquer
// POST em /api/dashboards responde 403 ou 401). "Esta chave confere?" também já era
// respondido por qualquer mutação, sem limite nenhum. Aqui há limite: tentativa ERRADA conta
// por IP (CHECK_LIMIT por CHECK_WINDOW) e, estourado o limite, a resposta é 429 até a janela
// virar, inclusive pra chave certa (senão o chute certo ainda seria confirmado). Então esta
// rota é um oráculo PIOR que o que já existia, nunca um atalho pra força bruta.
// A comparação é em tempo constante (safeEqual) e a chave só entra pelo header, nunca por URL.

import { safeEqual } from './auth-config.mjs';
import { rateLimit, rateLimitEstourado, clientIp } from './rate-limit.mjs';

export const CHECK_LIMIT = 10;
export const CHECK_WINDOW = 300; // 5 min

const JSON_HEADERS = { 'content-type': 'application/json' };
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });

/**
 * @param {Object} env
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function checarAdmin(env, request) {
  if (request.method.toUpperCase() !== 'POST') {
    return json({ error: 'Use POST para conferir a chave de administrador.' }, 405);
  }
  const adminToken = env && env.ADMIN_TOKEN;
  if (!adminToken) return json({ adminConfigurado: false, tokenConfere: false });

  const informado = request.headers.get('x-admin-token') || '';
  // Sem chave no pedido: só responde "precisa". Não gasta tentativa.
  if (!informado) return json({ adminConfigurado: true, tokenConfere: false });

  const balde = `admin-check:${clientIp(request)}`;
  const opts = { limit: CHECK_LIMIT, windowSec: CHECK_WINDOW };
  const estado = await rateLimitEstourado(env, balde, opts);
  if (estado.estourado) {
    return json(
      { error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.', rateLimited: true },
      429,
      { 'Retry-After': String(estado.retryAfter || 60) },
    );
  }
  if (safeEqual(informado, adminToken)) return json({ adminConfigurado: true, tokenConfere: true });
  await rateLimit(env, balde, opts); // só a tentativa errada conta
  return json({ adminConfigurado: true, tokenConfere: false });
}
