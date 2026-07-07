// CRUD das configs de dashboard no KV DASHBOARDS_KV (Contrato 7).
// Cada dashboard é guardado na chave `dash:<id>`.
// A lógica pura `slugify` é testável sem rede nem KV.

// A auth (needsAuth/authOk/safeEqual/checkAdminToken) mora no modulo neutro
// auth-config.mjs para que os conectores nao dependam desta camada de config.
// Reexportamos needsAuth e authOk aqui para nao quebrar quem ja importa de
// dashboards.js (ex: os testes).
import { needsAuth, authOk, checkAdminToken, derivePasswordAuth } from '../lib/auth-config.mjs';
import { authRateLimit } from '../lib/rate-limit.mjs';
import { DOMAINS, isDomain } from '../lib/domains.mjs';
import { validarFonte } from '../lib/source-shape.mjs';
export { needsAuth, authOk } from '../lib/auth-config.mjs';

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

// Qualquer chave cujo nome soe a credencial e removida antes de ir pro browser.
const SECRET_KEY = /token|secret|api[_-]?key|password|senha|authorization|bearer/i;
function scrubSecrets(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.keys(obj)) {
    if (SECRET_KEY.test(k)) { delete obj[k]; continue; }
    if (obj[k] && typeof obj[k] === 'object') scrubSecrets(obj[k]);
  }
}

/**
 * Remove segredos antes de devolver a config ao browser: hash da senha e QUALQUER
 * credencial guardada na fonte (token, apiKey, authorization, senha...), inclusive
 * em conectores sob medida (nao so o Meta). Varredura recursiva de `source`.
 */
export function stripSecrets(config) {
  if (!config || typeof config !== 'object') return config;
  const clone = JSON.parse(JSON.stringify(config));
  // Remove TODO o material de senha do bloco auth (nao so o hash legado): sal,
  // verifier e iterations tambem sao segredos que nunca vao pro browser. Um dump
  // da resposta GET nao pode conter nada reenviavel nem util pra forca bruta.
  delete clone.auth;
  if (clone.source) scrubSecrets(clone.source);
  clone.protected = needsAuth(config);
  return clone;
}

