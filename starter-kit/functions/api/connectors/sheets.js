// Conector de planilhas Google (Contrato 2).
// Recebe o link de uma planilha pública e devolve um DataSet.
// A lógica pura de conversão de link (sheetUrlToCsv) vive em lib/sheets-url.mjs
// e é reexportada aqui para compatibilidade com quem já importava daqui.
import { parseCSV } from '../../lib/csv.mjs';
import { sheetUrlToCsv } from '../../lib/sheets-url.mjs';
import { rateLimit, clientIp, authRateLimit } from '../../lib/rate-limit.mjs';
import { needsAuth, authOk } from '../../lib/auth-config.mjs';
import { colunasDoPainel, podarDataSet } from '../../lib/vista-do-painel.mjs';

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

// Painel salvo (?id=): o link da planilha fica no servidor (3.9.0, achado 6 da auditoria). Antes ele
// saía no GET da config, e quem tinha o link do painel abria a planilha inteira. Aqui o servidor lê a
// config no KV, confere a senha do painel (mesma regra do Meta e do D1) e usa o link guardado.
// Devolve { erro } (Response pronta) ou { url, gid, config }.
async function planilhaDoPainel(env, request, id, headers) {
  const kv = env && env.DASHBOARDS_KV;
  const resposta = (corpo, status) => ({ erro: new Response(JSON.stringify(corpo), { status, headers }) });
  if (!kv) return resposta({ error: 'Binding DASHBOARDS_KV não configurado.' }, 500);
  const raw = await kv.get(`dash:${id}`);
  if (!raw) return resposta({ error: 'Dashboard não encontrado.' }, 404);
  let config;
  try { config = JSON.parse(raw); } catch { return resposta({ error: 'Configuração corrompida.' }, 500); }
  if (needsAuth(config) && !(await authOk(config, request.headers.get('x-dash-auth') || ''))) {
    const rl = await authRateLimit(env, request, id);
    if (!rl.ok) return { erro: tooMany(rl.retryAfter, headers) };
    return resposta({ error: 'Senha necessária ou incorreta.', needsPassword: true }, 401);
  }
  const fonte = config.source || {};
  if (fonte.type !== 'sheets' || !fonte.url) return resposta({ error: 'Este painel não tem planilha do Google como fonte.' }, 400);
  return { url: fonte.url, gid: fonte.gid || '0', config };
}

/**
 * Handler Cloudflare Pages Function.
 * Params: ?url=<link da planilha>&gid=<opcional, default 0> (assistente, antes de salvar)
 *     ou: ?id=<id do painel> (painel salvo: o link fica no servidor e só saem as colunas do painel)
 * Responde DataSet em JSON.
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
  const id = searchParams.get('id');
  let url = searchParams.get('url');
  let gid = searchParams.get('gid') || '0';
  let painel = null;

  if (id) {
    const achado = await planilhaDoPainel(env, request, id, headers);
    if (achado.erro) return achado.erro;
    ({ url, gid } = achado);
    painel = achado.config;
  }

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
    let dataset = {
      columns,
      rows,
      meta: {
        source: 'sheets',
        fetchedAt: new Date().toISOString(),
        rowCount: rows.length,
      },
    };
    // Painel salvo: só as colunas que o painel usa (as do colMap). O resto da planilha não sai.
    if (painel) dataset = podarDataSet(dataset, colunasDoPainel(painel));
    return new Response(JSON.stringify(dataset), { status: 200, headers });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Falha ao buscar ou interpretar a planilha. Tente novamente.' }),
      { status: 502, headers }
    );
  }
}
