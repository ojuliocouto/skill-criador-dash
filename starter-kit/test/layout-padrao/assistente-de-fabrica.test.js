// O que o ASSISTENTE mostra e grava quando o modelo é o DE FÁBRICA. Mesmo papel dos outros
// arquivos desta pasta: é aqui, e só aqui, que a suíte confere o que vem de fábrica. Os testes
// da biblioteca (test/*.test.js) usam modelo próprio e não podem cair quando a pessoa
// personaliza o layout. Só mude este arquivo quando a decisão for mudar o padrão pra todo mundo.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resumoDaArea } from '../../public/assets/js/lib/area-resumo.js';
import { montarConfig, montarPersonalizacao } from '../../public/assets/js/lib/config-do-painel.js';
import { template as marketing } from '../../public/assets/js/templates/marketing.js';
import { template as vendas } from '../../public/assets/js/templates/vendas.js';

const base = {
  id: null, name: '  Estúdio  ', domain: 'marketing',
  source: { type: 'csv', data: 'Data,Investimento\n01/07/2026,10' },
  colMap: { data: 'Data', investimento: 'Investimento', canal: null },
  accent: '#2563eb', accent2: '', logo: '', logoFundo: '', heroMetric: '', hiddenMetrics: [],
  goal: '', labels: {}, storage: '',
};

test('resumoDaArea: modelo com abas lista os números da primeira aba e o nome de cada aba', () => {
  const r = resumoDaArea(marketing);
  assert.deepEqual(r.numeros, ['Investimento', 'Leads', 'CPL', 'Conversões', 'CPA', 'Receita', 'ROAS']);
  assert.deepEqual(r.abas, ['Visão geral', 'Canais', 'Evolução', 'Funil', 'Dados']);
  assert.deepEqual(r.blocos, []);
});

test('resumoDaArea: modelo sem abas lista os números e o título de cada bloco', () => {
  const r = resumoDaArea(vendas);
  assert.deepEqual(r.numeros, ['Faturamento', 'Negócios', 'Vendas ganhas', 'Taxa de conversão', 'Ticket médio']);
  assert.deepEqual(r.abas, []);
  assert.deepEqual(r.blocos, [
    'Faturamento no tempo', 'Funil de fechamento', 'Ranking por vendedor', 'Ranking por produto', 'Dados linha a linha',
  ]);
});

test('montarConfig: meta vazia, zero ou texto não vira meta; a meta segue o número em destaque', () => {
  for (const goal of ['', '0', '-5', 'abc', null]) assert.equal(montarConfig({ ...base, goal }, marketing).goal, undefined);
  assert.deepEqual(montarConfig({ ...base, goal: '1.500' }, marketing).goal, { metricKey: 'leads', value: 1500 });
  assert.deepEqual(montarConfig({ ...base, goal: 120 }, marketing).goal, { metricKey: 'leads', value: 120 });
});

test('montarPersonalizacao: mesmo contrato de antes, agora neste módulo', () => {
  assert.deepEqual(montarPersonalizacao(marketing, 'CPA', ['CTR']), { heroMetric: 'CPA', hiddenMetrics: ['CTR'] });
  assert.deepEqual(montarPersonalizacao(marketing, 'leads', []), {});
});
