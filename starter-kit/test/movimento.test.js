// Movimento (microinteração) do assistente e do painel. A parte pura: contagem dos indicadores,
// deslize do marcador da aba, direção da troca de passo e o desligamento com
// prefers-reduced-motion. Mais as travas de CSS: só transform, opacity e stroke-dashoffset
// animam, as curvas e durações são tokens, e nada de enfeite (gradiente, brilho, vidro, loop).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  suavizar, valorDaContagem, textoDaContagem, transformDoMarcador, duracao, direcaoDoPasso, DURACAO,
} from '../public/assets/js/lib/movimento.js';
import { render as renderKpi } from '../public/assets/js/widgets/kpi.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => readFileSync(join(raiz, 'public', rel), 'utf8');
const mainCss = ler('assets/css/main.css');
const assistenteCss = ler('assets/css/assistente.css');
const MARCA = '/* MOVIMENTO */';
const blocoDeMovimento = mainCss.slice(mainCss.indexOf(MARCA));

test('suavizar: começa em 0, termina em 1, cresce sempre e desacelera no fim', () => {
  assert.equal(suavizar(0), 0);
  assert.equal(suavizar(1), 1);
  assert.equal(suavizar(-3), 0);
  assert.equal(suavizar(7), 1);
  assert.ok(suavizar(0.5) > 0.5, 'saída rápida, chegada suave');
  let anterior = 0;
  for (let t = 0.1; t <= 1.0001; t += 0.1) { const v = suavizar(t); assert.ok(v >= anterior); anterior = v; }
});

test('valorDaContagem: no fim é EXATAMENTE o valor final; no meio fica entre zero e ele', () => {
  assert.equal(valorDaContagem(1234.56, 1), 1234.56);
  assert.equal(valorDaContagem(1234.56, 2), 1234.56);
  assert.equal(valorDaContagem(1234.56, 0), 0);
  const meio = valorDaContagem(1000, 0.4);
  assert.ok(meio > 0 && meio < 1000);
  assert.equal(valorDaContagem(-50, 1), -50);
  assert.ok(Number.isNaN(valorDaContagem(NaN, 0.5)), 'valor que não é número não vira zero inventado');
});

test('textoDaContagem: formata o quadro no formato do indicador; inteiro não mostra casa decimal no caminho', () => {
  assert.equal(textoDaContagem(370, 'integer', 1), '370');
  assert.match(textoDaContagem(370, 'integer', 0.3), /^\d+$/);
  assert.match(textoDaContagem(1520.5, 'currency', 0.5), /^R\$\s[\d.]+,\d{2}$/);
  assert.equal(textoDaContagem(1520.5, 'currency', 1), textoDaContagem(1520.5, 'currency', 5));
});

test('transformDoMarcador: leva o marcador da aba antiga até a nova só com transform', () => {
  const de = { left: 10, top: 5, width: 100, height: 30 };
  const para = { left: 130, top: 5, width: 50, height: 30 };
  assert.equal(transformDoMarcador(de, para), 'translate(-120px, 0px) scale(2, 1)');
  assert.equal(transformDoMarcador(para, para), 'none');
  assert.equal(transformDoMarcador(null, para), 'none');
  assert.equal(transformDoMarcador(de, { left: 0, top: 0, width: 0, height: 0 }), 'none');
});

test('duracao: com movimento reduzido tudo vira zero (estado final na hora)', () => {
  assert.equal(duracao(200, false), 200);
  assert.equal(duracao(200, true), 0);
  assert.equal(duracao(DURACAO.entrada, true), 0);
});

test('durações dentro da régua: interação de 120 a 220 ms, entrada até 400 ms', () => {
  assert.ok(DURACAO.toque >= 120 && DURACAO.toque <= 220);
  assert.ok(DURACAO.troca >= 120 && DURACAO.troca <= 220);
  assert.ok(DURACAO.entrada <= 400);
  assert.ok(DURACAO.contagem <= 700);
});

test('direcaoDoPasso: avançar vai pra frente, voltar vai pra trás', () => {
  assert.equal(direcaoDoPasso(1, 2), 'frente');
  assert.equal(direcaoDoPasso(4, 3), 'tras');
  assert.equal(direcaoDoPasso(2, 2), 'frente');
});

