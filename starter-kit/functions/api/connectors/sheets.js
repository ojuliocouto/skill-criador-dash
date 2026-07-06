// Conector de planilhas Google (Contrato 2).
// Recebe o link de uma planilha pública e devolve um DataSet.
// A lógica pura de conversão de link (sheetUrlToCsv) vive em lib/sheets-url.mjs
// e é reexportada aqui para compatibilidade com quem já importava daqui.
import { parseCSV } from '../../lib/csv.mjs';
import { sheetUrlToCsv } from '../../lib/sheets-url.mjs';

export { sheetUrlToCsv };

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
