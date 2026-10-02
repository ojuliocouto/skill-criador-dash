/**
 * O gate de tela reprova painel com QUALQUER card de KPI sem número.
 *
 * T4 do teste com aluno (02/10/2026): o prova-dash aprovava um painel com 3 de 5 cards em
 * traço e um zero falso, porque bastava UM card com dígito. Agora cada card é conferido.
 */
const http = require('node:http');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const card = (label, valor, extra = '') =>
  `<div class="kpi${extra}"><div class="kpi__label">${label}</div><div class="kpi__value">${valor}</div></div>`;

const PAGINAS = {
  // Ano no título não substitui o número de um KPI.
  ok: card('Investimento', 'R$ 150,00') + card('CPA', 'R$ 95,17'),
  vazio: card('Investimento', '&#8212;'),
  traco: card('Investimento', 'R$ 150,00') + card('Leads', '-') + card('CPL', '-'),
  travessao: card('Investimento', 'R$ 150,00') + card('CPA', '&#8212;'),
  nan: card('Investimento', 'R$ 150,00') + card('ROAS', 'NaN'),
  em_branco: card('Investimento', 'R$ 150,00') + card('CTR', ''),
  erro: card('Investimento', 'R$ 150,00') + card('CPA', 'Erro'),
  nao_mapeada: card('Investimento', 'R$ 150,00') + card('ROAS', 'Não mapeada', ' is-unmapped'),
};
const ESPERADO = { ok: 0, vazio: 1, traco: 1, travessao: 1, nan: 1, em_branco: 1, erro: 1, nao_mapeada: 1 };

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'prova-dash-teste-'));
const servidor = http.createServer((req, res) => {
  const rota = req.url.slice(1);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>Painel 2026</h1>' + (PAGINAS[rota] || '') + '</body></html>');
});

function rodar(rota) {
  return new Promise((resolve) => {
    const filho = spawn(process.execPath, [path.join(__dirname, 'prova-dash.js'), `http://127.0.0.1:${servidor.address().port}/${rota}`, '--out', path.join(pasta, rota)]);
    let saida = '';
    filho.stdout.on('data', (d) => { saida += d; });
    filho.stderr.on('data', (d) => { saida += d; });
    const teto = setTimeout(() => filho.kill('SIGTERM'), 90000);
    filho.on('close', (code) => {
      clearTimeout(teto);
      fs.writeFileSync(path.join(pasta, rota + '.log'), saida);
      resolve({ code, saida });
    });
  });
}

servidor.listen(0, '127.0.0.1', async () => {
  let falhas = 0;
  for (const rota of Object.keys(PAGINAS)) {
    const { code, saida } = await rodar(rota);
    const ok = code === ESPERADO[rota];
    console.log(`${ok ? 'ok   ' : 'FALHA'} ${rota}: exit=${code}, esperado=${ESPERADO[rota]}`);
    if (!ok) { falhas++; console.log(saida.split('\n').filter((l) => /FALHA|aviso/.test(l)).join('\n')); }
    // A mensagem precisa dizer QUAL card falhou, senão o aluno não sabe o que consertar.
    if (rota === 'traco' && code === 1 && !/Leads/.test(saida)) { falhas++; console.log('FALHA traco: a saída não nomeia o card Leads'); }
    if (rota === 'nao_mapeada' && code === 1 && !/ocult/i.test(saida)) { falhas++; console.log('FALHA nao_mapeada: a saída não ensina a ocultar a métrica'); }
  }
  console.log(`Evidências: ${pasta}`);
  servidor.close();
  process.exitCode = falhas ? 1 : 0;
});
