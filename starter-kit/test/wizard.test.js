import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateRequired, idDaQueryString, prefillStateFromConfig } from '../public/assets/js/config-wizard.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';

test('validateRequired: tudo ok quando todos os required têm coluna', () => {
  const colMap = {
    data: 'Data',
    investimento: 'Investimento',
    canal: null, // opcional, sem coluna, tudo bem
  };
  const missing = validateRequired(marketing.slots, colMap);
  assert.deepEqual(missing, []);
});

test('validateRequired: aponta required faltando (null e vazio)', () => {
  const colMap = {
    data: null, // required, faltando
    investimento: '   ', // required, string vazia após trim => faltando
    canal: 'Origem',
  };
  const missing = validateRequired(marketing.slots, colMap);
  const keys = missing.map((m) => m.key).sort();
  assert.deepEqual(keys, ['data', 'investimento']);
  // Carrega o label para exibição.
  assert.ok(missing.every((m) => typeof m.label === 'string' && m.label.length > 0));
});

test('validateRequired: colMap ausente conta todos os required como faltando', () => {
  const missing = validateRequired(marketing.slots, undefined);
  const reqCount = marketing.slots.filter((s) => s.required).length;
  assert.equal(missing.length, reqCount);
});

test('validateRequired: slots vazio não quebra', () => {
  assert.deepEqual(validateRequired([], { qualquer: 'x' }), []);
  assert.deepEqual(validateRequired(undefined, undefined), []);
});

// ---------------------------------------------------------------------------
// P7 RODADA 3: o botao "Reconfigurar" aponta pra /config.html?id=<id>, mas o
// wizard sempre ignorava o parametro e abria um dashboard novo em branco.
// idDaQueryString + prefillStateFromConfig sao a parte PURA (sem DOM/rede) do
// fix; o bootstrap que as usa so e exercitavel manualmente/Playwright (mesmo
// padrao de render/actions neste arquivo, que tambem nao tem teste unitario
// direto).
// ---------------------------------------------------------------------------

test('idDaQueryString: le o id da query string de config.html?id=...', () => {
  assert.equal(idDaQueryString('?id=dash-abc123'), 'dash-abc123');
  assert.equal(idDaQueryString('id=dash-abc123'), 'dash-abc123');
  assert.equal(idDaQueryString('?id=meu-dash&outro=x'), 'meu-dash');
});

test('idDaQueryString: sem id, vazio ou so espaco -> null (dashboard novo)', () => {
  assert.equal(idDaQueryString(''), null);
  assert.equal(idDaQueryString('?outro=x'), null);
  assert.equal(idDaQueryString('?id='), null);
  assert.equal(idDaQueryString('?id=%20'), null);
  assert.equal(idDaQueryString(undefined), null);
  assert.equal(idDaQueryString(null), null);
});

test('prefillStateFromConfig: prefila domain/name/colMap/source/accent/id a partir da config carregada', () => {
  const stateAtual = {
    step: 1, id: 'dash-abc', domain: null, source: null, dataset: null,
    colMap: {}, name: '', accent: '#6d28d9', logo: '', accent2: '', connecting: false,
  };
  const cfg = {
    id: 'dash-abc',
    name: 'Financeiro Julho',
    domain: 'financeiro',
    accent: '#ff0000',
    accent2: '#00ff00',
    logo: 'https://x/logo.png',
    colMap: { data: 'Data', entrada: 'Entrada' },
    source: { type: 'csv', data: 'Data;Entrada\n01/01;100' },
  };
  const novo = prefillStateFromConfig(stateAtual, cfg);
  assert.equal(novo.id, 'dash-abc');
  assert.equal(novo.domain, 'financeiro');
  assert.equal(novo.name, 'Financeiro Julho');
  assert.equal(novo.accent, '#ff0000');
  assert.equal(novo.accent2, '#00ff00');
  assert.equal(novo.logo, 'https://x/logo.png');
  assert.deepEqual(novo.colMap, { data: 'Data', entrada: 'Entrada' });
  assert.deepEqual(novo.source, { type: 'csv', data: 'Data;Entrada\n01/01;100' });
  // Pura: nao muta o state recebido.
  assert.equal(stateAtual.domain, null, 'nao muta o state original');
});

test('prefillStateFromConfig: campos ausentes na config caem em default seguro (nao quebra)', () => {
  const stateAtual = { id: null, domain: null, source: { type: 'csv', data: 'x' }, name: 'antigo', accent: '#111' };
  const novo = prefillStateFromConfig(stateAtual, {});
  assert.equal(novo.id, null);
  assert.equal(novo.domain, null);
  assert.equal(novo.name, 'antigo', 'sem name na config, preserva o que ja tinha');
  assert.equal(novo.accent, '#111', 'sem accent na config, preserva o que ja tinha');
  assert.deepEqual(novo.colMap, {}, 'sem colMap na config, vira objeto vazio (nunca undefined)');
  assert.equal(novo.accent2, '');
  assert.equal(novo.logo, '');
  assert.deepEqual(novo.source, { type: 'csv', data: 'x' }, 'sem source na config, preserva o que ja tinha');
});

test('prefillStateFromConfig: config null/undefined nao quebra, devolve o state praticamente intacto', () => {
  const stateAtual = { id: null, domain: 'vendas', name: 'X', accent: '#222', source: null, colMap: { a: 'b' } };
  assert.deepEqual(prefillStateFromConfig(stateAtual, null).domain, 'vendas');
  assert.deepEqual(prefillStateFromConfig(stateAtual, undefined).name, 'X');
});
