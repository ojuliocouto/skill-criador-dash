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

// Página do passe de gosto (D13): um painelzinho LIMPO feito com os widgets de verdade, mais um defeito plantado
// por vez (?m=nome). O medidor tem que dar zero na limpa e acusar exatamente o sinal plantado.
const MUTANTES = {
  limpo: { css: '', html: '' },
  tinta_de_accent: { css: '.kpi{background:rgb(206,222,255)}', html: '' },
  barrinha_no_topo: { css: '.kpi{position:relative}.kpi::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:#5b62d6}', html: '' },
  gradiente_atras_de_numero: { css: '.kpi__value{background-image:linear-gradient(90deg,#5b62d6,#d65bb0)}', html: '' },
  icone_por_metrica: { css: '', html: '', js: 'document.querySelectorAll(".kpi").forEach((k, i) => k.insertAdjacentHTML("afterbegin", \'<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="hsl(\' + (i * 90) + \',70%,50%)"/></svg>\'));' },
  sombra_sem_hairline: { css: '.card{border:0;box-shadow:0 24px 60px rgba(0,0,0,.3)}', html: '' },
  sem_dados_sem_motivo: { css: '', html: '<div class="card"><div>Sem dados</div></div>' },
  caixa_alta_espacada: { css: '.kpi__label{text-transform:uppercase;letter-spacing:.14em}', html: '' },
  numero_em_mono_esticado: { css: '.kpi__value{font-family:ui-monospace,Menlo,monospace;letter-spacing:.09em}', html: '' },
  card_com_metade_vazia: { css: '.kpi{min-height:260px}', html: '' },
  data_formato_americano: { css: '', html: '<p class="hint">Atualizado em 09/25/2026</p>' },
};
const PAGINA_GOSTO = (m, tema) => {
  const mut = MUTANTES[m] || MUTANTES.limpo;
  return `<!doctype html>
<html lang="pt-BR" data-theme="${tema}" style="--accent:#0F5C6E;--accent-solido:#0F5C6E">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bancada do passe de gosto</title>
<link rel="stylesheet" href="/assets/css/main.css"><link rel="stylesheet" href="/assets/css/presenca.css"><link rel="stylesheet" href="/assets/css/efeitos.css"><link rel="stylesheet" href="/assets/css/celular.css">
<style>body{margin:0;padding:24px;background:var(--bg)}${mut.css}</style></head>
<body><div id="app" style="max-width:1100px"></div>
<script type="module">
import { render as kpi } from '/assets/js/widgets/kpi.js';
import { render as resumo } from '/assets/js/widgets/resumo.js';
import { render as tabela } from '/assets/js/widgets/table.js';
const d = { ok: true, dimLabel: 'Canal', totalDeGrupos: 2, colunas: [{ key: 'l', label: 'Leads', format: 'integer' }], linhas: [{ label: 'Google', valores: { l: 80 } }, { label: 'Instagram', valores: { l: 120 } }], total: { label: 'Total', valores: { l: 200 } } };
document.getElementById('app').innerHTML = '<div class="grid kpis" style="--kpi-cols:3">' + kpi({ label: 'Investimento', format: 'currency' }, 12000) + kpi({ label: 'Leads', format: 'integer' }, 480) + kpi({ label: 'CPL', format: 'currency' }, 25.1) + '</div>' +
  '<div class="card" style="margin-top:16px">' + resumo({ title: 'Por canal' }, d) + '</div><div class="card" style="margin-top:16px">' + tabela({ title: 'Dados' }, { columns: ['Data', 'Leads'], rows: [{ Data: '01/07/2026', Leads: '4' }, { Data: '02/07/2026', Leads: '5' }] }) + '</div>' + ${JSON.stringify(mut.html)};
${mut.js || ''}
window.__pronto = true;
</script></body></html>`;
};

// Barra do topo (3.7.1): a barra fixa com o conteúdo rolando por trás, como no painel.
const PAGINA_TOPO = (tema) => `<!doctype html>
<html lang="pt-BR" data-theme="${tema}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bancada da barra do topo</title>
<link rel="stylesheet" href="/assets/css/main.css"><link rel="stylesheet" href="/assets/css/presenca.css"></head>
<body><header class="topbar"><div class="brand"><span class="dot"></span><span class="name">Painel de teste</span></div></header>
<main class="wrap">${Array.from({ length: 30 }, (_, i) => `<p style="font-size:34px;font-weight:700;margin:0 0 18px;color:var(--text)">Número ${i} R$ ${1000 + i * 37},00 texto grande atrás da barra</p>`).join('')}</main>
<script type="module">
import { ligarBarraSolida } from '/assets/js/lib/barra-topo.js';
ligarBarraSolida(document.querySelector('.topbar'));
window.__pronto = true;
</script></body></html>`;

