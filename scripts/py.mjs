#!/usr/bin/env node
/**
 * Chama o Python 3 desta máquina, seja qual for o nome dele (python3, python ou py -3).
 *
 * Por que existe: no Windows quase nunca existe `python3`; no macOS e no Linux quase
 * sempre existe. O roteiro da skill usa SEMPRE este lançador, então o mesmo comando
 * funciona nos três sistemas e ninguém precisa descobrir o nome do Python na mão.
 * O Node é pré-requisito da skill de qualquer jeito (wrangler e testes), por isso o
 * lançador é .mjs e não um script de shell.
 *
 * Uso:
 *   node py.mjs gate-etapas.py --perfil dash ...   # nome solto: procura na pasta scripts/ da skill
 *   node py.mjs /caminho/qualquer.py args          # caminho completo também vale
 *   node py.mjs -m unittest ...                    # tudo que o python aceita passa direto
 *   node py.mjs --descobrir                        # só diz qual comando e versão foram achados
 *
 * Ele também liga o modo UTF-8 do Python (PYTHONUTF8=1): sem isso o Python do Windows lê e
 * escreve texto em cp1252 e quebra em qualquer acento.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MENOR_MINOR = 8; // Python 3.8 em diante

// Ordem de tentativa: python3 (macOS/Linux), python (Windows e alguns Linux), py -3 (Windows).
const CANDIDATOS = [['python3'], ['python'], ['py', '-3']];

function testar(cmd) {
  // Roda de verdade e confere que é um Python 3: o "python3" falso da loja do Windows
  // existe no PATH, mas só abre a loja e não responde.
  try {
    const r = spawnSync(cmd[0], [...cmd.slice(1), '-c',
      'import sys;print("%d.%d"%sys.version_info[:2])'],
    { encoding: 'utf8', timeout: 15000, windowsHide: true });
    if (r.status !== 0) return null;
    const m = /^(\d+)\.(\d+)/.exec((r.stdout || '').trim());
    if (!m || Number(m[1]) !== 3 || Number(m[2]) < MENOR_MINOR) return null;
    return `${m[1]}.${m[2]}`;
  } catch (_) {
    return null;
  }
}

function acharPython() {
  for (const cmd of CANDIDATOS) {
    const versao = testar(cmd);
    if (versao) return { cmd, versao };
  }
  return null;
}

function ajudaInstalar() {
  return [
    'Não achei o Python 3 (versão 3.8 ou mais nova) nesta máquina.',
    'Instale o do seu sistema e abra um terminal NOVO:',
    '  Windows:        winget install -e --id Python.Python.3.12   (ou baixe em https://www.python.org/downloads/ e marque "Add python.exe to PATH")',
    '  macOS:          brew install python   (ou o instalador em https://www.python.org/downloads/macos/)',
    '  Debian/Ubuntu:  sudo apt install python3',
    '  Fedora:         sudo dnf install python3',
    'Depois confira com: node "' + join(AQUI, 'py.mjs') + '" --descobrir',
  ].join('\n');
}

function principal() {
  const args = process.argv.slice(2);
  const py = acharPython();
  if (args[0] === '--descobrir') {
    if (!py) { console.error(ajudaInstalar()); process.exit(127); }
    console.log(`Python ${py.versao} (comando: ${py.cmd.join(' ')}; sistema: ${process.platform})`);
    process.exit(0);
  }
  if (!py) { console.error(ajudaInstalar()); process.exit(127); }
  if (args.length === 0) { console.error('uso: node py.mjs <script.py> [argumentos]  (ou --descobrir)'); process.exit(2); }

  if (/\.py$/i.test(args[0]) && !isAbsolute(args[0]) && !existsSync(args[0])) {
    const naPasta = join(AQUI, args[0]);
    if (existsSync(naPasta)) args[0] = naPasta;
  }
  const env = { ...process.env };
  if (!env.PYTHONUTF8) env.PYTHONUTF8 = '1';
  if (!env.PYTHONIOENCODING) env.PYTHONIOENCODING = 'utf-8';
  const r = spawnSync(py.cmd[0], [...py.cmd.slice(1), ...args], { stdio: 'inherit', env, windowsHide: true });
  if (r.error) { console.error('Falha ao iniciar o Python: ' + r.error.message); process.exit(126); }
  process.exit(r.status === null ? 1 : r.status);
}

principal();
