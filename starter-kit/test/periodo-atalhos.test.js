// Efeito 4 (período em um clique): a conta da faixa de datas de cada atalho e o reconhecimento de qual
// atalho corresponde a um período já escolhido.
//
// 3.9 (achado 5 da auditoria de 25/10/2026): "Hoje" é o dia do CALENDÁRIO, não o último dia com dado.
// Antes, um painel com dado até 04/10 mostrava em 25/10 os números de 04/10 sob o botão "Hoje", com o
// selo "Atualizado agora". Agora a faixa conta de hoje; se a fonte parou, o período fica vazio e o
// painel diz qual é o último dado (lib/estado-vazio.js e lib/atualizado.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ATALHOS, faixaDoAtalho, atalhoAtivo, atalhosHtml, hojeLocal } from '../public/assets/js/lib/periodo-atalhos.js';

const HOJE = '2026-10-25';
const DADOS = { min: '2026-08-06', max: '2026-10-04', hoje: HOJE };

test('ATALHOS: Hoje, 7 dias, 30 dias, Este mês, Tudo e Personalizado, nessa ordem, ids únicos', () => {
  assert.deepEqual(ATALHOS.map((a) => a.rotulo), ['Hoje', '7 dias', '30 dias', 'Este mês', 'Tudo', 'Personalizado']);
  assert.equal(new Set(ATALHOS.map((a) => a.id)).size, ATALHOS.length);
});

test('faixaDoAtalho: cada atalho conta a partir de HOJE no calendário, mesmo com o dado parado em 04/10', () => {
  assert.deepEqual(faixaDoAtalho('hoje', DADOS), { from: '2026-10-25', to: '2026-10-25' });
  assert.deepEqual(faixaDoAtalho('7d', DADOS), { from: '2026-10-19', to: '2026-10-25' });
  assert.deepEqual(faixaDoAtalho('30d', DADOS), { from: '2026-09-26', to: '2026-10-25' });
  assert.deepEqual(faixaDoAtalho('mes', DADOS), { from: '2026-10-01', to: '2026-10-25' });
  assert.deepEqual(faixaDoAtalho('tudo', DADOS), { from: null, to: null });
});

test('faixaDoAtalho: sem `hoje` nos limites, usa a data de hoje do aparelho', () => {
  const semHoje = { min: '2020-01-01', max: '2020-01-02' };
  assert.deepEqual(faixaDoAtalho('hoje', semHoje), { from: hojeLocal(), to: hojeLocal() });
});

test('hojeLocal: data do calendário do aparelho (não UTC) em ISO', () => {
  // 25/10/2026 às 23h30 em São Paulo ainda é dia 25, mesmo já sendo 26 em UTC.
  const tarde = new Date(2026, 9, 25, 23, 30);
  assert.equal(hojeLocal(tarde), '2026-10-25');
  assert.match(hojeLocal(), /^\d{4}-\d{2}-\d{2}$/);
});

test('faixaDoAtalho: atravessa mês e ano bissexto sem errar a conta', () => {
  assert.equal(faixaDoAtalho('7d', { min: '2024-01-01', max: '2024-03-03', hoje: '2024-03-03' }).from, '2024-02-26');
  assert.equal(faixaDoAtalho('7d', { min: '2026-01-01', max: '2026-03-03', hoje: '2026-03-03' }).from, '2026-02-25');
  assert.equal(faixaDoAtalho('30d', { min: '2025-01-01', max: '2026-01-10', hoje: '2026-01-10' }).from, '2025-12-12');
  assert.equal(faixaDoAtalho('mes', { min: '2026-01-01', max: '2026-03-15', hoje: '2026-03-15' }).from, '2026-03-01');
});

test('faixaDoAtalho: a janela é a do calendário, mesmo que os dados comecem depois (o período não encolhe calado)', () => {
  const curto = { min: '2026-10-22', max: '2026-10-25', hoje: HOJE };
  assert.deepEqual(faixaDoAtalho('7d', curto), { from: '2026-10-19', to: '2026-10-25' });
  assert.deepEqual(faixaDoAtalho('mes', curto), { from: '2026-10-01', to: '2026-10-25' });
});

test('faixaDoAtalho: personalizado não muda a faixa; sem dados ou atalho desconhecido devolve null', () => {
  assert.equal(faixaDoAtalho('personalizado', DADOS), null);
  assert.equal(faixaDoAtalho('7d', { min: null, max: null, hoje: HOJE }), null);
  assert.equal(faixaDoAtalho('7d', null), null);
  assert.equal(faixaDoAtalho('xyz', DADOS), null);
});

test('atalhoAtivo: reconhece o atalho de uma faixa pronta; o resto é personalizado', () => {
  assert.equal(atalhoAtivo({ from: null, to: null }, DADOS), 'tudo');
  assert.equal(atalhoAtivo({ from: '2026-08-06', to: '2026-10-04' }, DADOS), 'tudo');
  assert.equal(atalhoAtivo({ from: '2026-10-25', to: '2026-10-25' }, DADOS), 'hoje');
  assert.equal(atalhoAtivo({ from: '2026-10-19', to: '2026-10-25' }, DADOS), '7d');
  assert.equal(atalhoAtivo({ from: '2026-09-26', to: '2026-10-25' }, DADOS), '30d');
  assert.equal(atalhoAtivo({ from: '2026-10-01', to: '2026-10-25' }, DADOS), 'mes');
  assert.equal(atalhoAtivo({ from: '2026-10-04', to: '2026-10-04' }, DADOS), 'personalizado', 'o último dia com dado não é mais "Hoje"');
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
