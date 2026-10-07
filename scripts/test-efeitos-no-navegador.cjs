/**
 * Mede no navegador (Chromium do Playwright) o que teste de string não alcança:
 *  - META BATIDA: duração total do marco, % de pixels do cartão que mudam no meio do efeito,
 *    volta ao estado normal com o selo visível, nada em movimento reduzido;
 *  - ROLETA: em 5 quadros durante o giro, cada casa mostra no máximo 2 dígitos e só o que sai e o
 *    que entra, separadores não rolam, a largura do número não varia mais de 2 px.
 * As animações são pausadas e o relógio delas é posto em cada instante: a medida não depende de tempo real.
 * Uso: node scripts/test-efeitos-no-navegador.cjs   (EFEITOS_QUADROS=<pasta> guarda os PNG dos quadros)
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

const QUADROS = process.env.EFEITOS_QUADROS || '';
if (QUADROS) fs.mkdirSync(QUADROS, { recursive: true });

/** Fração de pixels do cartão que mudaram (qualquer canal com diferença maior que `limiar`). */
async function fracaoMudada(pagina, a, b, limiar = 12) {
  return pagina.evaluate(async ({ a, b, limiar }) => {
    const carregar = (src) => new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = src; });
    const [ia, ib] = await Promise.all([carregar(a), carregar(b)]);
    const w = Math.min(ia.width, ib.width); const h = Math.min(ia.height, ib.height);
    const dados = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const da = dados(ia); const db = dados(ib);
    let n = 0;
    for (let i = 0; i < da.length; i += 4) {
      if (Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])) > limiar) n++;
    }
    return n / (w * h);
  }, { a, b, limiar });
}
const dataUrl = (buf) => 'data:image/png;base64,' + buf.toString('base64');

async function abrir(browser, base, { reduzido = false, tema = 'dark', acento } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: reduzido ? 'reduce' : 'no-preference' });
  const pagina = await ctx.newPage();
  const erros = [];
  pagina.on('pageerror', (e) => erros.push(String(e)));
  await pagina.goto(`${base}/bancada.html?tema=${tema}${acento ? '&acento=' + encodeURIComponent(acento) : ''}`);
  await pagina.waitForFunction(() => window.__pronto === true);
  pagina.__erros = erros;
  return { ctx, pagina };
}

const montar = (pagina, itens) => pagina.evaluate((itens) => {
  const { render } = window.__efeitos;
  document.getElementById('grade').innerHTML = itens.map((i) => render(i.props, i.valor)).join('');
}, itens);

/** Pausa toda animação e põe o relógio dela em `t` ms. Devolve quantas havia. */
const irPara = (pagina, t) => pagina.evaluate((t) => { const as = document.getAnimations(); as.forEach((a) => { a.pause(); a.currentTime = t; }); return as.length; }, t);

