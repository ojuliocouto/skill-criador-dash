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
import { validarColMap, colunasDaFonte } from '../lib/colmap-shape.mjs';
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

/**
 * Indica se a config chegou COM senha (dashboard protegido). Cobre os dois
 * formatos que podem aparecer num POST: `{ hash }` (payload cru do wizard, que
 * ainda vira verifier salgado mais abaixo no create) e `{ verifier }` (bloco v2
 * ja derivado, quando o cliente reenvia uma config vinda do servidor).
 * @param {*} config
 * @returns {boolean}
 */
export function temSenha(config) {
  const a = config && typeof config === 'object' ? config.auth : null;
  if (!a || typeof a !== 'object') return false;
  return !!(a.hash || a.verifier);
}

/**
 * Id OPACO para dashboard protegido: 16 bytes aleatorios (128 bits) em hex, com
 * prefixo neutro. Nao carrega nada do nome, do cliente nem da data, e continua
 * sendo um slug seguro ([a-z0-9-]) para virar chave KV.
 * @returns {string}
 */
export function gerarIdOpaco() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return `dash-${hex}`;
}

/**
 * Resolve o id definitivo do dashboard no POST.
 *
 * P7 (vazamento de nome pelo id): o id sai na listagem PUBLICA e na URL. Enquanto
 * ele era sempre slugify(name), a listagem anonima devolvia
 * {"id":"faturamento-acme-janeiro","protected":true} e entregava o nome do cliente
 * de graca, mesmo com a listagem ja endurecida para omitir name/domain/accent.
 * Pior: com o id adivinhavel, GET ?id=<slug do nome> respondia 401 needsPassword
 * (existe) contra 404 (nao existe), virando oraculo para confirmar nomes.
 *
 * Regra:
 *  - SEM senha: nada muda. O id continua o slug legivel do nome (ou do id que o
 *    cliente mandou, sempre sanitizado), porque a landing precisa listar e a
 *    pessoa precisa reconhecer o proprio dashboard.
 *  - COM senha, criando: id OPACO aleatorio. Nem o nome, nem um id escolhido pelo
 *    cliente entram na conta (senao bastaria um POST com id:"sigiloso-cliente"
 *    para reintroduzir o vazamento por fora do wizard).
 *  - COM senha, sobrescrevendo um id que JA existe E JA era protegido: preserva
 *    o id. O link de um dashboard protegido publicado nao pode mudar por causa
 *    de uma edicao.
 *  - COM senha, sobrescrevendo um id que JA existe mas NAO era protegido ainda
 *    (dashboard publico ganhando senha agora): id OPACO novo (ROTACIONA). Um
 *    dashboard que nasceu publico tem o slug legivel na listagem e na URL; se
 *    o POST que adiciona a senha preservasse esse slug, o nome do cliente
 *    continuaria vazando do mesmo jeito que o id opaco existe pra evitar. Quem
 *    chama (o handler `create`) e responsavel por migrar o registro no KV
 *    (gravar no id novo, apagar o antigo) e devolver o id novo na resposta.
 *
 * @param {Object} config           config recebida no POST
 * @param {{ existe?: boolean, eraProtegido?: boolean }} [opts]
 *   `existe` = ja ha um dashboard gravado com esse id.
 *   `eraProtegido` = esse dashboard, do jeito que estava gravado ANTES deste
 *   POST, ja exigia senha (so importa quando `existe` e true).
 * @returns {string}
 */
