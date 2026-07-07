// Testes das funções puras do conector Meta Ads (Facebook/Instagram).
// Só lógica pura: buildInsightsUrl e mapInsightsToDataSet. Sem rede.
// A parte de fetch fica no handler; aqui testamos montagem de URL e mapeamento.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildInsightsUrl, mapInsightsToDataSet } from '../functions/lib/meta.mjs';

test('buildInsightsUrl: monta URL base da Graph API v20.0 com act_ correto', () => {
  const url = buildInsightsUrl({ token: 'TK', accountId: '123' });
  assert.ok(
    url.startsWith('https://graph.facebook.com/v20.0/act_123/insights?'),
    'deve começar com o endpoint act_123/insights'
  );
});

test('buildInsightsUrl: não duplica o prefixo act_ quando já vem em accountId', () => {
  const url = buildInsightsUrl({ token: 'TK', accountId: 'act_123' });
  assert.ok(url.includes('/act_123/insights'), 'deve usar act_123 uma única vez');
  assert.ok(!url.includes('act_act_'), 'não pode duplicar o prefixo act_');
});

test('buildInsightsUrl: inclui access_token, level, time_increment e fields', () => {
  const url = buildInsightsUrl({ token: 'meu-token', accountId: '999' });
  const qs = new URL(url).searchParams;
  assert.equal(qs.get('access_token'), 'meu-token');
  assert.equal(qs.get('level'), 'campaign');
  assert.equal(qs.get('time_increment'), '1');
  assert.equal(
    qs.get('fields'),
    'campaign_name,spend,impressions,clicks,actions,date_start'
  );
});

test('buildInsightsUrl: level customizável via parâmetro', () => {
  const url = buildInsightsUrl({ token: 'TK', accountId: '1', level: 'ad' });
  assert.equal(new URL(url).searchParams.get('level'), 'ad');
});

test('buildInsightsUrl: com since/until inclui time_range codificado como JSON', () => {
  const url = buildInsightsUrl({
    token: 'TK',
    accountId: '1',
    since: '2026-01-01',
    until: '2026-01-31',
  });
  const timeRange = new URL(url).searchParams.get('time_range');
  assert.equal(timeRange, '{"since":"2026-01-01","until":"2026-01-31"}');
});

test('buildInsightsUrl: sem since/until omite o time_range', () => {
  const url = buildInsightsUrl({ token: 'TK', accountId: '1' });
  assert.equal(new URL(url).searchParams.has('time_range'), false);
});

test('buildInsightsUrl: aceita o alias account (nome gravado pelo wizard)', () => {
  const url = buildInsightsUrl({ token: 'TK', account: '456' });
  assert.ok(
    url.startsWith('https://graph.facebook.com/v20.0/act_456/insights?'),
    'deve montar act_456 a partir de account'
  );
});

test('buildInsightsUrl: account também remove o prefixo act_ sem duplicar', () => {
  const url = buildInsightsUrl({ token: 'TK', account: 'act_456' });
  assert.ok(url.includes('/act_456/insights'), 'deve usar act_456 uma única vez');
  assert.ok(!url.includes('act_act_'), 'não pode duplicar o prefixo act_');
});

test('buildInsightsUrl: accountId tem prioridade sobre account quando ambos vierem', () => {
  const url = buildInsightsUrl({ token: 'TK', accountId: '111', account: '222' });
  assert.ok(url.includes('/act_111/insights'), 'accountId deve prevalecer');
  assert.ok(!url.includes('act_222'), 'account não deve ser usado quando accountId existe');
});

test('buildInsightsUrl: sem accountId nem account lança Error', () => {
  assert.throws(() => buildInsightsUrl({ token: 'TK' }), /conta|account/i);
});

test('buildInsightsUrl: sem token lança Error', () => {
  assert.throws(() => buildInsightsUrl({ accountId: '1' }), /token/i);
});

test('buildInsightsUrl: sem accountId lança Error', () => {
  assert.throws(() => buildInsightsUrl({ token: 'TK' }), /conta|account/i);
});

test('mapInsightsToDataSet: mapeia data com 2 itens para o DataSet', () => {
  const apiJson = {
    data: [
      {
        campaign_name: 'Campanha A',
        spend: '150.50',
        impressions: '10000',
        clicks: '250',
        date_start: '2026-01-01',
        actions: [
          { action_type: 'lead', value: '12' },
          { action_type: 'purchase', value: '5' },
        ],
      },
      {
        campaign_name: 'Campanha B',
        spend: '80',
        impressions: '4000',
        clicks: '90',
        date_start: '2026-01-02',
      },
    ],
  };
  const ds = mapInsightsToDataSet(apiJson);

  assert.deepEqual(ds.columns, [
    'Data',
    'Campanha',
    'Investimento',
    'Impressões',
    'Cliques',
    'Leads',
    'Conversões',
  ]);
  assert.equal(ds.rows.length, 2);

  assert.deepEqual(ds.rows[0], {
    Data: '2026-01-01',
    Campanha: 'Campanha A',
    Investimento: '150.50',
    Impressões: '10000',
    Cliques: '250',
    Leads: '12',
    Conversões: '5',
  });

  // Segundo item sem actions: Leads e Conversões viram '0'.
  assert.equal(ds.rows[1].Leads, '0');
  assert.equal(ds.rows[1].Conversões, '0');
  assert.equal(ds.rows[1].Campanha, 'Campanha B');

  assert.equal(ds.meta.source, 'meta');
  assert.equal(ds.meta.fetchedAt, null);
  assert.equal(ds.meta.rowCount, 2);
});

