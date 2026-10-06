// A config que o assistente manda pro servidor e a que a prévia ao vivo desenha saem da MESMA
// função (montarConfig): o que a pessoa vê na prévia é o que vai ser gravado.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { montarConfig, montarPersonalizacao } from '../public/assets/js/lib/config-do-painel.js';
import { prefillStateFromConfig } from '../public/assets/js/config-wizard.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';
import { validarColMap } from '../functions/lib/colmap-shape.mjs';
import { validarLabels } from '../functions/lib/labels-shape.mjs';
import { validarPersonalizacao } from '../functions/lib/personalizacao-shape.mjs';

const base = {
  id: null, name: '  Estúdio  ', domain: 'marketing',
  source: { type: 'csv', data: 'Data,Investimento\n01/07/2026,10' },
  colMap: { data: 'Data', investimento: 'Investimento', canal: null },
  accent: '#2563eb', accent2: '', logo: '', logoFundo: '', heroMetric: '', hiddenMetrics: [],
  goal: '', labels: {}, storage: '',
};

test('montarConfig: o mínimo sai limpo, sem campo opcional vazio', () => {
  const c = montarConfig(base, marketing);
  assert.deepEqual(c, {
    name: 'Estúdio', domain: 'marketing', source: base.source, colMap: base.colMap, accent: '#2563eb',
  });
});

test('montarConfig: opcionais só entram quando a pessoa escolheu', () => {
  const c = montarConfig({
    ...base, id: 'meu-painel', accent2: '#0e9f6e', logo: 'data:image/png;base64,AAAA', logoFundo: 'escuro',
    heroMetric: 'CPA', hiddenMetrics: ['CTR'], goal: '80', labels: { conversoes: 'Alunas novas', leads: 'Leads' },
    storage: 'd1',
  }, marketing);
  assert.equal(c.id, 'meu-painel');
  assert.equal(c.accent2, '#0e9f6e');
  assert.equal(c.logo, 'data:image/png;base64,AAAA');
  assert.equal(c.logoFundo, 'escuro');
  assert.equal(c.heroMetric, 'CPA');
  assert.deepEqual(c.hiddenMetrics, ['CTR']);
  assert.deepEqual(c.goal, { metricKey: 'CPA', value: 80 });
  assert.deepEqual(c.labels, { conversoes: 'Alunas novas' }, 'nome igual ao padrão não é gravado');
  assert.equal(c.storage, undefined, 'arquivo CSV não tem histórico');
  assert.equal(montarConfig({ ...base, source: { type: 'sheets', url: 'https://x' }, storage: 'd1' }, marketing).storage, 'd1');
});

test('montarConfig: fundo do logo só vai junto com um logo', () => {
  assert.equal(montarConfig({ ...base, logoFundo: 'escuro' }, marketing).logoFundo, undefined);
});

test('montarConfig: não inclui senha (a senha é tratada à parte, fora da prévia)', () => {
  const c = montarConfig({ ...base, senha: 'segredo', auth: { hash: 'x' } }, marketing);
  assert.equal(c.auth, undefined);
  assert.equal(c.senha, undefined);
});

test('montarConfig: o que sai passa nas validações do servidor', () => {
  const c = montarConfig({ ...base, heroMetric: 'CPA', hiddenMetrics: ['CTR'], labels: { conversoes: 'Alunas novas' } }, marketing);
  assert.equal(validarColMap(c.domain, c.colMap, ['Data', 'Investimento']), null);
  assert.equal(validarLabels(c), null);
  assert.equal(validarPersonalizacao(c), null);
});

test('reconfigurar: nomes trocados, meta, fundo do logo e histórico voltam carregados', () => {
  const st = prefillStateFromConfig({}, {
    id: 'a', domain: 'marketing', labels: { conversoes: 'Alunas novas', ruim: '<b>' },
    goal: { metricKey: 'leads', value: 2500 }, logo: 'data:image/png;base64,AAAA', logoFundo: 'escuro', storage: 'd1',
    protected: true,
  });
  assert.deepEqual(st.labels, { conversoes: 'Alunas novas' });
  assert.equal(st.goal, '2500');
  assert.equal(st.logoFundo, 'escuro');
  assert.equal(st.storage, 'd1');
  assert.equal(st.protegido, true);
  const vazio = prefillStateFromConfig({}, { id: 'b', domain: 'vendas' });
  assert.deepEqual(vazio.labels, {});
  assert.equal(vazio.goal, '');
  assert.equal(vazio.logoFundo, '');
  assert.equal(vazio.protegido, false);
});
