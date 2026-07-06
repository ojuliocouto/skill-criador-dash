// CRUD das configs de dashboard no KV DASHBOARDS_KV (Contrato 7).
// Cada dashboard é guardado na chave `dash:<id>`.
// A lógica pura `slugify` é testável sem rede nem KV.

/**
 * Gera um slug a partir do nome do dashboard.
 * lowercase, remove acento, troca não-alfanumérico por '-', colapsa e apara '-'.
 * Nunca devolve string vazia: cai no fallback 'dashboard'.
 * @param {string} name
 * @returns {string}
 */
export function slugify(name) {
  const base = String(name == null ? '' : name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos (acentos)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')     // não-alfanumérico vira '-'
    .replace(/-+/g, '-')             // colapsa hífens repetidos
    .replace(/^-+|-+$/g, '');        // apara hífens das pontas
  return base || 'dashboard';
}

const JSON_HEADERS = { 'content-type': 'application/json' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function erro(mensagem, status) {
  return json({ error: mensagem }, status);
}

const PREFIX = 'dash:';
const kvKey = (id) => `${PREFIX}${id}`;

/**
 * Handler Cloudflare Pages Function. Roteia por método HTTP.
 * @param {{ request: Request, env: Object }} context
 */
export async function onRequest(context) {
  const { request, env } = context;
  const kv = env && env.DASHBOARDS_KV;

  if (!kv) {
    return erro(
      'Binding DASHBOARDS_KV não configurado. Crie o KV e vincule o binding no painel Cloudflare Pages (Settings > Bindings).',
      500
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const method = request.method.toUpperCase();

  try {
    if (method === 'GET') {
      return id ? await getOne(kv, id) : await listAll(kv);
    }
    if (method === 'POST') {
      return await create(kv, request);
    }
    if (method === 'DELETE') {
      return await remove(kv, id);
    }
    return erro(`Método ${method} não suportado.`, 405);
  } catch (err) {
    return erro(err && err.message ? err.message : 'Erro inesperado ao processar o dashboard.', 500);
  }
}

async function listAll(kv) {
  const listed = await kv.list({ prefix: PREFIX });
  const keys = (listed.keys || []).map((k) => k.name);
  const configs = await Promise.all(
    keys.map(async (name) => {
      const raw = await kv.get(name);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    })
  );
  const validas = configs.filter(Boolean);
  validas.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return json(validas);
}

async function getOne(kv, id) {
  const raw = await kv.get(kvKey(id));
  if (!raw) {
    return erro('Dashboard não encontrado.', 404);
  }
  let config;
  try { config = JSON.parse(raw); } catch { return erro('Configuração do dashboard corrompida.', 500); }
  return json(config);
}

async function create(kv, request) {
  let config;
  try {
    config = await request.json();
  } catch {
    return erro('Corpo da requisição inválido. Envie um JSON com a configuração do dashboard.', 400);
  }

  if (!config || typeof config !== 'object') {
    return erro('Configuração inválida. Envie um objeto JSON com os dados do dashboard.', 400);
  }

  const faltando = [];
  if (!config.name || !String(config.name).trim()) faltando.push('name');
  if (!config.domain || !String(config.domain).trim()) faltando.push('domain');
  if (!config.source || typeof config.source !== 'object') faltando.push('source');
  if (!config.colMap || typeof config.colMap !== 'object') faltando.push('colMap');
  if (faltando.length) {
    return erro(`Campos obrigatórios ausentes: ${faltando.join(', ')}.`, 400);
  }

  if (!config.id) config.id = slugify(config.name);
  if (!config.createdAt) config.createdAt = new Date().toISOString();

  await kv.put(kvKey(config.id), JSON.stringify(config));
  return json(config);
}

async function remove(kv, id) {
  if (!id) {
    return erro('Parâmetro "id" é obrigatório para excluir um dashboard.', 400);
  }
  await kv.delete(kvKey(id));
  return json({ ok: true });
}
