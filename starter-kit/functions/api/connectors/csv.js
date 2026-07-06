// Conector de upload de CSV (Contrato 2).
// Aceita POST com o CSV cru no corpo (text/csv) ou num campo de formulário
// e devolve um DataSet. O delimitador é detectado automaticamente.
import { parseCSV, detectDelimiter } from '../../lib/csv.mjs';

/**
 * Extrai o texto CSV do corpo da requisição.
 * Aceita corpo cru (text/csv, text/plain) ou multipart/form-data com um campo
 * "csv" ou "file".
 * @param {Request} request
 * @returns {Promise<string>}
 */
async function lerCorpoCsv(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
    const form = await request.formData();
    const campo = form.get('csv') ?? form.get('file') ?? form.get('data');
    if (campo == null) return '';
    // Arquivo (File) ou string.
    if (typeof campo === 'string') return campo;
    return await campo.text();
  }
  return await request.text();
}

/**
 * Handler Cloudflare Pages Function.
 * Método: POST. Corpo: CSV cru ou campo de formulário.
 * Responde DataSet completo em JSON.
 * @param {{ request: Request }} context
 */
export async function onRequest(context) {
  const headers = { 'content-type': 'application/json' };
  const { request } = context;

  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Use POST enviando o conteúdo do CSV no corpo da requisição.' }),
      { status: 405, headers }
    );
  }

  try {
    const text = await lerCorpoCsv(request);
    if (!text || text.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'O CSV enviado está vazio.' }),
        { status: 400, headers }
      );
    }
    const delimiter = detectDelimiter(text);
    const { columns, rows } = parseCSV(text, { delimiter });
    const dataset = {
      columns,
      rows,
      meta: {
        source: 'csv',
        fetchedAt: new Date().toISOString(),
        rowCount: rows.length,
      },
    };
    return new Response(JSON.stringify(dataset), { status: 200, headers });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Não foi possível interpretar o CSV enviado. Confira o arquivo e tente de novo.' }),
      { status: 502, headers }
    );
  }
}
