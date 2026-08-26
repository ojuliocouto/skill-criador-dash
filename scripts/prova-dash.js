#!/usr/bin/env node
/**
 * Prova de tela do dashboard publicado: abre no navegador de verdade, autentica se
 * precisar, espera os dados chegarem e CONFERE se o painel mostra numero.
 *
 * Por que existe (26/08/2026): a skill tinha 654 testes passando e NENHUM olhava o
 * dashboard. Teste de logica nao ve painel publicado abrindo vazio, com "—" em todo
 * card, NaN no ROAS ou 500 no conector. O dono descobre isso pelo cliente.
 *
 * "Declarei pronto" sem este script rodando verde nao vale.
 *
 * Uso:
 *   node prova-dash.js --check                       # so verifica se o Playwright responde
 *   node prova-dash.js <url> [--senha X] [--out dir] # a prova de verdade
 *
 * Sai != 0 quando o painel nao passa. Sempre grava os PNG (desktop e mobile) para
 * serem OLHADOS: o script prova que ha numero na tela, nao que o numero esta certo.
 */
const fs = require('fs');
const path = require('path');

function resolvePlaywright() {
  // NAO devolva "ok" antes desta linha: o bug que isso corrige foi um --check que
  // saia ANTES do require e respondia identico com e sem o pacote instalado.
  const tentativas = [
    () => require('playwright'),
    () => require(path.join(process.env.HOME, '.npm-global/lib/node_modules/playwright')),
    () => require(path.join(process.env.HOME, '.npm-global/lib/node_modules/playwright-core')),
  ];
  for (const t of tentativas) { try { return t(); } catch (_) {} }
  return null;
}

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] || true) : d; };

if (args.includes('--check')) {
  const pw = resolvePlaywright();
  if (!pw) { console.error('Playwright nao resolve. npm i -g playwright'); process.exit(1); }
  let bin;
  try { bin = pw.chromium.executablePath(); } catch (e) {
    console.error('Playwright resolve, mas nao sabe o caminho do Chromium: ' + e.message);
    process.exit(1);
  }
  // Pacote instalado sem o browser baixado e o caso que mais engana: `require` passa,
  // o launch quebra so na hora da prova.
  if (!bin || !fs.existsSync(bin)) {
    console.error('Playwright instalado, mas o Chromium nao foi baixado: npx playwright install chromium');
    process.exit(1);
  }
  console.log('Playwright OK, Chromium em ' + bin);
  process.exit(0);
}

const url = args.find((a) => a.startsWith('http'));
if (!url) {
  console.error('uso: node prova-dash.js <url-do-dashboard> [--senha X] [--out dir]');
  process.exit(2);
}
const senha = flag('--senha');
const outDir = flag('--out', path.join(process.cwd(), 'prova'));

// Placeholders que um painel mostra quando o dado NAO chegou. Achar so isso na tela,
// e nenhum numero, e exatamente o modo de falha que passava despercebido.
const VAZIO = ['—', 'NaN', 'undefined', 'Infinity', 'null'];

(async () => {
  const pw = resolvePlaywright();
  if (!pw) { console.error('Playwright nao resolve. npm i -g playwright'); process.exit(1); }
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await pw.chromium.launch();
  const falhas = [];
  const avisos = [];

  for (const perfil of [
    { nome: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
    { nome: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ]) {
    const ctx = await browser.newContext(perfil);
    const page = await ctx.newPage();
    const errosConsole = [];
    const respostasRuins = [];
    page.on('console', (m) => { if (m.type() === 'error') errosConsole.push(m.text().slice(0, 200)); });
    page.on('response', (r) => {
      if (r.status() >= 400) respostasRuins.push(`${r.status()} ${r.url().slice(0, 120)}`);
    });

    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (resp && resp.status() >= 400) falhas.push(`[${perfil.nome}] a propria pagina voltou ${resp.status()}`);

      if (senha) {
        const campo = page.locator('input[type="password"]').first();
        if (await campo.count()) {
          await campo.fill(String(senha));
          await page.keyboard.press('Enter');
        }
      }

      // Espera o dado chegar, nao o DOM montar: painel monta o esqueleto na hora e
      // preenche depois. Sem isso a prova fotografa o esqueleto e aprova vazio.
      await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {
        avisos.push(`[${perfil.nome}] rede nao aquietou em 45s (polling? stream?)`);
      });

      const texto = (await page.locator('body').innerText().catch(() => '')) || '';
      const temNumero = /\d/.test(texto.replace(/\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/g, ''));
      if (!temNumero) falhas.push(`[${perfil.nome}] nenhum numero na tela: o painel abriu vazio`);

      const placeholders = VAZIO.filter((p) => texto.includes(p));
      if (placeholders.length) {
        const grave = placeholders.filter((p) => p !== '—');
        (grave.length ? falhas : avisos).push(
          `[${perfil.nome}] placeholder de dado ausente na tela: ${placeholders.join(', ')}`);
      }

      if (respostasRuins.length) falhas.push(`[${perfil.nome}] request falhou: ${respostasRuins.slice(0, 3).join(' | ')}`);
      if (errosConsole.length) avisos.push(`[${perfil.nome}] erro no console: ${errosConsole.slice(0, 2).join(' | ')}`);

      const png = path.join(outDir, `dash-${perfil.nome}.png`);
      await page.screenshot({ path: png, fullPage: true });
      console.log(`  ${perfil.nome}: ${png}`);
    } catch (e) {
      falhas.push(`[${perfil.nome}] ${e.message.split('\n')[0].slice(0, 160)}`);
    }
    await ctx.close();
  }
  await browser.close();

  console.log('\n' + '='.repeat(70));
  avisos.forEach((a) => console.log('  aviso: ' + a));
  if (falhas.length) {
    falhas.forEach((f) => console.log('  FALHA: ' + f));
    console.log('\n  O dashboard NAO passou. Nao declare pronto.\n');
    process.exit(1);
  }
  console.log('  Painel abre, autentica e mostra numero, no desktop e no mobile.');
  console.log('  OLHE os dois PNG antes de entregar: isto prova que ha numero, nao que ele esta certo.\n');
})();
