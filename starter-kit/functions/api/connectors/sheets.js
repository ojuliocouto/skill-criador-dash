// Conector de planilhas Google (Contrato 2).
// Recebe o link de uma planilha pública e devolve um DataSet.
// A lógica pura de conversão de link (sheetUrlToCsv) é testável sem rede.
import { parseCSV } from '../../lib/csv.mjs';

/**
 * Converte um link de planilha Google no endpoint gviz que devolve CSV.
 * Extrai o ID do trecho /spreadsheets/d/{ID}/ do link.
 * @param {string} url   link completo da planilha
 * @param {string} [gid] aba (gid), default '0'
 * @returns {string} endpoint gviz que responde CSV
 * @throws {Error} se o link não contiver um ID de planilha válido
 */
export function sheetUrlToCsv(url, gid = '0') {
  const match = String(url || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    throw new Error('Link de planilha Google inválido. Cole o link completo da planilha.');
  }
  const id = match[1];
  const aba = gid || '0';
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${aba}`;
}

/**
 * Handler Cloudflare Pages Function.
 * Params: ?url=<link da planilha>&gid=<opcional, default 0>
 * Responde DataSet completo em JSON.
 * @param {{ request: Request }} context
 */
export async function onRequest(context) {
  const headers = { 'content-type': 'application/json' };
  const { searchParams } = new URL(context.request.url);
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
