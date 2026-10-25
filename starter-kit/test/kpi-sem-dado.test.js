// 3.9 (achado 4 da auditoria de 25/10/2026): com zero venda o cartão mostrava CPA R$ 0,00 e a tabela
// logo abaixo dizia "sem dado" para o mesmo CPA. Divisão por zero não é número: o cartão diz "sem dado",
// igual à tabela, e explica o motivo. Vale para toda taxa (CPA, CPL, CPC, CTR, ROAS, custo por resultado).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { render as renderKpi } from '../public/assets/js/widgets/kpi.js';
import { renderKpiBlock } from '../public/assets/js/dashboard.js';
import { computeAllMapped, denominadorDaTaxa, taxaSemDenominador } from '../public/assets/js/lib/metrics.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';

const CM = { data: 'Data', canal: 'Canal', investimento: 'Inv', impressoes: 'Imp', cliques: 'Cli', leads: 'Leads', conversoes: 'Conv', receita: 'Rec' };
// "Hoje" no canal YouTube Ads do print da auditoria: R$ 109,02 gastos, 5 leads, 0 venda.
const SEM_VENDA = [{ Data: '25/10/2026', Canal: 'YouTube Ads', Inv: '109,02', Imp: '4000', Cli: '40', Leads: '5', Conv: '0', Rec: '0' }];

const def = (k) => marketing.metrics.find((m) => m.key === k);
const itens = (keys) => keys.map((k) => ({ widget: 'kpi', props: { metricKey: k } }));
const cartao = (html, rotulo) => {
  const parte = html.split(/(?=<div class="kpi[ "])/).find((p) => p.includes(`<div class="kpi__label">${rotulo}</div>`));
  assert.ok(parte, `cartão ${rotulo} na faixa`);
  return parte;
};

test('denominadorDaTaxa: ratio usa o 2o termo; derivada usa o denominator declarado; volume não tem', () => {
  assert.equal(denominadorDaTaxa(def('CPA')), 'conversoes');
  assert.equal(denominadorDaTaxa(def('CPL')), 'leads');
  assert.equal(denominadorDaTaxa(def('CTR')), 'impressoes');
  assert.equal(denominadorDaTaxa(def('ROAS')), 'investimento');
  assert.equal(denominadorDaTaxa(def('custo_resultado')), 'resultados');
  assert.equal(denominadorDaTaxa(def('investimento')), null);
  assert.equal(denominadorDaTaxa(null), null);
});

test('taxaSemDenominador: zero, vazio ou negativo no denominador = sem dado', () => {
  assert.equal(taxaSemDenominador(def('CPA'), { conversoes: 0 }), true);
  assert.equal(taxaSemDenominador(def('CPA'), {}), true);
  assert.equal(taxaSemDenominador(def('CPA'), { conversoes: 3 }), false);
  assert.equal(taxaSemDenominador(def('leads'), { leads: 0 }), false, 'métrica de volume nunca é "sem dado" por denominador');
});

test('kpi: semDado mostra "sem dado" com o motivo, sem número, seta, meta, contagem nem minigráfico', () => {
  const h = renderKpi({ label: 'CPA', format: 'currency', semDado: 'Sem conversões no período', trend: { text: '▼ 100%', good: true }, goal: { pct: 0.5, text: '50% da meta' }, hero: true, spark: [1, 2, 3] }, 0);
  assert.match(h, /<div class="kpi__value">sem dado<\/div>/);
  assert.match(h, /Sem conversões no período/);
  assert.match(h, /data-estado="sem-dado"/);
  assert.match(h, /is-sem-dado/);
  assert.doesNotMatch(h, /R\$/);
  assert.doesNotMatch(h, /kpi__trend|kpi__goal|kpi__spark|data-conta-valor/);
});

test('renderKpiBlock: dia sem venda mostra CPA "sem dado" (nunca R$ 0,00), e os números com base continuam', () => {
  const { computed, mapped } = computeAllMapped(marketing.metrics, SEM_VENDA, CM);
  const html = renderKpiBlock(itens(['investimento', 'leads', 'CPL', 'conversoes', 'CPA', 'ROAS']), marketing, computed, mapped);
  const cpa = cartao(html, 'CPA');
  assert.match(cpa, /kpi__value">sem dado</);
  assert.match(cpa, /Sem conversões no período/);
  assert.doesNotMatch(html, /R\$\s0,00/, 'nenhum cartão em R$ 0,00');
  assert.match(cartao(html, 'CPL'), /R\$\s21,80/);
  // ROAS 0 com investimento é número de verdade (gastou e não voltou nada): continua 0.
  assert.match(cartao(html, 'ROAS'), /kpi__value">0</);
});

test('renderKpiBlock: sem investimento, ROAS e CPL também viram "sem dado" pelo denominador certo', () => {
  const linhas = [{ ...SEM_VENDA[0], Inv: '0', Leads: '0', Imp: '0' }];
  const { computed, mapped } = computeAllMapped(marketing.metrics, linhas, CM);
  const html = renderKpiBlock(itens(['investimento', 'CTR', 'CPL', 'ROAS']), marketing, computed, mapped);
  assert.match(cartao(html, 'ROAS'), /sem dado[\s\S]*Sem investimento no período/);
  assert.match(cartao(html, 'CPL'), /sem dado[\s\S]*Sem leads no período/);
  assert.match(cartao(html, 'CTR'), /sem dado[\s\S]*Sem impressões no período/);
});

test('renderKpiBlock: o motivo usa o nome que a pessoa deu à métrica (Conversões renomeada para Vendas)', () => {
  const tpl = { ...marketing, metrics: marketing.metrics.map((m) => (m.key === 'conversoes' ? { ...m, label: 'Vendas' } : m)) };
  const { computed, mapped } = computeAllMapped(tpl.metrics, SEM_VENDA, CM);
  assert.match(renderKpiBlock(itens(['investimento', 'CPA']), tpl, computed, mapped), /Sem vendas no período/);
});

test('renderKpiBlock: taxa de custo marca data-taxa="custo" (a prova de tela reprova R$ 0,00 nela)', () => {
  const linhas = [{ ...SEM_VENDA[0], Conv: '2' }];
  const { computed, mapped } = computeAllMapped(marketing.metrics, linhas, CM);
  const html = renderKpiBlock(itens(['investimento', 'CPA', 'ROAS']), marketing, computed, mapped);
  assert.match(cartao(html, 'CPA'), /data-taxa="custo"/);
  assert.doesNotMatch(cartao(html, 'ROAS'), /data-taxa="custo"/);
  assert.doesNotMatch(cartao(html, 'Investimento'), /data-taxa/);
});

test('kpi: a seta diz com o que compara (rótulo e datas do período anterior)', () => {
  const h = renderKpi({ label: 'Leads', format: 'integer', trend: { text: '▲ 2,32%', good: true, rotulo: 'vs. 7 dias anteriores', titulo: 'Comparado com 12/10/2026 a 18/10/2026' } }, 1146);
  assert.match(h, /kpi__trend-cap"> vs\. 7 dias anteriores</);
  assert.match(h, /title="Comparado com 12\/10\/2026 a 18\/10\/2026"/);
  assert.doesNotMatch(h, /vs\. início/);
});