async function main() {
  const pw = acharPlaywright();
  if (!pw) { console.error('Playwright não encontrado'); return 1; }
  const bancada = await subir();
  const browser = await pw.chromium.launch();
  try {
    // ------------------------------------------------------------------ META BATIDA
    const META = [{ props: { label: 'Leads', format: 'integer', goal: { pct: 1.7, text: '170% da meta' } }, valor: 2555 },
      { props: { label: 'Receita', format: 'currency' }, valor: 12000 }, { props: { label: 'Cliques', format: 'integer' }, valor: 900 }];

    for (const tema of ['dark', 'light']) {
      await teste(`meta batida (${tema}): dura de 1,6 a 2,4 s e começa e termina por si`, async () => {
        const { ctx, pagina } = await abrir(browser, bancada.url, { tema });
        await montar(pagina, META);
        const fim = await pagina.evaluate(() => {
          window.__efeitos.marcarMetaBatida(document.getElementById('grade'));
          const as = document.getAnimations();
          as.forEach((a) => a.pause());
          return Math.max(0, ...as.map((a) => a.effect.getComputedTiming().endTime));
        });
        assert.ok(fim >= 1600 && fim <= 2400, `duração total ${fim} ms, fora de 1600 a 2400`);
        await ctx.close();
      });

      await teste(`meta batida (${tema}): no meio do efeito pelo menos 25% dos pixels do cartão mudam; no fim volta ao normal com o selo`, async () => {
        const { ctx, pagina } = await abrir(browser, bancada.url, { tema });
        await montar(pagina, META);
        await pagina.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
        const cartao = pagina.locator('.kpi').first();
        const antes = await cartao.screenshot();
        const fim = await pagina.evaluate(() => {
          window.__efeitos.marcarMetaBatida(document.getElementById('grade'));
          const as = document.getAnimations(); as.forEach((a) => a.pause());
          return Math.max(0, ...as.map((a) => a.effect.getComputedTiming().endTime));
        });
        const medidas = {};
        for (const t of [0.15, 0.3, 0.5, 0.7, 0.9].map((f) => Math.round(fim * f))) {
          await irPara(pagina, t);
          const quadro = await cartao.screenshot();
          if (QUADROS) fs.writeFileSync(path.join(QUADROS, `meta-${tema}-${t}ms.png`), quadro);
          medidas[t] = await fracaoMudada(pagina, dataUrl(antes), dataUrl(quadro));
        }
        const meio = medidas[Math.round(fim * 0.5)];
        console.log(`        (${tema}) fração mudada por instante: ` + Object.entries(medidas).map(([t, f]) => `${t} ms ${(f * 100).toFixed(1)}%`).join(' | '));
        assert.ok(meio >= 0.25, `no meio do efeito só ${(meio * 100).toFixed(1)}% do cartão mudou (mínimo 25%)`);
        // fim: relógio no fim de tudo e a camada do efeito já saiu
        await pagina.evaluate((fim) => { document.getAnimations().forEach((a) => { a.currentTime = fim + 50; a.finish(); }); }, fim);
        await pagina.waitForFunction(() => !document.querySelector('.kpi__onda'), null, { timeout: 5000 });
        await pagina.evaluate(() => document.getAnimations().forEach((a) => a.cancel()));
        const depois = await cartao.screenshot();
        const resto = await fracaoMudada(pagina, dataUrl(antes), dataUrl(depois), 4);
        assert.ok(resto < 0.01, `depois do fim o cartão ainda difere ${(resto * 100).toFixed(2)}% do estado normal`);
        const selo = await pagina.evaluate(() => { const s = document.querySelector('.kpi__selo'); const r = s.getBoundingClientRect(); const cs = getComputedStyle(s); return { w: r.width, h: r.height, op: cs.opacity, vis: cs.visibility, tr: cs.transform }; });
        assert.ok(selo.w > 20 && selo.h > 10 && selo.op === '1' && selo.vis === 'visible' && selo.tr === 'none', 'selo não ficou visível e em repouso: ' + JSON.stringify(selo));
        assert.deepEqual(pagina.__erros, []);
        await ctx.close();
      });
    }

    await teste('meta batida: com movimento reduzido não toca nada', async () => {
      const { ctx, pagina } = await abrir(browser, bancada.url, { reduzido: true });
      await montar(pagina, META);
      const r = await pagina.evaluate(() => ({ tocou: window.__efeitos.marcarMetaBatida(document.getElementById('grade')), camadas: document.querySelectorAll('.kpi__onda').length, anims: document.getAnimations().length }));
      assert.deepEqual(r, { tocou: false, camadas: 0, anims: 0 });
      await ctx.close();
    });

    await teste('meta batida: o cartão sem meta batida não acende e a camada do efeito só usa transform e opacity', async () => {
      const { ctx, pagina } = await abrir(browser, bancada.url);
      await montar(pagina, META);
      await pagina.evaluate(() => { window.__efeitos.marcarMetaBatida(document.getElementById('grade')); document.getAnimations().forEach((a) => a.pause()); });
      const props = await pagina.evaluate(() => {
        const nomes = new Set();
        document.getAnimations().forEach((a) => a.effect.getKeyframes().forEach((k) => Object.keys(k).forEach((p) => { if (!['offset', 'easing', 'composite', 'computedOffset'].includes(p)) nomes.add(p); })));
        return [...nomes].sort();
      });
      assert.deepEqual(props.filter((p) => !['transform', 'opacity'].includes(p)), [], 'anima propriedade proibida: ' + props.join());
      const cartoesComCamada = await pagina.evaluate(() => [...document.querySelectorAll('.kpi')].map((k) => !!k.querySelector('.kpi__onda')));
      assert.deepEqual(cartoesComCamada, [true, false, false]);
      await ctx.close();
    });

    // ------------------------------------------------------------------ ROLETA
    const { planoDaRoleta } = await import('../starter-kit/public/assets/js/lib/numero-roleta.js');
    const CASOS = [
      { nome: 'sobe de 8.419 para 12.037 (inteiro)', fmt: 'integer', de: 8419, para: 12037 },
      { nome: 'desce de R$ 12.480,50 para R$ 3.719,05', fmt: 'currency', de: 12480.5, para: 3719.05 },
      { nome: 'sobe de 41,6% para 58,2%', fmt: 'percent', de: 41.6, para: 58.2 },
    ];
    for (const c of CASOS) {
      await teste(`roleta ${c.nome}: em 5 quadros cada casa mostra no máximo 2 dígitos, só o que sai e o que entra, e a largura não muda`, async () => {
        const { ctx, pagina } = await abrir(browser, bancada.url);
        await montar(pagina, [{ props: { label: 'Métrica', format: c.fmt }, valor: c.de }]);
        const textoAntes = await pagina.evaluate(() => document.querySelector('.kpi__value').textContent);
        await montar(pagina, [{ props: { label: 'Métrica', format: c.fmt }, valor: c.para }]);
        const textoDepois = await pagina.evaluate(() => document.querySelector('.kpi__value').textContent);
        const plano = planoDaRoleta(textoAntes, textoDepois);
        await pagina.evaluate((de) => { window.__efeitos.rolarIndicadores(document.getElementById('grade'), [de]); document.getAnimations().forEach((a) => a.pause()); }, c.de);
        const larguras = [];
        for (const t of [80, 180, 280, 380, 480]) {
          await irPara(pagina, t);
          if (QUADROS) await pagina.locator('.kpi').first().screenshot({ path: path.join(QUADROS, `roleta-${c.fmt}-${t}ms.png`) });
          const q = await pagina.evaluate(() => {
            const roleta = document.querySelector('.kpi__roleta');
            const rr = roleta.getBoundingClientRect();
            const cols = [...roleta.children].map((col) => {
              const rc = col.getBoundingClientRect();
              const animada = col.getAnimations({ subtree: true }).length > 0;
              const visiveis = [...col.querySelectorAll('.rd__cel')].filter((cel) => {
                const r = cel.getBoundingClientRect();
                return Math.min(r.bottom, rc.bottom) - Math.max(r.top, rc.top) > 0.75 && cel.getAnimations().every((a) => true);
              }).map((cel) => cel.textContent);
              return { fixo: col.classList.contains('rd--fixo'), visiveis, animada, h: rc.height };
            });
            const alvo = document.querySelector('.kpi__value'); const rg = document.createRange(); rg.selectNodeContents(alvo.firstChild);
            return { largura: rr.width, texto: rg.getBoundingClientRect().width, cols };
          });
          assert.equal(q.cols.length, plano.length, 'a roleta deve ter uma casa por caractere do número novo');
          q.cols.forEach((col, i) => {
            const p = plano[i];
            if (p.tipo === 'fixo') { assert.equal(col.animada, false, `a casa "${p.ch}" (separador ou dígito igual) não pode rolar`); return; }
            assert.ok(col.visiveis.length <= 2, `casa ${i} mostra ${col.visiveis.length} dígitos (${col.visiveis.join(',')}) em ${t} ms`);
            const permitidos = new Set([String(p.ch), p.tipo === 'rola' ? String(p.de) : String(p.ch)]);
            const intrusos = col.visiveis.filter((d) => !permitidos.has(d));
            assert.deepEqual(intrusos, [], `casa ${i} mostra dígito de passagem ${intrusos.join(',')} em ${t} ms (só ${[...permitidos].join(' e ')} podem aparecer)`);
          });
          assert.ok(Math.abs(q.largura - q.texto) <= 2, `a roleta mede ${q.largura.toFixed(1)} px e o número ${q.texto.toFixed(1)} px em ${t} ms`);
          larguras.push(q.largura);
        }
        const variacao = Math.max(...larguras) - Math.min(...larguras);
        assert.ok(variacao <= 2, `largura variou ${variacao.toFixed(2)} px entre os quadros`);
        assert.deepEqual(pagina.__erros, []);
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
