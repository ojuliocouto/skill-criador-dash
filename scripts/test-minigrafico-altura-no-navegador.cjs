/**
 * Altura do minigráfico dos cartões (3.7.3). Achado na prova no ar de 08/10/2026 (teste-sheets-373, 1440): o cartão
 * Investimento esticava o minigráfico até ~110 px de altura, enquanto os outros tinham ~40 px, porque o cartão cresce
 * junto com a linha do destaque (que tem a barra da meta) e o SVG esticava para preencher. Isso exagera o serrilhado.
 * Regra medida aqui, com o painel de verdade (Functions reais, CSV de 60 dias, meta mensal):
 *   - todos os minigráficos renderizados da mesma grade têm a mesma altura (diferença de no máximo 2 px);
 *   - nenhum passa de 56 px, no computador e no celular;
 *   - ficam alinhados ao pé do cartão (a distância até a borda de baixo é igual em todos os cartões da mesma linha e o
    bloco do traço termina no preenchimento do cartão).
 * Uso: node <dir-da-skill>/scripts/test-minigrafico-altura-no-navegador.cjs   (ALTURA_PRINTS=<pasta> guarda os PNG)
 */
const fs = require('node:fs');
const path = require('node:path');
const { acharPlaywright } = require('./video/achar-playwright.cjs');
const { subirPilha } = require('./stack-local.cjs');

const CSV = fs.readFileSync(path.join(__dirname, '..', 'starter-kit', 'examples', 'marketing-60d.csv'), 'utf8');
const COLMAP = { data: 'Data', canal: 'Canal', investimento: 'Investimento', impressoes: 'Impressoes', cliques: 'Cliques', leads: 'Leads', conversoes: 'Conversoes', receita: 'Receita' };
const PRINTS = process.env.ALTURA_PRINTS || '';
if (PRINTS) fs.mkdirSync(PRINTS, { recursive: true });
const MAXIMO = 56;
const TOLERANCIA = 2;

let falhas = 0;
async function teste(nome, fn) {
  try { await fn(); console.log(`ok    ${nome}`); } catch (e) { falhas++; console.log(`FALHA ${nome} -> ${String(e.message).split('\n')[0]}`); }
}

/** Mede, na página aberta, cada minigráfico que aparece (altura renderizada e folga até o pé do cartão). */
const medir = () => [...document.querySelectorAll('.grid.kpis .kpi__spark')].map((s) => {
  const r = s.getBoundingClientRect();
  const k = s.closest('.kpi').getBoundingClientRect();
  const rotulo = (s.closest('.kpi').querySelector('.kpi__label') || {}).textContent || '?';
  const linha = s.closest('.kpi__linha');
  return { rotulo: rotulo.trim(), altura: r.height, largura: r.width, folgaDoPe: k.bottom - r.bottom, folgaDaLinha: linha ? k.bottom - linha.getBoundingClientRect().bottom : null, topoDoCartao: Math.round(k.top), heroi: !!s.closest('.kpi--hero') };
}).filter((m) => m.altura > 0 && m.largura > 0);

async function main() {
  const pw = acharPlaywright();
  if (!pw) { console.log('PULADO: Playwright não encontrado (npm i -g playwright && npx playwright install chromium). Esta bancada NÃO rodou.'); return 0; }
  const pilha = await subirPilha();
  const browser = await pw.chromium.launch();
  const ids = {
    comMeta: await pilha.criar({ name: 'Marketing com meta', domain: 'marketing', accent: '#0F5C6E', goal: { metricKey: 'leads', value: 3000, periodo: 'mensal' }, source: { type: 'csv', data: CSV }, colMap: COLMAP }),
    semMeta: await pilha.criar({ name: 'Marketing sem meta', domain: 'marketing', accent: '#1F8A70', source: { type: 'csv', data: CSV }, colMap: COLMAP }),
  };
  const perfis = [
    ['computador 1440', { viewport: { width: 1440, height: 900 } }],
    ['computador 1100', { viewport: { width: 1100, height: 900 } }],
    ['celular 390', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ['celular 360', { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ];
  try {
    for (const [nomePerfil, perfil] of perfis) {
      for (const [quando, id] of [['com meta', ids.comMeta], ['sem meta', ids.semMeta]]) {
        await teste(`${nomePerfil}, ${quando}: minigráficos com a mesma altura (±${TOLERANCIA} px), no máximo ${MAXIMO} px, no pé do cartão`, async () => {
          const ctx = await browser.newContext({ ...perfil, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', reducedMotion: 'reduce' });
          const pagina = await ctx.newPage();
          await pagina.goto(`${pilha.url}/dashboard.html?id=${id}`, { waitUntil: 'domcontentloaded' });
          await pagina.waitForFunction(() => /\d/.test((document.querySelector('.grid.kpis .kpi__value') || {}).textContent || ''), null, { timeout: 20000 });
          await pagina.waitForTimeout(900);
          const m = await pagina.evaluate(medir);
          if (PRINTS) await pagina.screenshot({ path: path.join(PRINTS, `altura-${nomePerfil.replace(/ /g, '-')}-${quando.replace(' ', '-')}.png`) });
          await ctx.close();
          const minis = m.filter((x) => !x.heroi);
          if (minis.length < 3) throw new Error(`só ${minis.length} minigráficos à vista: o teste não prova nada (${JSON.stringify(m)})`);
          const alturas = minis.map((x) => x.altura);
          const resumo = minis.map((x) => `${x.rotulo}=${x.altura.toFixed(0)}`).join(' ');
          if (Math.max(...alturas) - Math.min(...alturas) > TOLERANCIA) throw new Error(`alturas diferentes: ${resumo}`);
          if (Math.max(...m.map((x) => x.altura)) > MAXIMO) throw new Error(`passa de ${MAXIMO} px: ${m.map((x) => `${x.rotulo}=${x.altura.toFixed(0)}`).join(' ')}`);
          // alinhados ao pé: dentro da mesma linha da grade, a folga até a borda de baixo é igual
          const linhas = new Map();
          for (const x of minis) linhas.set(x.topoDoCartao, [...(linhas.get(x.topoDoCartao) || []), x.folgaDoPe]);
          for (const [topo, folgas] of linhas) {
            if (Math.max(...folgas) - Math.min(...folgas) > TOLERANCIA) throw new Error(`na linha que começa em ${topo}px os minigráficos não estão no mesmo pé: folgas ${folgas.map((f) => f.toFixed(0)).join(', ')}`);
          }
          // o bloco do traço (com a variação ao lado ou embaixo) termina no preenchimento do cartão, não no meio dele
          const longe = minis.filter((x) => x.folgaDaLinha !== null && x.folgaDaLinha > 20);
          if (longe.length) throw new Error(`bloco do minigráfico longe do pé do cartão: ${longe.map((x) => `${x.rotulo}=${x.folgaDaLinha.toFixed(0)}`).join(' ')}`);
        });
      }
    }
  } finally { await browser.close(); await pilha.fechar(); }
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  return falhas ? 1 : 0;
}
main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
