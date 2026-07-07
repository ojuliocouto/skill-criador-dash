// Conector de planilhas Google (Contrato 2).
// Recebe o link de uma planilha pública e devolve um DataSet.
// A lógica pura de conversão de link (sheetUrlToCsv) vive em lib/sheets-url.mjs
// e é reexportada aqui para compatibilidade com quem já importava daqui.
import { parseCSV } from '../../lib/csv.mjs';
import { sheetUrlToCsv } from '../../lib/sheets-url.mjs';
import { rateLimit, clientIp } from '../../lib/rate-limit.mjs';

export { sheetUrlToCsv };

// Limite do conector Sheets: por IP, para nao virar relay de fetch anonimo
// ilimitado (o handler busca uma URL do lado do servidor). Mesma politica de IP
// do preview Meta. Usa o store do rate-limit (DASHBOARD_CACHE || DASHBOARDS_KV).
const SHEETS_LIMIT = 20;
const SHEETS_WINDOW = 60;

// 429 amigavel em PT-BR. Nao revela contadores nem limites.
function tooMany(retryAfter, headers) {
  return new Response(
    JSON.stringify({ error: 'Muitas requisições em pouco tempo. Aguarde um instante e tente de novo.', rateLimited: true }),
    { status: 429, headers: { ...headers, 'Retry-After': String(retryAfter || 60) } }
  );
}

/**
 * Handler Cloudflare Pages Function.
 * Params: ?url=<link da planilha>&gid=<opcional, default 0>
 * Responde DataSet completo em JSON.
 * @param {{ request: Request }} context
 */
export async function onRequest(context) {
  const { request, env } = context;
  const headers = { 'content-type': 'application/json' };

  // RATE LIMIT por IP ANTES de tocar a rede: fecha o relay de fetch anonimo
  // (o endpoint deixa de ser proxy ilimitado). Store = DASHBOARD_CACHE ||
  // DASHBOARDS_KV; sem nenhum dos dois, rateLimit libera (deploy degenerado).
  const rl = await rateLimit(env, `sheets:${clientIp(request)}`, { limit: SHEETS_LIMIT, windowSec: SHEETS_WINDOW });
  if (!rl.ok) return tooMany(rl.retryAfter, headers);

  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const gid = searchParams.get('gid') || '0';

  if (!url) {
    return new Response(
      JSON.stringify({ error: 'Parâmetro "url" da planilha é obrigatório.' }),
      { status: 400, headers }
    );
  }

  let csvUrl;
  try {
    csvUrl = sheetUrlToCsv(url, gid);
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers });
  }

  try {
    const resp = await fetch(csvUrl, { redirect: 'follow' });
    if (!resp.ok) {
      return new Response(
        JSON.stringify({
          error: 'Não foi possível ler a planilha. Confira se ela está pública ("qualquer pessoa com o link").',
        }),
        { status: 502, headers }
      );
    }
    const text = await resp.text();
    const { columns, rows } = parseCSV(text);
    const dataset = {
      columns,
      rows,
      meta: {
        source: 'sheets',
        fetchedAt: new Date().toISOString(),
        rowCount: rows.length,
      },
    };
    return new Response(JSON.stringify(dataset), { status: 200, headers });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Falha ao buscar ou interpretar a planilha. Tente novamente.' }),
      { status: 502, headers }
    );
  }
}
