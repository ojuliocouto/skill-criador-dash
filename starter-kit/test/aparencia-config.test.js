// Campos novos de aparência saindo do assistente (montarConfig) e voltando pra ele ao editar
// (prefillStateFromConfig). Só vai pra config o que a pessoa mudou em relação ao padrão.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { montarConfig } from '../public/assets/js/lib/config-do-painel.js';
import { prefillStateFromConfig } from '../public/assets/js/config-wizard.js';
import { validarAparencia } from '../functions/lib/aparencia-shape.mjs';
import { modeloComAbas, estadoBase } from './apoio/modelo-de-teste.js';

test('montarConfig: sem mexer nos campos novos, a config sai igual à de antes', () => {
  const c = montarConfig(estadoBase, modeloComAbas);
  for (const campo of ['tema', 'saudacao', 'saudacaoLigada', 'fundoAnimado']) assert.equal(c[campo], undefined, campo);
  const padroes = montarConfig({ ...estadoBase, tema: 'auto', saudacao: '   ', saudacaoLigada: true, fundoAnimado: true }, modeloComAbas);
  assert.deepEqual(padroes, c, 'valor padrão não é gravado');
});

test('montarConfig: modo claro ou escuro escolhido entra; auto e lixo não', () => {
  assert.equal(montarConfig({ ...estadoBase, tema: 'escuro' }, modeloComAbas).tema, 'escuro');
  assert.equal(montarConfig({ ...estadoBase, tema: 'claro' }, modeloComAbas).tema, 'claro');
  assert.equal(montarConfig({ ...estadoBase, tema: 'dark' }, modeloComAbas).tema, undefined);
});

test('montarConfig: quem o painel cumprimenta entra limpo; texto que o servidor recusaria fica de fora', () => {
  assert.equal(montarConfig({ ...estadoBase, saudacao: '  Carla  ' }, modeloComAbas).saudacao, 'Carla');
  assert.equal(montarConfig({ ...estadoBase, saudacao: '<b>Carla</b>' }, modeloComAbas).saudacao, undefined);
  assert.equal(montarConfig({ ...estadoBase, saudacao: 'x'.repeat(80) }, modeloComAbas).saudacao.length, 40);
});

test('montarConfig: desligar a saudação ou o movimento do fundo grava false', () => {
  const c = montarConfig({ ...estadoBase, saudacaoLigada: false, fundoAnimado: false }, modeloComAbas);
  assert.equal(c.saudacaoLigada, false);
  assert.equal(c.fundoAnimado, false);
});

test('montarConfig: tudo que sai passa na validação do servidor', () => {
  const c = montarConfig({ ...estadoBase, tema: 'escuro', saudacao: 'time do Studio Equilíbrio', saudacaoLigada: false, fundoAnimado: false }, modeloComAbas);
  assert.equal(validarAparencia(c), null);
});

test('reconfigurar: os campos novos voltam carregados; painel antigo volta com os padrões', () => {
  const st = prefillStateFromConfig({}, { id: 'a', domain: 'marketing', tema: 'escuro', saudacao: 'Carla', saudacaoLigada: false, fundoAnimado: false });
  assert.equal(st.tema, 'escuro');
  assert.equal(st.saudacao, 'Carla');
  assert.equal(st.saudacaoLigada, false);
  assert.equal(st.fundoAnimado, false);
  const antigo = prefillStateFromConfig({}, { id: 'b', domain: 'vendas' });
  assert.equal(antigo.tema, 'auto');
  assert.equal(antigo.saudacao, '');
  assert.equal(antigo.saudacaoLigada, true, 'saudação nasce ligada');
  assert.equal(antigo.fundoAnimado, true, 'fundo nasce ligado');
  assert.equal(prefillStateFromConfig({}, { id: 'c', tema: 'lixo', saudacao: '<b>' }).tema, 'auto');
  assert.equal(prefillStateFromConfig({}, { id: 'c', tema: 'lixo', saudacao: '<b>' }).saudacao, '');
});