test('mapInsightsToDataSet: valores em string crua conforme Contrato 1', () => {
  const ds = mapInsightsToDataSet({
    data: [{ campaign_name: 'X', spend: '10', impressions: '100', clicks: '3', date_start: '2026-02-01', actions: [] }],
  });
  for (const v of Object.values(ds.rows[0])) {
    assert.equal(typeof v, 'string');
  }
});

test('mapInsightsToDataSet: omni_purchase é agregado, NÃO soma com pixel/purchase (bug de dobra)', () => {
  // Caso real: a Graph API traz omni_purchase (agregado unificado) JUNTO com
  // offsite_conversion.fb_pixel_purchase. omni_purchase JÁ inclui as compras
  // de pixel/site. Somar os dois conta a mesma compra em dobro.
  const ds = mapInsightsToDataSet({
    data: [
      {
        campaign_name: 'Dobra',
        spend: '1',
        impressions: '1',
        clicks: '1',
        date_start: '2026-03-01',
        actions: [
          { action_type: 'omni_purchase', value: '10' },
          { action_type: 'offsite_conversion.fb_pixel_purchase', value: '10' },
        ],
      },
    ],
  });
  // Havendo omni_purchase, usa SÓ o agregado: 10 (não 20).
  assert.equal(ds.rows[0].Conversões, '10');
});

test('mapInsightsToDataSet: sem omni_purchase soma purchase + pixel', () => {
  const ds = mapInsightsToDataSet({
    data: [
      {
        campaign_name: 'SemOmni',
        spend: '1',
        impressions: '1',
        clicks: '1',
        date_start: '2026-03-02',
        actions: [
          { action_type: 'purchase', value: '2' },
          { action_type: 'offsite_conversion.fb_pixel_purchase', value: '3' },
          { action_type: 'link_click', value: '99' },
        ],
      },
    ],
  });
  // Sem agregado omni: soma os específicos 2 + 3 = 5 (link_click ignorado).
  assert.equal(ds.rows[0].Conversões, '5');
});

test('mapInsightsToDataSet: só omni_purchase usa o agregado', () => {
  const ds = mapInsightsToDataSet({
    data: [
      {
        campaign_name: 'SoOmni',
        spend: '1',
        impressions: '1',
        clicks: '1',
        date_start: '2026-03-03',
        actions: [
          { action_type: 'omni_purchase', value: '7' },
          { action_type: 'link_click', value: '99' },
        ],
      },
    ],
  });
  assert.equal(ds.rows[0].Conversões, '7');
});

test('mapInsightsToDataSet: múltiplos omni_purchase somam entre si (itens distintos do agregado)', () => {
  // Vários omni_purchase são itens/janelas separados do mesmo agregado unificado;
  // somar os omni ENTRE SI é correto. O que não pode é somar omni COM pixel/purchase.
  const ds = mapInsightsToDataSet({
    data: [
      {
        campaign_name: 'MultiOmni',
        spend: '1',
        impressions: '1',
        clicks: '1',
        date_start: '2026-03-04',
        actions: [
          { action_type: 'omni_purchase', value: '4' },
          { action_type: 'omni_purchase', value: '6' },
          { action_type: 'offsite_conversion.fb_pixel_purchase', value: '10' },
        ],
      },
    ],
  });
  // Soma só os omni: 4 + 6 = 10. O pixel é ignorado por já estar no agregado.
  assert.equal(ds.rows[0].Conversões, '10');
});

test('mapInsightsToDataSet: resposta de erro da Graph API lança Error', () => {
  assert.throws(
    () => mapInsightsToDataSet({ error: { message: 'Token inválido' } }),
    /Token inválido/
  );
});

test('mapInsightsToDataSet: sem data devolve DataSet vazio com columns fixas', () => {
  const ds = mapInsightsToDataSet({});
  assert.deepEqual(ds.columns, [
    'Data',
    'Campanha',
    'Investimento',
    'Impressões',
    'Cliques',
    'Leads',
    'Conversões',
  ]);
  assert.deepEqual(ds.rows, []);
  assert.equal(ds.meta.rowCount, 0);
  assert.equal(ds.meta.source, 'meta');
});
