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
  const bancada = await subir({ paineis: [A, B, C, G], senhas: { [C.id]: SENHA }, atrasoPorLeads: { 1200: 2500 } });
  const browser = await pw.chromium.launch();
  const abrir = async (query, perfil = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, ...perfil });
    const page = await ctx.newPage();
    await page.goto(`${bancada.url}/dashboard.html?id=grupo${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.tabs .tab', { timeout: 20000 });
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
  } finally {
    await browser.close();
    await bancada.fechar();
  }
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error('FALHA inesperada:', e.message); process.exit(1); });