export function resolverId(config, { existe = false, eraProtegido = false } = {}) {
  const idPedido = config && config.id != null ? String(config.id).trim() : '';
  const nome = config ? config.name : '';
  if (!temSenha(config)) return slugify(idPedido || nome);
  if (idPedido && existe && eraProtegido) return slugify(idPedido);
  return gerarIdOpaco();
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

    // Valida a FORMA do colMap logo na sequencia (functions/lib/colmap-shape.mjs).
    // Sem isso, um colMap vazio ou incompleto era gravado com 200 e o dashboard
    // publicava "INVESTIMENTO R$ 0,00" no KPI com a linha certa na tabela logo
    // abaixo: numero errado com cara de numero certo. O wizard ja barrava no
    // front (validateRequired), mas o POST, que e o caminho do agente, nao tinha
    // gate nenhum. Quando a fonte e csv, as colunas reais sao conhecidas aqui,
    // entao tambem checamos que cada coluna escolhida existe de verdade.
    const colunas = colunasDaFonte(config.source);
    const colMapInvalido = validarColMap(config.domain, config.colMap, colunas);
    if (colMapInvalido) return erro(colMapInvalido, 400);
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

  // SEGURANCA do id. Regras que convivem aqui:
  //
  // 1) Nunca usar o id CRU do cliente como chave KV. Um id arbitrario (com
  //    espacos, barras, '..', caracteres de controle) viraria uma chave KV
  //    perigosa/ambigua, entao tudo passa pelo slugify do contrato.
  // 2) Dashboard PROTEGIDO nao pode ter id derivado do nome (P7): o id sai na
  //    listagem publica e na URL. Com senha, o id vira opaco e aleatorio.
  // 3) PROTEGER DEPOIS um dashboard que ja existia PUBLICO (P7, rodada 2) tem
  //    que ROTACIONAR o id pro formato opaco, nao preservar o slug legivel:
  //    senao o nome do cliente continua vazando pela listagem e pela URL do
  //    jeito que a regra 2 existe pra evitar. `eraProtegido` carrega se o
  //    registro que hoje esta gravado com esse id JA tinha bloco auth, pra
  //    resolverId() distinguir "editar um protegido" (preserva) de "proteger
  //    um publico" (rotaciona).
  //
  // A sobrescrita de um dashboard PROTEGIDO que JA existe preserva o id (o link
  // publicado nao pode mudar por causa de uma edicao). Ver resolverId() e
  // references/seguranca.md.
  const idPedido = config.id == null ? '' : String(config.id).trim();
  let idResolvidoDoPedido = idPedido ? slugify(idPedido) : '';

  // P7 RODADA 3 (caminho real da UI): a rotacao acima so acontecia quando o
  // POST trazia `id` explicito. Mas o config-wizard.js real NUNCA manda id de
  // volta (o botao "Reconfigurar" abria um wizard em branco, sem ler ?id= da
  // URL: ver fix no proprio config-wizard.js). Resultado: aluno cria publico,
  // refaz com senha, e o POST sem id sempre CRIAVA um dashboard novo (opaco),
  // deixando o PUBLICO original orfao e vivo, vazando o nome do cliente na
  // listagem anonima do mesmo jeito que o id opaco existe pra fechar. Sem id
  // explicito mas COM senha nova, tratamos como o MESMO caso: se ja existe um
  // dashboard PUBLICO gravado no slug do NOME, migra pra ele (rotaciona),
  // exatamente como a rotacao por id explicito ja faz logo abaixo.
  if (!idResolvidoDoPedido && temSenha(config) && config.name) {
    const slugDoNome = slugify(config.name);
    const existentePeloNome = await loadConfig(kv, slugDoNome);
    if (existentePeloNome && !needsAuth(existentePeloNome)) {
      idResolvidoDoPedido = slugDoNome;
    }
  }

  const existenteAntigo = idResolvidoDoPedido ? await loadConfig(kv, idResolvidoDoPedido) : null;
  const idJaExiste = !!existenteAntigo;
  const eraProtegido = idJaExiste && needsAuth(existenteAntigo);
  config.id = resolverId(config, { existe: idJaExiste, eraProtegido });
  if (!config.createdAt) config.createdAt = new Date().toISOString();

  // ROTACAO (P7, rodada 2): o id pedido apontava pra um dashboard PUBLICO que
  // existia, e o id resolvido saiu diferente (rotacionou pro opaco porque este
  // POST trouxe senha nova). O registro velho, com o slug legivel, precisa
  // sumir do KV: senao o dashboard fica duplicado (um orfao publico e legivel
  // convivendo com o novo protegido), o que reabriria o vazamento pela chave
  // antiga que continuaria respondendo com o mesmo conteudo.
  const rotacionando = idJaExiste && idResolvidoDoPedido !== config.id;

  // Nao deixa SOBRESCREVER um dashboard protegido sem a senha dele (senao qualquer
  // um com o id apagaria/trocaria a config de um dashboard protegido). Numa
  // rotacao o id resolvido e NOVO por definicao (ainda nao existe no KV), entao
  // nao ha o que checar aqui.
  const existente = rotacionando ? null : await loadConfig(kv, config.id);
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
  // So depois de gravar o novo com sucesso e que o antigo e apagado: assim uma
  // falha no meio do caminho nunca deixa o dashboard sem nenhum registro valido.
  if (rotacionando) {
    await kv.delete(kvKey(idResolvidoDoPedido));
  }
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
