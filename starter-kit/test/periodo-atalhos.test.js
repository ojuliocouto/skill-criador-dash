// Efeito 4 (período em um clique): a conta da faixa de datas de cada atalho, ajustada aos dados
// que existem (o "hoje" é o último dia COM dado, não o calendário), e o reconhecimento de qual
// atalho corresponde a um período já escolhido.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ATALHOS, faixaDoAtalho, atalhoAtivo, atalhosHtml } from '../public/assets/js/lib/periodo-atalhos.js';

const DADOS = { min: '2026-08-06', max: '2026-10-04' };

test('ATALHOS: Hoje, 7 dias, 30 dias, Este mês, Tudo e Personalizado, nessa ordem, ids únicos', () => {
  assert.deepEqual(ATALHOS.map((a) => a.rotulo), ['Hoje', '7 dias', '30 dias', 'Este mês', 'Tudo', 'Personalizado']);
  assert.equal(new Set(ATALHOS.map((a) => a.id)).size, ATALHOS.length);
});

test('faixaDoAtalho: cada atalho conta a partir do último dia que tem dado', () => {
  assert.deepEqual(faixaDoAtalho('hoje', DADOS), { from: '2026-10-04', to: '2026-10-04' });
  assert.deepEqual(faixaDoAtalho('7d', DADOS), { from: '2026-09-28', to: '2026-10-04' });
  assert.deepEqual(faixaDoAtalho('30d', DADOS), { from: '2026-09-05', to: '2026-10-04' });
  assert.deepEqual(faixaDoAtalho('mes', DADOS), { from: '2026-10-01', to: '2026-10-04' });
  assert.deepEqual(faixaDoAtalho('tudo', DADOS), { from: null, to: null });
});

test('faixaDoAtalho: atravessa mês e ano bissexto sem errar a conta', () => {
  assert.equal(faixaDoAtalho('7d', { min: '2024-01-01', max: '2024-03-03' }).from, '2024-02-26');
  assert.equal(faixaDoAtalho('7d', { min: '2026-01-01', max: '2026-03-03' }).from, '2026-02-25');
  assert.equal(faixaDoAtalho('30d', { min: '2025-01-01', max: '2026-01-10' }).from, '2025-12-12');
  assert.equal(faixaDoAtalho('mes', { min: '2026-01-01', max: '2026-03-15' }).from, '2026-03-01');
});

test('faixaDoAtalho: nunca começa antes do primeiro dia com dado', () => {
  const curto = { min: '2026-10-02', max: '2026-10-04' };
  assert.deepEqual(faixaDoAtalho('7d', curto), { from: '2026-10-02', to: '2026-10-04' });
  assert.deepEqual(faixaDoAtalho('30d', curto), { from: '2026-10-02', to: '2026-10-04' });
  assert.deepEqual(faixaDoAtalho('mes', { min: '2026-09-20', max: '2026-10-04' }), { from: '2026-10-01', to: '2026-10-04' });
  assert.deepEqual(faixaDoAtalho('mes', { min: '2026-10-03', max: '2026-10-04' }), { from: '2026-10-03', to: '2026-10-04' });
});

test('faixaDoAtalho: personalizado não muda a faixa; sem dados ou atalho desconhecido devolve null', () => {
  assert.equal(faixaDoAtalho('personalizado', DADOS), null);
  assert.equal(faixaDoAtalho('7d', { min: null, max: null }), null);
  assert.equal(faixaDoAtalho('7d', null), null);
  assert.equal(faixaDoAtalho('xyz', DADOS), null);
});

test('atalhoAtivo: reconhece o atalho de uma faixa pronta; o resto é personalizado', () => {
  assert.equal(atalhoAtivo({ from: null, to: null }, DADOS), 'tudo');
  assert.equal(atalhoAtivo({ from: '2026-08-06', to: '2026-10-04' }, DADOS), 'tudo');
  assert.equal(atalhoAtivo({ from: '2026-10-04', to: '2026-10-04' }, DADOS), 'hoje');
  assert.equal(atalhoAtivo({ from: '2026-09-28', to: '2026-10-04' }, DADOS), '7d');
  assert.equal(atalhoAtivo({ from: '2026-09-05', to: '2026-10-04' }, DADOS), '30d');
  assert.equal(atalhoAtivo({ from: '2026-10-01', to: '2026-10-04' }, DADOS), 'mes');
  assert.equal(atalhoAtivo({ from: '2026-09-10', to: '2026-09-12' }, DADOS), 'personalizado');
  assert.equal(atalhoAtivo({ from: '2026-09-10', to: null }, DADOS), 'personalizado');
});

test('atalhosHtml: radiogrupo com um item marcado, todos com nome legível e o campo digitado como Personalizado', () => {
  const html = atalhosHtml('30d');
  assert.match(html, /role="radiogroup"/);
  assert.equal([...html.matchAll(/role="radio"/g)].length, 6);
  assert.equal([...html.matchAll(/aria-checked="true"/g)].length, 1);
  assert.match(html, /data-atalho="30d"[^>]*aria-checked="true"/);
  for (const r of ['Hoje', '7 dias', '30 dias', 'Este mês', 'Tudo', 'Personalizado']) assert.ok(html.includes(`>${r}<`), r);
  assert.ok(!/\u2014/.test(html));
});

test('setas do teclado trocam o atalho sem puxar a página de volta ao topo (foco com preventScroll)', async () => {
  const { readFileSync } = await import('node:fs');
  const js = readFileSync(new URL('../public/assets/js/lib/periodo-atalhos.js', import.meta.url), 'utf8');
  assert.match(js, /prox\.focus\(\{ preventScroll: true \}\)/);
});
