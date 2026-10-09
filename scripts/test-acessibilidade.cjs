/**
 * 3.7.3: acessibilidade medida no navegador, não suposta.
 *   1. axe-core (versão fixa, a mesma no CI) nas telas index, config (os 4 passos do assistente) e dashboard (as 5 abas e o filtro
 *      "Personalizado"), no computador (1440) e no celular (Pixel 7), nos temas claro e escuro. Qualquer violação reprova.
 *      O fundo decorativo de linhas (.fundo) sai da página só durante a medida de contraste: o axe não consegue calcular contraste
 *      por cima de imagem e devolveria "incompleto" em todo texto. Os que ele ainda deixa incompletos (texto de eixo de gráfico em
 *      SVG, cartão com camada de pseudo-elemento) são medidos aqui, um a um, pela fórmula do WCAG.
 *   2. Só teclado: Tab chega nas abas, nos atalhos de período, nos cabeçalhos que ordenam e nos botões da lista de painéis; as setas
 *      trocam de aba e de atalho; Enter e Espaço ordenam; o foco sempre tem contorno visível com contraste mínimo de 3:1.
 *   3. Nomes acessíveis: todo gráfico é uma imagem com nome que diz o que mostra, os cartões de número têm rótulo e valor juntos,
 *      os minigráficos decorativos ficam fora da árvore de acessibilidade, as tabelas têm cabeçalhos de coluna.
 *   4. O detector tem dentes: o mesmo axe, numa cópia da página com defeitos plantados (contraste, nome, rótulo), reprova.
 * Sem o axe-core instalado o teste PULA (e diz como instalar); no CI a variável CI transforma o pulo em falha.
 *
 * Uso: node <dir-da-skill>/scripts/test-acessibilidade.cjs
 *      ACESSIBILIDADE_RELATORIO=<arquivo.json>  grava a contagem de violações por gravidade (para o relatório)
 *      ACESSIBILIDADE_SO=celular                roda só os perfis cujo nome contém o texto
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { acharPlaywright } = require('./video/achar-playwright.cjs');
const { subirPilha, TOKEN_ADMIN_DE_TESTE } = require('./stack-local.cjs');

const CI = Boolean(process.env.CI);
const RELATORIO = process.env.ACESSIBILIDADE_RELATORIO || '';
const SO = process.env.ACESSIBILIDADE_SO || '';
const AXE_VERSAO_ESPERADA = '4.13.0';

function acharAxe() {
  const pastas = [];
  try { pastas.push(path.dirname(require.resolve('axe-core/package.json'))); } catch (_) { /* próximo */ }
  try {
    const r = spawnSync('npm', ['root', '-g'], { encoding: 'utf8', timeout: 20000, shell: process.platform === 'win32', windowsHide: true });
    if (r.status === 0 && r.stdout.trim()) pastas.push(path.join(r.stdout.trim(), 'axe-core'));
  } catch (_) { /* sem npm */ }
  for (const p of pastas) {
    try { return { fonte: fs.readFileSync(path.join(p, 'axe.min.js'), 'utf8'), versao: JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8')).version }; } catch (_) { /* próxima */ }
  }
  return null;
}

// ------------------------------------------------------------------ o dado
const CSV_TEXTO = fs.readFileSync(path.join(__dirname, '..', 'starter-kit', 'examples', 'marketing-60d.csv'), 'utf8');
const COLMAP = { data: 'Data', canal: 'Canal', investimento: 'Investimento', impressoes: 'Impressoes', cliques: 'Cliques', leads: 'Leads', conversoes: 'Conversoes', receita: 'Receita' };

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const GRAVIDADES = ['critical', 'serious', 'moderate', 'minor'];

// Contraste pela fórmula do WCAG, no navegador: cor do texto (ou do preenchimento do SVG) contra o fundo composto de baixo para cima.
const MEDIR_CONTRASTE = (seletor) => {
  const parse = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,/]+/).map(Number); return { r: v[0], g: v[1], b: v[2], a: v[3] === undefined ? 1 : v[3] }; };
  const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const sobre = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
  const fundoDe = (el) => {
    const camadas = []; let e = el;
    while (e) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { camadas.push(c); if (c.a >= 0.99) break; } e = e.parentElement; }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    if (!camadas.length || camadas[camadas.length - 1].a < 0.99) { const bg = parse(getComputedStyle(document.body).backgroundColor); if (bg && bg.a > 0) base = bg; }
    for (let i = camadas.length - 1; i >= 0; i--) base = sobre(camadas[i], base);
    return base;
  };
  const out = [];
  for (const el of document.querySelectorAll(seletor)) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    const fg0 = parse(el instanceof SVGElement ? cs.fill : cs.color); if (!fg0) continue;
    const bg = fundoDe(el); const fg = fg0.a < 1 ? sobre(fg0, bg) : fg0;
    const a = lum(fg); const b = lum(bg);
    const px = parseFloat(cs.fontSize); const grande = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700);
    out.push({ texto: el.textContent.trim().slice(0, 24), razao: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), minimo: grande ? 3 : 4.5 });
  }
  return out;
};

