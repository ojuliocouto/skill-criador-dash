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
import { render as renderResumo } from '/assets/js/widgets/resumo.js';
window.__efeitos = { render, marcarMetaBatida, rolarIndicadores, ligarTabelaOrdena, renderTabela, renderResumo };
window.__pronto = true;
</script></body></html>`;

// Página de celular (D12): abas, atalhos de período, tabela de dados e tabela por canal, como no painel.
const PAGINA_CELULAR = `<!doctype html>
<html lang="pt-BR" data-theme="light" style="--accent:#0F5C6E;--accent-solido:#0F5C6E">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bancada de celular</title>
<link rel="stylesheet" href="/assets/css/main.css"><link rel="stylesheet" href="/assets/css/presenca.css"><link rel="stylesheet" href="/assets/css/efeitos.css"><link rel="stylesheet" href="/assets/css/celular.css">
</head><body><div id="app" style="padding:16px 16px 40px"></div>
<script type="module">
import { barraDeAbasHtml } from '/assets/js/lib/abas.js';
import { atalhosHtml, ligarAtalhos } from '/assets/js/lib/periodo-atalhos.js';
import { ligarBordas } from '/assets/js/lib/rolagem-borda.js';
import { ligarTabelaOrdena } from '/assets/js/lib/tabela-ordena.js';
import { render as renderTabela } from '/assets/js/widgets/table.js';
import { render as renderResumo } from '/assets/js/widgets/resumo.js';
const abas = [{ id: 'a', label: 'Visão geral' }, { id: 'b', label: 'Canais' }, { id: 'c', label: 'Evolução' }, { id: 'd', label: 'Funil' }, { id: 'e', label: 'Dados' }];
const COLS = ['Data', 'Canal', 'Investimento', 'Impressões', 'Cliques', 'Leads', 'Conversões', 'Receita'];
const canais = ['Instagram', 'Google', 'TikTok'];
const rows = Array.from({ length: 12 }, (_, i) => ({ Data: '0' + (1 + (i % 9)) + '/07/2026', Canal: canais[i % 3], Investimento: String(100 + i * 13), 'Impressões': String(1000 + i * 77), Cliques: String(20 + i), Leads: String(2 + (i * 5) % 7), 'Conversões': String(i % 4), Receita: String(i * 250) }));
const resumo = { ok: true, dimLabel: 'Canal', totalDeGrupos: 3, colunas: [{ key: 'i', label: 'Investimento', format: 'currency' }, { key: 'l', label: 'Leads', format: 'integer' }, { key: 'c', label: 'CPL', format: 'currency' }, { key: 'v', label: 'Conversões', format: 'integer' }],
  linhas: [{ label: 'Google', valores: { i: 900, l: 80, c: 11.2, v: 30 } }, { label: 'Instagram', valores: { i: 700, l: 120, c: 5.8, v: 41 } }, { label: 'TikTok', valores: { i: 300, l: 50, c: 6, v: 9 } }], total: { label: 'Total', valores: { i: 1900, l: 250, c: 7.6, v: 80 } } };
document.getElementById('app').innerHTML = barraDeAbasHtml(abas, 'a', 'corpo') + '<div class="filterbar">' + atalhosHtml('tudo') + '<div class="fb-datas" hidden><input id="fb-from"><input id="fb-to"></div></div>' +
  '<div id="corpo">' + renderResumo({ title: 'Resultado por canal' }, resumo) + renderTabela({ title: 'Dados linha a linha' }, { columns: COLS, rows }) + '</div>';
ligarBordas(document.querySelector('.abas'));
ligarAtalhos(document.querySelector('.filterbar'), { min: '2026-07-01', max: '2026-09-28' }, () => {});
ligarTabelaOrdena(document.getElementById('corpo'), { aba: () => 'a' });
window.__pronto = true;
</script></body></html>`;

function subir(opcoes = {}) {
  const tema = opcoes.tema || 'dark';
  const acento = opcoes.acento || '#1F8A70';
  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/bancada.html') { res.writeHead(200, { 'content-type': TIPOS['.html'] }); res.end(PAGINA(url.searchParams.get('tema') || tema, url.searchParams.get('acento') || acento)); return; }
    if (url.pathname === '/celular.html') { res.writeHead(200, { 'content-type': TIPOS['.html'] }); res.end(PAGINA_CELULAR); return; }
    const arq = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
    if (!arq.startsWith(PUBLIC) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); res.end('nao achei'); return; }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(arq)] || 'application/octet-stream' });
    fs.createReadStream(arq).pipe(res);
  });
  return new Promise((ok) => servidor.listen(0, '127.0.0.1', () => ok({ servidor, url: `http://127.0.0.1:${servidor.address().port}`, fechar: () => new Promise((f) => servidor.close(f)) })));
}

module.exports = { subir };
