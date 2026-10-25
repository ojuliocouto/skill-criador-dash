// Conector Meta Ads 3.8.0: Resultados, Tipo de resultado, Custo por resultado, CPL e Leads sem dobra.
//
// Reclamação do dono (25/10/2026): "ele não puxava do Meta Ads resultados, leads e custo por resultado".
// Causa: o conector pedia só campaign_name,spend,impressions,clicks,actions,date_start e contava Leads
// só pelo action_type 'lead'.
//
// FORMATO DOS CAMPOS (documentação oficial, lida em 25/10/2026):
//   https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/insights
//   results          list<AdsInsightsResult>  "The number of times your ad achieved an outcome, based on
//                                              the objective and settings you selected."
//   cost_per_result  list<AdsInsightsResult>  "The average cost per result from your ads."
//   actions          list<AdsActionStats>     (action_type, value)
// A doc NÃO descreve os subcampos de AdsInsightsResult (o SDK oficial em Python tipa como list<Object>).
// O formato que a Graph devolve na prática é { indicator, values: [{ value, attribution_windows }] }.
// Como a doc não fecha isso, o conector aceita os dois desenhos e o teste cobre os dois:
//   A) { indicator: 'actions:...', values: [{ value: '12', attribution_windows: ['default'] }] }
//   B) { action_type: '...', value: '12' }   (mesmo desenho de AdsActionStats)
//
// LEADS (doc oficial de AdsActionStats, https://developers.facebook.com/docs/marketing-api/reference/ads-action-stats/):
//   lead                              "All offsite leads plus all On-Facebook leads"  (agregado)
//   onsite_conversion.lead_grouped    "All On-Facebook Leads"
//   leadgen_grouped                   "On-Facebook leads coming from Messenger and Instant Forms" (parte do de cima)
//   offsite_conversion.fb_pixel_lead  "Leads" (pixel, fora do Facebook)
import test from 'node:test';
import assert from 'node:assert/strict';

import { mapInsightsToDataSet, contarLeads } from '../functions/lib/meta.mjs';

const linha = (extra) => ({
  campaign_name: 'Camp', spend: '120.00', impressions: '1000', clicks: '40', date_start: '2026-10-01', ...extra,
});
const um = (extra) => mapInsightsToDataSet({ data: [linha(extra)] }).rows[0];

test('DataSet: colunas antigas continuam, na mesma ordem, e as novas vêm depois (dash já criado não quebra)', () => {
  const ds = mapInsightsToDataSet({ data: [] });
  assert.deepEqual(ds.columns, [
    'Data', 'Campanha', 'Investimento', 'Impressões', 'Cliques', 'Leads', 'Conversões',
    'Resultados', 'Tipo de resultado', 'Custo por resultado', 'CPL', 'Cliques (todos)',
  ]);
});

test('Resultados e Custo por resultado vêm da Meta (formato A: indicator + values)', () => {
  const r = um({
    actions: [{ action_type: 'lead', value: '10' }],
    results: [{ indicator: 'actions:onsite_conversion.lead_grouped', values: [{ value: '10', attribution_windows: ['default'] }] }],
    cost_per_result: [{ indicator: 'actions:onsite_conversion.lead_grouped', values: [{ value: '12.003', attribution_windows: ['default'] }] }],
  });
  assert.equal(r.Resultados, '10');
  assert.equal(r['Tipo de resultado'], 'Leads no formulário');
  assert.equal(r['Custo por resultado'], '12.00', 'o valor da Meta, em 2 casas');
  assert.equal(r.CPL, '12.00', '120 / 10');
});

test('Resultados no formato B (action_type + value) também é lido', () => {
  const r = um({
    results: [{ action_type: 'offsite_conversion.fb_pixel_lead', value: '8' }],
    cost_per_result: [{ action_type: 'offsite_conversion.fb_pixel_lead', value: '15' }],
  });
  assert.equal(r.Resultados, '8');
  assert.equal(r['Tipo de resultado'], 'Leads no site');
  assert.equal(r['Custo por resultado'], '15.00');
});

test('Resultados com várias janelas de atribuição: usa a janela default, nunca soma as janelas', () => {
  const r = um({
    results: [{ indicator: 'actions:offsite_conversion.fb_pixel_purchase', values: [
      { value: '9', attribution_windows: ['7d_click'] },
      { value: '5', attribution_windows: ['default'] },
    ] }],
  });
  assert.equal(r.Resultados, '5');
  assert.equal(r['Tipo de resultado'], 'Compras no site');
  assert.equal(r['Custo por resultado'], '24.00', 'sem cost_per_result da Meta: 120 / 5');
});