const JSON_HEADERS = { 'content-type': 'application/json' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function erro(mensagem, status) {
  return json({ error: mensagem }, status);
}

// 429 com Retry-After e mensagem generica PT-BR (nao revela contadores/limites).
function tooMany(retryAfter) {
  return new Response(
    JSON.stringify({ error: 'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.', rateLimited: true }),
    { status: 429, headers: { ...JSON_HEADERS, 'Retry-After': String(retryAfter || 60) } }
  );
}

const PREFIX = 'dash:';
const kvKey = (id) => `${PREFIX}${id}`;

// Cor hex valida: #rgb ou #rrggbb. Validar no servidor evita injetar valor
// arbitrario numa CSS custom property (--accent) via config.accent.
const HEX_COLOR = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

// Limite de tamanho pro logo em data: URI. Um data:image grande viraria dezenas
// de KB dentro da config e estouraria o valor de KV (limite de 25 MB por chave,
// mas nao faz sentido guardar imagem inline: 200 KB ja e folgado pra um logo).
const LOGO_MAX_LEN = 200 * 1024; // 200 KB

/**
 * Valida o src do logo da marca. Aceita apenas fontes de imagem SEGURAS para
 * cair num <img src="..."> no browser sem virar vetor de XSS:
 *   - "" (vazio)  -> sem logo, valido
 *   - URL https:// -> valido (http:// e rejeitado: mixed content e sem TLS)
 *   - data:image/ -> valido (imagem inline; qualquer outro data: e rejeitado)
 * Qualquer outra coisa (javascript:, vbscript:, http://, texto solto) e rejeitada.
 * @param {*} logo
 * @returns {boolean}
 */
function isLogoSeguro(logo) {
  if (logo === '' || logo == null) return true; // vazio = sem logo
  if (typeof logo !== 'string') return false;
  const v = logo.trim();
  if (v === '') return true;
  if (v.length > LOGO_MAX_LEN) return false;
  // data:image/... (so imagem; nao aceita data:text/html nem outros tipos)
  if (/^data:image\/[a-z0-9.+-]+[;,]/i.test(v)) return true;
  // URL https:// (http:// NAO conta: exigimos TLS pra imagem de marca externa)
  if (/^https:\/\/[^\s]+$/i.test(v)) return true;
  return false;
}

// A trava global de mutacao (checkAdminToken) mora em auth-config.mjs (modulo
// neutro), para que os conectores possam usa-la sem importar deste handler.
// Reexportada aqui para nao quebrar quem ja importava de dashboards.js.
export { checkAdminToken } from '../lib/auth-config.mjs';

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
  const providedHash = request.headers.get('x-dash-auth') || '';

  try {
    // Trava GLOBAL de mutacao, modelo FAIL-CLOSED: POST e DELETE exigem que o
    // servidor tenha ADMIN_TOKEN definido E o header x-admin-token bata com ele.
    // Roda ANTES da checagem per-dashboard e so vale para POST/DELETE (GET nao muda,
    // a leitura de dashboard publicado continua PUBLICA).
    //
    // SEM env.ADMIN_TOKEN a mutacao fica BLOQUEADA (403 adminNotConfigured): nao ha
    // mais criacao/sobrescrita/delecao anonima. Para liberar as mutacoes, o operador
    // define o secret (wrangler pages secret put ADMIN_TOKEN) e passa a mandar o
    // header x-admin-token. Com o token setado mas sem header -> 401 needsAdmin.
    if (method === 'POST' || method === 'DELETE') {
      const adminGate = checkAdminToken(env, request);
      if (adminGate) return adminGate;
    }

    if (method === 'GET') {
      return id ? await getOne(kv, id, providedHash, env, request) : await listAll(kv);
    }
    if (method === 'POST') {
      return await create(kv, request, providedHash, env);
    }
    if (method === 'DELETE') {
      return await remove(kv, id, providedHash, env, request);
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
  // A listagem e publica (a landing lista todos): devolve so campos seguros.
  // NAO expoe `source` (link da planilha, conta do Meta) nem nada da fonte, senao
  // vazaria a origem de um dashboard PROTEGIDO pra qualquer anonimo.
  //
  // MINOR (metadados): para dashboards PROTEGIDOS, nao expor nome/dominio/accent
  // sem a senha, so { id, protected }. Antes, um anonimo lia o nome e o cliente
  // (dominio) de dashboards privados sem nunca provar a senha. Dashboards SEM
  // senha seguem expostos como antes (a landing precisa lista-los).
  const validas = configs.filter(Boolean).map((c) => {
    const prot = needsAuth(c);
    if (prot) return { id: c.id, protected: true };
    return {
      id: c.id,
      name: c.name,
      domain: c.domain,
      // kind:'group' (dashboard com abas) sai na listagem pra landing distinguir
      // grupo de dashboard comum. Ausente nos dashboards normais.
      kind: c.kind,
      accent: c.accent,
      createdAt: c.createdAt,
      protected: false,
    };
  });
  validas.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return json(validas);
}

async function getOne(kv, id, providedHash, env, request) {
  const raw = await kv.get(kvKey(id));
  if (!raw) {
    return erro('Dashboard não encontrado.', 404);
  }
  let config;
  try { config = JSON.parse(raw); } catch { return erro('Configuração do dashboard corrompida.', 500); }
  if (!(await authOk(config, providedHash))) {
    // RATE LIMIT anti brute force online da senha: so conta a tentativa ERRADA
    // (a senha certa nao passa por aqui). Estourou -> 429 Retry-After.
    const rl = await authRateLimit(env, request, id);
    if (!rl.ok) return tooMany(rl.retryAfter);
    return json({ error: 'Senha necessária ou incorreta.', needsPassword: true }, 401);
  }
  return json(stripSecrets(config));
}

// Carrega a config crua do KV (ou null). Usado para checar protecao antes de mutar.
async function loadConfig(kv, id) {
  const raw = await kv.get(kvKey(id));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function create(kv, request, providedHash, env) {
  let config;
  try {
    config = await request.json();
  } catch {
    return erro('Corpo da requisição inválido. Envie um JSON com a configuração do dashboard.', 400);
  }

  if (!config || typeof config !== 'object') {
    return erro('Configuração inválida. Envie um objeto JSON com os dados do dashboard.', 400);
  }

  // GRUPO (dashboard com abas): kind:'group' agrega dashboards existentes sob um
  // unico link. Nao tem fonte propria (domain/source/colMap), entao a validacao
  // troca esses obrigatorios por `tabs` (lista de { id, label }).
  const isGroup = config.kind === 'group';

  const faltando = [];
  if (!config.name || !String(config.name).trim()) faltando.push('name');
  if (isGroup) {
    if (!Array.isArray(config.tabs) || !config.tabs.length) faltando.push('tabs');
  } else {
    if (!config.domain || !String(config.domain).trim()) faltando.push('domain');
    if (!config.source || typeof config.source !== 'object') faltando.push('source');
    if (!config.colMap || typeof config.colMap !== 'object') faltando.push('colMap');
  }
  if (faltando.length) {
    return erro(`Campos obrigatórios ausentes: ${faltando.join(', ')}.`, 400);
  }

  if (isGroup) {
    // Cada aba referencia um dashboard por id (slug). Valida so a forma aqui; a
    // existencia do dashboard-filho e checada na hora de abrir a aba (uma aba pode
    // ser criada depois do grupo, ou ficar orfa sem derrubar o grupo inteiro).
    for (const t of config.tabs) {
      if (!t || !t.id || !String(t.id).trim()) {
        return erro('Cada aba do grupo precisa de um id de dashboard (tabs: [{ id, label }]).', 400);
      }
    }
  } else if (!isDomain(config.domain)) {
    // Valida o dominio contra a lista canonica (functions/lib/domains.mjs), a MESMA
    // fonte que alimenta o registry de templates do front-end. Derivar daqui (em vez
    // de um enum literal no handler) faz com que adicionar um dominio novo NAO exija
    // editar esta validacao: basta registrar a chave em domains.mjs + criar o
    // template. Dominios fora da lista continuam rejeitados (contrato preservado).
    return erro(`Domínio inválido: "${config.domain}". Use um de: ${DOMAINS.join(', ')}.`, 400);
  }

  // Valida a FORMA da fonte (só dashboard comum; grupo não tem fonte). Estrita
  // nos tipos que o wizard grava (csv/sheets/meta), permissiva em conector sob
  // medida. Sem isso, uma fonte malformada era gravada com 200 e o erro só
  // estourava na renderização, longe da causa (functions/lib/source-shape.mjs).
  if (!isGroup) {
    const fonteInvalida = validarFonte(config.source);
    if (fonteInvalida) return erro(fonteInvalida, 400);
  }

  // Valida a cor de destaque no servidor: se vier e nao for hex (#rgb/#rrggbb),
  // rejeita com 400. Sem isso, um valor arbitrario iria parar numa CSS custom
  // property (ex: '); background:url(x)') e viraria vetor de injecao.
  if (config.accent != null && !HEX_COLOR.test(String(config.accent))) {
    return erro('Cor de destaque (accent) inválida. Use um hexadecimal como #7c3aed ou #abc.', 400);
  }

  // Cor SECUNDARIA (accent2): opcional. Ausente/vazia e valido; se presente, vale
  // a MESMA regra do accent (hex #rgb/#rrggbb). Mesma motivacao: o valor cai numa
  // CSS custom property no front, entao um valor arbitrario seria vetor de injecao.
  if (config.accent2 != null && String(config.accent2) !== '' && !HEX_COLOR.test(String(config.accent2))) {
    return erro('Cor secundária (accent2) inválida. Use um hexadecimal como #7c3aed ou #abc.', 400);
  }

  // LOGO da marca: opcional. Vazio ("") = sem logo. Se preenchido, so aceita src de
  // imagem SEGURO (URL https ou data:image). Sem essa trava, um valor como
  // "javascript:alert(1)" cairia num <img src>/onerror e viraria XSS, ou um data:
  // gigante estouraria o KV. Validar no servidor e a barreira que nao depende do front.
  if (config.logo != null && !isLogoSeguro(config.logo)) {
    return erro('Logo inválido: use uma URL https ou um data:image.', 400);
  }

  // SEGURANCA: nunca usar o id CRU do cliente como chave KV. Um id arbitrario
  // (com espacos, barras, '..', caracteres de controle) viraria uma chave KV
  // perigosa/ambigua. Passa SEMPRE pelo mesmo slugify do contrato: se o cliente
  // mandou um id, e sanitizado; se nao mandou, deriva do name. Assim a chave
  // gravada e sempre um slug seguro.
  config.id = slugify(config.id || config.name);
  if (!config.createdAt) config.createdAt = new Date().toISOString();

  // Nao deixa SOBRESCREVER um dashboard protegido sem a senha dele (senao qualquer
  // um com o id apagaria/trocaria a config de um dashboard protegido).
  const existente = await loadConfig(kv, config.id);
  if (existente && needsAuth(existente) && !(await authOk(existente, providedHash))) {
    // RATE LIMIT: sobrescrever dashboard protegido tambem e superficie de brute force.
    const rl = await authRateLimit(env, request, config.id);
    if (!rl.ok) return tooMany(rl.retryAfter);
    return json({ error: 'Dashboard protegido por senha. Informe a senha (header x-dash-auth) para sobrescrever.', needsPassword: true }, 401);
  }

  // SEGURANCA: nunca grava o hash cru que o cliente envia no header. Se a config
  // trouxe `auth.hash` (o sha256Hex que o header carrega), derivamos um bloco
  // salgado { salt, verifier, iterations } via PBKDF2 e guardamos SO ele. Assim um
  // dump do KV nao expoe nada reenviavel no header, e o sal mata rainbow table.
  // Um bloco ja no formato v2 (com verifier) e mantido como esta.
  if (config.auth && typeof config.auth === 'object' && config.auth.hash && !config.auth.verifier) {
    config.auth = await derivePasswordAuth(String(config.auth.hash));
  }

  await kv.put(kvKey(config.id), JSON.stringify(config));
  return json(stripSecrets(config));
}

async function remove(kv, id, providedHash, env, request) {
  if (!id) {
    return erro('Parâmetro "id" é obrigatório para excluir um dashboard.', 400);
  }
  // Nao deixa EXCLUIR um dashboard protegido sem a senha dele.
  const existente = await loadConfig(kv, id);
  if (existente && needsAuth(existente) && !(await authOk(existente, providedHash))) {
    // RATE LIMIT: excluir dashboard protegido tambem e superficie de brute force.
    const rl = await authRateLimit(env, request, id);
    if (!rl.ok) return tooMany(rl.retryAfter);
    return json({ error: 'Dashboard protegido por senha. Informe a senha (header x-dash-auth) para excluir.', needsPassword: true }, 401);
  }
  await kv.delete(kvKey(id));
  return json({ ok: true });
}
