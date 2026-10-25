// 3.9 (achado 3 da auditoria de 25/10/2026): a seta do indicador compara o período escolhido com o
// período ANTERIOR do mesmo tamanho, como Stripe, Vercel Analytics e PostHog. Antes ela comparava as
// duas metades do próprio período ("vs. início") e, em 7 dias, mostrava Leads ▼30,12% numa semana em
// que os leads subiram 2,32%.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { comparacaoDoPeriodo, rotuloDaComparacao } from '../public/assets/js/lib/periodo-anterior.js';

const DADOS = { min: '2026-08-26', max: '2026-10-25' };

test('comparacaoDoPeriodo: 7 dias contra os 7 dias imediatamente antes', () => {
  const c = comparacaoDoPeriodo({ from: '2026-10-19', to: '2026-10-25' }, DADOS);
  assert.deepEqual(c.atual, { from: '2026-10-19', to: '2026-10-25' });
  assert.deepEqual(c.anterior, { from: '2026-10-12', to: '2026-10-18' });
  assert.equal(c.dias, 7);
  assert.equal(c.rotulo, 'vs. 7 dias anteriores');
  assert.equal(c.titulo, 'Comparado com 12/10/2026 a 18/10/2026');
});

test('comparacaoDoPeriodo: um dia contra o dia anterior', () => {
  const c = comparacaoDoPeriodo({ from: '2026-10-25', to: '2026-10-25' }, DADOS);
  assert.deepEqual(c.anterior, { from: '2026-10-24', to: '2026-10-24' });
  assert.equal(c.rotulo, 'vs. dia anterior');
  assert.equal(c.titulo, 'Comparado com 24/10/2026');
});

test('comparacaoDoPeriodo: "Tudo" (sem data) não tem período anterior', () => {
  assert.equal(comparacaoDoPeriodo({ from: null, to: null }, DADOS), null);
  assert.equal(comparacaoDoPeriodo({}, DADOS), null);
  assert.equal(comparacaoDoPeriodo(null, DADOS), null);
});

test('comparacaoDoPeriodo: período anterior que começa antes do primeiro dado não compara (sem seta)', () => {
  // 30 dias (26/09 a 25/10): o anterior vai de 27/08 a 25/09 e cabe. 46 dias (10/09 a 25/10) não cabe.
  assert.ok(comparacaoDoPeriodo({ from: '2026-09-26', to: '2026-10-25' }, DADOS));
  assert.equal(comparacaoDoPeriodo({ from: '2026-09-10', to: '2026-10-25' }, DADOS), null);
});

test('comparacaoDoPeriodo: dias depois do último dado não entram (hoje ainda sem dado não vira queda)', () => {
  // Dado até 24/10, "7 dias" de 19 a 25/10: compara os 6 dias que têm dado com os 6 dias antes.
  const c = comparacaoDoPeriodo({ from: '2026-10-19', to: '2026-10-25' }, { min: '2026-08-26', max: '2026-10-24' });
  assert.deepEqual(c.atual, { from: '2026-10-19', to: '2026-10-24' });
  assert.deepEqual(c.anterior, { from: '2026-10-13', to: '2026-10-18' });
  assert.equal(c.rotulo, 'vs. 6 dias anteriores');
});

test('comparacaoDoPeriodo: período inteiro depois do último dado não compara', () => {
  assert.equal(comparacaoDoPeriodo({ from: '2026-10-25', to: '2026-10-25' }, { min: '2026-08-06', max: '2026-10-04' }), null);
});

test('comparacaoDoPeriodo: só De ou só Até usa a ponta dos dados', () => {
  const soDe = comparacaoDoPeriodo({ from: '2026-10-20', to: null }, DADOS);
  assert.deepEqual(soDe.atual, { from: '2026-10-20', to: '2026-10-25' });
  assert.deepEqual(soDe.anterior, { from: '2026-10-14', to: '2026-10-19' });
  // Só Até: começa no primeiro dado, então não há nada antes.
  assert.equal(comparacaoDoPeriodo({ from: null, to: '2026-09-30' }, DADOS), null);
});

test('comparacaoDoPeriodo: atravessa mês e ano bissexto', () => {
  const c = comparacaoDoPeriodo({ from: '2024-03-01', to: '2024-03-07' }, { min: '2024-01-01', max: '2024-03-31' });
  assert.deepEqual(c.anterior, { from: '2024-02-23', to: '2024-02-29' });
});

test('comparacaoDoPeriodo: sem datas nos dados não compara', () => {
  assert.equal(comparacaoDoPeriodo({ from: '2026-10-19', to: '2026-10-25' }, { min: null, max: null }), null);
  assert.equal(comparacaoDoPeriodo({ from: '2026-10-19', to: '2026-10-25' }, null), null);
});

test('rotuloDaComparacao: dia anterior, N dias anteriores', () => {
  assert.equal(rotuloDaComparacao(1), 'vs. dia anterior');
  assert.equal(rotuloDaComparacao(7), 'vs. 7 dias anteriores');
  assert.equal(rotuloDaComparacao(30), 'vs. 30 dias anteriores');
});
