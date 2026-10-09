/**
 * D13: o medidor do passe de gosto se prova com mutantes. Um painel limpo feito com os widgets de verdade tem que dar
 * ZERO nos dois temas; cada defeito plantado (um por vez, um por sinal medido) tem que ser acusado, e só ele.
 * Uso: node <dir-da-skill>/scripts/test-passe-de-gosto-no-navegador.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { acharPlaywright } = require('./video/achar-playwright.cjs');
const { subir, MUTANTES } = require('./efeitos-harness.cjs');
const { SINAIS, NAO_MEDIDOS, medirNaPagina } = require('./video/sinais-de-gosto.cjs');

const grupoHarness = require('./grupo-harness.cjs');

/** Roda o passe-de-gosto.js de verdade contra uma URL e devolve { status, saida, ms }. */
function rodarPasse(args, tempoMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const f = spawn(process.execPath, [path.join(__dirname, 'passe-de-gosto.js'), ...args], { windowsHide: true });
    let saida = '';
    f.stdout.on('data', (d) => { saida += d; });
    f.stderr.on('data', (d) => { saida += d; });
    const relogio = setTimeout(() => f.kill(), tempoMs);
    f.on('close', (status) => { clearTimeout(relogio); resolve({ status, saida, ms: Date.now() - t0 }); });
  });
}

let falhas = 0;
async function teste(nome, fn) {
  try { await fn(); console.log(`ok    ${nome}`); } catch (e) { falhas++; console.log(`FALHA ${nome} -> ${String(e.message).split('\n')[0]}`); }
}

async function main() {
  const pw = acharPlaywright();
  if (!pw) { console.log('PULADO: Playwright não encontrado (npm i -g playwright && npx playwright install chromium). Esta bancada NÃO rodou.'); return 0; }
  const bancada = await subir();
  const browser = await pw.chromium.launch();
  const medir = async (m, tema = 'light', largura = 1200) => {
    const ctx = await browser.newContext({ viewport: { width: largura, height: 900 } });
    const pagina = await ctx.newPage();
    await pagina.goto(`${bancada.url}/gosto.html?m=${m}&tema=${tema}`);
    await pagina.waitForFunction(() => window.__pronto === true);
    await pagina.waitForTimeout(250);
    const r = await pagina.evaluate(medirNaPagina);
    await ctx.close();
    return Object.fromEntries(Object.entries(r).filter(([, v]) => v.achados).map(([k, v]) => [k, v.achados]));
  };
  try {
    await teste('a lista tem 10 sinais medidos e 3 itens de gosto que o gate cobra por print', () => {
      assert.equal(Object.keys(SINAIS).length, 10);
      assert.deepEqual(Object.keys(NAO_MEDIDOS).sort(), ['cor_como_enfeite', 'olhado_claro', 'olhado_escuro']);
      assert.deepEqual(Object.keys(MUTANTES).filter((k) => k !== 'limpo').sort(), Object.keys(SINAIS).sort(), 'há um mutante plantado para cada sinal medido');
    });
    for (const tema of ['light', 'dark']) {
      await teste(`painel limpo (${tema}): zero sinais`, async () => {
        assert.deepEqual(await medir('limpo', tema), {});
      });
    }
    for (const chave of Object.keys(SINAIS)) {
      await teste(`mutante ${chave}: o medidor acusa esse sinal (e nenhum outro)`, async () => {
        const r = await medir(chave);
        assert.ok(r[chave] >= 1, `não acusou ${chave}: ${JSON.stringify(r)}`);
        const outros = Object.keys(r).filter((k) => k !== chave);
        // o defeito pode arrastar um vizinho legítimo (card alto demais é card meio vazio); só não pode acusar sinal sem relação
        const permitidos = chave === 'icone_por_metrica' ? ['card_com_metade_vazia'] : [];
        assert.deepEqual(outros.filter((k) => !permitidos.includes(k)), [], `acusou sinal que não foi plantado: ${outros}`);
      });
    }
    await teste('mutante em tema escuro também é acusado (cor tingida no escuro)', async () => {
      const r = await medir('caixa_alta_espacada', 'dark');
      assert.ok(r.caixa_alta_espacada >= 1);
    });

    // 3.7.3: o passe de gosto esperava `.kpi__value` ou tabela SEM exigir dígito, e o esqueleto de carregamento tem
    // `.kpi__value` (só barras cinza): a espera se satisfazia com o esqueleto e o script media o esqueleto.
    const lenta = grupoHarness.painel('painel-lento', 'Painel lento', 777);
    const harnessLento = await grupoHarness.subir({ paineis: [lenta], atrasoPorLeads: { 777: 60000 } });
    await teste('passe de gosto: painel que só mostra o esqueleto (sem número) NÃO dá verde, reprova dizendo que não apareceu número', async () => {
      const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'passe esqueleto '));
      const r = await rodarPasse([`${harnessLento.url}/dashboard.html?id=${lenta.id}`, '--out', saida, '--espera-ms', '4000'], 90000);
      assert.notEqual(r.status, 0, `saiu 0 medindo o esqueleto: ${r.saida.slice(0, 200)}`);
      assert.match(r.saida, /número|dígito/i, `a mensagem não diz o motivo: ${r.saida.slice(0, 200)}`);
      assert.ok(!fs.existsSync(path.join(saida, 'passe-de-gosto-medido.json')), 'gravou medição de uma tela sem número');
    });
    await harnessLento.fechar();
    const tardia = grupoHarness.painel('painel-tardio', 'Painel tardio', 888);
    const harnessTardio = await grupoHarness.subir({ paineis: [tardia], atrasoPorLeads: { 888: 5500 } });
    await teste('passe de gosto: painel que demora 5,5 s para trazer o número é medido DEPOIS do número (abas reais, não o esqueleto)', async () => {
      const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'passe tardio '));
      const r = await rodarPasse([`${harnessTardio.url}/dashboard.html?id=${tardia.id}`, '--out', saida], 240000);
      assert.equal(r.status, 0, `saída ${r.status}: ${r.saida.slice(0, 300)}`);
      const medido = JSON.parse(fs.readFileSync(path.join(saida, 'passe-de-gosto-medido.json'), 'utf8'));
      const abas = [...new Set(medido.passes.map((p) => p.aba))];
      assert.ok(abas.includes('Visão geral'), `mediu ${JSON.stringify(abas)}: o esqueleto, não o painel`);
    });
    await harnessTardio.fechar();
  } finally {
    await browser.close();
    await bancada.fechar();
  }
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  return falhas ? 1 : 0;
}
main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
