// Efeito 5 (meta batida): quando a barra da meta cruza 100% acontece um marco, UMA vez. A parte
// com conta: detectar o cruzamento (e não repetir enquanto a meta segue batida). 3.9: o marco é
// discreto (barra e selo); o cartão não é tingido (trava em test/visual-39.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { cruzouMeta, TEMPOS_DO_MARCO, DURACAO_TOTAL_DO_MARCO } from '../public/assets/js/lib/meta-batida.js';
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

test('tempos do marco: o clarão espera a barra chegar e tudo termina em menos de 1,3 s', () => {
  assert.ok(TEMPOS_DO_MARCO.claraoAtraso >= 400);
  assert.ok(TEMPOS_DO_MARCO.claraoAtraso + TEMPOS_DO_MARCO.clarao <= 1300);
  assert.ok(TEMPOS_DO_MARCO.seloAtraso + TEMPOS_DO_MARCO.selo <= 1300);
});

test('kpi com meta batida carrega o selo no HTML (estado final já no DOM); sem meta batida não tem selo', () => {
  const batida = renderKpi({ label: 'Leads', format: 'integer', goal: { pct: 1.7, text: '170% da meta' } }, 2555);
  assert.match(batida, /class="kpi__selo"/);
  assert.match(batida, />Meta batida</);
  const aberta = renderKpi({ label: 'Leads', format: 'integer', goal: { pct: 0.43, text: '43% da meta' } }, 639);
  assert.ok(!/kpi__selo/.test(aberta));
});

test('travas do CSS: selo e clarão só animam por transform e opacity, sem gradiente, sem brilho', () => {
  const css = readFileSync(join(raiz, 'public/assets/css/efeitos.css'), 'utf8');
  const bloco = css.slice(css.indexOf('/* EFEITO 5'));
  assert.ok(bloco.length > 200);
  assert.ok(!/gradient\(|blur\(|filter:|box-shadow:[^;]*(0 0 \d+px)/.test(bloco));
});

test('marco: a duração total é a do último trecho a terminar', () => {
  const t = TEMPOS_DO_MARCO;
  const fins = [t.claraoAtraso + t.clarao, t.seloAtraso + t.selo];
  assert.ok(fins.every(Number.isFinite), 'faltam tempos do clarão ou do selo');
  assert.equal(DURACAO_TOTAL_DO_MARCO, Math.max(...fins));
  assert.ok(DURACAO_TOTAL_DO_MARCO >= 800 && DURACAO_TOTAL_DO_MARCO <= 1300, `total ${DURACAO_TOTAL_DO_MARCO} ms`);
});

test('marco: a ordem é barra fecha, clarão na barra, selo entra', () => {
  const t = TEMPOS_DO_MARCO;
  assert.ok(t.claraoAtraso < t.seloAtraso);
});

test('CSS do marco: clarão na barra e selo; nenhuma camada sobre o cartão', () => {
  const css = readFileSync(join(raiz, 'public/assets/css/efeitos.css'), 'utf8');
  const bloco = css.slice(css.indexOf('/* EFEITO 5'), css.indexOf('/* EFEITO 6'));
  for (const classe of ['.kpi__goal-clarao', '.kpi__selo']) assert.ok(bloco.includes(classe), `falta ${classe}`);
  assert.ok(!/kpi__onda/.test(bloco), 'a luz do cartão saiu do desenho');
  assert.ok(!/opacity: 0;/.test(bloco), 'camadas do marco começam visíveis no CSS; o 0 vem do primeiro quadro da animação');
});

test('JS do marco: clareia a barra, traz o selo e anima só transform e opacity', () => {
  const js = readFileSync(join(raiz, 'public/assets/js/lib/meta-batida.js'), 'utf8');
  for (const trecho of ['kpi__goal-clarao', '.kpi__selo']) assert.ok(js.includes(trecho), `falta ${trecho}`);
  assert.ok(!/filter|blur\(|box-shadow|background:/.test(js.replace(/\/\/.*$/gm, '')), 'nada de filter, blur, sombra ou fundo animado');
});
