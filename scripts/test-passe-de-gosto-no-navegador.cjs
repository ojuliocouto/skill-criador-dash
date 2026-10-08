/**
 * D13: o medidor do passe de gosto se prova com mutantes. Um painel limpo feito com os widgets de verdade tem que dar
 * ZERO nos dois temas; cada defeito plantado (um por vez, um por sinal medido) tem que ser acusado, e só ele.
 * Uso: node <dir-da-skill>/scripts/test-passe-de-gosto-no-navegador.cjs
 */
const assert = require('node:assert/strict');
const { acharPlaywright } = require('./video/achar-playwright.cjs');
const { subir, MUTANTES } = require('./efeitos-harness.cjs');
const { SINAIS, NAO_MEDIDOS, medirNaPagina } = require('./video/sinais-de-gosto.cjs');

let falhas = 0;
async function teste(nome, fn) {
  try { await fn(); console.log(`ok    ${nome}`); } catch (e) { falhas++; console.log(`FALHA ${nome} -> ${String(e.message).split('\n')[0]}`); }
}

async function main() {
  const pw = acharPlaywright();
  if (!pw) { console.error('Playwright não encontrado'); return 1; }
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
  } finally {
    await browser.close();
    await bancada.fechar();
  }
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  return falhas ? 1 : 0;
}
main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
