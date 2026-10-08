/**
 * Integração do gravador de vídeo de prova: grava de verdade (Chromium do Playwright) uma página
 * local mínima, numa pasta com ESPAÇO e ACENTO, e confere que:
 *  - o arquivo de vídeo existe, tem mais de 0 byte e é WebM;
 *  - a duração lida do próprio WebM cai dentro da faixa (sem ffprobe) e bate com a marca de tempo dos passos;
 *  - saíram 6 quadros e a prancha, e o painel falso mostra o número, a aba trocou e o filtro mudou nos quadros;
 *  - um roteiro inválido é recusado antes de abrir o navegador.
 * Sem Playwright, avisa que foi PULADO (não finge que passou).
 * Uso: node <dir-da-skill>/scripts/test-gravar-video-integracao.cjs
 */
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { acharPlaywright } = require('./video/achar-playwright.cjs');

const GRAVADOR = process.env.GRAVADOR || path.join(__dirname, 'gravar-video.js');
// Assíncrono de propósito: o servidor da página vive neste mesmo processo, e um spawnSync o travaria.
function rodar(args, tempoMs) {
  return new Promise((resolve) => {
    const f = spawn(process.execPath, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    f.stdout.on('data', (d) => { stdout += d; });
    f.stderr.on('data', (d) => { stderr += d; });
    const relogio = setTimeout(() => f.kill(), tempoMs);
    f.on('close', (status) => { clearTimeout(relogio); resolve({ status, stdout, stderr }); });
  });
}

let falhas = 0;
const checa = (nome, ok, det = '') => { console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}${det ? ' -> ' + det : ''}`); if (!ok) falhas++; };

const PAGINA = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>painel falso</title>
<style>body{font:20px system-ui;margin:30px}.abas button{padding:10px 18px;margin-right:8px}.kpi__value{font-size:48px}[role=tabpanel]{min-height:1200px}</style>
<div class="abas" role="tablist"><button role="tab" id="t0">Visão geral</button><button role="tab" id="t1">Canais</button><button role="tab" id="t2">Funil</button></div>
<div id="filterbar"><select id="canal"><option>Todos</option><option>Instagram</option></select></div>
<div class="kpi"><div class="kpi__value" id="valor">R$ 1.234,00</div></div>
<div role="tabpanel" id="painel">Aba: Visão geral</div>
<script>
document.querySelectorAll('[role=tab]').forEach((b) => b.addEventListener('click', () => { document.getElementById('painel').textContent = 'Aba: ' + b.textContent; }));
document.getElementById('canal').addEventListener('change', (e) => { document.getElementById('valor').textContent = e.target.value === 'Todos' ? 'R$ 1.234,00' : 'R$ 321,00'; });
</script></html>`;

const roteiro = {
  nome: 'teste',
  passos: [
    { acao: 'abrir' }, { acao: 'esperar_seletor', seletor: '.kpi__value' }, { acao: 'esperar', ms: 1500 },
    { acao: 'print', nome: 'abriu' }, { acao: 'mover_mouse', seletor: '.kpi' }, { acao: 'print', nome: 'numero' },
    { acao: 'clicar', seletor: '.abas [role="tab"] >> nth=1' }, { acao: 'esperar', ms: 1500 }, { acao: 'print', nome: 'aba canais' },
    { acao: 'clicar', seletor: '.abas [role="tab"] >> nth=2' }, { acao: 'esperar', ms: 1500 }, { acao: 'print', nome: 'aba funil' },
    { acao: 'escolher', seletor: '#filterbar select', indice: 1 }, { acao: 'esperar', ms: 1500 }, { acao: 'print', nome: 'filtro' },
    { acao: 'clicar', seletor: '#nao-existe', opcional: true },
    { acao: 'rolar', y: 400 }, { acao: 'esperar', ms: 1500 }, { acao: 'print', nome: 'rolou' },
  ],
};

(async () => {
  const pw = acharPlaywright();
  if (!pw) { console.log('PULADO: Playwright não encontrado (npm i -g playwright). Esta integração NÃO rodou.'); return; }
  const servidor = http.createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGINA); });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${servidor.address().port}/`;
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'vídeo de prova '));
  const saida = path.join(raiz, 'saída com espaço');
  const arquivoRoteiro = path.join(raiz, 'roteiro de teste.json');
  fs.writeFileSync(arquivoRoteiro, JSON.stringify(roteiro), 'utf8');

  const r = await rodar([GRAVADOR, url, '--saida', saida, '--roteiro', arquivoRoteiro, '--perfis', 'desktop'], 120000);
  console.log((r.stdout || '').split('\n').filter((l) => /desktop:|FALHA|aviso/.test(l)).join('\n') + (r.stderr || '').slice(0, 300));
  checa('o gravador terminou com código 0', r.status === 0, `código ${r.status}`);

  const video = path.join(saida, 'video-desktop.webm');
  const existe = fs.existsSync(video);
  checa('o vídeo existe, em pasta com espaço e acento', existe, video);
  const bytes = existe ? fs.statSync(video).size : 0;
  checa('o vídeo tem mais de 0 byte', bytes > 0, `${bytes} bytes`);
  const cab = existe ? fs.readFileSync(video).subarray(0, 4).toString('hex') : '';
  checa('o arquivo é WebM (cabeçalho EBML)', cab === '1a45dfa3', cab);

  let info = null;
  try { info = JSON.parse(fs.readFileSync(path.join(saida, 'video-info.json'), 'utf8')); } catch (_) { /* segue */ }
  const d = info && info.perfis && info.perfis.desktop;
  checa('video-info.json descreve o vídeo', !!d && d.formato === 'webm' && d.bytes === bytes);
  if (d) {
    const webmS = d.duracaoWebmMs === null ? null : d.duracaoWebmMs / 1000;
    const marcasS = d.duracaoDasMarcasMs / 1000;
    checa('duração lida do próprio WebM está entre 8 e 18 s', webmS !== null && webmS >= 8 && webmS <= 18, `webm=${webmS} s, marcas=${marcasS.toFixed(1)} s`);
    checa('a duração do WebM bate com a marca de tempo dos passos (até 2,5 s de diferença)', webmS !== null && Math.abs(webmS - marcasS) <= 2.5, `${webmS} x ${marcasS.toFixed(1)}`);
    checa('o passo opcional que não existe foi pulado e avisado, sem derrubar a gravação', d.passosPulados.length === 1 && d.falha === null, JSON.stringify(d.passosPulados));
    checa('saíram 6 quadros', d.quadros.length === 6 && d.quadros.every((q) => fs.statSync(path.join(saida, 'quadros', q)).size > 0), d.quadros.join(', '));
    checa('a prancha foi montada', !!d.prancha && fs.statSync(path.join(saida, d.prancha)).size > 0, d.prancha);
  }
  checa('a pasta temporária de gravação foi limpa', !fs.existsSync(path.join(saida, '.gravando-desktop')));

  // Roteiro inválido: recusado antes de abrir o navegador (código 2, nenhuma pasta de vídeo).
  const ruim = path.join(raiz, 'ruim.json');
  fs.writeFileSync(ruim, JSON.stringify({ passos: [{ acao: 'clicar', seletor: 'a' }] }), 'utf8');
  const r2 = await rodar([GRAVADOR, url, '--saida', path.join(raiz, 'saida2'), '--roteiro', ruim], 30000);
  checa('roteiro inválido é recusado com código 2', r2.status === 2 && /Roteiro inválido/.test(r2.stderr), `código ${r2.status}`);

  servidor.close();
  console.log(`\nPasta de saída do teste: ${saida}`);
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error('FALHA inesperada:', e.message); process.exit(1); });
