/**
 * Barra do topo (3.7.1): ao rolar, o conteúdo que passa por trás da barra fixa aparecia como texto fantasma (o fundo é
 * translúcido e desfoque é proibido). Mede no navegador: no topo a aparência é a de sempre (translúcida); rolado 400 px o
 * fundo computado tem alfa 1 e uma faixa vazia da barra é de uma cor só (nenhum texto do conteúdo legível atrás).
 * Em tema claro e escuro, 1440 e 390.
 * Uso: node <dir-da-skill>/scripts/test-barra-topo-no-navegador.cjs
 */
const assert = require('node:assert/strict');
const { acharPlaywright } = require('./video/achar-playwright.cjs');
const { subir } = require('./efeitos-harness.cjs');

let falhas = 0;
async function teste(nome, fn) {
  try { await fn(); console.log(`ok    ${nome}`); } catch (e) { falhas++; console.log(`FALHA ${nome} -> ${String(e.message).split('\n')[0]}`); }
}
const alfa = (cor) => { const m = /rgba?\(\s*[\d.]+[ ,]+[\d.]+[ ,]+[\d.]+(?:[ ,/]+([\d.]+))?\s*\)/.exec(cor); return m && m[1] != null ? parseFloat(m[1]) : 1; };

async function main() {
  const pw = acharPlaywright();
  if (!pw) { console.error('Playwright não encontrado'); return 1; }
  const bancada = await subir();
  const browser = await pw.chromium.launch();
  try {
    for (const tema of ['light', 'dark']) {
      for (const largura of [1440, 390]) {
        await teste(`barra do topo (${tema}, ${largura}): translúcida no topo, opaca e sem texto fantasma depois de rolar 400 px`, async () => {
          const ctx = await browser.newContext({ viewport: { width: largura, height: 800 } });
          const pagina = await ctx.newPage();
          await pagina.goto(`${bancada.url}/topo.html?tema=${tema}`);
          await pagina.waitForFunction(() => window.__pronto === true);
          const fundo = () => pagina.evaluate(() => getComputedStyle(document.querySelector('.topbar')).backgroundColor);
          // faixa vazia da barra: o meio, longe da marca (esquerda) e dos botões (direita)
          const unicaCor = async () => {
            const caixa = await pagina.evaluate(() => { const r = document.querySelector('.topbar').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
            const png = await pagina.screenshot({ clip: { x: Math.round(caixa.x + caixa.w * 0.5), y: Math.round(caixa.y + 6), width: Math.round(caixa.w * 0.4), height: Math.round(caixa.h - 14) } });
            return pagina.evaluate(async (b64) => {
              const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
              const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
              const d = x.getImageData(0, 0, c.width, c.height).data; let maior = 0;
              for (let i = 4; i < d.length; i += 4) maior = Math.max(maior, Math.abs(d[i] - d[0]), Math.abs(d[i + 1] - d[1]), Math.abs(d[i + 2] - d[2]));
              return maior; // diferença máxima entre pixels da faixa: 0 = uma cor só
            }, png.toString('base64'));
          };
          assert.ok(alfa(await fundo()) < 1, 'no topo a aparência de sempre (translúcida)');
          await pagina.evaluate(() => window.scrollTo(0, 400));
          await pagina.waitForTimeout(250);
          assert.equal(alfa(await fundo()), 1, 'rolado, o fundo da barra tem alfa 1');
          assert.equal(await unicaCor(), 0, 'rolado, a faixa vazia da barra é de uma cor só: nada do conteúdo aparece atrás');
          await pagina.evaluate(() => window.scrollTo(0, 0));
          await pagina.waitForTimeout(250);
          assert.ok(alfa(await fundo()) < 1, 'de volta ao topo, a aparência de sempre');
          await ctx.close();
        });
      }
    }
    await teste('o mutante (barra translúcida sem a classe) mostra texto fantasma: a medida pega o defeito', async () => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 800 } });
      const pagina = await ctx.newPage();
      await pagina.goto(`${bancada.url}/topo.html?tema=light`);
      await pagina.waitForFunction(() => window.__pronto === true);
      await pagina.addStyleTag({ content: '.topbar.is-rolado{background:var(--topbar-bg) !important}' });
      await pagina.evaluate(() => window.scrollTo(0, 400)); await pagina.waitForTimeout(250);
      const a = await pagina.evaluate(() => getComputedStyle(document.querySelector('.topbar')).backgroundColor);
      assert.ok(alfa(a) < 1);
      await ctx.close();
    });
  } finally { await browser.close(); await bancada.fechar(); }
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  return falhas ? 1 : 0;
}
main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
