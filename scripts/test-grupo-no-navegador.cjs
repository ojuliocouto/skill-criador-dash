/**
 * Grupo de painéis com abas, no navegador, com o dashboard.html e o dashboard.js de verdade.
 *
 * Achados da prova no ar de 08/10/2026 (grupo "teste-grupo-373"):
 *  - G1 (corrida entre abas): no celular, clicar numa aba enquanto a anterior ainda carrega deixava a aba nova
 *    marcada e o conteúdo da anterior na tela, porque a resposta atrasada da aba anterior desenhava por cima. Número
 *    de um painel sob o nome de outro, com cara de certo. A aba que vale é a última que a pessoa clicou.
 *  - G2 (aba com senha): a aba de um painel com senha mostrava "Não deu para abrir este painel ... confira o
 *    endereço", um beco sem saída. Agora a aba pede a senha ali mesmo e, com a senha certa, abre o painel na aba.
 *
 * Bancada: scripts/grupo-harness.cjs (a API é de mentira, o painel é o do aluno). Sem Playwright, avisa PULADO.
 * Uso: node <dir-da-skill>/scripts/test-grupo-no-navegador.cjs
 */
const { acharPlaywright } = require('./video/achar-playwright.cjs');
const { subir, painel } = require('./grupo-harness.cjs');

const SENHA = 'segredo-do-grupo';
let falhas = 0;
async function teste(nome, fn) {
  try { await fn(); console.log(`ok    ${nome}`); } catch (e) { falhas++; console.log(`FALHA ${nome} -> ${String(e.message).split('\n')[0]}`); }
}
const igual = (real, esperado, o) => { if (real !== esperado) throw new Error(`${o}: esperado ${JSON.stringify(esperado)}, na tela ${JSON.stringify(real)}`); };

