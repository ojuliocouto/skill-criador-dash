// Passo 3 do assistente ("Confira as colunas"): placar do que foi encontrado, valores de exemplo
// de cada coluna (pra pessoa conferir com o olho) e o que o painel deixa de mostrar sem um dado
// opcional. Esta última parte sai das MÉTRICAS e dos blocos do template, nunca de texto à mão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseCSV } from '../functions/lib/csv.mjs';
import {
  placarDoMapa, textoDoPlacar, exemplosDaColuna, oQueSePerdeSem, fraseDoQueSePerde, validateRequired,
} from '../public/assets/js/lib/mapa-colunas.js';
import { autoMap } from '../public/assets/js/lib/automap.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';
import { template as vendas } from '../public/assets/js/templates/vendas.js';
import { template as financeiro } from '../public/assets/js/templates/financeiro.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const fixture = parseCSV(readFileSync(join(aqui, 'fixtures', 'marketing-30-dias.csv'), 'utf8'));

test('placarDoMapa: arquivo completo dá 8 de 8', () => {
  const colMap = autoMap(marketing.slots, fixture.columns);
  const p = placarDoMapa(marketing.slots, colMap, fixture.columns);
  assert.equal(p.total, 8);
  assert.equal(p.encontradas, 8);
  assert.deepEqual(p.faltamObrigatorias, []);
  assert.deepEqual(p.faltamOpcionais, []);
  assert.equal(textoDoPlacar(p), 'Encontramos 8 de 8 colunas');
});

test('placarDoMapa: separa o que falta em obrigatória e opcional', () => {
  const colMap = { data: 'Data', canal: 'Canal', investimento: null, receita: '' };
  const p = placarDoMapa(marketing.slots, colMap, ['Data', 'Canal']);
  assert.equal(p.encontradas, 2);
  assert.deepEqual(p.faltamObrigatorias.map((s) => s.key), ['investimento']);
  assert.deepEqual(p.faltamOpcionais.map((s) => s.key), ['impressoes', 'cliques', 'leads', 'conversoes', 'receita']);
  assert.equal(textoDoPlacar(p), 'Encontramos 2 de 8 colunas');
});

test('placarDoMapa: coluna escolhida que não existe no arquivo não conta como encontrada', () => {
  const p = placarDoMapa(marketing.slots, { data: 'Data', investimento: 'Sumiu' }, ['Data']);
  assert.equal(p.encontradas, 1);
  assert.deepEqual(p.faltamObrigatorias.map((s) => s.key), ['investimento']);
});

test('placarDoMapa: sem lista de colunas confia no que está escolhido', () => {
  const p = placarDoMapa(marketing.slots, { data: 'Data', investimento: 'Gasto' });
  assert.equal(p.encontradas, 2);
});

test('textoDoPlacar: singular quando o modelo tem uma coluna só', () => {
  assert.equal(textoDoPlacar({ total: 1, encontradas: 1 }), 'Encontramos 1 de 1 coluna');
  assert.equal(textoDoPlacar({ total: 3, encontradas: 0 }), 'Encontramos 0 de 3 colunas');
});

test('exemplosDaColuna: primeiros valores distintos, pulando vazio', () => {
  assert.deepEqual(exemplosDaColuna(fixture.rows, 'Canal', 3), ['Instagram', 'Google', 'TikTok']);
  assert.deepEqual(exemplosDaColuna(fixture.rows, 'Data', 2), ['2026-09-05', '2026-09-06']);
  const rows = [{ A: '' }, { A: '  ' }, { A: 'x' }, { A: 'x' }, { A: null }, { A: 'y' }];
  assert.deepEqual(exemplosDaColuna(rows, 'A', 3), ['x', 'y']);
});

test('exemplosDaColuna: valor comprido é cortado; coluna inexistente ou vazia devolve lista vazia', () => {
  const longo = 'a'.repeat(80);
  const [v] = exemplosDaColuna([{ A: longo }], 'A', 3);
  assert.ok(v.length <= 28, `cortado em 28, veio ${v.length}`);
  assert.ok(v.endsWith('...'));
  assert.deepEqual(exemplosDaColuna(fixture.rows, 'Não existe', 3), []);
  assert.deepEqual(exemplosDaColuna(fixture.rows, '', 3), []);
  assert.deepEqual(exemplosDaColuna(null, 'A', 3), []);
});

