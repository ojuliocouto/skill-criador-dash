// T4 do teste com aluno (02/10/2026): dashboard criado só com Data e Investimento mostrou
// CPA, Leads e CPL com "-", ROAS com "0" (falso: a receita não estava mapeada) e um ranking
// "Alunas novas por canal" com Instagram 0 (falso: a coluna não estava mapeada).
// Regra: métrica sem insumo aparece como "Não mapeada" no card, nunca "0" nem traço.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseCSV } from '../functions/lib/csv.mjs';
import { computeAllMapped } from '../public/assets/js/lib/metrics.js';
import { renderKpiBlock } from '../public/assets/js/dashboard.js';
import { render as renderKpi } from '../public/assets/js/widgets/kpi.js';
import { registry } from '../public/assets/js/widgets/index.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';

const rows = parseCSV(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'marketing-exemplo.csv'), 'utf8')).rows;
const findMetricDef = (t, k) => (t.metrics || []).find((m) => m.key === k);
const card = (title, inner) => `<div class="card"><div class="widget-title">${title}</div>${inner}</div>`;
const SO_DATA_E_INVESTIMENTO = { data: 'Data', investimento: 'Investimento' };
const itens = (...keys) => keys.map((k) => ({ widget: 'kpi', props: { metricKey: k } }));
const valorDoCard = (html, label) => {
  const i = html.indexOf(`>${label}<`);
  assert.ok(i >= 0, `card ${label} existe`);
  const m = html.slice(i).match(/kpi__value">([^<]*)</);
  return m && m[1];
};

test('kpi: card sem coluna mostra "Não mapeada", nunca traço', () => {
  const html = renderKpi({ label: 'CPA', format: 'currency', unmapped: true }, 0);
  assert.equal(valorDoCard(html, 'CPA'), 'Não mapeada');
  assert.ok(html.includes('data-estado="nao-mapeada"'), 'o estado fica legível pra prova de tela');
  assert.ok(!html.includes('R$ 0,00'));
});

test('ROAS (derivada) sem Receita mapeada é "Não mapeada", não "0"', () => {
  const { computed, mapped } = computeAllMapped(marketing.metrics, rows, SO_DATA_E_INVESTIMENTO);
  assert.equal(mapped.ROAS, false, 'derivada sem insumo não é mapeada');
  const html = renderKpiBlock(itens('investimento', 'ROAS'), marketing, computed, mapped, {}, null);
  assert.equal(valorDoCard(html, 'ROAS'), 'Não mapeada');
});

test('ROAS com Receita e Investimento mapeados mostra o número', () => {
  const { mapped } = computeAllMapped(marketing.metrics, rows, { ...SO_DATA_E_INVESTIMENTO, receita: 'Receita' });
  assert.equal(mapped.ROAS, true);
});

test('cenário do aluno: só Data e Investimento, nenhum card mostra "0" nem traço', () => {
  const { computed, mapped } = computeAllMapped(marketing.metrics, rows, SO_DATA_E_INVESTIMENTO);
  const html = renderKpiBlock(itens('investimento', 'leads', 'CPL', 'CPA', 'ROAS'), marketing, computed, mapped, {}, null);
  for (const label of ['Leads', 'CPL', 'CPA', 'ROAS']) {
    assert.equal(valorDoCard(html, label), 'Não mapeada', `${label} sem insumo`);
  }
  assert.match(valorDoCard(html, 'Investimento'), /R\$ 13\.990,50/);
});

test('ranking com a coluna de valor fora do mapeamento mostra "Não mapeada", nunca barra com 0', () => {
  const item = { widget: 'ranking', props: { dimensionSlot: 'canal', valueSlot: 'conversoes', title: 'Alunas novas por canal' } };
  const html = registry.ranking.toHtml(item, {
    template: marketing, dataset: { rows, columns: [] }, colMap: { data: 'Data', canal: 'Canal', investimento: 'Investimento' }, computed: {}, findMetricDef, card,
  });
  assert.ok(html, 'o card aparece explicando, não some calado');
  assert.ok(/Não mapeada/.test(html), 'diz que a coluna não está mapeada');
  assert.ok(!/ranking__value">0</.test(html), 'nenhum canal com 0 falso');
  assert.ok(/Conversões/.test(html), 'diz qual coluna falta');
});

test('série no tempo com a coluna de valor fora do mapeamento explica em vez de desenhar linha zerada', () => {
  const item = { widget: 'timeseries', props: { dateSlot: 'data', valueSlot: 'leads', title: 'Leads no tempo' } };
  const html = registry.timeseries.toHtml(item, {
    template: marketing, dataset: { rows, columns: [] }, colMap: SO_DATA_E_INVESTIMENTO, computed: {}, findMetricDef, card,
  });
  assert.ok(/Não mapeada/.test(html) && /Leads/.test(html));
  assert.ok(!/<svg/.test(html), 'não desenha gráfico de dado que não existe');
});
