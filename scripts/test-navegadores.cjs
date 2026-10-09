/**
 * 3.7.3: o painel de verdade (index e dashboard, servidos pelas Functions reais com a CSP real) nos motores que
 * as pessoas usam, não só no Chromium do desenvolvedor:
 *   Chromium desktop 1440 | Firefox desktop 1440 | WebKit desktop 1440 (o motor do Safari)
 *   WebKit iPhone 14 | Chromium Pixel 7 (celular, com toque)
 * Em CADA combinação, com um painel de marketing COM meta mensal (examples/marketing-60d.csv):
 *   1. a página abre sem erro no console, sem exceção, sem requisição falha e sem violação da CSP;
 *   2. os 7 cartões de número mostram o número certo (contra a soma calculada aqui, direto do CSV);
 *   3. o atalho de período troca os números (7 dias) e o controle marca o escolhido;
 *   4. ordenar a tabela funciona (clique no cabeçalho no computador; seletor "Ordenar por" no celular);
 *   5. no celular a tabela de dados vira cartões e nada rola de lado; no computador continua tabela;
 *   6. os 7 efeitos de movimento rodam e TERMINAM no estado final (sem camada sobrando, número legível);
 *   7. com prefers-reduced-motion nenhum movimento é criado e o estado final já está lá.
 * Um motor que não está instalado PULA (e diz qual); no CI a variável CI transforma o pulo em falha.
 *
 * Uso: node <dir-da-skill>/scripts/test-navegadores.cjs
 *      NAVEGADORES_PRINTS=<pasta>  guarda um PNG por combinação (para LER)
 *      NAVEGADORES_SO=firefox      roda só os perfis cujo nome contém o texto
 *      NAVEGADORES_TESTE=filtros   roda só as verificações cujo nome contém o texto
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { acharPlaywright } = require('./video/achar-playwright.cjs');
const { subirPilha } = require('./stack-local.cjs');

const CI = Boolean(process.env.CI);
const PRINTS = process.env.NAVEGADORES_PRINTS || '';
const SO = process.env.NAVEGADORES_SO || '';
if (PRINTS) fs.mkdirSync(PRINTS, { recursive: true });

// ------------------------------------------------------------------ o dado de verdade (lido do CSV de exemplo)
const CSV = path.join(__dirname, '..', 'starter-kit', 'examples', 'marketing-60d.csv');
const CSV_TEXTO = fs.readFileSync(CSV, 'utf8');
const num = (s) => Number(String(s).replace(/"/g, '').replace(',', '.'));
function lerCsv(texto) {
  const [cab, ...linhas] = texto.trim().split(/\r?\n/);
  const colunas = cab.split(',');
  return linhas.map((l) => {
    const partes = l.match(/("[^"]*"|[^,]+)/g);
    return Object.fromEntries(colunas.map((c, i) => [c, partes[i].replace(/^"|"$/g, '')]));
  });
}
const LINHAS = lerCsv(CSV_TEXTO);
const DATAS = [...new Set(LINHAS.map((l) => l.Data))].sort();
const ULTIMO = DATAS[DATAS.length - 1];
const somar = (rows, col) => rows.reduce((s, r) => s + num(r[col]), 0);
const diasAtras = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);
const ULTIMOS_7 = LINHAS.filter((l) => l.Data >= diasAtras(ULTIMO, 6));
const brl = (n) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inteiro = (n) => Math.round(n).toLocaleString('pt-BR');
const limpar = (t) => String(t).replace(/[\s ]+/g, ' ').trim();

const COLMAP = { data: 'Data', canal: 'Canal', investimento: 'Investimento', impressoes: 'Impressoes', cliques: 'Cliques', leads: 'Leads', conversoes: 'Conversoes', receita: 'Receita' };
// Painel 1: o do dia a dia, com meta MENSAL de leads (a meta que o assistente cria por padrão).
// Painel 2: a mesma base com meta "do período" (1000 leads): em 7 dias o painel está abaixo (52%), em "Tudo" acima,
// e é só neste caso que o painel mostra "Meta batida" (comparação proporcional nunca mostra o selo), então é por
// aqui que o efeito 6 (meta batida) cruza os 100% de verdade ao voltar de "7 dias" para "Tudo".
const LEADS_7 = somar(ULTIMOS_7, 'Leads');
const META_DO_PERIODO = 1000;

const PERFIS = (pw) => [
  { nome: 'Chromium desktop 1440', motor: 'chromium', celular: false, ctx: { viewport: { width: 1440, height: 900 } } },
  { nome: 'Firefox desktop 1440', motor: 'firefox', celular: false, ctx: { viewport: { width: 1440, height: 900 } } },
  { nome: 'WebKit desktop 1440 (Safari)', motor: 'webkit', celular: false, ctx: { viewport: { width: 1440, height: 900 } } },
  { nome: 'WebKit iPhone 14', motor: 'webkit', celular: true, ctx: pw.devices['iPhone 14'] },
  { nome: 'Chromium Pixel 7', motor: 'chromium', celular: true, ctx: pw.devices['Pixel 7'] },
].filter((p) => !SO || p.nome.toLowerCase().includes(SO.toLowerCase()));

// ------------------------------------------------------------------ ajudantes de página
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function abrirContexto(browser, perfil, extra = {}) {
  const ctx = await browser.newContext({ ...perfil.ctx, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', ...extra });
  const pagina = await ctx.newPage();
  const problemas = [];
  pagina.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problemas.push(`console.${m.type()}: ${m.text()}`); });
  pagina.on('pageerror', (e) => problemas.push(`exceção: ${e && e.message ? e.message : e}`));
  pagina.on('requestfailed', (r) => problemas.push(`requisição falhou: ${r.url()} (${(r.failure() || {}).errorText})`));
  pagina.on('response', (r) => { if (r.status() >= 400) problemas.push(`HTTP ${r.status()}: ${r.url()}`); });
  await pagina.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP bloqueou ${e.violatedDirective}: ${e.blockedURI}`)); });
  pagina.__problemas = problemas;
  return { ctx, pagina };
}

async function abrirPainel(pagina, base, id) {
  await pagina.goto(`${base}/dashboard.html?id=${id}`);
  await pagina.waitForFunction(() => document.querySelectorAll('.kpi__value').length >= 7, null, { timeout: 30000 });
  await pagina.evaluate(() => document.fonts && document.fonts.ready);
  await quieto(pagina);
}

/** Espera todas as animações com fim terminarem (as infinitas, como o carregando, não contam). */
const quieto = (pagina, limite = 6000) => pagina.waitForFunction(() => !document.getAnimations().some((a) => {
  const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
  return a.playState === 'running' && t && Number.isFinite(t.endTime);
}), null, { timeout: limite, polling: 50 });

