// Abas DENTRO de um dashboard (template.tabs). Diferente do grupo (vários dashboards num link,
// que usa ?tab=): aqui é o mesmo painel dividido em seções, e a aba ativa mora no hash da URL
// (#canais) pra dar pra mandar o link de uma aba. Template sem `tabs` segue pelo `layout`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  abasDoTemplate, abaDoHash, resolverAba, layoutDaAba, proximaAba, barraDeAbasHtml, idDoBotaoDaAba,
} from '../public/assets/js/lib/abas.js';
import { planLayout, resolveActiveTab } from '../public/assets/js/dashboard.js';
import { templates } from '../public/assets/js/templates/index.js';

const kpi = (k) => ({ widget: 'kpi', props: { metricKey: k } });
const TPL = {
  layout: [kpi('a'), { widget: 'table', props: {} }],
  tabs: [
    { id: 'visao-geral', label: 'Visão geral', layout: [kpi('a'), kpi('b')] },
    { id: 'canais', label: 'Canais', layout: [{ widget: 'ranking', props: {} }] },
    { id: 'dados', label: 'Dados', layout: [{ widget: 'table', props: {} }] },
  ],
};

test('abasDoTemplate: template sem tabs não tem abas', () => {
  assert.deepEqual(abasDoTemplate({ layout: [] }), []);
  assert.deepEqual(abasDoTemplate({ tabs: [] }), []);
  assert.deepEqual(abasDoTemplate({ tabs: 'x' }), []);
  assert.deepEqual(abasDoTemplate(null), []);
});

test('abasDoTemplate: devolve id, rótulo e layout; descarta aba sem id ou sem layout', () => {
  const abas = abasDoTemplate({
    tabs: [
      { id: 'a', label: 'A', layout: [kpi('x')] },
      { label: 'sem id', layout: [kpi('x')] },
      { id: 'sem-layout', label: 'Sem layout' },
      { id: 'b', layout: [kpi('y')] },
      { id: 'a', label: 'Repetida', layout: [kpi('z')] },
    ],
  });
  assert.deepEqual(abas.map((t) => t.id), ['a', 'b']);
  assert.equal(abas[1].label, 'b', 'sem rótulo, usa o id');
  assert.equal(abas[0].label, 'A', 'id repetido: vale a primeira');
});

test('abaDoHash: tira o # e decodifica; hash vazio ou quebrado vira null', () => {
  assert.equal(abaDoHash('#canais'), 'canais');
  assert.equal(abaDoHash('canais'), 'canais');
  assert.equal(abaDoHash('#vis%C3%A3o'), 'visão');
  assert.equal(abaDoHash('#'), null);
  assert.equal(abaDoHash(''), null);
  assert.equal(abaDoHash(null), null);
  assert.equal(abaDoHash('#%E0%A4%A'), null, 'sequência inválida não derruba a página');
});

test('resolverAba: a pedida, se existir; senão a primeira; sem abas, null', () => {
  const abas = abasDoTemplate(TPL);
  assert.equal(resolverAba(abas, 'canais'), 'canais');
  assert.equal(resolverAba(abas, 'inexistente'), 'visao-geral');
  assert.equal(resolverAba(abas, null), 'visao-geral');
  assert.equal(resolverAba([], 'canais'), null);
});

test('resolveActiveTab do grupo continua com o mesmo contrato', () => {
  assert.equal(resolveActiveTab([{ id: 'mkt' }, { id: 'vendas' }], 'vendas'), 'vendas');
  assert.equal(resolveActiveTab([{ label: 'sem id' }, { id: 'ok' }], null), 'ok');
  assert.equal(resolveActiveTab([], 'x'), null);
});

test('layoutDaAba: template com abas devolve o layout da aba ativa', () => {
  assert.deepEqual(layoutDaAba(TPL, 'canais'), TPL.tabs[1].layout);
  assert.deepEqual(layoutDaAba(TPL, 'nao-existe'), TPL.tabs[0].layout, 'aba desconhecida cai na primeira');
  assert.deepEqual(layoutDaAba(TPL, null), TPL.tabs[0].layout);
});

test('layoutDaAba: template SEM abas devolve o layout de sempre, intacto', () => {
  const semAbas = { layout: [kpi('a'), { widget: 'table', props: {} }] };
  assert.equal(layoutDaAba(semAbas, 'canais'), semAbas.layout);
  assert.equal(layoutDaAba(semAbas, null), semAbas.layout);
  assert.deepEqual(layoutDaAba({}, null), []);
});

test('domínios sem abas (vendas, financeiro, estoque, suporte) renderizam pelo layout, como antes', () => {
  for (const id of ['vendas', 'financeiro', 'estoque', 'suporte']) {
    const tpl = templates[id];
    assert.deepEqual(abasDoTemplate(tpl), [], `${id} não declara abas`);
    assert.equal(layoutDaAba(tpl, 'canais'), tpl.layout, `${id}: layout intacto`);
    assert.ok(planLayout(layoutDaAba(tpl, null)).length > 0);
  }
});

test('proximaAba: setas andam e dão a volta; Home e End vão pras pontas', () => {
  const abas = abasDoTemplate(TPL);
  assert.equal(proximaAba(abas, 'visao-geral', 'ArrowRight'), 'canais');
  assert.equal(proximaAba(abas, 'dados', 'ArrowRight'), 'visao-geral', 'da última volta pra primeira');
  assert.equal(proximaAba(abas, 'visao-geral', 'ArrowLeft'), 'dados', 'da primeira vai pra última');
  assert.equal(proximaAba(abas, 'canais', 'ArrowLeft'), 'visao-geral');
  assert.equal(proximaAba(abas, 'canais', 'Home'), 'visao-geral');
  assert.equal(proximaAba(abas, 'canais', 'End'), 'dados');
  assert.equal(proximaAba(abas, 'canais', 'Enter'), null, 'outra tecla não troca de aba');
  assert.equal(proximaAba(abas, 'canais', 'a'), null);
  assert.equal(proximaAba([], 'canais', 'ArrowRight'), null);
});

test('barraDeAbasHtml: papéis ARIA de abas e só a ativa no caminho do Tab', () => {
  const html = barraDeAbasHtml(abasDoTemplate(TPL), 'canais', 'dashbody');
  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-label="Seções do painel"/);
  assert.equal((html.match(/role="tab"/g) || []).length, 3);
  assert.equal((html.match(/aria-selected="true"/g) || []).length, 1);
  assert.equal((html.match(/aria-selected="false"/g) || []).length, 2);
  assert.match(html, /<button[^>]*id="aba-canais"[^>]*aria-selected="true"[^>]*tabindex="0"/);
  assert.match(html, /<button[^>]*id="aba-dados"[^>]*aria-selected="false"[^>]*tabindex="-1"/);
  assert.equal((html.match(/aria-controls="dashbody"/g) || []).length, 3);
  assert.match(html, /data-aba="visao-geral"/);
  assert.match(html, />Visão geral</);
  assert.equal(idDoBotaoDaAba('canais'), 'aba-canais');
});

test('barraDeAbasHtml: escapa rótulo e id; sem abas não desenha barra', () => {
  const html = barraDeAbasHtml([{ id: 'a"b', label: '<b>x</b>', layout: [] }], 'a"b', 'dashbody');
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.ok(!/id="aba-a"b"/.test(html));
  assert.equal(barraDeAbasHtml([], null, 'dashbody'), '');
});
