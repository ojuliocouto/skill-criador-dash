/**
 * Os três scripts de prova (prova-dash, passe-de-gosto, gravar-video) funcionam com `--senha`.
 *
 * Achado da prova no ar de 08/10/2026 (dash com senha publicado na Cloudflare):
 *  - prova-dash.js --senha reprovava o painel ("nenhum card de KPI visível") porque a tela de senha só aparece
 *    DEPOIS da resposta 401 da API, e o script procurava o campo logo após o carregamento da página, quando ele
 *    ainda não existia: pulava a senha, ficava na tela de senha e ainda contava o 401 esperado como "request falhou";
 *  - gravar-video.js --senha: mesmo defeito (o passo esperar_numero estourava em 45 s);
 *  - passe-de-gosto.js --senha dava VERDE medindo a tela de senha (aba "(sem abas)", 0 sinais): falso verde.
 *
 * A bancada é um servidor local que se comporta como o painel de verdade: a página abre com o esqueleto, pergunta
 * à API, recebe 401 sem o cabeçalho de senha, e só depois desenha o campo de senha; senha certa desenha o painel
 * com abas e números; senha errada desenha o campo de novo com "Senha incorreta".
 * Sem Playwright, avisa que foi PULADO (não finge que passou).
 * Uso: node <dir-da-skill>/scripts/test-senha-nos-scripts.cjs
 */
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { acharPlaywright } = require('./video/achar-playwright.cjs');

const SENHA = 'senha-da-bancada';
const PAGINA = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Dashboard</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:18px system-ui;margin:24px}.kpi__value{font-size:40px;min-height:48px}</style></head>
<body><div id="app"><div class="kpi"><div class="kpi__value esq">&nbsp;</div></div></div>
<script>
const app = document.getElementById('app');
const guardada = () => { try { return sessionStorage.getItem('dashauth'); } catch (_) { return null; } };
function pedirSenha() {
  const jaTentou = !!guardada();
  app.innerHTML = '<h2>Dashboard protegido</h2><input id="pwInput" type="password" placeholder="Senha"><button id="pwBtn" type="button">Acessar</button><p class="error" id="pwErr">' + (jaTentou ? 'Senha incorreta. Tente de novo.' : '') + '</p>';
  const entrar = () => { const v = document.getElementById('pwInput').value; if (!v) return; sessionStorage.setItem('dashauth', v); app.innerHTML = '<div class="kpi"><div class="kpi__value esq">&nbsp;</div></div>'; iniciar(); };
  document.getElementById('pwBtn').addEventListener('click', entrar);
  document.getElementById('pwInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); });
}
function painel() {
  app.innerHTML = '<div class="abas" role="tablist"><button role="tab">Visão geral</button><button role="tab">Canais</button></div>' +
    '<div class="kpi"><div class="kpi__label">Investimento</div><div class="kpi__value">R$ 1.234,00</div></div>' +
    '<div class="kpi"><div class="kpi__label">Leads</div><div class="kpi__value">2.647</div></div>';
}
async function iniciar() {
  const h = guardada();
  await new Promise((r) => setTimeout(r, 700)); // a rede não é instantânea: o campo de senha só nasce depois da resposta
  const r = await fetch('/api/dashboards?id=x', { headers: h ? { 'x-dash-auth': h } : {} });
  if (r.status === 401) pedirSenha(); else painel();
}
iniciar();
</script></body></html>`;

let falhas = 0;
const checa = (nome, ok, det = '') => { console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}${det ? ' -> ' + det : ''}`); if (!ok) falhas++; };

function rodar(args, tempoMs) {
  return new Promise((resolve) => {
    const f = spawn(process.execPath, args, { windowsHide: true });
    let saida = '';
    f.stdout.on('data', (d) => { saida += d; });
    f.stderr.on('data', (d) => { saida += d; });
    const relogio = setTimeout(() => f.kill(), tempoMs);
    f.on('close', (status) => { clearTimeout(relogio); resolve({ status, saida }); });
  });
}

