#!/usr/bin/env node
/**
 * Passe de gosto MEDIDO (3.7.1, D13). O "passe de gosto" da etapa 6 era autodeclarado: o gate aceitava
 * {"antes":0,"depois":0} com um tell da própria lista na tela. Este script mede no navegador os sinais da
 * lista que dá para medir (caixa alta espaçada, ícone por métrica, gradiente atrás de número, fundo tingido,
 * barrinha no topo, sombra sem hairline, "Sem dados" solto, número em mono esticado, card com metade vazia,
 * data americana), em cada aba, nos dois temas, no desktop e no celular, e grava o resultado.
 * O que é gosto (cor como enfeite, o painel inteiro olhado nos dois temas) NÃO é medido: fica para o registro
 * item por item com o print olhado. Também grava um print por tema e perfil para esse olhar.
 *
 * Uso:
 *   node <dir-da-skill>/scripts/passe-de-gosto.js "<URL-DO-DASHBOARD>" [--out evidencias] [--senha X]
 * Grava <out>/passe-de-gosto-medido.json e <out>/passe-<tema>-<perfil>.png. Sai com 1 se mediu algum sinal.
 */
const fs = require('node:fs');
const path = require('node:path');
const { acharPlaywright } = require('./video/achar-playwright.cjs');
const { SINAIS, NAO_MEDIDOS, medirNaPagina } = require('./video/sinais-de-gosto.cjs');

const PERFIS = [{ nome: 'desktop', viewport: { width: 1440, height: 900 } }, { nome: 'mobile', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }];
const TEMAS = [{ nome: 'claro', attr: 'light' }, { nome: 'escuro', attr: 'dark' }];

async function main() {
  const args = process.argv.slice(2);
  const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
  const url = args.find((a) => /^https?:/.test(a));
  if (!url) { console.log('uso: node passe-de-gosto.js "<URL-DO-DASHBOARD>" [--out evidencias] [--senha X]'); return 2; }
  const saida = path.resolve(flag('--out', 'evidencias'));
  const senha = flag('--senha');
  const pw = acharPlaywright();
  if (!pw) { console.log('Playwright não encontrado: npm i -g playwright && npx playwright install chromium'); return 1; }
  fs.mkdirSync(saida, { recursive: true });
  const browser = await pw.chromium.launch();
  const passes = [];
  const sinais = Object.fromEntries(Object.keys(SINAIS).map((k) => [k, { achados: 0, onde: [] }]));
  try {
    for (const perfil of PERFIS) {
      const ctx = await browser.newContext({ viewport: perfil.viewport, hasTouch: !!perfil.hasTouch, isMobile: !!perfil.isMobile, deviceScaleFactor: 1 });
      const pagina = await ctx.newPage();
      await pagina.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (senha) { const campo = pagina.locator('input[type="password"]').first(); if (await campo.count()) { await campo.fill(String(senha)); await pagina.keyboard.press('Enter'); } }
      await pagina.waitForSelector('.kpi__value, .table__el, .resumo__el', { timeout: 30000 });
      await pagina.waitForTimeout(4500); // a abertura (saudação) e a contagem dos números terminam
      const nAbas = await pagina.locator('.abas [role="tab"]').count();
      for (const tema of TEMAS) {
        await pagina.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema.attr);
        await pagina.waitForTimeout(700);
        for (let i = 0; i < Math.max(1, nAbas); i++) {
          if (nAbas) { await pagina.evaluate((k) => document.querySelectorAll('.abas [role="tab"]')[k].click(), i); await pagina.waitForTimeout(1600); }
          const aba = nAbas ? (await pagina.locator('.abas [role="tab"]').nth(i).innerText()).trim() : '(sem abas)';
          const medido = await pagina.evaluate(medirNaPagina);
          const contagem = {};
          for (const [k, v] of Object.entries(medido)) {
            contagem[k] = v.achados;
            const acumulado = sinais[k];
            acumulado.achados = Math.max(acumulado.achados, v.achados); // o pior caso entre as telas, não a soma da mesma coisa repetida
            for (const o of v.onde) if (acumulado.onde.length < 8) acumulado.onde.push(`${perfil.nome}/${tema.nome}/${aba}: ${o}`);
          }
          passes.push({ perfil: perfil.nome, tema: tema.nome, aba, achados: contagem });
          if (i === 0) await pagina.screenshot({ path: path.join(saida, `passe-${tema.nome}-${perfil.nome}.png`) });
        }
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  const total = Object.values(sinais).reduce((s, v) => s + v.achados, 0);
  const doc = { versao: 1, url: url.replace(/[?#].*$/, ''), medidoEm: new Date().toISOString(), sinais, nao_medidos: Object.keys(NAO_MEDIDOS), passes, total };
  fs.writeFileSync(path.join(saida, 'passe-de-gosto-medido.json'), JSON.stringify(doc, null, 2), 'utf8');
  console.log(`Passe de gosto medido: ${total} sinal(is) da lista na tela (${passes.length} medições).`);
  for (const [k, v] of Object.entries(sinais)) if (v.achados) console.log(`  - ${SINAIS[k]}: ${v.achados} (ex.: ${v.onde[0]})`);
  console.log(`Não medidos (olhe e registre com o print): ${Object.values(NAO_MEDIDOS).join('; ')}.`);
  console.log(`Gravado: ${path.join(saida, 'passe-de-gosto-medido.json')} e os prints passe-<tema>-<perfil>.png`);
  return total ? 1 : 0;
}
main().then((c) => process.exit(c), (e) => { console.log(`Falha ao medir: ${e.message}`); process.exit(1); });