test('Resultado de conversa por mensagem entra como Resultados com o nome em português', () => {
  const r = um({
    results: [{ indicator: 'actions:onsite_conversion.messaging_conversation_started_7d', values: [{ value: '30' }] }],
    cost_per_result: [{ indicator: 'actions:onsite_conversion.messaging_conversation_started_7d', values: [{ value: '4' }] }],
  });
  assert.equal(r.Resultados, '30');
  assert.equal(r['Tipo de resultado'], 'Conversas por mensagem');
  assert.equal(r['Custo por resultado'], '4.00');
});

test('Indicador desconhecido mantém o nome cru da Meta (sem o prefixo actions:)', () => {
  const r = um({ results: [{ indicator: 'actions:onsite_conversion.algo_novo', values: [{ value: '3' }] }] });
  assert.equal(r['Tipo de resultado'], 'onsite_conversion.algo_novo');
});

test('Leads: formulário instantâneo e pixel sem dobra (lead é o agregado e vence)', () => {
  // A Graph manda o agregado E as partes juntos. Somar tudo daria 10 + 6 + 6 + 4 = 26.
  assert.equal(contarLeads([
    { action_type: 'lead', value: '10' },
    { action_type: 'onsite_conversion.lead_grouped', value: '6' },
    { action_type: 'leadgen_grouped', value: '6' },
    { action_type: 'offsite_conversion.fb_pixel_lead', value: '4' },
  ]), 10);
});

test('Leads sem o agregado: formulário (lead_grouped) + pixel, e leadgen_grouped não soma de novo', () => {
  assert.equal(contarLeads([
    { action_type: 'onsite_conversion.lead_grouped', value: '6' },
    { action_type: 'leadgen_grouped', value: '6' },
    { action_type: 'offsite_conversion.fb_pixel_lead', value: '4' },
  ]), 10);
});

test('Leads só de formulário instantâneo (leadgen_grouped) contam', () => {
  assert.equal(contarLeads([{ action_type: 'leadgen_grouped', value: '7' }]), 7);
});

test('Leads só de pixel contam (antes saía 0)', () => {
  const r = um({ actions: [{ action_type: 'offsite_conversion.fb_pixel_lead', value: '9' }] });
  assert.equal(r.Leads, '9');
  assert.equal(r.CPL, '13.33', '120 / 9');
});

test('Campanha sem results (antiga): Resultados cai nos Leads calculados, com o tipo dizendo que é cálculo', () => {
  const r = um({ actions: [{ action_type: 'lead', value: '6' }, { action_type: 'purchase', value: '2' }] });
  assert.equal(r.Resultados, '6');
  assert.equal(r['Tipo de resultado'], 'Leads (calculado pelo painel)');
  assert.equal(r['Custo por resultado'], '20.00', '120 / 6');
});

test('Campanha sem results e sem leads: Resultados cai nas compras', () => {
  const r = um({ actions: [{ action_type: 'omni_purchase', value: '4' }] });
  assert.equal(r.Resultados, '4');
  assert.equal(r['Tipo de resultado'], 'Compras (calculado pelo painel)');
  assert.equal(r['Custo por resultado'], '30.00');
});

test('Sem results, sem leads e sem compras: Resultados 0, custo vazio (sem dividir por zero)', () => {
  const r = um({ actions: [{ action_type: 'link_click', value: '40' }] });
  assert.equal(r.Resultados, '0');
  assert.equal(r['Tipo de resultado'], '');
  assert.equal(r['Custo por resultado'], '');
  assert.equal(r.CPL, '');
});

test('results vazio ([]) conta como sem results e cai no cálculo', () => {
  const r = um({ results: [], actions: [{ action_type: 'lead', value: '3' }] });
  assert.equal(r.Resultados, '3');
  assert.equal(r['Tipo de resultado'], 'Leads (calculado pelo painel)');
});

test('Dois tipos de resultado na mesma linha: soma e junta os nomes; custo vira investimento / total', () => {
  const r = um({
    results: [
      { indicator: 'actions:onsite_conversion.lead_grouped', values: [{ value: '4' }] },
      { indicator: 'actions:offsite_conversion.fb_pixel_lead', values: [{ value: '2' }] },
    ],
    cost_per_result: [
      { indicator: 'actions:onsite_conversion.lead_grouped', values: [{ value: '10' }] },
      { indicator: 'actions:offsite_conversion.fb_pixel_lead', values: [{ value: '40' }] },
    ],
  });
  assert.equal(r.Resultados, '6');
  assert.equal(r['Tipo de resultado'], 'Leads no formulário + Leads no site');
  assert.equal(r['Custo por resultado'], '20.00', '120 / 6, não a média dos dois custos');
});

test('Valores do DataSet continuam string crua (Contrato 1)', () => {
  const r = um({ results: [{ indicator: 'reach', values: [{ value: '500' }] }] });
  for (const v of Object.values(r)) assert.equal(typeof v, 'string');
  assert.equal(r['Tipo de resultado'], 'Alcance');
});
