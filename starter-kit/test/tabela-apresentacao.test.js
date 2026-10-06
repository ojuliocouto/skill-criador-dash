// Tabela "Dados": apresentação por coluna. Reprovado na tela real: data em ISO (2026-09-05),
// dinheiro sem R$ e cabeçalho "Conversoes" sem acento. O valor cru da fonte não muda; o que
// muda é como a tabela mostra a coluna quando ela está mapeada num slot do template.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { apresentacaoDasColunas } from '../public/assets/js/lib/colunas.js';
import { render as renderTable } from '../public/assets/js/widgets/table.js';
import { registry } from '../public/assets/js/widgets/index.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';
import { template as vendas } from '../public/assets/js/templates/vendas.js';
import { template as financeiro } from '../public/assets/js/templates/financeiro.js';
import { template as suporte } from '../public/assets/js/templates/suporte.js';

const COLUNAS = ['Data', 'Canal', 'Investimento', 'Impressoes', 'Cliques', 'Leads', 'Conversoes', 'Receita'];
const COLMAP = {
  data: 'Data', canal: 'Canal', investimento: 'Investimento', impressoes: 'Impressoes',
  cliques: 'Cliques', leads: 'Leads', conversoes: 'Conversoes', receita: 'Receita',
};
const ROWS = [
  { Data: '2026-09-05', Canal: 'Instagram', Investimento: '850,00', Impressoes: '48200', Cliques: '612', Leads: '38', Conversoes: '5', Receita: '1.900,00' },
  { Data: '2026-09-06', Canal: 'Google', Investimento: '710,00', Impressoes: '35800', Cliques: '534', Leads: '32', Conversoes: '5', Receita: '1.900,00' },
];

test('apresentacaoDasColunas (marketing): rótulo do slot, data e moeda', () => {
  const ap = apresentacaoDasColunas(marketing, COLMAP, COLUNAS);
  assert.deepEqual(ap.Data, { label: 'Data', format: 'date' });
  assert.deepEqual(ap.Investimento, { label: 'Investimento', format: 'currency' });
  assert.deepEqual(ap.Receita, { label: 'Receita', format: 'currency' });
  assert.deepEqual(ap.Conversoes, { label: 'Conversões' });
  assert.deepEqual(ap.Impressoes, { label: 'Impressões' });
  assert.deepEqual(ap.Canal, { label: 'Canal' });
});

test('apresentacaoDasColunas: coluna não mapeada fica de fora (aparece como veio)', () => {
  const ap = apresentacaoDasColunas(marketing, { data: 'Data', investimento: 'Valor Gasto' }, ['Data', 'Valor Gasto', 'Observacao']);
  assert.deepEqual(Object.keys(ap).sort(), ['Data', 'Valor Gasto']);
  assert.deepEqual(ap['Valor Gasto'], { label: 'Investimento', format: 'currency' });
  assert.deepEqual(apresentacaoDasColunas(marketing, null, COLUNAS), {});
  assert.deepEqual(apresentacaoDasColunas(null, COLMAP, COLUNAS), {});
});

test('apresentacaoDasColunas: moeda vem do formato do slot ou da métrica de soma da coluna', () => {
  // Vendas: nenhuma métrica SOMA o slot valor (num_vendas só conta), então o slot declara.
  const v = apresentacaoDasColunas(vendas, { data: 'Data', valor: 'Valor', vendedor: 'Vendedor' }, ['Data', 'Valor', 'Vendedor']);
  assert.deepEqual(v.Valor, { label: 'Valor', format: 'currency' });
  // Financeiro: entradas e saídas somam em moeda.
  const f = apresentacaoDasColunas(financeiro, { data: 'Data', entrada: 'Entrada', saida: 'Saída' }, ['Data', 'Entrada', 'Saída']);
  assert.equal(f.Entrada.format, 'currency');
  assert.equal(f['Saída'].format, 'currency');
  // Suporte: contagem não é dinheiro.
  const s = apresentacaoDasColunas(suporte, { data: 'Data', atendimentos: 'Atendimentos', csat: 'CSAT' }, ['Data', 'Atendimentos', 'CSAT']);
  assert.equal(s.Atendimentos.format, undefined);
  assert.equal(s.CSAT.format, undefined);
});

