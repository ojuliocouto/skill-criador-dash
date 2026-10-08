/**
 * Minigráfico nos cartões vizinhos do destaque (3.7.1). Mede no navegador, com a faixa de indicadores de verdade:
 * nenhum cartão fica meio vazio (o medidor do passe de gosto dá zero) em 1440, 390 e 360, claro e escuro; no celular são
 * 2 colunas e a página não rola de lado; o traço se desenha na abertura e se transforma na troca de período; com
 * movimento reduzido nada anima.
 * Uso: node <dir-da-skill>/scripts/test-minigrafico-no-navegador.cjs   (MINI_PRINTS=<pasta> guarda os PNG)
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { acharPlaywright } = require('./video/achar-playwright.cjs');
const { subir } = require('./efeitos-harness.cjs');
const { medirNaPagina } = require('./video/sinais-de-gosto.cjs');

let falhas = 0;
async function teste(nome, fn) {
  try { await fn(); console.log(`ok    ${nome}`); } catch (e) { falhas++; console.log(`FALHA ${nome} -> ${String(e.message).split('\n')[0]}`); }
}
const PRINTS = process.env.MINI_PRINTS || '';
if (PRINTS) fs.mkdirSync(PRINTS, { recursive: true });

async function main() {
  const pw = acharPlaywright();
  if (!pw) { console.log('PULADO: Playwright não encontrado (npm i -g playwright && npx playwright install chromium). Esta bancada NÃO rodou.'); return 0; }
  const bancada = await subir();
  const browser = await pw.chromium.launch();
  const abrir = async (largura, tema, opcoes = {}) => {
    const ctx = await browser.newContext({ viewport: { width: largura, height: 900 }, reducedMotion: opcoes.reduzido ? 'reduce' : 'no-preference', isMobile: largura < 500, hasTouch: largura < 500 });
    const pagina = await ctx.newPage();
    await pagina.goto(`${bancada.url}/faixa.html?tema=${tema}`);
    await pagina.waitForFunction(() => window.__pronto === true);
    await pagina.waitForTimeout(600); // o dashboard.js importado mexe no tema ao iniciar: o tema do teste vem depois
    await pagina.evaluate((x) => { document.documentElement.dataset.theme = x; }, tema);
    await pagina.waitForTimeout(200);
    return { ctx, pagina };
  };
  try {
    for (const tema of ['light', 'dark']) {
      for (const largura of [1440, 390, 360]) {
        await teste(`${largura} ${tema}: nenhum cartão meio vazio e nenhum outro sinal da lista; vizinhos com minigráfico`, async () => {
          const { ctx, pagina } = await abrir(largura, tema, { reduzido: true });
          const r = await pagina.evaluate(medirNaPagina);
          const achados = Object.fromEntries(Object.entries(r).filter(([, v]) => v.achados).map(([k, v]) => [k, v.onde[0]]));
          assert.deepEqual(achados, {});
          const m = await pagina.evaluate(() => ({
            minis: document.querySelectorAll('.kpi--mini').length,
            minigraficos: [...document.querySelectorAll('.kpi--mini .kpi__spark')].filter((s) => s.getBoundingClientRect().height > 0).length,
            roas: !!document.querySelector('.kpi:not(.kpi--mini):not(.kpi--hero) .kpi__spark'),
            paginaX: document.documentElement.scrollWidth - window.innerWidth,
            larguras: [...document.querySelectorAll('.grid.kpis > .kpi')].map((k) => Math.round(k.getBoundingClientRect().width)),
          }));
          assert.equal(m.minis, 5);
          assert.equal(m.roas, false, 'indicador sem série não ganha minigráfico');
          assert.ok(m.paginaX <= 0, `a página rola ${m.paginaX} px de lado`);
          if (largura < 500) {
            assert.ok(m.larguras.slice(1, 5).every((w) => w < largura * 0.6), `2 colunas no celular: ${m.larguras}`);
            assert.equal(m.minigraficos, 5, 'cabe em 360 e 390');
          }
          if (PRINTS) await pagina.screenshot({ path: path.join(PRINTS, `faixa-${largura}-${tema}.png`), fullPage: true });
          await ctx.close();
        });
      }
    }

    await teste('o traço do minigráfico se desenha na abertura (movimento permitido)', async () => {
      const { ctx, pagina } = await abrir(1440, 'light');
      await pagina.evaluate(() => window.__desenhar('entrada'));
      const m = await pagina.evaluate(() => { const p = document.querySelector('.kpi--mini .kpi__spark polyline'); const h = document.querySelector('.kpi--hero .kpi__spark polyline'); return { mini: getComputedStyle(p).strokeDasharray, heroi: getComputedStyle(h).strokeDasharray, anim: document.getAnimations().length }; });
      assert.notEqual(m.mini, 'none');
      assert.notEqual(m.heroi, 'none');
      await ctx.close();
    });

    await teste('na troca de período a linha do minigráfico vai do desenho antigo ao novo e termina exatamente no novo', async () => {
      const { ctx, pagina } = await abrir(1440, 'light');
      // o desenho final esperado: o mesmo dado, desenhado parado
      const final = await pagina.evaluate(() => { window.__desenhar('quieto', 6); const f = document.querySelector('.kpi--mini .kpi__spark polyline').getAttribute('points'); window.__desenhar('quieto', 2.5); return f; });
      await pagina.evaluate(() => window.__desenhar('filtro', 6));
      // o desenho novo foi posto e a transformação começou; no meio do caminho a linha NÃO é a final
      const meio = await pagina.evaluate(() => new Promise((ok) => setTimeout(() => ok(document.querySelector('.kpi--mini .kpi__spark polyline').getAttribute('points')), 160)));
      assert.notEqual(meio, final, 'no meio da transformação a linha ainda não é a final');
      await pagina.waitForTimeout(1000);
      assert.equal(await pagina.evaluate(() => document.querySelector('.kpi--mini .kpi__spark polyline').getAttribute('points')), final);
      await ctx.close();
    });

    await teste('movimento reduzido: sem desenho do traço, sem transformação, estado final de imediato', async () => {
      const { ctx, pagina } = await abrir(1440, 'light', { reduzido: true });
      await pagina.evaluate(() => window.__desenhar('entrada'));
      const dash = await pagina.evaluate(() => getComputedStyle(document.querySelector('.kpi--mini .kpi__spark polyline')).strokeDasharray);
      assert.equal(dash, 'none');
      const final = await pagina.evaluate(() => { window.__desenhar('filtro', 6); return document.querySelector('.kpi--mini .kpi__spark polyline').getAttribute('points'); });
      const logo = await pagina.evaluate(() => document.querySelector('.kpi--mini .kpi__spark polyline').getAttribute('points'));
      assert.equal(logo, final, 'sem interpolação');
      assert.equal(await pagina.evaluate(() => document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.kpi__spark')).length), 0);
      await ctx.close();
    });
  } finally { await browser.close(); await bancada.fechar(); }
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  return falhas ? 1 : 0;
}
main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