// O texto do número SEM a camada da roleta (que, durante o giro, também mora dentro do .kpi__value).
const lerValor = (k) => { const v = k.querySelector('.kpi__value').cloneNode(true); v.querySelectorAll('.kpi__roleta, .kpi__selo').forEach((e) => e.remove()); return v.textContent; };
const kpi = (pagina, rotulo) => pagina.evaluate(({ rotulo, fn }) => {
  const ler = new Function('k', `return (${fn})(k)`);
  const c = [...document.querySelectorAll('.kpi')].find((k) => (k.querySelector('.kpi__label') || {}).textContent.trim() === rotulo);
  return c ? ler(c) : null;
}, { rotulo, fn: lerValor.toString() });
const kpis = (pagina) => pagina.evaluate((fn) => { const ler = new Function('k', `return (${fn})(k)`); return [...document.querySelectorAll('.kpi')].map((k) => ({ rotulo: k.querySelector('.kpi__label').textContent.trim(), valor: ler(k) })); }, lerValor.toString());
/** Espera o cartão mostrar o valor (já com o giro da roleta terminado). */
const esperarKpi = async (pagina, rotulo, valor) => {
  const fim = Date.now() + 8000; let ultimo;
  while (Date.now() < fim) { ultimo = limpar(await kpi(pagina, rotulo)); if (ultimo === valor) break; await pagina.waitForTimeout(100); }
  await quieto(pagina);
  assert.equal(limpar(await kpi(pagina, rotulo)), valor, `cartão ${rotulo} não chegou ao valor`);
};

/** Começa a gravar o que o efeito faz (quantas animações, quais camadas apareceram); `parar` espera acabar e devolve. */
const gravar = (pagina, camadas = []) => pagina.evaluate((camadas) => {
  const g = { maxAnims: 0, maxTransicoes: 0, camadas: {}, rodando: true, quadros: 0 };
  const amostra = () => {
    const todas = document.getAnimations();
    g.maxAnims = Math.max(g.maxAnims, todas.filter((a) => a.effect && a.effect.getComputedTiming && Number.isFinite(a.effect.getComputedTiming().endTime)).length);
    g.maxTransicoes = Math.max(g.maxTransicoes, todas.filter((a) => a.constructor && a.constructor.name === 'CSSTransition').length);
    for (const c of camadas) if (document.querySelector(c)) g.camadas[c] = true;
    g.quadros++;
    if (g.rodando) requestAnimationFrame(amostra);
  };
  window.__gravacao = g;
  requestAnimationFrame(amostra);
}, camadas);
const parar = async (pagina, espera = 3500) => {
  await pagina.waitForTimeout(150);
  await quieto(pagina, espera + 3000).catch(() => {});
  await pagina.waitForTimeout(150);
  return pagina.evaluate(() => { const g = window.__gravacao; g.rodando = false; g.sobrando = document.getAnimations().filter((a) => a.effect && Number.isFinite(a.effect.getComputedTiming().endTime) && a.playState === 'running').length; return g; });
};