(async () => {
  const pw = acharPlaywright();
  if (!pw) { console.log('PULADO: Playwright não encontrado (npm i -g playwright). Esta bancada NÃO rodou.'); return; }
  const servidor = http.createServer((req, res) => {
    if (req.url.startsWith('/api/dashboards')) {
      const ok = req.headers['x-dash-auth'] === SENHA;
      res.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' });
      res.end(ok ? '{"id":"x"}' : '{"error":"Senha necessária ou incorreta.","needsPassword":true}');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGINA);
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${servidor.address().port}/dashboard.html?id=x`;
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'senha nos scripts '));

  // 1. prova-dash.js
  let r = await rodar([path.join(__dirname, 'prova-dash.js'), url, '--senha', SENHA, '--out', path.join(raiz, 'prova ok')], 120000);
  checa('prova-dash --senha certa: aprova o painel (saída 0)', r.status === 0, `saída ${r.status}; ${r.saida.split('\n').filter((l) => /FALHA/.test(l)).join(' | ')}`);
  checa('prova-dash --senha certa: o 401 esperado da tela de senha não vira "request falhou"', !/request falhou/.test(r.saida), (r.saida.match(/FALHA[^\n]*request[^\n]*/) || [''])[0]);
  r = await rodar([path.join(__dirname, 'prova-dash.js'), url, '--senha', 'errada-de-proposito', '--out', path.join(raiz, 'prova errada')], 120000);
  checa('prova-dash --senha errada: reprova (saída diferente de 0)', r.status !== 0, `saída ${r.status}`);
  checa('prova-dash --senha errada: a mensagem diz que a SENHA foi recusada', /senha/i.test(r.saida.split('\n').filter((l) => /FALHA/.test(l)).join(' ')) && /recusad|incorret/i.test(r.saida), r.saida.split('\n').filter((l) => /FALHA/.test(l)).join(' | ').slice(0, 200));

  // 2. passe-de-gosto.js: tem que medir o PAINEL (abas "Visão geral" e "Canais"), não a tela de senha.
  const saidaPasse = path.join(raiz, 'passe');
  r = await rodar([path.join(__dirname, 'passe-de-gosto.js'), url, '--senha', SENHA, '--out', saidaPasse], 180000);
  let medido = null;
  try { medido = JSON.parse(fs.readFileSync(path.join(saidaPasse, 'passe-de-gosto-medido.json'), 'utf8')); } catch (_) { /* segue */ }
  const abas = medido ? [...new Set(medido.passes.map((p) => p.aba))] : [];
  checa('passe-de-gosto --senha certa: mediu o painel e não a tela de senha (abas medidas: Visão geral e Canais)', abas.includes('Visão geral') && abas.includes('Canais'), `abas medidas: ${JSON.stringify(abas)}`);
  r = await rodar([path.join(__dirname, 'passe-de-gosto.js'), url, '--senha', 'errada-de-proposito', '--out', path.join(raiz, 'passe errada')], 120000);
  checa('passe-de-gosto --senha errada: reprova em vez de dar verde medindo a tela de senha', r.status !== 0 && /senha/i.test(r.saida), `saída ${r.status}; ${r.saida.slice(0, 160).replace(/\n/g, ' | ')}`);

  // 3. gravar-video.js com um roteiro mínimo (abrir, esperar o número, três quadros).
  const roteiro = path.join(raiz, 'roteiro.json');
  fs.writeFileSync(roteiro, JSON.stringify({ nome: 'senha', duracao_minima_s: 10, passos: [{ acao: 'abrir' }, { acao: 'esperar_numero', ms: 15000 }, ...[1, 2, 3, 4, 5, 6].flatMap((n) => [{ acao: 'print', nome: `q${n}` }, { acao: 'esperar', ms: 1500 }])] }), 'utf8');
  const saidaVideo = path.join(raiz, 'video');
  r = await rodar([path.join(__dirname, 'gravar-video.js'), url, '--senha', SENHA, '--saida', saidaVideo, '--roteiro', roteiro, '--perfis', 'desktop'], 150000);
  checa('gravar-video --senha certa: grava (saída 0) com número na tela', r.status === 0, `saída ${r.status}; ${r.saida.split('\n').filter((l) => /FALHA/.test(l)).join(' | ')}`);
  r = await rodar([path.join(__dirname, 'gravar-video.js'), url, '--senha', 'errada-de-proposito', '--saida', path.join(raiz, 'video errada'), '--roteiro', roteiro, '--perfis', 'desktop'], 150000);
  checa('gravar-video --senha errada: reprova e diz que a senha foi recusada', r.status !== 0 && /senha/i.test(r.saida) && /recusad|incorret/i.test(r.saida), `saída ${r.status}; ${r.saida.split('\n').filter((l) => /FALHA/.test(l)).join(' | ').slice(0, 200)}`);

  servidor.close();
  console.log(`\nPasta de saída do teste: ${raiz}`);
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error('FALHA inesperada:', e.message); process.exit(1); });
