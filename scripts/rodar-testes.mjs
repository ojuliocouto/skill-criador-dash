#!/usr/bin/env node
/**
 * Roda a suíte de testes da skill num comando só, igual em Windows, macOS e Linux.
 *
 *   node <dir-da-skill>/scripts/rodar-testes.mjs                 # tudo: npm test do starter-kit + todos os test-*.py e test-*.cjs
 *   node <dir-da-skill>/scripts/rodar-testes.mjs --so-portateis  # só o que não precisa de navegador
 *   node <dir-da-skill>/scripts/rodar-testes.mjs --lista         # mostra o que rodaria, sem rodar
 *   node <dir-da-skill>/scripts/rodar-testes.mjs --filtro gate   # só os arquivos cujo nome contém "gate"
 *
 * Sem curinga de shell (o Windows não expande `test-*.py`): a pasta é lida com readdirSync. Os .py rodam pelo
 * py.mjs (acha o Python da máquina e liga o UTF-8). O `npm test` do starter-kit roda como `node --test` direto,
 * sem passar por .cmd nem shell. Sai com código diferente de zero se QUALQUER teste falhar.
 *
 * Teste que não tem como rodar nesta máquina se declara pulado imprimindo "PULADO: <motivo>" e saindo com 0: o
 * resumo conta e mostra o motivo de cada um, pular nunca é passar calado. No CI (variável CI) pulo por falta de
 * Playwright, de um dos motores (Firefox, WebKit) ou do axe-core conta como FALHA: lá eles existem de propósito.
 *
 * PORTÁTIL = roda só com Node e Python, sem instalar mais nada. Fica fora quem abre navegador (Playwright com
 * Chromium). A lista está em PRECISAM, com o motivo de cada arquivo; teste novo entra como portátil por padrão.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = dirname(AQUI);
const KIT = join(RAIZ, 'starter-kit');
const TETO_POR_TESTE_MS = 20 * 60 * 1000;

const PRECISAM = {
  'test-barra-topo-no-navegador.cjs': 'navegador (mede a barra do topo ao rolar)',
  'test-acessibilidade.cjs': 'navegador + axe-core (axe nas telas, teclado, nomes; npm i -g axe-core@4.13.0)',
  'test-celular-no-navegador.cjs': 'navegador (mede o celular em 390 e 360)',
  'test-efeitos-no-navegador.cjs': 'navegador (mede os efeitos de movimento)',
  'test-grupo-no-navegador.cjs': 'navegador (grupo com abas: corrida entre abas e aba com senha)',
  'test-gravar-video-integracao.cjs': 'navegador (grava vídeo de verdade)',
  'test-minigrafico-no-navegador.cjs': 'navegador (mede a faixa de indicadores)',
  'test-navegadores.cjs': 'Chromium, Firefox e WebKit do Playwright (a matriz: Safari, iPhone, Pixel; npx playwright install chromium firefox webkit)',
  'test-passe-de-gosto-no-navegador.cjs': 'navegador (mutantes do passe de gosto)',
  'test-prova-dash.cjs': 'navegador (o gate de tela abre as páginas de teste)',
  'test-resolver-playwright.cjs': 'Playwright instalado (acha o pacote pelo npm root -g)',
  'test-senha-nos-scripts.cjs': 'navegador (prova-dash, passe de gosto e gravador entram num painel com senha)',
};

const achar = () => readdirSync(AQUI).filter((n) => /^test-.+\.(py|cjs)$/.test(n)).sort();

function plano(arquivos, soPortateis) {
  // O npm test do starter-kit vem primeiro: é a suíte grande e a mais rápida de falhar.
  const itens = [{ nome: 'npm test (starter-kit)', prog: process.execPath, argv: ['--test', 'test/*.test.js', 'test/layout-padrao/*.test.js'], cwd: KIT }];
  for (const a of arquivos) {
    if (soPortateis && PRECISAM[a]) continue;
    itens.push(a.endsWith('.py')
      ? { nome: a, prog: process.execPath, argv: [join(AQUI, 'py.mjs'), join(AQUI, a)], cwd: AQUI }
      : { nome: a, prog: process.execPath, argv: [join(AQUI, a)], cwd: AQUI });
  }
  return itens;
}

function main() {
  const args = process.argv.slice(2);
  const soPortateis = args.includes('--so-portateis');
  const soLista = args.includes('--lista');
  const iF = args.indexOf('--filtro');
  const filtro = iF >= 0 ? args[iF + 1] : null;

  let itens = plano(achar(), soPortateis);
  if (filtro) itens = itens.filter((i) => i.nome.includes(filtro));
  if (!itens.length) { console.error('Nenhum teste encontrado.'); process.exit(2); }

  console.log(`Sistema: ${process.platform} | Node ${process.version} | ${itens.length} item(ns)${soPortateis ? ' (só portáteis)' : ''}`);
  if (soLista) {
    for (const i of itens) console.log(`  ${i.nome}${PRECISAM[i.nome] ? '   [precisa: ' + PRECISAM[i.nome] + ']' : ''}`);
    process.exit(0);
  }

  const env = { ...process.env, PYTHONUTF8: process.env.PYTHONUTF8 || '1', PYTHONIOENCODING: process.env.PYTHONIOENCODING || 'utf-8' };
  const resultados = [];
  for (const it of itens) {
    console.log(`\n===== ${it.nome} =====`);
    const t0 = Date.now();
    const r = spawnSync(it.prog, it.argv, { encoding: 'utf8', env, cwd: it.cwd, timeout: TETO_POR_TESTE_MS, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
    const saida = `${r.stdout || ''}${r.stderr || ''}`;
    // npm test imprime milhares de linhas: mostra só o resumo dele; os demais mostram tudo.
    const mostrar = it.nome.startsWith('npm test') ? saida.split('\n').filter((l) => /^# (tests|suites|pass|fail|cancelled|skipped)|^not ok|^# Subtest.*not ok/.test(l)).join('\n') + '\n' : saida;
    process.stdout.write(mostrar.endsWith('\n') || mostrar === '' ? mostrar : mostrar + '\n');
    const segundos = ((Date.now() - t0) / 1000).toFixed(1);
    const pulado = [...new Set((saida.match(/PULADO:[^\n']*/g) || []).map((l) => l.trim()))];
    let status = r.status;
    if (r.error) { status = r.error.code === 'ETIMEDOUT' ? 124 : 126; console.log(`ERRO ao rodar: ${r.error.message}`); }
    if (status === null) status = 1;
    console.log(`----- ${it.nome}: saída ${status} em ${segundos}s${pulado.length ? ` (${pulado.length} PULADO)` : ''}`);
    resultados.push({ nome: it.nome, status, segundos, pulado });
  }

  const estrito = Boolean(process.env.CI) && !soPortateis;
  for (const r of resultados) {
    if (estrito && r.status === 0 && r.pulado.some((l) => /playwright|axe-core/i.test(l))) {
      r.status = 3;
      console.log(`FALHA em modo CI: ${r.nome} pulou por falta de Playwright (ou do axe-core ou de um motor), e no CI eles têm que existir.`);
    }
  }
  const falhas = resultados.filter((r) => r.status !== 0);
  const pulados = resultados.filter((r) => r.pulado.length);
  console.log('\n===== RESUMO =====');
  for (const r of resultados) console.log(`${r.status === 0 ? 'ok   ' : 'FALHA'} ${String(r.status).padStart(3)}  ${r.segundos.padStart(7)}s  ${r.nome}`);
  if (pulados.length) {
    console.log('\nPulados (nada foi provado nestes trechos):');
    for (const r of pulados) for (const l of r.pulado) console.log(`  ${r.nome}: ${l}`);
  }
  console.log(`\n${resultados.length - falhas.length} de ${resultados.length} com saída 0; ${falhas.length} com falha; ${pulados.length} com trecho pulado.`);
  process.exit(falhas.length ? 1 : 0);
}

main();
