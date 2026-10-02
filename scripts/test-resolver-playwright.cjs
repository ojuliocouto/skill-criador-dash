/**
 * T10 do teste com aluno (02/10/2026): o prova-dash.js e o checar-ferramentas.py procuravam o
 * Playwright global só em ~/.npm-global, que é a configuração da máquina do dono. Quem instalou
 * o Node pelo Homebrew tem os globais em /opt/homebrew/lib/node_modules. A pasta certa é a que o
 * próprio npm informa: `npm root -g`.
 *
 * O teste monta um "npm global" falso (npm_config_prefix aponta pra ele) com um playwright de
 * mentira e confere que o --check acha ESSE, e não um caminho fixo.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let falhas = 0;
const checa = (nome, ok, det = '') => { console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}${det ? ' -> ' + det : ''}`); if (!ok) falhas++; };

const prefixo = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-global-falso-'));
// npm root -g = <prefix>/lib/node_modules no macOS e no Linux
const raiz = path.join(prefixo, 'lib', 'node_modules', 'playwright');
fs.mkdirSync(raiz, { recursive: true });
const MARCA = path.join(prefixo, 'chromium-de-mentira');
fs.writeFileSync(MARCA, 'x');
fs.writeFileSync(path.join(raiz, 'package.json'), JSON.stringify({ name: 'playwright', main: 'index.js' }));
fs.writeFileSync(path.join(raiz, 'index.js'), `module.exports = { chromium: { executablePath: () => ${JSON.stringify(MARCA)} } };`);

const env = { ...process.env, npm_config_prefix: prefixo };
delete env.NODE_PATH;
const r = spawnSync(process.execPath, [path.join(__dirname, 'prova-dash.js'), '--check'], { env, cwd: os.tmpdir(), encoding: 'utf8' });
checa('--check acha o Playwright pela pasta do `npm root -g`', r.status === 0 && (r.stdout || '').includes(MARCA), (r.stdout + r.stderr).trim().slice(0, 160));

const fonte = fs.readFileSync(path.join(__dirname, 'prova-dash.js'), 'utf8');
checa('prova-dash.js não tem caminho fixo de npm global', !fonte.includes('.npm-global'));
const checar = fs.readFileSync(path.join(__dirname, 'checar-ferramentas.py'), 'utf8');
checa('checar-ferramentas.py não tem caminho fixo de npm global', !checar.includes('.npm-global'));

process.exitCode = falhas ? 1 : 0;