const tocar = (perfil, loc) => (perfil.celular ? loc.tap() : loc.click());

async function overflowDeLado(pagina) { return pagina.evaluate(() => ({ pagina: document.documentElement.scrollWidth, janela: window.innerWidth })); }

// ------------------------------------------------------------------ as verificações (uma por linha da matriz)
async function verificar(perfil, browser, base, ids, resultados, teste) {
  const P = (nome) => `${perfil.nome}: ${nome}`;
  let ctx; let pagina;
  const abrir = async (id, extra) => { ({ ctx, pagina } = await abrirContexto(browser, perfil, extra)); await abrirPainel(pagina, base, id); };
  const fechar = async () => { if (ctx) await ctx.close(); ctx = null; };

  await teste(P('abre sem erro no console, sem exceção, sem requisição falha e sem violação da CSP'), async () => {
    await abrir(ids.meta);
    await pagina.waitForTimeout(600);
    assert.deepEqual(pagina.__problemas, []);
    if (PRINTS) await pagina.screenshot({ path: path.join(PRINTS, `${slug(perfil.nome)}-visao-geral.png`), fullPage: true });
    await fechar();
  });

  await teste(P('os 7 cartões mostram o número certo (soma calculada direto do CSV)'), async () => {
    await abrir(ids.meta);
    const k = await kpis(pagina);
    assert.equal(k.length, 7);
    const esperado = { Investimento: brl(somar(LINHAS, 'Investimento')), Leads: inteiro(somar(LINHAS, 'Leads')), 'Conversões': inteiro(somar(LINHAS, 'Conversoes')), Receita: brl(somar(LINHAS, 'Receita')) };
    for (const [rotulo, valor] of Object.entries(esperado)) assert.equal(limpar(k.find((x) => x.rotulo === rotulo).valor), valor, `cartão ${rotulo}`);
    for (const x of k) assert.ok(/\d/.test(x.valor) && !/NaN|undefined|Infinity|^\u2014$|^-$/.test(x.valor), `cartão ${x.rotulo} mostra "${x.valor}"`);
    const cpl = limpar(k.find((x) => x.rotulo === 'CPL').valor);
    assert.equal(cpl, brl(somar(LINHAS, 'Investimento') / somar(LINHAS, 'Leads')), 'CPL = investimento / leads');
    await fechar();
  });

  await teste(P('o atalho "7 dias" troca os números e o controle marca o escolhido'), async () => {
    await abrir(ids.meta);
    await tocar(perfil, pagina.locator('.atalho[data-atalho="7d"]'));
    await esperarKpi(pagina, 'Leads', inteiro(LEADS_7));
    assert.equal(limpar(await kpi(pagina, 'Investimento')), brl(somar(ULTIMOS_7, 'Investimento')));
    const marcado = await pagina.evaluate(() => [...document.querySelectorAll('.atalho[aria-checked="true"]')].map((a) => a.dataset.atalho));
    assert.deepEqual(marcado, ['7d']);
    const de = await pagina.inputValue('#fb-from').catch(() => null);
    assert.ok(de === null || /(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/.test(de), `campo De com "${de}"`);
    await tocar(perfil, pagina.locator('.atalho[data-atalho="tudo"]'));
    await esperarKpi(pagina, 'Leads', inteiro(somar(LINHAS, 'Leads')));
    assert.deepEqual(pagina.__problemas, []);
    await fechar();
  });

  await teste(P(perfil.celular ? 'ordenar a tabela por canal pelo seletor "Ordenar por"' : 'ordenar a tabela por canal clicando no cabeçalho'), async () => {
    await abrir(ids.meta);
    const porCanal = {};
    for (const l of LINHAS) porCanal[l.Canal] = (porCanal[l.Canal] || 0) + num(l.Leads);
    const crescente = Object.entries(porCanal).sort((a, b) => a[1] - b[1]).map(([c]) => c);
    const nomes = () => pagina.evaluate(() => [...document.querySelectorAll('.resumo__el tbody tr')].map((tr) => tr.cells[0].textContent.trim()));
    if (perfil.celular) await pagina.locator('.resumo .ordenar-por select').first().selectOption('2:asc');
    else await pagina.locator('.resumo__el thead th', { hasText: 'Leads' }).first().click();
    await pagina.waitForTimeout(900); await quieto(pagina);
    assert.deepEqual(await nomes(), crescente, 'crescente por Leads');
    if (perfil.celular) await pagina.locator('.resumo .ordenar-por select').first().selectOption('2:desc');
    else await pagina.locator('.resumo__el thead th', { hasText: 'Leads' }).first().click();
    await pagina.waitForTimeout(900); await quieto(pagina);
    assert.deepEqual(await nomes(), [...crescente].reverse(), 'decrescente por Leads');
    const total = await pagina.evaluate(() => document.querySelector('.resumo__el tfoot tr').cells[0].textContent.trim());
    assert.equal(total, 'Total', 'o total continua no rodapé');
    if (!perfil.celular) assert.equal(await pagina.locator('.resumo__el thead th', { hasText: 'Leads' }).first().getAttribute('aria-sort'), 'descending');
    assert.deepEqual(pagina.__problemas, []);
    await fechar();
  });

  await teste(P(perfil.celular ? 'a tabela de dados vira um cartão por linha e nada rola de lado' : 'a tabela de dados continua tabela (cabeçalho à vista)'), async () => {
    await abrir(ids.meta);
    await tocar(perfil, pagina.locator('.aba', { hasText: 'Dados' }));
    await pagina.waitForSelector('.table .table__el tbody tr', { timeout: 10000 });
    await quieto(pagina);
    const m = await pagina.evaluate(() => {
      const t = document.querySelector('.table .table__el');
      const td = t.querySelector('tbody tr td');
      return { cabecalho: getComputedStyle(t.tHead).display, celula: getComputedStyle(td).display, rotulo: td.getAttribute('data-label'), linhas: t.tBodies[0].rows.length,
        scroll: [...document.querySelectorAll('.table__scroll, .resumo__scroll')].map((e) => [e.scrollWidth, e.clientWidth]) };
    });
    if (perfil.celular) {
      assert.equal(m.cabecalho, 'none'); assert.equal(m.celula, 'flex'); assert.ok(m.rotulo && m.rotulo.length > 0, 'cada valor leva o nome da coluna');
      for (const [sw, cw] of m.scroll) assert.ok(sw <= cw + 1, `tabela rola de lado (${sw} em ${cw})`);
      const o = await overflowDeLado(pagina);
      assert.ok(o.pagina <= o.janela, `a página rola de lado (${o.pagina} em ${o.janela})`);
    } else {
      assert.notEqual(m.cabecalho, 'none'); assert.notEqual(m.celula, 'flex');
    }
    assert.ok(m.linhas >= 10, `só ${m.linhas} linhas`);
    if (PRINTS) await pagina.screenshot({ path: path.join(PRINTS, `${slug(perfil.nome)}-dados.png`), fullPage: false });
    await fechar();
  });

  // ---------------------------------------------------------------- encaixe das telas (o que só o aparelho de verdade mostra)
  // A lista de painéis e o assistente nasceram olhados só no computador: no iPhone a marca era espremida em 22 px
  // e o botão Excluir passava da linha do painel; no Safari o seletor "Canal" saía com 23 px de altura.
  const encaixe = () => ({
    topbar: (() => {
      const t = document.querySelector('.topbar'); if (!t) return { ok: false, motivo: 'sem .topbar' };
      const r = (e) => e.getBoundingClientRect();
      const filhos = [...t.children].filter((e) => r(e).width > 0);
      const sobrepoe = [];
      for (let i = 0; i < filhos.length; i++) for (let j = i + 1; j < filhos.length; j++) {
        const a = r(filhos[i]); const b = r(filhos[j]);
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) sobrepoe.push(`${filhos[i].className} x ${filhos[j].className}`);
      }
      const nome = t.querySelector('.brand .name') || t.querySelector('.brand');
      const folhas = [...t.querySelectorAll('.brand, .actions, .btn, .btn-barra, .theme-toggle')];
      return { sobrepoe, nomeCortado: nome.scrollWidth > nome.clientWidth + 1, nomeLargura: Math.round(nome.getBoundingClientRect().width), alturaDoNome: Math.round(nome.getBoundingClientRect().height),
        fora: folhas.filter((e) => r(e).right > window.innerWidth + 1 || r(e).left < -1).map((e) => e.className) };
    })(),
  });

  await teste(P('lista de painéis e assistente: a barra do topo não esprema a marca nem sobrepõe, e os botões ficam dentro do cartão'), async () => {
    ({ ctx, pagina } = await abrirContexto(browser, perfil));
    for (const pag of ['/', '/config.html']) {
      await pagina.goto(`${base}${pag}`);
      await pagina.waitForSelector(pag === '/' ? '.list-item' : '#steps', { timeout: 15000 });
      await pagina.waitForTimeout(500);
      const m = (await pagina.evaluate(encaixe)).topbar;
      assert.deepEqual(m.sobrepoe, [], `${pag}: peças da barra sobrepostas`);
      assert.equal(m.nomeCortado, false, `${pag}: o nome da marca está cortado (${m.nomeLargura} px de largura)`);
      assert.ok(m.alturaDoNome <= 24, `${pag}: o nome da marca quebrou em ${Math.round(m.alturaDoNome / 18)} linhas (${m.alturaDoNome} px)`);
      assert.deepEqual(m.fora, [], `${pag}: peça da barra fora da tela`);
    }
    await pagina.goto(`${base}/`);
    await pagina.waitForSelector('.list-item');
    const fora = await pagina.evaluate(() => {
      const itens = [...document.querySelectorAll('.list-item')];
      return itens.flatMap((it) => { const ri = it.getBoundingClientRect(); return [...it.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > ri.right + 1 || r.left < ri.left - 1); }).map((e) => `${e.tagName}.${e.className} passa ${Math.round(e.getBoundingClientRect().right - ri.right)} px da linha`); });
    });
    assert.deepEqual(fora, [], 'botão ou texto passando da linha do painel');
    if (PRINTS) await pagina.screenshot({ path: path.join(PRINTS, `${slug(perfil.nome)}-lista.png`), fullPage: false });
    await fechar();
  });

  await teste(P('filtros do painel: o seletor "Canal" tem a altura dos outros campos e "Limpar filtros" tem o texto no centro'), async () => {
    await abrir(ids.meta);
    const m = await pagina.evaluate(() => {
      const sel = document.querySelector('.filterbar select'); const reset = document.querySelector('.filterbar .fb-reset');
      const rg = document.createRange(); rg.selectNodeContents(reset); const rt = rg.getBoundingClientRect(); const rb = reset.getBoundingClientRect();
      const campo = document.querySelector('.filterbar input'); 
      return { select: sel.getBoundingClientRect().height, campo: campo ? campo.getBoundingClientRect().height : 0, reset: rb.height, desvio: Math.abs((rt.left + rt.width / 2) - (rb.left + rb.width / 2)), largura: rb.width };
    });
    assert.ok(m.select >= (perfil.celular ? 44 : 36), `o seletor Canal tem ${m.select} px de altura`);
    assert.ok(m.reset >= (perfil.celular ? 44 : 36), `"Limpar filtros" tem ${m.reset} px de altura`);
    assert.ok(m.desvio <= 4, `o texto de "Limpar filtros" está ${m.desvio.toFixed(1)} px fora do centro do botão (${m.largura.toFixed(0)} px de largura)`);
    await fechar();
  });

  // ---------------------------------------------------------------- os 7 efeitos
  await teste(P('efeito 3 e 4, período em um clique e números de roleta: rodam e terminam no número final, legível'), async () => {
    await abrir(ids.meta);
    await gravar(pagina, ['.kpi__roleta']);
    await tocar(perfil, pagina.locator('.atalho[data-atalho="7d"]'));
    const g = await parar(pagina);
    assert.ok(g.maxAnims > 0 || g.camadas['.kpi__roleta'], 'nenhum movimento foi criado na troca de período');
    assert.equal(g.sobrando, 0, 'sobrou animação rodando depois do fim');
    const m = await pagina.evaluate(() => {
      const pilula = document.querySelector('.atalhos__pilula'); const marcado = document.querySelector('.atalho[aria-checked="true"]');
      const rp = pilula.getBoundingClientRect(); const rm = marcado.getBoundingClientRect();
      const valor = document.querySelector('.kpi__value');
      return { camada: document.querySelectorAll('.kpi__roleta').length, cor: getComputedStyle(valor).color, opacidade: getComputedStyle(valor).opacity,
        pilulaX: Math.abs(rp.left - rm.left), pilulaW: Math.abs(rp.width - rm.width), pilulaY: Math.abs(rp.top - rm.top), marcado: marcado.dataset.atalho };
    });
    assert.equal(m.camada, 0, 'a camada da roleta ficou na tela');
    assert.ok(!/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)|transparent/.test(m.cor), `o número ficou transparente (${m.cor})`);
    assert.equal(m.opacidade, '1');
    assert.ok(m.pilulaX <= 1.5 && m.pilulaW <= 1.5 && m.pilulaY <= 1.5, `a pílula parou fora do atalho marcado: ${JSON.stringify(m)}`);
    assert.equal(m.marcado, '7d');
    assert.equal(limpar(await kpi(pagina, 'Leads')), inteiro(LEADS_7));
    assert.deepEqual(pagina.__problemas, []);
    await fechar();
  });

  await teste(P('efeito 6, meta batida: acende ao cruzar a meta, termina com o selo e sem camada sobrando'), async () => {
    await abrir(ids.periodo);
    await tocar(perfil, pagina.locator('.atalho[data-atalho="7d"]'));
    await esperarKpi(pagina, 'Leads', inteiro(LEADS_7));
    await pagina.waitForTimeout(500); await quieto(pagina, 8000);
    const antes = await pagina.evaluate(() => ({ selo: document.querySelectorAll('.kpi__selo').length, texto: (document.querySelector('.kpi__goal-text') || {}).textContent }));
    assert.equal(antes.selo, 0, 'em 7 dias a meta ainda não foi batida: ' + antes.texto);
    await gravar(pagina, ['.kpi__onda', '.kpi__selo']);
    await tocar(perfil, pagina.locator('.atalho[data-atalho="tudo"]'));
    const g = await parar(pagina, 4500);
    assert.ok(g.camadas['.kpi__onda'], 'a camada do efeito (onda) nunca apareceu');
    assert.ok(g.maxAnims >= 3, `poucas animações no marco (${g.maxAnims})`);
    assert.equal(g.sobrando, 0);
    // as camadas saem sozinhas logo depois do fim das animações (o painel as tira 200 ms depois do último quadro)
    await pagina.waitForFunction(() => !document.querySelector('.kpi__onda, .kpi__goal-clarao'), null, { timeout: 3000 }).catch(() => {});
    const m = await pagina.evaluate(() => { const s = document.querySelector('.kpi__selo'); const r = s ? s.getBoundingClientRect() : null; const cs = s ? getComputedStyle(s) : null;
      return { onda: document.querySelectorAll('.kpi__onda').length, clarao: document.querySelectorAll('.kpi__goal-clarao').length, selo: !!s, w: r && r.width, op: cs && cs.opacity, tr: cs && cs.transform, vis: cs && cs.visibility }; });
    assert.equal(m.onda + m.clarao, 0, 'a camada do efeito ficou na tela');
    assert.ok(m.selo && m.w > 20 && m.op === '1' && m.vis === 'visible' && (m.tr === 'none' || m.tr === 'matrix(1, 0, 0, 1, 0, 0)'), 'selo não ficou em repouso: ' + JSON.stringify(m));
    if (PRINTS) await pagina.screenshot({ path: path.join(PRINTS, `${slug(perfil.nome)}-meta-batida.png`), fullPage: false });
    assert.deepEqual(pagina.__problemas, []);
    await fechar();
  });

  await teste(P('efeito 2 e 5, gráfico que responde e que se transforma (aba Evolução)'), async () => {
    await abrir(ids.meta);
    await tocar(perfil, pagina.locator('.aba', { hasText: 'Evolução' }));
    await pagina.waitForSelector('.chart--timeseries .chart__svg', { timeout: 10000 });
    await quieto(pagina);
    const svg = pagina.locator('.chart--timeseries .chart__svg').first();
    await svg.scrollIntoViewIfNeeded();
    const caixa = await svg.boundingBox();
    const alvo = { x: caixa.x + caixa.width * 0.6, y: caixa.y + caixa.height * 0.5 };
    if (perfil.celular) await svg.tap({ position: { x: caixa.width * 0.6, y: caixa.height * 0.5 } });
    else await pagina.mouse.move(alvo.x, alvo.y, { steps: 6 });
    await pagina.waitForFunction(() => document.querySelector('.chart__regua.is-ativa') && document.querySelector('.chart__dica.is-ativa'), null, { timeout: 4000 });
    const dica = await pagina.evaluate(() => ({ data: document.querySelector('.chart__dica-data').textContent, valor: document.querySelector('.chart__dica-valor').textContent,
      caixa: document.querySelector('.chart__dica').getBoundingClientRect().toJSON(), tela: { w: window.innerWidth, h: window.innerHeight } }));
    assert.match(dica.data, /\d{2}\/\d{2}|\d{1,2} de|\d{4}/, `etiqueta sem data: "${dica.data}"`);
    assert.match(dica.valor, /\d/, `etiqueta sem valor: "${dica.valor}"`);
    assert.ok(dica.caixa.left >= -1 && dica.caixa.right <= dica.tela.w + 1, 'a etiqueta saiu da tela');
    // tira o dedo/mouse: some
    if (perfil.celular) await pagina.locator('.faixa__nome').first().tap(); else await pagina.mouse.move(8, 8, { steps: 4 }); // fora do gráfico e longe de qualquer link
    await pagina.waitForFunction(() => !document.querySelector('.chart__regua.is-ativa'), null, { timeout: 4000 });
    // transforma: troca de período com o gráfico na tela
    await gravar(pagina, []);
    await tocar(perfil, pagina.locator('.atalho[data-atalho="30d"]'));
    const g = await parar(pagina);
    assert.ok(g.maxAnims > 0, 'o gráfico não se transformou (nenhuma animação)');
    assert.equal(g.sobrando, 0);
    const fim = await pagina.evaluate(() => ({ nan: [...document.querySelectorAll('.chart--timeseries svg *')].some((e) => /NaN|undefined/.test((e.getAttribute('d') || '') + (e.getAttribute('points') || '') + (e.getAttribute('transform') || ''))),
      linhas: document.querySelectorAll('.chart--timeseries path.chart__line, .chart--timeseries polyline').length }));
    assert.equal(fim.nan, false, 'o desenho final do gráfico tem NaN');
    assert.ok(fim.linhas > 0, 'o gráfico sumiu depois da troca');
    if (PRINTS) await pagina.screenshot({ path: path.join(PRINTS, `${slug(perfil.nome)}-evolucao.png`), fullPage: false });
    assert.deepEqual(pagina.__problemas, []);
    await fechar();
  });

  await teste(P('efeito 7, tabela que reordena: as linhas deslizam e terminam sem transform sobrando'), async () => {
    await abrir(ids.meta);
    await gravar(pagina, []);
    if (perfil.celular) await pagina.locator('.resumo .ordenar-por select').first().selectOption('1:desc');
    else await pagina.locator('.resumo__el thead th', { hasText: 'Investimento' }).first().click();
    const g = await parar(pagina);
    assert.ok(g.maxAnims > 0, 'as linhas não deslizaram');
    assert.equal(g.sobrando, 0);
    const resto = await pagina.evaluate(() => [...document.querySelectorAll('.resumo__el tbody tr')].filter((tr) => tr.style.transform && tr.style.transform !== 'none').length);
    assert.equal(resto, 0, 'linha ficou com transform inline');
    await fechar();
  });

  await teste(P('efeito 1, cartão que vira a tela: da lista ao painel, a capa sobe e some'), async () => {
    ({ ctx, pagina } = await abrirContexto(browser, perfil));
    await pagina.goto(`${base}/`);
    await pagina.waitForSelector('.list-item[data-id="' + ids.meta + '"]', { timeout: 15000 });
    await pagina.waitForTimeout(700);
    await gravar(pagina, ['.capa']);
    await tocar(perfil, pagina.locator(`.list-item[data-id="${ids.meta}"]`));
    await pagina.waitForURL(/dashboard/, { timeout: 15000 });
    await pagina.waitForFunction(() => document.querySelectorAll('.kpi__value').length >= 7, null, { timeout: 30000 });
    await pagina.waitForFunction(() => !document.documentElement.hasAttribute('data-cobertura'), null, { timeout: 9000 });
    await quieto(pagina);
    const m = await pagina.evaluate(() => { const c = document.getElementById('cobertura'); const cs = getComputedStyle(c); return { atributo: document.documentElement.hasAttribute('data-cobertura'), display: cs.display, visivel: cs.visibility, opacidade: cs.opacity }; });
    assert.equal(m.atributo, false);
    assert.ok(m.display === 'none' || m.opacidade === '0', 'a capa ficou cobrindo o painel: ' + JSON.stringify(m));
    assert.equal(limpar(await kpi(pagina, 'Leads')), inteiro(somar(LINHAS, 'Leads')));
    assert.deepEqual(pagina.__problemas, []);
    await fechar();
  });

  // ---------------------------------------------------------------- movimento reduzido
  await teste(P('prefers-reduced-motion: nenhum movimento é criado e o estado final já está na tela'), async () => {
    await abrir(ids.periodo, { reducedMotion: 'reduce' });
    assert.equal(await pagina.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true, 'o navegador não aceitou o movimento reduzido');
    await gravar(pagina, ['.kpi__onda', '.kpi__roleta', '.capa', '.kpi__goal-clarao']);
    await tocar(perfil, pagina.locator('.atalho[data-atalho="7d"]'));
    await pagina.waitForTimeout(900);
    assert.equal(limpar(await kpi(pagina, 'Leads')), inteiro(LEADS_7), 'o número final já tem que estar lá');
    const meio = await pagina.evaluate(() => document.getAnimations().length);
    await tocar(perfil, pagina.locator('.atalho[data-atalho="tudo"]'));
    await pagina.waitForTimeout(900);
    assert.ok(await pagina.evaluate(() => document.querySelectorAll('.kpi__selo').length === 1), 'a meta foi batida em "Tudo": o selo tem que estar lá, sem o show');
    await tocar(perfil, pagina.locator('.aba', { hasText: 'Evolução' }));
    await pagina.waitForSelector('.chart--timeseries .chart__svg', { timeout: 10000 });
    await tocar(perfil, pagina.locator('.aba', { hasText: 'Visão geral' }));
    await pagina.waitForTimeout(700);
    const porCanal = {};
    for (const l of LINHAS) porCanal[l.Canal] = (porCanal[l.Canal] || 0) + num(l.Leads);
    const crescente = Object.entries(porCanal).sort((a, b) => a[1] - b[1]).map(([c]) => c);
    if (perfil.celular) await pagina.locator('.resumo .ordenar-por select').first().selectOption('2:asc');
    else await pagina.locator('.resumo__el thead th', { hasText: 'Leads' }).first().click();
    await pagina.waitForTimeout(700);
    const g = await parar(pagina, 1500);
    assert.equal(g.maxAnims, 0, `foram criadas ${g.maxAnims} animações com movimento reduzido`);
    assert.equal(g.maxTransicoes, 0, 'houve transição CSS com movimento reduzido');
    assert.equal(meio, 0, 'havia animação rodando logo depois do clique');
    assert.deepEqual(g.camadas, {}, 'apareceu camada de efeito: ' + JSON.stringify(g.camadas));
    assert.deepEqual(await pagina.evaluate(() => [...document.querySelectorAll('.resumo__el tbody tr')].map((tr) => tr.cells[0].textContent.trim())), crescente, 'a tabela já está ordenada');
    assert.deepEqual(pagina.__problemas, []);
    await fechar();
  });

  await teste(P('prefers-reduced-motion: a capa da lista não cobre a tela e o painel abre direto'), async () => {
    ({ ctx, pagina } = await abrirContexto(browser, perfil, { reducedMotion: 'reduce' }));
    await pagina.goto(`${base}/`);
    await pagina.waitForSelector('.list-item[data-id="' + ids.meta + '"]', { timeout: 15000 });
    await gravar(pagina, ['.capa']);
    await tocar(perfil, pagina.locator(`.list-item[data-id="${ids.meta}"]`));
    await pagina.waitForURL(/dashboard/, { timeout: 15000 });
    await pagina.waitForFunction(() => document.querySelectorAll('.kpi__value').length >= 7, null, { timeout: 30000 });
    assert.equal(await pagina.evaluate(() => document.documentElement.hasAttribute('data-cobertura')), false);
    assert.equal(await pagina.evaluate(() => document.getAnimations().length), 0);
    await fechar();
  });
}

