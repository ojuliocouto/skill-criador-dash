/**
 * hash-senha.mjs dá o MESMO hash que o navegador (public/assets/js/lib/auth.js, sha256Hex) e que o servidor espera.
 * Uso: node <dir-da-skill>/scripts/test-hash-senha.cjs
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let falhas = 0;
const checa = (nome, ok, det = '') => { console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}${det ? ' -> ' + det : ''}`); if (!ok) falhas++; };
const rodar = (env, entrada) => spawnSync(process.execPath, [path.join(__dirname, 'hash-senha.mjs')], { env: { ...process.env, CD_SENHA: undefined, ...env }, input: entrada, encoding: 'utf8' });

(async () => {
  const { sha256Hex } = await import(pathToFileURL(path.join(__dirname, '..', 'starter-kit', 'public', 'assets', 'js', 'lib', 'auth.js')).href);
  for (const senha of ['abc', 'Pilates-9xK2', 'açaí com acento 123', 'senha com espaço e "aspas"']) {
    const r = rodar({ CD_SENHA: senha }, '');
    checa(`CD_SENHA="${senha}" dá o hash do navegador`, r.status === 0 && r.stdout.trim() === await sha256Hex(senha), r.stderr.slice(0, 100));
  }
  checa('vetor conhecido: "abc"', rodar({ CD_SENHA: 'abc' }, '').stdout.trim() === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const viaEntrada = rodar({}, 'Pilates-9xK2\n');
  checa('pela entrada padrão (com a quebra de linha final) dá o mesmo hash', viaEntrada.status === 0 && viaEntrada.stdout.trim() === await sha256Hex('Pilates-9xK2'), viaEntrada.stderr.slice(0, 100));
  const sem = rodar({}, '');
  checa('sem senha nenhuma: sai com código 2 e explica como passar a senha', sem.status === 2 && /CD_SENHA/.test(sem.stderr) && sem.stdout === '', `código ${sem.status}`);
  checa('a saída é só o hash (64 caracteres hexadecimais)', /^[0-9a-f]{64}\n$/.test(rodar({ CD_SENHA: 'x' }, '').stdout));
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error('FALHA inesperada:', e.message); process.exit(1); });
