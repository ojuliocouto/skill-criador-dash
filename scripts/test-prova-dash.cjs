/** O ano do título não pode substituir o número de um KPI. */
const http = require('node:http');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'prova-dash-teste-'));
const servidor = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>Painel 2026</h1><div class="kpi__value">' + (req.url === '/ok' ? 'R$ 150,00' : '&#8212;') + '</div></body></html>');
});
servidor.listen(0, '127.0.0.1', async () => {
  let falhas = 0;
  for (const [rota, esperado] of [['ok', 0], ['vazio', 1]]) {
    const codigo = await new Promise(resolve => {
      const filho = spawn(process.execPath, [path.join(__dirname, 'prova-dash.js'), `http://127.0.0.1:${servidor.address().port}/${rota}`, '--out', path.join(pasta, rota)]);
      let saida = '';
      filho.stdout.on('data', d => { saida += d; });
      filho.stderr.on('data', d => { saida += d; });
      const teto = setTimeout(() => filho.kill('SIGTERM'), 90000);
      filho.on('close', code => {
        clearTimeout(teto);
        fs.writeFileSync(path.join(pasta, rota + '.log'), saida);
        resolve(code);
      });
    });
    console.log(`${rota}: exit=${codigo}, esperado=${esperado}`);
    if (codigo !== esperado) falhas++;
  }
  console.log(`Evidências: ${pasta}`);
  servidor.close();
  process.exitCode = falhas ? 1 : 0;
});
