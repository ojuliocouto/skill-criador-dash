// D6: o assistente guarda o período da meta (goal.periodo) com padrão mensal, e painel antigo reaberto
// no assistente não muda de comportamento sem a pessoa escolher.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarConfig } from '../public/assets/js/lib/config-do-painel.js';
import { prefillStateFromConfig } from '../public/assets/js/config-wizard.js';
import { getTemplate } from '../public/assets/js/templates/index.js';
import { fonteDoAssistente } from './apoio/fonte-do-assistente.js';

const tpl = getTemplate('marketing');
const base = { name: 'Clínica', domain: 'marketing', source: { type: 'csv', data: 'a' }, colMap: {}, accent: '#0F5C6E', heroMetric: 'leads' };

test('montarConfig: meta com período grava goal.periodo', () => {
  const c = montarConfig({ ...base, goal: '400', goalPeriodo: 'mensal' }, tpl);
  assert.deepEqual(c.goal, { metricKey: 'leads', value: 400, periodo: 'mensal' });
});

test('montarConfig: período vazio (painel antigo) não grava periodo', () => {
  const c = montarConfig({ ...base, goal: '400', goalPeriodo: '' }, tpl);
  assert.deepEqual(c.goal, { metricKey: 'leads', value: 400 });
});

test('montarConfig: período desconhecido é descartado, nunca vai pro servidor', () => {
  const c = montarConfig({ ...base, goal: '400', goalPeriodo: 'anual' }, tpl);
  assert.equal('periodo' in c.goal, false);
});

test('prefill: painel antigo com meta e sem periodo volta como "como estava" (vazio), não vira mensal', () => {
  const s = prefillStateFromConfig({}, { goal: { metricKey: 'leads', value: 400 } });
  assert.equal(s.goalPeriodo, '');
});

test('prefill: período salvo volta; sem meta, o padrão é mensal', () => {
  assert.equal(prefillStateFromConfig({}, { goal: { metricKey: 'leads', value: 400, periodo: 'semanal' } }).goalPeriodo, 'semanal');
  assert.equal(prefillStateFromConfig({}, {}).goalPeriodo, 'mensal');
});

test('assistente: a escolha do período aparece junto da meta, com o padrão mensal e a explicação', () => {
  const src = fonteDoAssistente();
  assert.ok(src.includes('PERIODOS_DA_META'), 'o passo usa a lista de períodos');
  assert.ok(src.includes('goalPeriodo'), 'o passo grava goalPeriodo');
  assert.ok(src.includes('Essa meta vale para'), 'a pergunta diz o que a escolha significa');
});