(async () => {
  const pw = acharPlaywright();
  if (!pw) { console.log('PULADO: Playwright não encontrado (npm i -g playwright && npx playwright install chromium). Esta bancada NÃO rodou.'); return; }
  const A = painel('painel-a', 'Painel A (lento)', 1200);
  const B = painel('painel-b', 'Painel B', 3000);
  const C = painel('dash-cccccccccccccccccccccccccccccccc', 'Painel C (com senha)', 4500);
  const G = { id: 'grupo', name: 'Grupo de teste', kind: 'group', accent: '#3F6B5C', saudacaoLigada: false, createdAt: '2026-10-02T00:00:00.000Z',
    tabs: [{ id: A.id, label: 'Lento' }, { id: B.id, label: 'Rápido' }, { id: C.id, label: 'Com senha' }] };
  // Grupo com rótulos longos (os do print do celular): as abas não cabem em 390 px e a barra precisa rolar por dentro.
  const D = painel('painel-d', 'Painel D', 5000);
  const GL = { ...G, id: 'grupo-longo', name: 'Grupo de rótulos longos',
    tabs: [{ id: A.id, label: 'Planilha ao vivo' }, { id: B.id, label: 'Meta mensal' }, { id: C.id, label: 'Com senha' }, { id: D.id, label: 'Resultado por canal' }] };
  // Os três rótulos do print do celular (390 px): têm que caber inteiros, sem rolagem e sem corte.
  const GC = { ...G, id: 'grupo-curto', name: 'Grupo de teste 373',
    tabs: [{ id: A.id, label: 'Planilha ao vivo' }, { id: B.id, label: 'Meta mensal' }, { id: C.id, label: 'Com senha' }] };
  const bancada = await subir({ paineis: [A, B, C, D, G, GL, GC], senhas: { [C.id]: SENHA }, atrasoPorLeads: { 1200: 2500 } });
  const browser = await pw.chromium.launch();
  const abrir = async (query, perfil = {}, grupo = 'grupo', esperar = '.tabs .tab') => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, ...perfil });
    const page = await ctx.newPage();
    await page.goto(`${bancada.url}/dashboard.html?id=${grupo}${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(esperar, { timeout: 20000 });
    return { ctx, page };
  };
  const leadsNaTela = (page) => page.evaluate(() => {
    const k = [...document.querySelectorAll('#tabpanel .kpi')].find((e) => /Leads/.test((e.querySelector('.kpi__label') || {}).textContent || ''));
    return k ? k.querySelector('.kpi__value').textContent.trim() : null;
  });
  const abaAtiva = (page) => page.$eval('.tabs .tab.active', (e) => e.textContent.trim());
  const esperarLeads = (page, valor, ms = 12000) => page.waitForFunction((v) => {
    const k = [...document.querySelectorAll('#tabpanel .kpi')].find((e) => /Leads/.test((e.querySelector('.kpi__label') || {}).textContent || ''));
    return !!k && k.querySelector('.kpi__value').textContent.trim() === v;
  }, valor, { timeout: ms });

  try {
    await teste('G1: clicar na aba rápida com a lenta ainda carregando: a tela fica com a aba clicada (depois que a lenta termina)', async () => {
      const { ctx, page } = await abrir(`&tab=${A.id}`);
      await page.waitForTimeout(500); // a aba lenta (2,5 s) está carregando
      await page.locator('.tabs .tab', { hasText: 'Rápido' }).click();
      await esperarLeads(page, '3.000'); // a rápida desenhou
      await page.waitForTimeout(3500); // a lenta termina agora e NÃO pode desenhar por cima
      igual(await abaAtiva(page), 'Rápido', 'aba marcada');
      igual(await leadsNaTela(page), '3.000', 'Leads na aba Rápido (a lenta tem 1.200)');
      await ctx.close();
    });

    await teste('G1: o mesmo no celular (390x844)', async () => {
      const { ctx, page } = await abrir(`&tab=${A.id}`, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      await page.waitForTimeout(500);
      await page.locator('.tabs .tab', { hasText: 'Rápido' }).tap();
      await esperarLeads(page, '3.000');
      await page.waitForTimeout(3500);
      igual(await leadsNaTela(page), '3.000', 'Leads na aba Rápido no celular');
      await ctx.close();
    });

    await teste('G1: voltar para a aba lenta depois mostra os números DELA (1.200)', async () => {
      const { ctx, page } = await abrir(`&tab=${B.id}`);
      await esperarLeads(page, '3.000');
      await page.locator('.tabs .tab', { hasText: 'Lento' }).click();
      await esperarLeads(page, '1.200', 15000);
      igual(await abaAtiva(page), 'Lento', 'aba marcada');
      await ctx.close();
    });

    await teste('G2: a aba com senha pede a senha na própria aba (campo de senha visível)', async () => {
      const { ctx, page } = await abrir(`&tab=${B.id}`);
      await esperarLeads(page, '3.000');
      await page.locator('.tabs .tab', { hasText: 'Com senha' }).click();
      await page.waitForSelector('#tabpanel input[type="password"]', { timeout: 8000 });
      const texto = await page.locator('#tabpanel').innerText();
      if (/n[ãa]o pode ser embutida|Não deu para abrir/.test(texto)) throw new Error('a aba ainda mostra o beco sem saída: ' + texto.slice(0, 120));
      await ctx.close();
    });

    await teste('G2: senha errada na aba mostra "Senha incorreta" e segue pedindo; certa abre o painel na aba', async () => {
      const { ctx, page } = await abrir(`&tab=${C.id}`);
      await page.waitForSelector('#tabpanel input[type="password"]', { timeout: 10000 });
      await page.fill('#tabpanel input[type="password"]', 'senha-errada');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => /incorret/i.test((document.querySelector('#tabpanel')?.innerText) || ''), null, { timeout: 8000 });
      await page.fill('#tabpanel input[type="password"]', SENHA);
      await page.keyboard.press('Enter');
      await esperarLeads(page, '4.500', 12000);
      igual(await abaAtiva(page), 'Com senha', 'aba marcada');
      // o grupo continua inteiro: dá para ir a outra aba e voltar sem pedir a senha de novo
      await page.locator('.tabs .tab', { hasText: 'Rápido' }).click();
      await esperarLeads(page, '3.000');
      await page.locator('.tabs .tab', { hasText: 'Com senha' }).click();
      await esperarLeads(page, '4.500', 12000);
      if (await page.locator('#tabpanel input[type="password"]').count()) throw new Error('pediu a senha de novo na mesma sessão');
      await ctx.close();
    });

    // ---- 3.7.3: a barra de abas do grupo no celular ----
    const CELULAR = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
    /** Onde cada aba está em relação à barra (todas as abas, em px de tela). */
    const geometriaDasAbas = (page) => page.evaluate(() => {
      const barra = document.querySelector('.tabs');
      const b = barra.getBoundingClientRect();
      const cs = getComputedStyle(barra);
      return {
        scrollLeft: barra.scrollLeft, rolaEsq: barra.classList.contains('rola-esq'), rolaDir: barra.classList.contains('rola-dir'),
        mascara: cs.maskImage || cs.webkitMaskImage || 'none', transborda: barra.scrollWidth > barra.clientWidth + 2,
        abas: [...barra.querySelectorAll('.tab')].map((t) => { const r = t.getBoundingClientRect(); return { texto: t.textContent.trim(), ativa: t.classList.contains('active'), esq: r.left - b.left, dir: r.right - b.right }; }),
      };
    });
    const inteira = (a) => a.esq >= -0.5 && a.dir <= 0.5;
    const nomeDe = (g) => g.abas.map((a) => `${a.texto}[${a.esq.toFixed(0)},${a.dir.toFixed(0)}]`).join(' ');

    await teste('senha (página e aba): o campo tem rótulo visível e o leitor de tela acha o campo pelo nome "Senha"', async () => {
      const { ctx, page } = await abrir('', {}, C.id, '#pwInput');
      await page.waitForSelector('#pwInput', { timeout: 10000 });
      igual(await page.getByLabel('Senha', { exact: true }).count(), 1, 'campos achados pelo rótulo "Senha" na página');
      const visivel = await page.evaluate(() => { const l = document.querySelector('label[for="pwInput"]'); const r = l && l.getBoundingClientRect(); return !!r && r.width > 20 && r.height > 8; });
      if (!visivel) throw new Error('o rótulo da tela de senha não está visível');
      await ctx.close();
      const { ctx: c2, page: p2 } = await abrir(`&tab=${C.id}`);
      await p2.waitForSelector('#abaSenha', { timeout: 10000 });
      igual(await p2.getByLabel('Senha do painel desta aba').count(), 1, 'campos achados pelo rótulo na aba');
      await c2.close();
    });

    await teste('barra de abas do grupo no celular: ao abrir, a primeira aba aparece inteira (nada cortado pela esquerda)', async () => {
      const { ctx, page } = await abrir('', CELULAR, GL.id);
      await page.waitForTimeout(600);
      const g = await geometriaDasAbas(page);
      if (!g.transborda) throw new Error('o cenário não transborda: o teste não prova nada (' + nomeDe(g) + ')');
      igual(g.scrollLeft, 0, 'rolagem ao abrir');
      if (!inteira(g.abas[0])) throw new Error('primeira aba cortada: ' + nomeDe(g));
      if (!g.abas[0].ativa) throw new Error('a aba ativa ao abrir devia ser a primeira');
      await ctx.close();
    });

    await teste('barra de abas do grupo no celular: tem a mesma borda esmaecida das abas internas (só do lado que tem mais)', async () => {
      const { ctx, page } = await abrir('', CELULAR, GL.id);
      await page.waitForTimeout(600);
      const g = await geometriaDasAbas(page);
      if (!g.rolaDir || g.rolaEsq) throw new Error(`classes de borda erradas ao abrir: rolaDir=${g.rolaDir} rolaEsq=${g.rolaEsq}`);
      if (!g.mascara || g.mascara === 'none') throw new Error('sem a máscara de borda esmaecida (mask-image) na barra');
      await ctx.close();
    });

    await teste('barra de abas do grupo no celular: abrir direto na última aba deixa a ativa inteira e avisa que há mais à esquerda', async () => {
      const { ctx, page } = await abrir(`&tab=${D.id}`, CELULAR, GL.id);
      await esperarLeads(page, '5.000', 15000);
      await page.waitForTimeout(600);
      const g = await geometriaDasAbas(page);
      const ativa = g.abas.find((a) => a.ativa);
      if (!ativa || !inteira(ativa)) throw new Error('aba ativa cortada ao abrir: ' + nomeDe(g));
      if (!g.rolaEsq) throw new Error('rolou para a direita sem a borda esmaecida da esquerda: ' + nomeDe(g));
      await ctx.close();
    });

    await teste('barra de abas do grupo no celular (390): os três rótulos do print cabem inteiros, sem corte e sem borda esmaecida à toa', async () => {
      const { ctx, page } = await abrir(`&tab=${C.id}`, CELULAR, GC.id);
      await page.waitForSelector('#tabpanel input[type="password"]', { timeout: 10000 });
      await page.waitForTimeout(600);
      const g = await geometriaDasAbas(page);
      igual(g.abas.length, 3, 'abas');
      for (const a of g.abas) if (!inteira(a)) throw new Error(`aba cortada: ${nomeDe(g)}`);
      igual(g.scrollLeft, 0, 'rolagem');
      if (g.rolaEsq || g.rolaDir) throw new Error(`borda esmaecida sem ter mais abas: ${nomeDe(g)}`);
      await ctx.close();
    });

    await teste('barra de abas do grupo no celular: tocar nas abas mantém a ativa inteira, e voltar à primeira desfaz a rolagem', async () => {
      const { ctx, page } = await abrir('', CELULAR, GL.id);
      await esperarLeads(page, '1.200', 15000);
      for (const rotulo of ['Meta mensal', 'Resultado por canal', 'Meta mensal', 'Planilha ao vivo']) {
        await page.locator('.tabs .tab', { hasText: rotulo }).tap();
        await page.waitForTimeout(500);
        const g = await geometriaDasAbas(page);
        const ativa = g.abas.find((a) => a.ativa);
        if (!ativa || ativa.texto !== rotulo || !inteira(ativa)) throw new Error(`depois de tocar em "${rotulo}" a ativa não está inteira: ` + nomeDe(g));
      }
      const g = await geometriaDasAbas(page);
      igual(g.scrollLeft, 0, 'rolagem depois de voltar à primeira');
      if (!inteira(g.abas[0])) throw new Error('primeira aba cortada depois de voltar: ' + nomeDe(g));
      await ctx.close();
    });

    await teste('barra de abas do grupo no celular: a borda esmaecida segue a rolagem do dedo DEPOIS que o painel da aba carregou', async () => {
      const { ctx, page } = await abrir('', CELULAR, GL.id);
      await esperarLeads(page, '1.200', 15000);
      await page.waitForTimeout(500);
      await page.evaluate(() => { const b = document.querySelector('.tabs'); b.scrollLeft = b.scrollWidth; });
      await page.waitForTimeout(400);
      let g = await geometriaDasAbas(page);
      if (!g.rolaEsq || g.rolaDir) throw new Error(`rolou até o fim e a borda não acompanhou: rolaEsq=${g.rolaEsq} rolaDir=${g.rolaDir}`);
      await page.evaluate(() => { document.querySelector('.tabs').scrollLeft = 0; });
      await page.waitForTimeout(400);
      g = await geometriaDasAbas(page);
      if (g.rolaEsq || !g.rolaDir) throw new Error(`voltou ao início e a borda não acompanhou: rolaEsq=${g.rolaEsq} rolaDir=${g.rolaDir}`);
      await ctx.close();
    });

    await teste('barra de abas do grupo no computador: cabe inteira, sem borda esmaecida', async () => {
      const { ctx, page } = await abrir('', {}, GL.id);
      await page.waitForTimeout(600);
      const g = await geometriaDasAbas(page);
      if (g.transborda) throw new Error('a barra transborda no computador: ' + nomeDe(g));
      if (g.rolaEsq || g.rolaDir) throw new Error('borda esmaecida onde não há mais nada');
      if (g.mascara && g.mascara !== 'none') throw new Error('máscara aplicada à toa: ' + g.mascara);
      await ctx.close();
    });
  } finally {
    await browser.close();
    await bancada.fechar();
  }
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error('FALHA inesperada:', e.message); process.exit(1); });