// ------------------------------------------------------------------ main
async function main() {
  const pw = acharPlaywright();
  if (!pw) {
    console.log('PULADO: Playwright não encontrado (npm i -g playwright && npx playwright install chromium firefox webkit). Esta bancada NÃO rodou.');
    return CI ? 1 : 0;
  }
  let falhas = 0; let pulados = 0;
  const matriz = [];
  const so = process.env.NAVEGADORES_TESTE || '';
  const teste = async (nome, fn) => {
    if (so && !nome.toLowerCase().includes(so.toLowerCase())) return;
    try { await fn(); console.log(`ok    ${nome}`); matriz.push({ nome, ok: true }); } catch (e) { falhas++; matriz.push({ nome, ok: false }); console.log(`FALHA ${nome} -> ${String(e.message).split('\n')[0]}${e.actual !== undefined ? ` [obtido: ${JSON.stringify(e.actual)} | esperado: ${JSON.stringify(e.expected)}]` : ''}`); }
  };

  const pilha = await subirPilha();
  try {
    const ids = {
      meta: await pilha.criar({ name: 'Marketing com meta', domain: 'marketing', accent: '#0F5C6E', goal: { metricKey: 'leads', value: 600, periodo: 'mensal' }, source: { type: 'csv', data: CSV_TEXTO }, colMap: COLMAP }),
      periodo: await pilha.criar({ name: 'Marketing meta do período', domain: 'marketing', accent: '#1F8A70', goal: { metricKey: 'leads', value: META_DO_PERIODO, periodo: 'periodo' }, source: { type: 'csv', data: CSV_TEXTO }, colMap: COLMAP }),
    };
    assert.ok(LEADS_7 < META_DO_PERIODO && somar(LINHAS, 'Leads') > META_DO_PERIODO, 'a base de teste não cruza a meta como deveria');

    for (const perfil of PERFIS(pw)) {
      let browser;
      try {
        const motor = pw[perfil.motor];
        const exe = motor.executablePath();
        if (!exe || !fs.existsSync(exe)) throw new Error(`o navegador ${perfil.motor} do Playwright não está baixado (${exe})`);
        browser = await motor.launch();
      } catch (e) {
        pulados++;
        console.log(`PULADO: ${perfil.nome} sem o motor ${perfil.motor} do Playwright (npx playwright install ${perfil.motor}). ${String(e.message).split('\n')[0]}`);
        if (CI) { falhas++; console.log(`FALHA ${perfil.nome}: no CI o motor ${perfil.motor} tem que existir`); }
        continue;
      }
      console.log(`\n== ${perfil.nome} (${perfil.motor} ${browser.version()}) ==`);
      try { await verificar(perfil, browser, pilha.url, ids, matriz, teste); } finally { await browser.close(); }
    }
  } finally {
    await pilha.fechar();
  }
  console.log(falhas ? `\n${falhas} falha(s), ${pulados} perfil(is) pulado(s)` : `\ntudo certo (${matriz.length} verificações, ${pulados} perfil(is) pulado(s))`);
  return falhas ? 1 : 0;
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
