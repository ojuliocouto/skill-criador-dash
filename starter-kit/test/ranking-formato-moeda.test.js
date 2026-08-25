// Achado 2 (auditoria pre-aula): rankings de Vendas, Financeiro e Estoque
// mostravam dinheiro sem "R$" e com casa decimal cortada (ex "9.640,2" em vez
// de "R$ 9.640,25"). Causa raiz: registry.ranking.toHtml so herda o `format`
// de uma MetricDef cuja KEY bate com o `valueSlot`; nesses 3 dominios a key da
// metrica-base NUNCA e igual ao slot (ex: financeiro tem key 'saidas', o slot
// e 'saida'), entao caia sempre no formato 'number' padrao. O fix declara
// `format: 'currency'` explicito nos props dos rankings de dinheiro.
//
// REGRA DE OURO: chama registry.ranking.toHtml de verdade (o mesmo caminho que
// dashboard.js usa), nunca reimplementa a resolucao de formato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseCSV } from '../functions/lib/csv.mjs';
import { registry } from '../public/assets/js/widgets/index.js';
import { template as vendas } from '../public/assets/js/templates/vendas.js';
import { template as financeiro } from '../public/assets/js/templates/financeiro.js';
import { template as estoque } from '../public/assets/js/templates/estoque.js';

const EXAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples');
function loadExample(name) {
  return parseCSV(readFileSync(join(EXAMPLES_DIR, name), 'utf8')).rows;
}
function findMetricDef(template, key) {
  return (template.metrics || []).find((m) => m.key === key);
}
const card = (title, inner) => `<div data-title="${title}">${inner}</div>`;

function rankingHtmlFor(template, title, colMap, rows) {
  const item = template.layout.find((i) => i.widget === 'ranking' && i.props.title === title);
  assert.ok(item, `layout tem um ranking com o titulo "${title}"`);
  return registry.ranking.toHtml(item, {
    template, dataset: { rows, columns: Object.keys(rows[0] || {}) }, colMap, findMetricDef, card,
  });
}

// ---------- Vendas ----------
const COL_VENDAS = { data: 'Data', vendedor: 'Vendedor', produto: 'Produto', valor: 'Valor', status: 'Status' };
const rowsVendas = loadExample('vendas-exemplo.csv');

test('vendas: "Ranking por vendedor" mostra dinheiro com R$ e 2 casas', () => {
  const html = rankingHtmlFor(vendas, 'Ranking por vendedor', COL_VENDAS, rowsVendas);
  assert.match(html, /ranking__value">R\$ [\d.]+,\d{2}</, 'todo valor tem R$ e 2 casas decimais');
  assert.ok(!/ranking__value">[\d.]+,?\d*</.test(html.replace(/R\$ [\d.,]+/g, '')), 'nao sobra valor sem R$ apos remover os validos');
});

test('vendas: "Ranking por produto" mostra dinheiro com R$ e 2 casas', () => {
  const html = rankingHtmlFor(vendas, 'Ranking por produto', COL_VENDAS, rowsVendas);
  assert.match(html, /ranking__value">R\$ [\d.]+,\d{2}</);
});

// ---------- Financeiro ----------
const COL_FINANCEIRO = { data: 'Data', categoria: 'Categoria', entrada: 'Entrada', saida: 'Saída' };
const rowsFinanceiro = loadExample('financeiro-exemplo.csv');

test('financeiro: "Saídas por categoria" e "Entradas por categoria" mostram R$', () => {
  const saidas = rankingHtmlFor(financeiro, 'Saídas por categoria', COL_FINANCEIRO, rowsFinanceiro);
  const entradas = rankingHtmlFor(financeiro, 'Entradas por categoria', COL_FINANCEIRO, rowsFinanceiro);
  assert.match(saidas, /ranking__value">R\$ [\d.]+,\d{2}</);
  assert.match(entradas, /ranking__value">R\$ [\d.]+,\d{2}</);
});

// ---------- Estoque ----------
const COL_ESTOQUE = {
  data: 'Data', produto: 'Produto', categoria: 'Categoria',
  quantidade: 'Quantidade Vendida', estoque: 'Estoque Atual', valor: 'Faturamento',
};
const rowsEstoque = loadExample('estoque-exemplo.csv');

test('estoque: rankings de FATURAMENTO (dinheiro) mostram R$; ranking de QUANTIDADE continua numero simples', () => {
  const faturamentoCategoria = rankingHtmlFor(estoque, 'Faturamento por categoria', COL_ESTOQUE, rowsEstoque);
  const topFaturamento = rankingHtmlFor(estoque, 'Top produtos por faturamento', COL_ESTOQUE, rowsEstoque);
  const maisVendidos = rankingHtmlFor(estoque, 'Mais vendidos (qtd)', COL_ESTOQUE, rowsEstoque);

  assert.match(faturamentoCategoria, /ranking__value">R\$ [\d.]+,\d{2}</, 'Faturamento por categoria e dinheiro: precisa de R$');
  assert.match(topFaturamento, /ranking__value">R\$ [\d.]+,\d{2}</, 'Top produtos por faturamento e dinheiro: precisa de R$');
  // Mais vendidos e QUANTIDADE (unidades), nao dinheiro: nao pode ganhar "R$" a
  // toa so porque os outros dois rankings do dominio viraram moeda.
  assert.ok(!maisVendidos.includes('R$'), 'Mais vendidos (qtd) continua sem R$ (e contagem de unidades, nao dinheiro)');
});

// ---------- Caso com centavos reais (nao so ,00): prova que a casa decimal nao corta ----------
test('ranking currency: valor com centavo (ex 9640,25) nunca perde a casa decimal', () => {
  const item = { widget: 'ranking', props: { dimensionSlot: 'vendedor', valueSlot: 'valor', title: 'X', format: 'currency' } };
  const rows = [
    { Vendedor: 'A', Valor: '9640,25' },
    { Vendedor: 'B', Valor: '100,00' },
  ];
  const html = registry.ranking.toHtml(item, {
    template: vendas, dataset: { rows, columns: ['Vendedor', 'Valor'] }, colMap: { vendedor: 'Vendedor', valor: 'Valor' }, findMetricDef, card,
  });
  assert.match(html, /R\$ 9\.640,25/, 'centavo (,25) preservado, nao vira ,2');
});