test('indicador: o valor final está no HTML desde o início; a contagem é só visual', () => {
  const html = renderKpi({ label: 'Leads', format: 'integer' }, 2510);
  assert.match(html, /kpi__value">2\.510</, 'texto final já no DOM');
  assert.match(html, /data-conta-valor="2510"/);
  assert.match(html, /data-conta-formato="integer"/);
  const semDado = renderKpi({ label: 'Leads', format: 'integer', unmapped: true }, 0);
  assert.ok(!semDado.includes('data-conta-valor'), 'indicador sem coluna não conta de zero a zero');
});

// ---------- travas de CSS ----------

test('main.css define curvas e durações como tokens', () => {
  for (const token of ['--ease-saida', '--ease-vai-volta', '--dur-toque', '--dur-troca', '--dur-entrada']) {
    assert.ok(new RegExp(`${token}\\s*:`).test(mainCss), `falta o token ${token}`);
  }
  assert.ok(blocoDeMovimento.length > 200, 'bloco de movimento marcado no main.css');
});

function propriedadesAnimadas(css) {
  const achadas = new Set();
  for (const m of css.matchAll(/transition(?:-property)?\s*:\s*([^;}]+)/g)) {
    for (const parte of m[1].split(',')) {
      const prop = parte.trim().split(/\s+/)[0];
      if (prop && !/^(none|var\(|\d)/.test(prop)) achadas.add(prop);
    }
  }
  for (const m of css.matchAll(/@keyframes\s+[\w-]+\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)) {
    for (const d of m[1].matchAll(/([a-z-]+)\s*:/g)) achadas.add(d[1]);
  }
  return [...achadas].sort();
}

test('só transform, opacity e stroke-dashoffset animam (assistente e bloco de movimento do painel)', () => {
  const permitidas = new Set(['transform', 'opacity', 'stroke-dashoffset']);
  for (const [nome, css] of [['assistente.css', assistenteCss], ['bloco MOVIMENTO do main.css', blocoDeMovimento]]) {
    const fora = propriedadesAnimadas(css).filter((p) => !permitidas.has(p));
    assert.deepEqual(fora, [], `${nome} anima propriedade fora da lista: ${fora.join(', ')}`);
  }
});

test('nada de enfeite: sem gradiente, brilho, vidro nem animação em loop sem fim de fundo', () => {
  for (const [nome, css] of [['assistente.css', assistenteCss], ['bloco MOVIMENTO do main.css', blocoDeMovimento]]) {
    assert.ok(!/gradient\(/.test(css), `${nome}: gradiente`);
    assert.ok(!/backdrop-filter|blur\(/.test(css), `${nome}: vidro ou desfoque`);
    assert.ok(!/text-transform:\s*uppercase/i.test(css), `${nome}: caixa alta`);
    assert.ok(!/letter-spacing:\s*0?\.\d+em|letter-spacing:\s*[1-9]/.test(css), `${nome}: letra espaçada`);
    const loops = [...css.matchAll(/([^{}]+)\{[^{}]*infinite[^{}]*\}/g)].map((m) => m[1].trim());
    assert.ok(loops.every((s) => /is-loading|carregando/.test(s)), `${nome}: loop só no botão carregando, achei em ${loops.join(' | ')}`);
  }
});

test('movimento reduzido: a regra global continua desligando transição e animação', () => {
  assert.match(mainCss, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*\s*\{[^}]*transition:\s*none !important;[^}]*animation:\s*none !important;/);
});

test('estado final é o estilo base: nenhum seletor de movimento esconde conteúdo fora de @keyframes', () => {
  const semKeyframes = (css) => css.replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  for (const [nome, css] of [['assistente.css', assistenteCss], ['bloco MOVIMENTO do main.css', blocoDeMovimento]]) {
    const regras = [...semKeyframes(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => /opacity:\s*0(?![.\d])/.test(m[2]))
      .map((m) => m[1].trim())
      // Exceções: enfeite que só aparece no estado escolhido (contorno do cartão, check da amostra de cor).
      .filter((sel) => !/sai-|fantasma|\[hidden\]|is-saindo|::after|::before|__amostra svg/.test(sel));
    assert.deepEqual(regras, [], `${nome}: opacity 0 fora de keyframes em ${regras.join(' | ')}`);
  }
});
