/**
 * Pilha local do painel para os testes de navegador (3.7.3): serve o `starter-kit/public` e roda as Functions
 * REAIS (`_middleware.js` com os cabeçalhos de segurança e a CSP, e `api/dashboards.js`) com um KV em memória,
 * sem wrangler, sem rede e sem conta. É o mesmo caminho que o painel faz em produção, menos o runtime do Cloudflare:
 * por isso a CSP de verdade chega ao navegador (o Safari e o Firefox a aplicam mais à risca que o Chromium) e o
 * painel é criado pelo mesmo POST /api/dashboards que o wizard usa (com a validação do colMap).
 *
 * Uso: const pilha = await subirPilha(); await pilha.criar({ ...config }); abrir `${pilha.url}/dashboard.html?id=...`.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KIT = path.join(__dirname, '..', 'starter-kit');
const PUBLIC = path.join(KIT, 'public');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.csv': 'text/csv; charset=utf-8', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
const TOKEN_ADMIN = 'token-local-de-teste';

function kvEmMemoria() {
  const mapa = new Map();
  return {
    async get(k) { return mapa.has(k) ? mapa.get(k) : null; },
    async put(k, v) { mapa.set(k, String(v)); },
    async delete(k) { mapa.delete(k); },
    async list({ prefix } = {}) { return { keys: [...mapa.keys()].filter((n) => !prefix || n.startsWith(prefix)).map((name) => ({ name })) }; },
  };
}

// O Pages serve /dashboard para dashboard.html (e redireciona o .html); aqui as duas formas respondem a página.
const PAGINAS = new Map([['/', 'index.html'], ['/index', 'index.html'], ['/index.html', 'index.html'], ['/dashboard', 'dashboard.html'], ['/dashboard.html', 'dashboard.html'],
  ['/config', 'config.html'], ['/config.html', 'config.html'], ['/group', 'group.html'], ['/group.html', 'group.html']]);

async function subirPilha() {
  const mw = await import(pathToFileURL(path.join(KIT, 'functions', '_middleware.js')).href);
  const dash = await import(pathToFileURL(path.join(KIT, 'functions', 'api', 'dashboards.js')).href);
  const env = { DASHBOARDS_KV: kvEmMemoria(), ADMIN_TOKEN: TOKEN_ADMIN };
  // Cada arquivo de functions/api/connectors/<nome>.js atende /api/connectors/<nome>, como o Pages faz.
  const conectores = {};
  for (const arq of fs.readdirSync(path.join(KIT, 'functions', 'api', 'connectors')).filter((n) => n.endsWith('.js'))) {
    conectores[arq.slice(0, -3)] = await import(pathToFileURL(path.join(KIT, 'functions', 'api', 'connectors', arq)).href);
  }

  const estatico = (url) => {
    const rel = PAGINAS.get(url.pathname) || decodeURIComponent(url.pathname);
    const arq = path.normalize(path.join(PUBLIC, rel));
    if (!arq.startsWith(PUBLIC) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) return new Response('nao achei', { status: 404 });
    return new Response(fs.readFileSync(arq), { status: 200, headers: { 'content-type': TIPOS[path.extname(arq)] || 'application/octet-stream' } });
  };

  const servidor = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const corpo = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise((ok) => { const p = []; req.on('data', (c) => p.push(c)); req.on('end', () => ok(Buffer.concat(p))); });
      const pedido = new Request(url, { method: req.method, headers: req.headers, body: corpo });
      const conector = /^\/api\/connectors\/([a-z0-9-]+)$/.exec(url.pathname);
      const proximo = async () => {
        if (url.pathname === '/api/dashboards') return dash.onRequest({ request: pedido, env });
        if (conector && conectores[conector[1]]) return conectores[conector[1]].onRequest({ request: pedido, env });
        return estatico(url);
      };
      const resposta = await mw.onRequest({ request: pedido, env, next: proximo });
      res.writeHead(resposta.status, Object.fromEntries(resposta.headers));
      res.end(Buffer.from(await resposta.arrayBuffer()));
    } catch (e) { res.writeHead(500, { 'content-type': 'text/plain' }); res.end(String(e && e.stack || e)); }
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${servidor.address().port}`;
  return {
    url,
    /** Cria um painel pelo mesmo POST que o wizard usa. Devolve o id. */
    async criar(config) {
      const r = await fetch(`${url}/api/dashboards`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': TOKEN_ADMIN }, body: JSON.stringify(config) });
      const t = await r.text();
      if (!r.ok) throw new Error(`POST /api/dashboards ${r.status}: ${t.slice(0, 200)}`);
      return JSON.parse(t).id;
    },
    fechar: () => new Promise((f) => { servidor.closeAllConnections && servidor.closeAllConnections(); servidor.close(f); }),
  };
}

module.exports = { subirPilha, KIT, TOKEN_ADMIN_DE_TESTE: TOKEN_ADMIN };
