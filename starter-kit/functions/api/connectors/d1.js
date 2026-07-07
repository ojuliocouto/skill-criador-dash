// Conector do modo histórico (Contrato 2), lendo do Cloudflare D1.
// Em vez de bater na fonte ao vivo, lê o snapshot mais recente que o cron gravou.
// A lógica pura de SQL e de reidratação vive em functions/lib/snapshots.mjs.
import { latestSnapshotSQL, rowToDataSet } from '../../lib/snapshots.mjs';
import { needsAuth, authOk } from '../../lib/auth-config.mjs';
import { authRateLimit } from '../../lib/rate-limit.mjs';

const JSON_HEADERS = { 'content-type': 'application/json' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// 429 com Retry-After e mensagem generica PT-BR (nao revela contadores/limites).
function tooMany(retryAfter) {
  return new Response(
    JSON.stringify({ error: 'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.', rateLimited: true }),
    { status: 429, headers: { ...JSON_HEADERS, 'Retry-After': String(retryAfter || 60) } }
  );
}

// Carrega a config do dashboard no KV para checar protecao por senha.
async function loadConfig(env, id) {
  const kv = env && env.DASHBOARDS_KV;
  if (!kv) return null;
  const raw = await kv.get(`dash:${id}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * Handler Cloudflare Pages Function.
 * GET com ?id=<dashboardId>. Lê o snapshot mais recente do binding D1
 * env.DASHBOARD_DB, reidrata o DataSet e responde em JSON.
 * @param {{ request: Request, env: Object }} context
 */
export async function onRequest(context) {
  const { request, env } = context;
  const db = env && env.DASHBOARD_DB;

  if (!db) {
    return json(
      {
        error:
          'Binding DASHBOARD_DB (D1) não configurado. Crie o banco D1 e vincule o binding no painel Cloudflare Pages (Settings > Bindings).',
      },
      500
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return json({ error: 'Parâmetro "id" do dashboard é obrigatório.' }, 400);
  }

  // Protecao por senha: se o dashboard e protegido, os DADOS tambem exigem a senha
  // (senao a senha protegeria so a config e nao o conteudo).
  const config = await loadConfig(env, id);
  if (config && needsAuth(config)) {
    const senhaOk = await authOk(config, request.headers.get('x-dash-auth') || '');
    if (!senhaOk) {
      // RATE LIMIT anti brute force: so conta as tentativas ERRADAS (senha certa
      // nao chega aqui). Estourou -> 429 Retry-After.
      const rl = await authRateLimit(env, request, id);
      if (!rl.ok) return tooMany(rl.retryAfter);
      return json({ error: 'Senha necessária ou incorreta.', needsPassword: true }, 401);
    }
  }

  try {
    const { sql, params } = latestSnapshotSQL(id);
    const row = await db.prepare(sql).bind(...params).first();

    if (!row) {
      return json(
        {
          error: 'Ainda nao ha dados capturados. Rode o cron ou aguarde a primeira captura.',
        },
        404
      );
    }

    const dataset = rowToDataSet(row);
    return json(dataset, 200);
  } catch (err) {
    const msg = err && err.message ? err.message : 'Falha ao ler o snapshot do banco de dados.';
    return json({ error: msg }, 500);
  }
}
