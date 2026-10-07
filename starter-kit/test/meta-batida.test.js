// Efeito 5 (meta batida): quando a barra da meta cruza 100% acontece um marco, UMA vez. A parte
// com conta: detectar o cruzamento (e não repetir enquanto a meta segue batida) e o raio da onda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { cruzouMeta, raioDaOnda, TEMPOS_DO_MARCO, DURACAO_TOTAL_DO_MARCO } from '../public/assets/js/lib/meta-batida.js';
import { render as renderKpi } from '../public/assets/js/widgets/kpi.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

test('cruzouMeta: só quando estava abaixo de 100% e passou a 100% ou mais', () => {
  assert.equal(cruzouMeta(0.42, 1.0), true);
  assert.equal(cruzouMeta(0.99, 1.7), true);
  assert.equal(cruzouMeta(0, 1), true);
});

test('cruzouMeta: não repete enquanto a meta continua batida, nem dispara quando cai', () => {
  assert.equal(cruzouMeta(1.0, 1.0), false);
  assert.equal(cruzouMeta(1.7, 1.2), false);
  assert.equal(cruzouMeta(1.2, 0.5), false);
  assert.equal(cruzouMeta(0.3, 0.8), false);
});

test('cruzouMeta: sem ponto de partida (primeira carga) ou valor inválido não dispara', () => {
  assert.equal(cruzouMeta(null, 1.5), false);
  assert.equal(cruzouMeta(undefined, 1.5), false);
  assert.equal(cruzouMeta(NaN, 1.5), false);
  assert.equal(cruzouMeta(0.4, NaN), false);
  assert.equal(cruzouMeta(0.4, null), false);
});

test('sequência de trocas de período: o marco aparece uma vez por cruzamento, não por redesenho', () => {
  const pcts = [0.4, 1.0, 1.0, 1.7, 0.43, 0.43, 1.0, 1.0];
  let anterior = null;
  const disparos = [];
  pcts.forEach((p, i) => { if (cruzouMeta(anterior, p)) disparos.push(i); anterior = p; });
  assert.deepEqual(disparos, [1, 6]);
});

test('raioDaOnda: o círculo cobre o cartão inteiro, mesmo saindo do canto mais longe', () => {
  const caixa = { w: 400, h: 200 };
  const r = raioDaOnda(caixa, { x: 0, y: 0 });
  assert.ok(Math.abs(r - Math.hypot(400, 200)) < 1e-9);
  const meio = raioDaOnda(caixa, { x: 200, y: 100 });
  assert.ok(Math.abs(meio - Math.hypot(200, 100)) < 1e-9);
  for (const o of [{ x: 12, y: 150 }, { x: 390, y: 20 }, { x: 200, y: 100 }]) {
    const raio = raioDaOnda(caixa, o);
    for (const [cx, cy] of [[0, 0], [400, 0], [0, 200], [400, 200]]) assert.ok(raio >= Math.hypot(cx - o.x, cy - o.y) - 1e-9);
  }
});

test('tempos do marco: a onda espera a barra chegar e tudo termina em menos de 2 s', () => {
  assert.ok(TEMPOS_DO_MARCO.ondaAtraso >= 400);
  assert.ok(TEMPOS_DO_MARCO.ondaAtraso + TEMPOS_DO_MARCO.onda < 2000);
  assert.ok(TEMPOS_DO_MARCO.seloAtraso + TEMPOS_DO_MARCO.selo < 2000);
});

test('kpi com meta batida carrega o selo no HTML (estado final já no DOM); sem meta batida não tem selo', () => {
  const batida = renderKpi({ label: 'Leads', format: 'integer', goal: { pct: 1.7, text: '170% da meta' } }, 2555);
  assert.match(batida, /class="kpi__selo"/);
  assert.match(batida, />Meta batida</);
  const aberta = renderKpi({ label: 'Leads', format: 'integer', goal: { pct: 0.43, text: '43% da meta' } }, 639);
  assert.ok(!/kpi__selo/.test(aberta));
});

test('travas do CSS: onda e selo só animam por transform e opacity, sem gradiente, sem brilho', () => {
  const css = readFileSync(join(raiz, 'public/assets/css/efeitos.css'), 'utf8');
  const bloco = css.slice(css.indexOf('/* EFEITO 5'));
  assert.ok(bloco.length > 200);
  assert.ok(!/gradient\(|blur\(|filter:|box-shadow:[^;]*(0 0 \d+px)/.test(bloco));
});

// ---------------------------------------------------------------- marco mais forte (3.7.0)

test('marco: a duração total fica entre 1,6 e 2,4 s e é a do último trecho a terminar', () => {
  const t = TEMPOS_DO_MARCO;
  const fins = [t.ondaAtraso + t.onda, t.claraoAtraso + t.clarao, t.pulsoAtraso + t.pulso, t.seloAtraso + t.selo];
  assert.ok(fins.every(Number.isFinite), 'faltam tempos do clarão, do pulso ou do selo');
  assert.equal(DURACAO_TOTAL_DO_MARCO, Math.max(...fins));
  assert.ok(DURACAO_TOTAL_DO_MARCO >= 1600 && DURACAO_TOTAL_DO_MARCO <= 2400, `total ${DURACAO_TOTAL_DO_MARCO} ms`);
});

test('marco: a ordem é barra, clarão na barra, cartão acende, número pulsa, selo entra com peso', () => {
  const t = TEMPOS_DO_MARCO;
  assert.ok(t.claraoAtraso <= t.ondaAtraso + 100, 'o clarão da barra e a luz do cartão começam juntos');
  assert.ok(t.ondaAtraso < t.pulsoAtraso && t.pulsoAtraso < t.seloAtraso);
});

test('CSS do marco: luz que cobre o cartão, faixa que atravessa e clarão na barra, sem restos da onda antiga', () => {
  const css = readFileSync(join(raiz, 'public/assets/css/efeitos.css'), 'utf8');
  const bloco = css.slice(css.indexOf('/* EFEITO 5'), css.indexOf('/* EFEITO 6'));
  for (const classe of ['.kpi__onda-luz', '.kpi__onda-passa', '.kpi__onda-faixa', '.kpi__onda-frente', '.kpi__goal-clarao']) assert.ok(bloco.includes(classe), `falta ${classe}`);
  assert.ok(!/onda-disco|onda-anel/.test(bloco), 'a onda em anel saiu do desenho');
  assert.match(bloco, /\.kpi__onda-luz[^}]*inset: 0/, 'a luz cobre o cartão inteiro');
  assert.ok(!/opacity: 0;/.test(bloco), 'camadas do marco começam visíveis no CSS; o 0 vem do primeiro quadro da animação');
});

test('JS do marco: acende o cartão, passa a faixa, clareia a barra, pulsa o número e anima só transform e opacity', () => {
  const js = readFileSync(join(raiz, 'public/assets/js/lib/meta-batida.js'), 'utf8');
  for (const trecho of ['kpi__onda-luz', 'kpi__onda-passa', 'kpi__goal-clarao', '.kpi__value', '.kpi__selo']) assert.ok(js.includes(trecho), `falta ${trecho}`);
  assert.ok(!/filter|blur\(|box-shadow|background:/.test(js.replace(/\/\/.*$/gm, '')), 'nada de filter, blur, sombra ou fundo animado');
});