test('tabela: data em formato brasileiro, dinheiro com R$ e cabeçalho com o rótulo do slot', () => {
  const html = renderTable({ columnMeta: apresentacaoDasColunas(marketing, COLMAP, COLUNAS) }, { columns: COLUNAS, rows: ROWS });
  assert.match(html, /<td>05\/09\/2026<\/td>/);
  assert.ok(!html.includes('2026-09-05'), 'ISO não aparece na tela');
  assert.match(html, /<td class="num">R\$ 850,00<\/td>/);
  assert.match(html, /<td class="num">R\$ 1\.900,00<\/td>/);
  assert.match(html, /<th scope="col" class="num"[^>]*>Conversões<\/th>/);
  assert.match(html, /<th scope="col" class="num"[^>]*>Impressões<\/th>/);
  assert.ok(!/>Conversoes</.test(html), 'cabeçalho sem acento não aparece');
  assert.match(html, /<td class="num">48\.200<\/td>/, 'coluna numérica comum segue como antes');
  assert.match(html, /<td>Instagram<\/td>/);
});

test('tabela: o valor cru da fonte não muda (as linhas de entrada ficam intactas)', () => {
  const copia = JSON.parse(JSON.stringify(ROWS));
  renderTable({ columnMeta: apresentacaoDasColunas(marketing, COLMAP, COLUNAS) }, { columns: COLUNAS, rows: ROWS });
  assert.deepEqual(ROWS, copia);
});

test('tabela: cabeçalho renomeado guarda o nome da coluna da fonte na dica', () => {
  const html = renderTable({ columnMeta: { Conversoes: { label: 'Conversões' } } }, { columns: ['Conversoes'], rows: [{ Conversoes: '5' }] });
  assert.match(html, /<th scope="col" class="num" title="Coluna na fonte: Conversoes">Conversões<\/th>/);
});

test('tabela: data com hora mantém a hora; célula que não é data nem número aparece como veio', () => {
  const meta = { Data: { label: 'Data', format: 'date' }, Valor: { label: 'Valor', format: 'currency' } };
  const html = renderTable({ columnMeta: meta }, {
    columns: ['Data', 'Valor'],
    rows: [{ Data: '2026-09-05 14:30', Valor: 'a combinar' }, { Data: 'sem data', Valor: '' }, { Data: '06/09/2026', Valor: 'R$ 1.250,5' }],
  });
  assert.match(html, />05\/09\/2026 14:30</);
  assert.match(html, />a combinar</);
  assert.match(html, />sem data</);
  assert.match(html, />06\/09\/2026</);
  assert.match(html, />R\$ 1\.250,50</);
  assert.ok(!/NaN|R\$ 0,00/.test(html));
});

test('tabela: sem columnMeta o comportamento é o de sempre', () => {
  const html = renderTable({}, { columns: COLUNAS, rows: ROWS });
  assert.match(html, /<th scope="col" class="num">Conversoes<\/th>/);
  assert.match(html, /<td>2026-09-05<\/td>/);
  assert.match(html, /<td class="num">850,00<\/td>/);
});

test('registry: a tabela do painel já sai com a apresentação do template', () => {
  const card = (titulo, inner) => `<div class="card">${titulo || ''}${inner}</div>`;
  const html = registry.table.toHtml({ widget: 'table', props: {} }, {
    template: marketing, dataset: { columns: COLUNAS, rows: ROWS }, colMap: COLMAP, card,
  });
  assert.match(html, />05\/09\/2026</);
  assert.match(html, />R\$ 850,00</);
  assert.match(html, />Conversões</);
});
