/**
 * Bancada dos efeitos de movimento do painel: serve o `starter-kit/public` por um servidor
 * estático mínimo (sem wrangler, sem rede) e uma página de teste com os indicadores desenhados
 * pelo próprio widget `kpi.js`. Quem usa (scripts/test-efeitos-no-navegador.cjs) pausa as animações
 * e anda o relógio delas quadro a quadro, então a medida não depende de tempo real.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.join(__dirname, '..', 'starter-kit', 'public');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

const PAGINA = (tema, acento) => `<!doctype html>
<html lang="pt-BR" data-theme="${tema}" style="--accent:${acento};--accent-solido:${acento}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bancada de efeitos</title>
<link rel="stylesheet" href="/assets/css/main.css"><link rel="stylesheet" href="/assets/css/presenca.css"><link rel="stylesheet" href="/assets/css/efeitos.css">
<style>body{margin:0;padding:24px;background:var(--bg)} #grade{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;width:900px}</style>
</head><body><div id="grade"></div>
<script type="module">
import { render } from '/assets/js/widgets/kpi.js';
import { marcarMetaBatida } from '/assets/js/lib/meta-batida.js';
import { rolarIndicadores } from '/assets/js/lib/numero-roleta.js';
import { ligarTabelaOrdena } from '/assets/js/lib/tabela-ordena.js';
import { render as renderTabela } from '/assets/js/widgets/table.js';
window.__efeitos = { render, marcarMetaBatida, rolarIndicadores, ligarTabelaOrdena, renderTabela };
window.__pronto = true;
</script></body></html>`;

function subir(opcoes = {}) {
  const tema = opcoes.tema || 'dark';
  const acento = opcoes.acento || '#1F8A70';
  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/bancada.html') { res.writeHead(200, { 'content-type': TIPOS['.html'] }); res.end(PAGINA(url.searchParams.get('tema') || tema, url.searchParams.get('acento') || acento)); return; }
    const arq = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
    if (!arq.startsWith(PUBLIC) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); res.end('nao achei'); return; }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(arq)] || 'application/octet-stream' });
    fs.createReadStream(arq).pipe(res);
  });
  return new Promise((ok) => servidor.listen(0, '127.0.0.1', () => ok({ servidor, url: `http://127.0.0.1:${servidor.address().port}`, fechar: () => new Promise((f) => servidor.close(f)) })));
}

module.exports = { subir };
