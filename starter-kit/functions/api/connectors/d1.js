// Conector do modo histórico (Contrato 2), lendo do Cloudflare D1.
// Em vez de bater na fonte ao vivo, lê o snapshot mais recente que o cron gravou.
// A lógica pura de SQL e de reidratação vive em functions/lib/snapshots.mjs.
import { latestSnapshotSQL, rowToDataSet } from '../../lib/snapshots.mjs';

const JSON_HEADERS = { 'content-type': 'application/json' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
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
