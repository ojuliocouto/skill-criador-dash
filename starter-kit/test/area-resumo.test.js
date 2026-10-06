// Passo 1 do assistente ("O que você quer acompanhar?"): cada área diz o que a pessoa vai ver
// no painel. A lista sai do TEMPLATE (abas, blocos e números reais), nunca de texto solto que
// desatualiza quando alguém mexe no modelo. O passo 2 usa colunasEsperadas pra dizer o que a
// planilha precisa ter.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resumoDaArea, colunasEsperadas, listaEmFrase } from '../public/assets/js/lib/area-resumo.js';
import { templates } from '../public/assets/js/templates/index.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';
import { template as vendas } from '../public/assets/js/templates/vendas.js';

test('resumoDaArea: sai do template (mexeu no modelo, mexeu na lista)', () => {
  const falso = {
    metrics: [{ key: 'a', label: 'Alfa' }, { key: 'b', label: 'Beta' }],
    layout: [
      { widget: 'kpi', props: { metricKey: 'b' } },
      { widget: 'ranking', props: { title: 'Beta por loja' } },
      { widget: 'ranking', props: { title: 'Beta por loja' } },
      { widget: 'funnel', props: {} },
    ],
  };
  const r = resumoDaArea(falso);
  assert.deepEqual(r.numeros, ['Beta']);
  assert.deepEqual(r.blocos, ['Beta por loja', 'Funil'], 'título repetido entra uma vez; bloco sem título usa o nome do tipo');
});

test('resumoDaArea: template ausente ou vazio não quebra', () => {
  assert.deepEqual(resumoDaArea(null), { numeros: [], abas: [], blocos: [] });
  assert.deepEqual(resumoDaArea({}), { numeros: [], abas: [], blocos: [] });
});

test('toda área do registro tem descrição em palavra comum e algo pra listar', () => {
  for (const [id, tpl] of Object.entries(templates)) {
    assert.equal(typeof tpl.descricao, 'string', `${id}: template.descricao`);
    assert.ok(tpl.descricao.trim().length >= 20, `${id}: descrição curta demais`);
    assert.ok(!/dom[ií]nio|widget|m[ée]trica|slot|dashboard/i.test(tpl.descricao), `${id}: descrição com jargão`);
    assert.ok(!tpl.descricao.includes(String.fromCharCode(8212)), `${id}: descrição com travessão`);
    const r = resumoDaArea(tpl);
    assert.ok(r.numeros.length >= 1, `${id}: pelo menos um número`);
    assert.ok(r.abas.length + r.blocos.length >= 1, `${id}: pelo menos uma aba ou bloco`);
  }
});

test('colunasEsperadas: separa obrigatórias e opcionais pelos campos do template', () => {
  const c = colunasEsperadas(marketing);
  assert.deepEqual(c.obrigatorias.map((s) => s.label), ['Data', 'Investimento']);
  assert.deepEqual(c.opcionais.map((s) => s.label), ['Canal', 'Impressões', 'Cliques', 'Leads', 'Conversões', 'Receita']);
  assert.deepEqual(colunasEsperadas(null), { obrigatorias: [], opcionais: [] });
});

test('listaEmFrase: junta com vírgula e "e"', () => {
  assert.equal(listaEmFrase([]), '');
  assert.equal(listaEmFrase(['A']), 'A');
  assert.equal(listaEmFrase(['A', 'B']), 'A e B');
  assert.equal(listaEmFrase(['A', 'B', 'C']), 'A, B e C');
});
