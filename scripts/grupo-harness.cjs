/**
 * Bancada do grupo de painéis (abas) e do painel com senha: serve o `starter-kit/public` de verdade (o mesmo
 * dashboard.html e dashboard.js do aluno) com uma API de mentira em memória, que se comporta como a Function:
 *  - GET /api/dashboards?id=<id> devolve a config; painel com senha devolve 401 needsPassword sem o cabeçalho certo;
 *  - POST /api/connectors/csv devolve o DataSet do CSV, com atraso por painel (`atraso` em ms) para criar corrida.
 * Sem wrangler, sem rede, sem Cloudflare. Quem usa: scripts/test-grupo-no-navegador.cjs.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PUBLIC = path.join(__dirname, '..', 'starter-kit', 'public');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

const COLMAP = { data: 'Data', canal: 'Canal', investimento: 'Investimento', impressoes: 'Impressoes', cliques: 'Cliques', leads: 'Leads', conversoes: 'Conversoes', receita: 'Receita' };
/** CSV de 3 linhas cujo total de Leads é `leads` (o número que a prova procura na tela). */
function csvComLeads(leads) {
  const a = Math.floor(leads / 3), b = Math.floor(leads / 3), c = leads - a - b;
  return `Data,Canal,Investimento,Impressoes,Cliques,Leads,Conversoes,Receita\n2026-09-05,Instagram,"100,00",1000,50,${a},2,"400,00"\n2026-09-06,Google,"100,00",1000,50,${b},2,"400,00"\n2026-09-07,TikTok,"100,00",1000,50,${c},2,"400,00"\n`;
}
function painel(id, nome, leads, extra = {}) {
  return { id, name: nome, domain: 'marketing', accent: '#3F6B5C', tema: 'claro', saudacaoLigada: false, fundoAnimado: false, source: { type: 'csv', data: csvComLeads(leads) }, colMap: COLMAP, createdAt: '2026-10-01T00:00:00.000Z', ...extra };
}

/**
 * @param {{ paineis: object[], senhas?: Record<string,string>, atrasoPorLeads?: Record<string,number> }} cfg
 *   senhas: id do painel -> senha (texto) que ele exige.
 *   atrasoPorLeads: "<leads>" -> ms que o conector demora para devolver o CSV que tem esse total de Leads.
 */
function subir(cfg) {
  const porId = Object.fromEntries(cfg.paineis.map((p) => [p.id, p]));
  const senhas = cfg.senhas || {};
  const atraso = cfg.atrasoPorLeads || {};
  const servidor = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const json = (status, corpo) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(corpo)); };
    if (u.pathname === '/api/dashboards') {
      const id = u.searchParams.get('id');
      if (!id) return json(200, cfg.paineis.map((p) => (senhas[p.id] ? { id: p.id, protected: true } : { id: p.id, name: p.name, domain: p.domain, kind: p.kind, accent: p.accent, createdAt: p.createdAt, protected: false })));
      const p = porId[id];
      if (!p) return json(404, { error: 'Dashboard não encontrado.' });
      if (senhas[id] && req.headers['x-dash-auth'] !== sha256(senhas[id])) return json(401, { error: 'Senha necessária ou incorreta.', needsPassword: true });
      return json(200, { ...p, protected: !!senhas[id] });
    }
    if (u.pathname === '/api/connectors/csv' && req.method === 'POST') {
      let corpo = ''; for await (const c of req) corpo += c;
      const leadsTotal = corpo.trim().split('\n').slice(1).reduce((s, l) => s + Number(((l.match(/("[^"]*"|[^,]+)/g) || [])[5]) || 0), 0);
      const espera = atraso[String(leadsTotal)] || 0;
      if (espera) await new Promise((r) => setTimeout(r, espera));
      const linhas = corpo.trim().split('\n');
      const colunas = linhas[0].split(',');
      const rows = linhas.slice(1).map((l) => { const campos = l.match(/("[^"]*"|[^,]+)/g) || []; return Object.fromEntries(colunas.map((c, i) => [c, String(campos[i] || '').replace(/^"|"$/g, '')])); });
      return json(200, { columns: colunas, rows, meta: { source: 'csv', fetchedAt: new Date().toISOString(), rowCount: rows.length } });
    }
    // estáticos do starter-kit/public (dashboard.html também sem a extensão, como o Pages serve)
    let rel = decodeURIComponent(u.pathname);
    if (rel === '/dashboard') rel = '/dashboard.html';
    if (rel === '/') rel = '/index.html';
    const arquivo = path.join(PUBLIC, rel);
    if (!arquivo.startsWith(PUBLIC) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) { res.writeHead(404); return res.end('nao achei'); }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' });
    res.end(fs.readFileSync(arquivo));
  });
  return new Promise((resolve) => servidor.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${servidor.address().port}`, fechar: () => new Promise((r) => servidor.close(r)) })));
}

module.exports = { subir, painel, csvComLeads, sha256 };
