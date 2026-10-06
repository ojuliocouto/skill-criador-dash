/**
 * Acha o Playwright da máquina: o local e, se não houver, o da pasta de pacotes globais que o PRÓPRIO
 * npm informa (`npm root -g`). Mesmo jeito do prova-dash.js; nenhum caminho fixo de máquina.
 */
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function pastaGlobalDoNpm() {
  try {
    // No Windows o npm é um .cmd: sem shell o spawnSync não o encontra.
    const r = spawnSync('npm', ['root', '-g'], { encoding: 'utf8', timeout: 20000, shell: process.platform === 'win32', windowsHide: true });
    const pasta = (r.stdout || '').trim();
    return r.status === 0 && pasta ? pasta : null;
  } catch (_) { return null; }
}

function acharPlaywright() {
  const tentativas = [() => require('playwright')];
  const global = pastaGlobalDoNpm();
  if (global) {
    tentativas.push(() => require(path.join(global, 'playwright')));
    tentativas.push(() => require(path.join(global, 'playwright-core')));
  }
  for (const t of tentativas) { try { return t(); } catch (_) { /* próxima */ } }
  return null;
}

module.exports = { acharPlaywright };