const PERFIS = (pw) => [
  { nome: 'Chromium desktop 1440', motor: 'chromium', celular: false, ctx: { viewport: { width: 1440, height: 900 } } },
  { nome: 'Chromium Pixel 7 (celular)', motor: 'chromium', celular: true, ctx: pw.devices['Pixel 7'] },
].filter((p) => !SO || p.nome.toLowerCase().includes(SO.toLowerCase()));

async function main() {
  const pw = acharPlaywright();
  const axe = acharAxe();
  if (!pw) { console.log('PULADO: Playwright não encontrado (npm i -g playwright && npx playwright install chromium). Esta bancada NÃO rodou.'); return CI ? 1 : 0; }
  if (!axe) { console.log(`PULADO: axe-core não encontrado (npm i -g axe-core@${AXE_VERSAO_ESPERADA}), e sem ele a acessibilidade NÃO foi medida (Playwright instalado, axe-core não).`); return CI ? 1 : 0; }
  if (axe.versao !== AXE_VERSAO_ESPERADA) console.log(`aviso: axe-core ${axe.versao} instalado, a versão fixa é ${AXE_VERSAO_ESPERADA}; as contagens podem diferir.`);
  const exe = pw.chromium.executablePath();
  if (!exe || !fs.existsSync(exe)) { console.log('PULADO: o Chromium do Playwright não está baixado (npx playwright install chromium).'); return CI ? 1 : 0; }

  let falhas = 0;
  const teste = async (nome, fn) => {
    try { await fn(); console.log(`ok    ${nome}`); } catch (e) { falhas++; console.log(`FALHA ${nome} -> ${String(e.message).split('\n')[0]}${e.actual !== undefined ? ` [obtido: ${JSON.stringify(e.actual)} | esperado: ${JSON.stringify(e.expected)}]` : ''}`); }
  };
  const contagem = { axe: axe.versao, telas: 0, violacoes: Object.fromEntries(GRAVIDADES.map((g) => [g, 0])), incompletos: 0, porPerfil: {} };

  const pilha = await subirPilha();
  const browser = await pw.chromium.launch();
  try {
    const id = await pilha.criar({ name: 'Marketing com meta', domain: 'marketing', accent: '#0F5C6E', goal: { metricKey: 'leads', value: 600, periodo: 'mensal' }, source: { type: 'csv', data: CSV_TEXTO }, colMap: COLMAP });

    const novoContexto = async (perfil, tema, extra = {}) => {
      const ctx = await browser.newContext({ ...perfil.ctx, colorScheme: tema, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', ...extra });
      // a chave de administrador de TESTE da pilha local, para o assistente abrir um painel para editar
      await ctx.addInitScript((t) => { try { localStorage.setItem('cd-admin-token', t); } catch (_) { /* sem storage */ } }, TOKEN_ADMIN_DE_TESTE);
      return { ctx, pagina: await ctx.newPage() };
    };
    const rodarAxe = async (pagina, rotulo, perfilNome) => {
      await pagina.evaluate(axe.fonte);
      await pagina.addStyleTag({ content: '.fundo{display:none!important}' });
      const r = await pagina.evaluate((tags) => axe.run(document, { resultTypes: ['violations', 'incomplete'], runOnly: { type: 'tag', values: tags } }), TAGS);
      contagem.telas++; contagem.incompletos += r.incomplete.length;
      const sumario = contagem.porPerfil[perfilNome] || (contagem.porPerfil[perfilNome] = { telas: 0, violacoes: 0 });
      sumario.telas++; sumario.violacoes += r.violations.length;
      for (const v of r.violations) contagem.violacoes[v.impact || 'minor']++;
      // os incompletos de contraste que o axe não decide (texto de eixo em SVG, camada de pseudo-elemento): medidos aqui
      const abertos = [];
      for (const inc of r.incomplete.filter((x) => x.id === 'color-contrast')) {
        for (const n of inc.nodes) {
          const motivo = (n.any[0] && n.any[0].data && n.any[0].data.messageKey) || '';
          const alvo = n.target[n.target.length - 1];
          if (/\.chart__ytick|\.chart__xtick|\.chart__axis/.test(alvo) || motivo === 'pseudoContent') abertos.push(alvo);
        }
      }
      const medidos = [];
      if (abertos.length) {
        const caixa = await pagina.evaluate(`(${MEDIR_CONTRASTE.toString()})('.chart__ytick, .chart__xtick, .kpi__label, .kpi__value')`);
        medidos.push(...caixa.filter((m) => m.razao < m.minimo));
      }
      return { violacoes: r.violations, medidosAbaixo: medidos, rotulo };
    };
    const formatar = (res) => [...res.violacoes.map((v) => `${v.impact} ${v.id} em ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' ; ')}`),
      ...res.medidosAbaixo.map((m) => `contraste ${m.razao.toFixed(2)} < ${m.minimo} em "${m.texto}"`)];

    for (const perfil of PERFIS(pw)) {
      for (const tema of ['light', 'dark']) {
        const P = (n) => `${perfil.nome}, tema ${tema === 'light' ? 'claro' : 'escuro'}: ${n}`;

        await teste(P('axe na lista de painéis e no assistente (os 4 passos)'), async () => {
          const { ctx, pagina } = await novoContexto(perfil, tema);
          const problemas = [];
          await pagina.goto(`${pilha.url}/`); await pagina.waitForSelector('.list-item'); await pagina.waitForTimeout(900);
          problemas.push(...formatar(await rodarAxe(pagina, 'lista', perfil.nome)).map((x) => `lista: ${x}`));
          await pagina.goto(`${pilha.url}/config.html?id=${id}`); await pagina.waitForSelector('#steps'); await pagina.waitForTimeout(1200);
          for (let passo = 1; passo <= 4; passo++) {
            problemas.push(...formatar(await rodarAxe(pagina, `assistente ${passo}`, perfil.nome)).map((x) => `assistente passo ${passo}: ${x}`));
            const prox = pagina.locator('main button', { hasText: /^Continuar/ }).first();
            if (passo < 4) { assert.ok(await prox.count(), `sem botão Continuar no passo ${passo}`); await prox.click(); await pagina.waitForTimeout(1300); }
          }
          await ctx.close();
          assert.deepEqual(problemas, []);
        });

        await teste(P('axe no painel (as 5 abas e o filtro Personalizado)'), async () => {
          const { ctx, pagina } = await novoContexto(perfil, tema);
          const problemas = [];
          await pagina.goto(`${pilha.url}/dashboard.html?id=${id}`); await pagina.waitForFunction(() => document.querySelectorAll('.kpi__value').length >= 7); await pagina.waitForTimeout(1800);
          for (const aba of ['Visão geral', 'Canais', 'Evolução', 'Funil', 'Dados']) {
            await pagina.locator('.aba', { hasText: aba }).click(); await pagina.waitForTimeout(1300);
            problemas.push(...formatar(await rodarAxe(pagina, aba, perfil.nome)).map((x) => `aba ${aba}: ${x}`));
          }
          await pagina.locator('.aba', { hasText: 'Visão geral' }).click();
          await pagina.locator('.atalho[data-atalho="personalizado"]').click(); await pagina.waitForTimeout(900);
          problemas.push(...formatar(await rodarAxe(pagina, 'Personalizado', perfil.nome)).map((x) => `Personalizado: ${x}`));
          await ctx.close();
          assert.deepEqual(problemas, []);
        });
      }
    }

    // ---------------------------------------------------------------- teclado (no computador)
    const desktop = PERFIS(pw).find((p) => !p.celular);
    if (desktop) {
      await teste('teclado: Tab chega nas abas, nos atalhos de período, nos cabeçalhos que ordenam e nos botões da lista, e o foco sempre aparece', async () => {
        const { ctx, pagina } = await novoContexto(desktop, 'light');
        const contrasteDoFoco = () => pagina.evaluate(`(${(() => {
          const e = document.activeElement; if (!e || e === document.body) return null;
          const cs = getComputedStyle(e);
          const parse = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,/]+/).map(Number); return { r: v[0], g: v[1], b: v[2], a: v[3] === undefined ? 1 : v[3] }; };
          const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
          const camadas = []; let n = e; while (n) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { camadas.push(c); if (c.a >= 0.99) break; } n = n.parentElement; }
          let base = { r: 255, g: 255, b: 255, a: 1 };
          for (let i = camadas.length - 1; i >= 0; i--) { const t = camadas[i]; base = { r: t.r * t.a + base.r * (1 - t.a), g: t.g * t.a + base.g * (1 - t.a), b: t.b * t.a + base.b * (1 - t.a), a: 1 }; }
          const contorno = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 ? parse(cs.outlineColor) : null;
          const sombra = cs.boxShadow !== 'none';
          const nome = e.tagName + (e.className ? '.' + String(e.className).split(' ')[0] : '') + ' ' + (e.getAttribute('aria-label') || e.textContent.trim().slice(0, 20));
          if (!contorno) return { nome, visivel: sombra, razao: null };
          const a = lum(contorno); const b = lum(base); return { nome, visivel: true, razao: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
        }).toString()})()`);
        const percorrer = async (alvos, max) => {
          const vistos = {};
          for (let i = 0; i < max && Object.keys(vistos).length < alvos.length; i++) {
            await pagina.keyboard.press('Tab');
            const f = await contrasteDoFoco();
            const ativo = await pagina.evaluate(() => { const e = document.activeElement; return e ? { cls: e.className && e.className.baseVal === undefined ? String(e.className) : '', role: e.getAttribute('role'), tag: e.tagName } : null; });
            for (const a of alvos) if (!vistos[a.nome] && a.casa(ativo)) {
              assert.ok(f && f.visivel, `${a.nome} recebeu foco sem contorno visível`);
              if (f.razao !== null) assert.ok(f.razao >= 3, `o contorno do foco em "${f.nome}" tem contraste ${f.razao.toFixed(2)} (mínimo 3)`);
              vistos[a.nome] = true;
            }
          }
          const faltou = alvos.filter((a) => !vistos[a.nome]).map((a) => a.nome);
          assert.deepEqual(faltou, [], 'o Tab não chegou em');
        };
        await pagina.goto(`${pilha.url}/dashboard.html?id=${id}`); await pagina.waitForFunction(() => document.querySelectorAll('.kpi__value').length >= 7); await pagina.waitForTimeout(1500);
        await percorrer([
          { nome: 'aba', casa: (a) => a && a.role === 'tab' },
          { nome: 'atalho de período', casa: (a) => a && a.role === 'radio' },
          { nome: 'cabeçalho que ordena', casa: (a) => a && a.tag === 'TH' },
        ], 40);
        await pagina.goto(`${pilha.url}/`); await pagina.waitForSelector('.list-item'); await pagina.waitForTimeout(800);
        await percorrer([
          { nome: 'Novo dashboard', casa: (a) => a && a.tag === 'A' && /btn/.test(a.cls) },
          { nome: 'Excluir', casa: (a) => a && a.tag === 'BUTTON' && /danger/.test(a.cls) },
        ], 12);
        await ctx.close();
      });

      await teste('teclado: setas trocam de aba e de atalho; Enter e Espaço ordenam a tabela; Enter no "Abrir" da lista abre o painel', async () => {
        const { ctx, pagina } = await novoContexto(desktop, 'light');
        await pagina.goto(`${pilha.url}/dashboard.html?id=${id}`); await pagina.waitForFunction(() => document.querySelectorAll('.kpi__value').length >= 7); await pagina.waitForTimeout(1500);
        const estado = () => pagina.evaluate(() => ({ aba: [...document.querySelectorAll('.aba[aria-selected="true"]')].map((a) => a.textContent.trim()), atalho: [...document.querySelectorAll('.atalho[aria-checked="true"]')].map((a) => a.dataset.atalho),
          ordem: [...document.querySelectorAll('.resumo__el th')].map((t) => t.getAttribute('aria-sort')).filter(Boolean).join(',') }));
        await pagina.locator('.aba[aria-selected="true"]').focus(); await pagina.keyboard.press('ArrowRight'); await pagina.waitForTimeout(400);
        assert.deepEqual((await estado()).aba, ['Canais'], 'seta para a direita nas abas');
        await pagina.keyboard.press('Home'); await pagina.waitForTimeout(400);
        assert.deepEqual((await estado()).aba, ['Visão geral'], 'Home volta à primeira aba');
        await pagina.locator('.atalho[aria-checked="true"]').focus(); await pagina.keyboard.press('ArrowLeft'); await pagina.waitForTimeout(600);
        assert.deepEqual((await estado()).atalho, ['mes'], 'seta para a esquerda nos atalhos de período');
        await pagina.locator('.resumo__el th').nth(2).focus(); await pagina.keyboard.press('Enter'); await pagina.waitForTimeout(700);
        assert.match((await estado()).ordem, /^none,none,ascending/, 'Enter ordena crescente');
        await pagina.keyboard.press('Space'); await pagina.waitForTimeout(700);
        assert.match((await estado()).ordem, /^none,none,descending/, 'Espaço ordena decrescente');
        await pagina.goto(`${pilha.url}/`); await pagina.waitForSelector('.list-item');
        await pagina.locator('.list-item a.btn').first().focus(); await pagina.keyboard.press('Enter');
        await pagina.waitForURL(/dashboard/, { timeout: 15000 });
        await ctx.close();
      });
    }

    // ---------------------------------------------------------------- nomes acessíveis
    await teste('nomes: gráficos são imagens com nome, minigráficos são decorativos, cartões têm rótulo e valor, tabelas têm cabeçalhos', async () => {
      const { ctx, pagina } = await novoContexto(PERFIS(pw)[0], 'light');
      await pagina.goto(`${pilha.url}/dashboard.html?id=${id}`); await pagina.waitForFunction(() => document.querySelectorAll('.kpi__value').length >= 7); await pagina.waitForTimeout(1500);
      const visao = await pagina.evaluate(() => ({
        cartoes: [...document.querySelectorAll('.kpi')].map((k) => ({ rotulo: (k.querySelector('.kpi__label') || {}).textContent, valor: (k.querySelector('.kpi__value') || {}).textContent })),
        minigraficos: [...document.querySelectorAll('svg.kpi__spark')].map((s) => s.getAttribute('aria-hidden')),
        tabelas: [...document.querySelectorAll('table')].map((t) => ({ colunas: t.querySelectorAll('thead th').length, escopo: [...t.querySelectorAll('thead th')].every((h) => h.getAttribute('scope') === 'col') })),
      }));
      assert.equal(visao.cartoes.length, 7);
      for (const c of visao.cartoes) assert.ok(c.rotulo && c.rotulo.trim() && /\d/.test(c.valor || ''), `cartão sem rótulo ou valor: ${JSON.stringify(c)}`);
      assert.ok(visao.minigraficos.length >= 6 && visao.minigraficos.every((a) => a === 'true'), 'minigráfico fora da árvore de acessibilidade (aria-hidden)');
      assert.ok(visao.tabelas.length >= 1 && visao.tabelas.every((t) => t.colunas > 0 && t.escopo), 'tabela sem cabeçalho de coluna com scope');
      await pagina.locator('.aba', { hasText: 'Evolução' }).click(); await pagina.waitForSelector('.chart--timeseries svg', { timeout: 8000 });
      const graficos = await pagina.evaluate(() => [...document.querySelectorAll('.chart--timeseries')].map((c) => ({ titulo: (c.querySelector('.chart__title') || {}).textContent, role: c.querySelector('svg').getAttribute('role'), nome: c.querySelector('svg').getAttribute('aria-label') })));
      assert.ok(graficos.length >= 1);
      for (const g of graficos) {
        assert.equal(g.role, 'img', `gráfico "${g.titulo}" sem role=img`);
        assert.ok(g.nome && g.nome.includes(g.titulo), `o nome do gráfico "${g.titulo}" não diz o que ele mostra: "${g.nome}"`);
        assert.match(g.nome, /\d/, `o nome do gráfico "${g.titulo}" não traz o intervalo dos valores`);
      }
      await ctx.close();
    });

    // O axe não calcula contraste por cima de imagem: o texto que passa por cima das linhas decorativas do fundo é medido aqui,
    // no pior caso (a linha mais forte, inteira por baixo de uma letra) e no pior texto (o secundário e o apagado).
    for (const tema of ['light', 'dark']) {
      await teste(`texto por cima das linhas decorativas do fundo (tema ${tema === 'light' ? 'claro' : 'escuro'}): o texto secundário e o apagado seguem legíveis (pior caso teórico, mínimo 3,5:1; no fundo liso o axe já exige 4,5:1)`, async () => {
        const { ctx, pagina } = await novoContexto(PERFIS(pw)[0], tema);
        await pagina.goto(`${pilha.url}/dashboard.html?id=${id}`); await pagina.waitForFunction(() => document.querySelectorAll('.kpi__value').length >= 7); await pagina.waitForTimeout(1200);
        const m = await pagina.evaluate(() => {
          const parse = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); const v = m[1].split(/[ ,/]+/).map(Number); return { r: v[0], g: v[1], b: v[2], a: v[3] === undefined ? 1 : v[3] }; };
          const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
          const sobre = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
          const cor = (v) => { const e = document.createElement('i'); e.style.cssText = `color:${v};position:absolute;visibility:hidden`; document.body.appendChild(e); const c = parse(getComputedStyle(e).color); e.remove(); return c; };
          const fundo = parse(getComputedStyle(document.body).backgroundColor);
          const base = fundo.a > 0 ? fundo : { r: 255, g: 255, b: 255, a: 1 };
          const linha = cor('var(--fundo-linha)'); const opacidadeDoFundo = +getComputedStyle(document.querySelector('.fundo')).opacity;
          const linhaSobre = sobre({ ...linha, a: linha.a * opacidadeDoFundo }, base);
          const razao = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
          return { dim: razao(sobre(cor('var(--text-dim)'), linhaSobre), linhaSobre), faint: razao(sobre(cor('var(--text-faint)'), linhaSobre), linhaSobre), dimSemLinha: razao(sobre(cor('var(--text-dim)'), base), base), faintSemLinha: razao(sobre(cor('var(--text-faint)'), base), base), opacidadeDoFundo };
        });
        assert.ok(m.dim >= 3.5, `texto secundário sobre a linha: ${m.dim.toFixed(2)}:1 (sobre o fundo liso: ${m.dimSemLinha.toFixed(2)}:1)`);
        assert.ok(m.faint >= 3.5, `texto apagado sobre a linha: ${m.faint.toFixed(2)}:1 (sobre o fundo liso: ${m.faintSemLinha.toFixed(2)}:1)`);
        console.log(`        (${tema}) pior caso sobre a linha: secundário ${m.dim.toFixed(2)}:1, apagado ${m.faint.toFixed(2)}:1; no fundo liso ${m.dimSemLinha.toFixed(2)}:1 e ${m.faintSemLinha.toFixed(2)}:1`);
        await ctx.close();
      });
    }

    // ---------------------------------------------------------------- o detector tem dentes
    await teste('detector: numa cópia com defeitos plantados (contraste, nome do botão, rótulo do campo, imagem sem texto) o axe reprova', async () => {
      const { ctx, pagina } = await novoContexto(PERFIS(pw)[0], 'light');
      await pagina.goto(`${pilha.url}/dashboard.html?id=${id}`); await pagina.waitForFunction(() => document.querySelectorAll('.kpi__value').length >= 7); await pagina.waitForTimeout(1200);
      await pagina.evaluate(() => {
        const t = document.createElement('p'); t.id = 'plantado-contraste'; t.style.cssText = 'color:#c9ccd3;background:#fff;font-size:14px'; t.textContent = 'Texto cinza claro sobre fundo branco'; document.querySelector('main').appendChild(t);
        const b = document.createElement('button'); b.id = 'plantado-botao'; b.innerHTML = '<svg width="16" height="16"><circle cx="8" cy="8" r="6"/></svg>'; document.querySelector('main').appendChild(b);
        const i = document.createElement('input'); i.id = 'plantado-campo'; i.type = 'text'; document.querySelector('main').appendChild(i);
        const im = document.createElement('img'); im.id = 'plantado-imagem'; im.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; document.querySelector('main').appendChild(im);
      });
      const r = await rodarAxe(pagina, 'defeitos plantados', 'detector');
      // esta página de propósito defeituosa não entra na contagem do relatório
      for (const v of r.violacoes) contagem.violacoes[v.impact || 'minor']--;
      contagem.porPerfil.detector.violacoes -= r.violacoes.length;
      const ids = new Set(r.violacoes.map((v) => v.id));
      for (const esperado of ['color-contrast', 'button-name', 'label', 'image-alt']) assert.ok(ids.has(esperado), `o axe não pegou o defeito plantado "${esperado}" (viu: ${[...ids].join(', ') || 'nada'})`);
      await ctx.close();
    });
  } finally {
    await browser.close();
    await pilha.fechar();
  }
  const total = Object.values(contagem.violacoes).reduce((a, b) => a + b, 0);
  console.log(`axe-core ${axe.versao}: ${contagem.telas} telas medidas, ${total} violações (${GRAVIDADES.map((g) => `${g} ${contagem.violacoes[g]}`).join(', ')}), ${contagem.incompletos} verificações incompletas do axe`);
  if (RELATORIO) fs.writeFileSync(RELATORIO, JSON.stringify(contagem, null, 2));
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  return falhas ? 1 : 0;
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