test('oQueSePerdeSem: sem Receita não tem Receita nem ROAS (sai das métricas do template)', () => {
  const p = oQueSePerdeSem(marketing, 'receita');
  assert.deepEqual(p.numeros, ['Receita', 'ROAS']);
  assert.deepEqual(p.blocos, ['Receita por canal']);
});

test('oQueSePerdeSem: sem Leads caem os números que dependem dele, direto ou por conta', () => {
  const p = oQueSePerdeSem(marketing, 'leads');
  assert.deepEqual(p.numeros, ['Leads', 'CPL', 'Cliques que viram lead', 'Leads que viram conversão']);
  assert.deepEqual(p.blocos, ['Leads por dia']);
});

test('oQueSePerdeSem: coluna de agrupamento (canal) derruba os blocos por canal, não números', () => {
  const p = oQueSePerdeSem(marketing, 'canal');
  assert.deepEqual(p.numeros, []);
  assert.ok(p.blocos.includes('Resultado por canal'));
  assert.ok(p.blocos.includes('Investimento por canal'));
  assert.ok(!p.blocos.includes('Ranking por canal'), 'modelo com abas não lista bloco do layout sem abas');
});

test('oQueSePerdeSem: modelo sem abas olha o layout único', () => {
  const p = oQueSePerdeSem(financeiro, 'saida');
  assert.deepEqual(p.numeros, ['Saídas', 'Saldo', 'Margem']);
  assert.deepEqual(p.blocos, ['Saídas por categoria']);
});

test('oQueSePerdeSem: é derivado (um modelo inventado responde pelo que declara)', () => {
  const falso = {
    slots: [{ key: 'x', label: 'Xis' }, { key: 'y', label: 'Ípsilon' }],
    metrics: [
      { key: 'mx', label: 'Total de xis', agg: 'sum', column: 'x' },
      { key: 'my', label: 'Total de ípsilon', agg: 'sum', column: 'y' },
      { key: 'r', label: 'Xis por ípsilon', agg: 'ratio', ratioOf: ['mx', 'my'] },
      { key: 'd', label: 'Dobro', agg: 'derived', dependsOn: ['r'], compute: () => 0 },
      { key: 'livre', label: 'Livre', agg: 'derived', compute: () => 0 },
    ],
    layout: [{ widget: 'timeseries', props: { dateSlot: 'x', valueSlot: 'y', title: 'Ípsilon no tempo' } }],
  };
  assert.deepEqual(oQueSePerdeSem(falso, 'y').numeros, ['Total de ípsilon', 'Xis por ípsilon', 'Dobro']);
  assert.deepEqual(oQueSePerdeSem(falso, 'y').blocos, ['Ípsilon no tempo']);
  assert.deepEqual(oQueSePerdeSem(falso, 'x').numeros, ['Total de xis', 'Xis por ípsilon', 'Dobro']);
});

test('oQueSePerdeSem: nota do próprio campo quando a falta muda uma conta em vez de sumir com ela', () => {
  const p = oQueSePerdeSem(vendas, 'status');
  assert.deepEqual(p.numeros, []);
  assert.equal(typeof p.nota, 'string');
  assert.ok(p.nota.length > 10, 'vendas.status explica o que acontece sem a coluna');
});

test('fraseDoQueSePerde: frase pronta pra tela', () => {
  assert.equal(
    fraseDoQueSePerde(marketing, 'receita'),
    'Sem Receita o painel não mostra: Receita, ROAS e Receita por canal.',
  );
  const canal = fraseDoQueSePerde(marketing, 'canal');
  assert.match(canal, /^Sem Canal o painel não mostra: /);
  assert.match(canal, / e mais \d+\.$/, 'lista comprida é resumida');
  assert.ok(!canal.includes('undefined'));
});

test('fraseDoQueSePerde: campo que não derruba nada diz que o painel funciona sem ele', () => {
  const falso = { slots: [{ key: 'obs', label: 'Observação' }], metrics: [], layout: [] };
  assert.equal(fraseDoQueSePerde(falso, 'obs'), 'O painel funciona sem Observação.');
  assert.equal(fraseDoQueSePerde(falso, 'nao-existe'), '');
});

test('validateRequired continua valendo a partir do módulo novo', () => {
  assert.deepEqual(validateRequired(marketing.slots, { data: 'Data', investimento: 'X' }), []);
  assert.deepEqual(validateRequired(marketing.slots, {}).map((m) => m.key), ['data', 'investimento']);
});