// Faixa de indicadores de verdade (renderKpiBlock) com destaque largo e minigráficos nos vizinhos (3.7.1).
const PAGINA_FAIXA = (tema) => `<!doctype html>
<html lang="pt-BR" data-theme="${tema}" style="--accent:#0F5C6E;--accent-solido:#0F5C6E;--accent-graph:#0F5C6E">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bancada da faixa</title>
<link rel="stylesheet" href="/assets/css/main.css"><link rel="stylesheet" href="/assets/css/presenca.css"><link rel="stylesheet" href="/assets/css/efeitos.css"><link rel="stylesheet" href="/assets/css/celular.css">
<style>body{margin:0;padding:16px;background:var(--bg)}</style></head>
<body><div id="faixa" style="max-width:1240px"></div>
<script type="module">
import { renderKpiBlock } from '/assets/js/dashboard.js';
import { getTemplate } from '/assets/js/templates/index.js';
import { fotografarDados, transformarDados } from '/assets/js/lib/grafico-transforma.js';
const tpl = getTemplate('marketing');
const itens = ['investimento', 'leads', 'CPL', 'conversoes', 'CPA', 'receita', 'ROAS'].map((metricKey) => ({ widget: 'kpi', props: { metricKey } }));
const computed = { investimento: 12000, leads: 480, CPL: 25, conversoes: 168, CPA: 71, receita: 67000, ROAS: 5.6 };
const trends = Object.fromEntries(Object.keys(computed).map((k) => [k, { text: '▲ 5,71%', good: true }]));
const serie = (n, f) => Array.from({ length: n }, (_, i) => 10 + Math.round(8 * Math.sin(i / f) + i % 5));
window.__desenhar = (modo, f = 2.5, goal = null) => {
  const alvo = document.getElementById('faixa');
  const foto = modo === 'filtro' ? fotografarDados(alvo) : null;
  const sparks = { leads: serie(40, f), investimento: serie(40, f + 1), CPL: serie(40, f + 2), conversoes: serie(40, f + 3), CPA: serie(40, f + 4), receita: serie(40, f + 5) };
  alvo.classList.toggle('anima-entrada', modo === 'entrada');
  alvo.innerHTML = renderKpiBlock(itens, tpl, computed, {}, trends, goal, sparks);
  if (foto) transformarDados(alvo, foto);
};
window.__desenhar('quieto');
window.__pronto = true;
</script></body></html>`;

function subir(opcoes = {}) {
  const tema = opcoes.tema || 'dark';
  const acento = opcoes.acento || '#1F8A70';
  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/bancada.html') { res.writeHead(200, { 'content-type': TIPOS['.html'] }); res.end(PAGINA(url.searchParams.get('tema') || tema, url.searchParams.get('acento') || acento)); return; }
    if (url.pathname === '/gosto.html') { res.writeHead(200, { 'content-type': TIPOS['.html'] }); res.end(PAGINA_GOSTO(url.searchParams.get('m') || 'limpo', url.searchParams.get('tema') || 'light')); return; }
    if (url.pathname === '/topo.html') { res.writeHead(200, { 'content-type': TIPOS['.html'] }); res.end(PAGINA_TOPO(url.searchParams.get('tema') || 'light')); return; }
    if (url.pathname === '/faixa.html') { res.writeHead(200, { 'content-type': TIPOS['.html'] }); res.end(PAGINA_FAIXA(url.searchParams.get('tema') || 'light')); return; }
    if (url.pathname === '/celular.html') { res.writeHead(200, { 'content-type': TIPOS['.html'] }); res.end(PAGINA_CELULAR); return; }
    const arq = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
    if (!arq.startsWith(PUBLIC) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); res.end('nao achei'); return; }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(arq)] || 'application/octet-stream' });
    fs.createReadStream(arq).pipe(res);
  });
  return new Promise((ok) => servidor.listen(0, '127.0.0.1', () => ok({ servidor, url: `http://127.0.0.1:${servidor.address().port}`, fechar: () => new Promise((f) => servidor.close(f)) })));
}

module.exports = { subir, MUTANTES };
