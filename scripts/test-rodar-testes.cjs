/**
 * O comando único da suíte (scripts/rodar-testes.mjs) não pode deixar um teste de navegador passar por portátil:
 * no Windows do CI sem Playwright ele quebraria, e o conjunto "portátil" é o que roda em pasta com acento e espaço.
 * Uso: node <dir-da-skill>/scripts/test-rodar-testes.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

let falhas = 0;
const teste = (nome, fn) => { try { fn(); console.log(`ok    ${nome}`); } catch (e) { falhas++; console.log(`FALHA ${nome} -> ${String(e.message).split('\n')[0]}`); } };
const fonte = fs.readFileSync(path.join(__dirname, 'rodar-testes.mjs'), 'utf8');
const bloco = fonte.slice(fonte.indexOf('const PRECISAM = {'), fonte.indexOf('};', fonte.indexOf('const PRECISAM = {')));
const precisam = [...bloco.matchAll(/'(test-[^']+)':/g)].map((m) => m[1]);
const testes = fs.readdirSync(__dirname).filter((n) => /^test-.+\.(py|cjs)$/.test(n));
const lista = (...a) => spawnSync(process.execPath, [path.join(__dirname, 'rodar-testes.mjs'), '--lista', ...a], { encoding: 'utf8' }).stdout;

teste('todo arquivo da lista PRECISAM existe (nome errado deixaria um teste de navegador no conjunto portátil)', () => {
  for (const n of precisam) assert.ok(testes.includes(n), `${n} não existe`);
});

teste('todo teste que abre o navegador (usa o Playwright) está na lista PRECISAM', () => {
  for (const n of testes) {
    if (n === 'test-rodar-testes.cjs' || !n.endsWith('.cjs')) continue;
    const txt = fs.readFileSync(path.join(__dirname, n), 'utf8');
    if (/acharPlaywright|chromium\.launch|'prova-dash\.js'/.test(txt)) assert.ok(precisam.includes(n), `${n} abre navegador e não está em PRECISAM`);
  }
});

teste('--lista mostra o npm test do starter-kit e todos os testes, sem curinga de shell', () => {
  const t = lista();
  assert.match(t, /npm test \(starter-kit\)/);
  for (const n of testes) assert.ok(t.includes(n), `${n} não aparece na lista`);
});

teste('--so-portateis tira os de navegador e mantém o npm test e os .py', () => {
  const t = lista('--so-portateis');
  assert.match(t, /npm test \(starter-kit\)/);
  assert.match(t, /test-gate-etapas\.py/);
  for (const n of precisam) assert.ok(!t.includes(n), `${n} não devia estar nos portáteis`);
});

teste('a execução não usa shell nem curinga: spawnSync sem shell e o glob vai para o node --test', () => {
  assert.ok(!/shell\s*:\s*true/.test(fonte));
  assert.ok(!/execSync\(/.test(fonte));
  assert.match(fonte, /'--test', 'test\/\*\.test\.js'/);
});

teste('no CI, pulo por falta de Playwright conta como falha (e fora do CI só aparece no resumo)', () => {
  assert.match(fonte, /process\.env\.CI/);
  assert.match(fonte, /pulou por falta de Playwright/);
});

process.exitCode = falhas ? 1 : 0;
console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
