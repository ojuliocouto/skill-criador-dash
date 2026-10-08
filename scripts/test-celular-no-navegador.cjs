/**
 * D12 (teste de ponta a ponta, 02/10/2026): mede no navegador, em 390 e 360 px de largura, o que o celular
 * reprovou: nenhuma tabela rolando de lado (a de dados vira cartões, com o seletor "Ordenar por"), os atalhos
 * de período rolando por dentro com a borda esmaecida e "Personalizado" ao alcance, alvo de toque de pelo menos
 * 44 px nos atalhos e nas abas, e as abas numa linha só.
 * Uso: node <dir-da-skill>/scripts/test-celular-no-navegador.cjs   (CELULAR_PRINTS=<pasta> guarda os PNG)
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { acharPlaywright } = require('./video/achar-playwright.cjs');
const { subir } = require('./efeitos-harness.cjs');

let falhas = 0;
async function teste(nome, fn) {
  try { await fn(); console.log(`ok    ${nome}`); } catch (e) { falhas++; console.log(`FALHA ${nome} -> ${String(e.message).split('\n')[0]}`); }
}
const PRINTS = process.env.CELULAR_PRINTS || '';
if (PRINTS) fs.mkdirSync(PRINTS, { recursive: true });

async function main() {
  const pw = acharPlaywright();
  if (!pw) { console.log('PULADO: Playwright não encontrado (npm i -g playwright && npx playwright install chromium). Esta bancada NÃO rodou.'); return 0; }
  const bancada = await subir();
  const browser = await pw.chromium.launch();
  try {
    for (const largura of [390, 360]) {
      const abrir = async () => {
        const ctx = await browser.newContext({ viewport: { width: largura, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
        const pagina = await ctx.newPage();
        await pagina.goto(`${bancada.url}/celular.html`);
        await pagina.waitForFunction(() => window.__pronto === true);
        await pagina.evaluate(() => document.fonts && document.fonts.ready);
        await pagina.waitForTimeout(200);
        return { ctx, pagina };
      };

      await teste(`${largura}: a página não rola de lado e nenhuma tabela rola de lado`, async () => {
        const { ctx, pagina } = await abrir();
        const m = await pagina.evaluate(() => ({ pagina: document.documentElement.scrollWidth, janela: window.innerWidth,
          tabelas: [...document.querySelectorAll('.table__scroll, .resumo__scroll')].map((e) => ({ cl: e.className, sw: e.scrollWidth, cw: e.clientWidth })) }));
        assert.ok(m.pagina <= m.janela, `a página tem ${m.pagina} px numa janela de ${m.janela}`);
        for (const t of m.tabelas) assert.ok(t.sw <= t.cw + 1, `${t.cl} rola de lado (${t.sw} em ${t.cw})`);
        if (PRINTS) await pagina.screenshot({ path: path.join(PRINTS, `celular-${largura}.png`), fullPage: true });
        await ctx.close();
      });

      await teste(`${largura}: "Dados linha a linha" vira um cartão por linha (cabeçalho escondido, nome da coluna em cada valor)`, async () => {
        const { ctx, pagina } = await abrir();
        const m = await pagina.evaluate(() => {
          const tabela = document.querySelector('.table .table__el');
          const td = tabela.querySelector('tbody tr:nth-child(3) td:nth-child(3)');
          return { cabecalho: getComputedStyle(tabela.tHead).display, celula: getComputedStyle(td).display,
            rotulo: td.getAttribute('data-label'), antes: getComputedStyle(td, '::before').content, linhas: tabela.tBodies[0].rows.length,
            alturaDaLinha: tabela.tBodies[0].rows[0].getBoundingClientRect().height };
        });
        assert.equal(m.cabecalho, 'none');
        assert.equal(m.celula, 'flex');
        assert.equal(m.rotulo, 'Investimento');
        assert.match(m.antes, /attr|Investimento/);
        assert.equal(m.linhas, 12);
        assert.ok(m.alturaDaLinha > 70, 'a linha é um cartão com várias linhas de texto');
        await ctx.close();
      });

      await teste(`${largura}: o seletor "Ordenar por" ordena os cartões (tabela de dados e por canal) e o total fica no fim`, async () => {
        const { ctx, pagina } = await abrir();
        const visivel = await pagina.locator('.ordenar-por select').evaluateAll((l) => l.map((s) => s.getBoundingClientRect().height));
        assert.equal(visivel.length, 2);
        assert.ok(visivel.every((h) => h >= 44), `seletor de ordem com altura ${visivel}`);
        const dados = pagina.locator('.table .ordenar-por select');
        await dados.selectOption('2:desc'); // Investimento, decrescente
        await pagina.waitForTimeout(700);
        const inv = await pagina.evaluate(() => [...document.querySelectorAll('.table tbody tr')].map((tr) => Number(tr.cells[2].textContent.replace(/\D/g, ''))));
        assert.deepEqual(inv, [...inv].sort((a, b) => b - a), 'os cartões ficaram do maior para o menor investimento');
        await dados.selectOption(''); await pagina.waitForTimeout(700);
        const original = await pagina.evaluate(() => [...document.querySelectorAll('.table tbody tr')].map((tr) => tr.cells[0].textContent));
        assert.equal(original[0], '01/07/2026');
        const resumo = pagina.locator('.resumo .ordenar-por select');
        await resumo.selectOption('1:desc'); await pagina.waitForTimeout(700);
        const nomes = await pagina.evaluate(() => [...document.querySelectorAll('.resumo tbody tr')].map((tr) => tr.cells[0].textContent));
        assert.deepEqual(nomes, ['Google', 'Instagram', 'TikTok'], 'por Investimento decrescente: 900, 700, 300');
        const total = await pagina.evaluate(() => document.querySelector('.resumo tfoot tr').cells[0].textContent);
        assert.equal(total, 'Total');
        await ctx.close();
      });

      await teste(`${largura}: atalhos e abas têm alvo de toque de pelo menos 44 px`, async () => {
        const { ctx, pagina } = await abrir();
        const alturas = await pagina.evaluate(() => ({
          atalhos: [...document.querySelectorAll('.atalho')].map((e) => e.getBoundingClientRect().height),
          abas: [...document.querySelectorAll('.aba')].map((e) => e.getBoundingClientRect().height) }));
        assert.equal(alturas.atalhos.length, 6);
        assert.equal(alturas.abas.length, 5);
        for (const h of [...alturas.atalhos, ...alturas.abas]) assert.ok(h >= 44, `alvo com ${h} px`);
        await ctx.close();
      });

      await teste(`${largura}: as abas ficam numa linha só (rolam por dentro se não couberem), inclusive "Dados"`, async () => {
        const { ctx, pagina } = await abrir();
        const m = await pagina.evaluate(() => ({ tops: [...document.querySelectorAll('.aba')].map((e) => Math.round(e.getBoundingClientRect().top)), quebra: [...document.querySelectorAll('.aba')].map((e) => e.getBoundingClientRect().height) }));
        assert.equal(new Set(m.tops).size, 1, `abas em mais de uma linha: ${m.tops}`);
        assert.ok(m.quebra.every((h) => h < 60), 'nenhuma aba virou duas linhas de texto');
        await ctx.close();
      });

      await teste(`${largura}: os atalhos rolam por dentro, a borda avisa que há mais e "Personalizado" é alcançável`, async () => {
        const { ctx, pagina } = await abrir();
        await pagina.evaluate(() => { document.querySelector('.atalhos').scrollLeft = 0; });
        await pagina.waitForTimeout(150);
        const antes = await pagina.evaluate(() => { const g = document.querySelector('.atalhos'); return { rola: g.scrollWidth > g.clientWidth, dir: g.classList.contains('rola-dir'), esq: g.classList.contains('rola-esq'), mascara: getComputedStyle(g).maskImage || getComputedStyle(g).webkitMaskImage }; });
        assert.ok(antes.rola, 'neste tamanho os 6 atalhos não cabem: o controle rola por dentro');
        assert.ok(antes.dir && !antes.esq, 'no começo há mais só à direita');
        assert.match(antes.mascara, /gradient/, 'a borda esmaecida está desenhada');
        await pagina.evaluate(() => { const g = document.querySelector('.atalhos'); g.scrollLeft = g.scrollWidth; });
        await pagina.waitForTimeout(150);
        const depois = await pagina.evaluate(() => { const g = document.querySelector('.atalhos'); const p = document.querySelector('[data-atalho="personalizado"]').getBoundingClientRect(); const c = g.getBoundingClientRect(); return { esq: g.classList.contains('rola-esq'), dir: g.classList.contains('rola-dir'), dentro: p.left >= c.left - 1 && p.right <= c.right + 1 }; });
        assert.ok(depois.dentro, '"Personalizado" cabe inteiro dentro do controle ao rolar até o fim');
        assert.ok(depois.esq && !depois.dir, 'no fim há mais só à esquerda');
        await pagina.locator('[data-atalho="personalizado"]').tap();
        await pagina.waitForTimeout(300);
        assert.equal(await pagina.evaluate(() => document.querySelector('[data-atalho="personalizado"]').getAttribute('aria-checked')), 'true', 'um toque em Personalizado escolhe');
        assert.ok(await pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'a página continua sem rolar de lado');
        await ctx.close();
      });
    }
  } finally {
    await browser.close();
    await bancada.fechar();
  }
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  return falhas ? 1 : 0;
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
