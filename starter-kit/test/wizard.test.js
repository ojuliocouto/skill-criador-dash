import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  validateRequired, idDaQueryString, prefillStateFromConfig, colMapAoTrocarDominio,
} from '../public/assets/js/config-wizard.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';
import { template as vendas } from '../public/assets/js/templates/vendas.js';
import { autoMap } from '../public/assets/js/lib/automap.js';
import { validarColMap } from '../functions/lib/colmap-shape.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wizardSrc = readFileSync(join(__dirname, '../public/assets/js/config-wizard.js'), 'utf8');

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

// ---------------------------------------------------------------------------
// REGRESSAO (aula 24/08): trocar de dominio no passo 1 depois de ja ter
// mapeado colunas virava 400 ao salvar. O passo 1 (renderDomain) so fazia
// `state.domain = id; goTo(2)` e NUNCA limpava o colMap antigo. O passo 3
// (renderMap) so roda autoMap quando o colMap esta VAZIO, entao o colMap do
// dominio anterior sobrevivia e o select do dominio NOVO ia ACRESCENTANDO
// chaves por cima (nunca removendo as antigas). O POST final ia com uma
// mistura de chaves dos dois dominios; o gate do servidor (functions/lib/
// colmap-shape.mjs, validarColMap/chavesDesconhecidas) rejeita CORRETAMENTE
// qualquer chave que nao seja slot do dominio novo. O bug era o wizard mandar
// slot errado, nao o gate recusar: colMapAoTrocarDominio() e o fix (chamado
// no handler `pick` de renderDomain), testado aqui pela funcao real que a
// producao usa, e a combinacao final e revalidada contra o proprio gate real
// do servidor (validarColMap), a mesma dupla que rejeitava a mistura antes.
// ---------------------------------------------------------------------------

test('colMapAoTrocarDominio: mesmo dominio (fluxo normal, sem troca) preserva o colMap intacto', () => {
  const atual = { data: 'Data', investimento: 'Investimento', canal: 'Canal' };
  const resultado = colMapAoTrocarDominio('marketing', 'marketing', atual);
  assert.deepEqual(resultado, atual);
});

test('colMapAoTrocarDominio: dominio DIFERENTE limpa o colMap antigo (remapeamento pro dominio novo)', () => {
  const atual = { data: 'Data', investimento: 'Investimento', canal: 'Canal' };
  const resultado = colMapAoTrocarDominio('marketing', 'vendas', atual);
  assert.deepEqual(resultado, {});
});

test('colMapAoTrocarDominio: primeira escolha de dominio (sem dominio atual) devolve vazio, sem quebrar', () => {
  assert.deepEqual(colMapAoTrocarDominio(null, 'marketing', {}), {});
  assert.deepEqual(colMapAoTrocarDominio(undefined, 'marketing', undefined), {});
});

test('sanidade: o handler de escolha de dominio (renderDomain/pick) realmente chama colMapAoTrocarDominio', () => {
  // Ancora contra um refactor que reintroduza o bug esquecendo de ligar o fix
  // no lugar onde o dominio muda de fato (mesmo espirito de wizard-cards.test.js).
  assert.match(
    wizardSrc,
    /state\.colMap\s*=\s*colMapAoTrocarDominio\(\s*state\.domain\s*,\s*id\s*,\s*state\.colMap\s*\)/,
    'pick() precisa chamar colMapAoTrocarDominio ANTES de reatribuir state.domain, senao o domainAtual chega errado',
  );
});

test('REGRESSAO end-to-end: colMap sobrevivente a troca marketing -> vendas passa no gate REAL do servidor', () => {
  // Simula o fluxo completo do aluno com as funcoes de PRODUCAO (nenhuma
  // reimplementada): autoMap (mapeamento automatico do passo 3), o fix
  // colMapAoTrocarDominio (passo 1) e o gate real do servidor validarColMap
  // (functions/lib/colmap-shape.mjs, o mesmo que devolveu 400 na reproducao).
  const columns = ['Data', 'Investimento', 'Canal'];

  // 1) Conecta no dominio marketing; o passo 3 roda autoMap (colMap comecava vazio).
  let colMap = autoMap(marketing.slots, columns);
  assert.equal(colMap.investimento, 'Investimento', 'sanidade: autoMap tem que ter casado investimento');

  // 2) Aluno volta ao passo 1 e troca pra vendas (pick() com o fix).
  colMap = colMapAoTrocarDominio('marketing', 'vendas', colMap);

  // 3) O passo 3 roda de novo: colMap vazio dispara autoMap pro dominio NOVO.
  if (!colMap || Object.keys(colMap).length === 0) colMap = autoMap(vendas.slots, columns);

  // 4) Slot obrigatorio que o autoMap nao teria como casar (nome de coluna nao bate
  // com nenhum alias de "valor"): o aluno mapeia manualmente, como faria na tela.
  if (colMap.valor == null) colMap.valor = 'Investimento';

  // O colMap final so tem chaves do dominio NOVO: o gate real aceita.
  const erro = validarColMap('vendas', colMap, columns);
  assert.equal(erro, null, `esperava colMap valido para "vendas", mas o gate real recusou: ${erro}`);
});

test('CONTROLE: sem trocar de dominio, o fluxo normal continua valido no gate REAL do servidor', () => {
  // O mesmo colMap que o autoMap monta para marketing, sem nenhuma troca de
  // dominio no meio, continua passando no gate (a correcao nao pode quebrar
  // o caminho que ja funcionava).
  const columns = ['Data', 'Investimento', 'Canal'];
  let colMap = autoMap(marketing.slots, columns);
  // Fluxo normal: volta ao passo 1 e clica no MESMO dominio de novo (nao muda nada).
  colMap = colMapAoTrocarDominio('marketing', 'marketing', colMap);
  const erro = validarColMap('marketing', colMap, columns);
  assert.equal(erro, null, `fluxo normal (sem troca de dominio) nao pode quebrar: ${erro}`);
});
