// Worker do modo histórico (exemplo de referência).
// Roda de hora em hora (cron trigger). Para cada dashboard cadastrado no KV cuja
// fonte seja viva (sheets ou meta), busca o DataSet atual e grava um snapshot no D1.
// Fontes 'csv' são estáticas (o dado já está salvo na config), então são puladas.
//
// Este Worker vive em workers/snapshot/, fora de functions/. O bundler do
// wrangler (esbuild) segue imports relativos, então importamos a MESMA lógica
// pura de parse de CSV e de conversão de link do Sheets usada pelos conectores
// de Pages. Isso elimina o drift: não há cópia inline aqui. A referência
// canônica da lógica pura de snapshots continua sendo functions/lib/snapshots.mjs.
//
// Sem libs externas.
import { parseCSV } from '../../../functions/lib/csv.mjs';
import { sheetUrlToCsv } from '../../../functions/lib/sheets-url.mjs';

// Reexporta a lógica pura compartilhada para que o teste de paridade
// (test/worker-parity.test.js) possa importar daqui e conferir que é a MESMA
// função usada pelos conectores de Pages, sem cópia inline no Worker.
export { parseCSV, sheetUrlToCsv };

const TABLE = 'snapshots';

export default {
  /**
   * Handler do cron trigger.
   * @param {ScheduledEvent} event
   * @param {{ DASHBOARD_DB: D1Database, DASHBOARDS_KV: KVNamespace }} env
   * @param {ExecutionContext} ctx
   */
  async scheduled(event, env, ctx) {
    const capturedAt = new Date().toISOString();

    // Lista as configs de dashboard no KV (chaves dash:<id>).
    const listed = await env.DASHBOARDS_KV.list({ prefix: 'dash:' });
    const keys = (listed.keys || []).map((k) => k.name);

    for (const key of keys) {
      // try/catch por dashboard: uma fonte quebrada não derruba as outras.
      try {
        const raw = await env.DASHBOARDS_KV.get(key);
        if (!raw) continue;

        let config;
        try {
          config = JSON.parse(raw);
        } catch {
          console.log(`snapshot: config corrompida em ${key}, pulando.`);
          continue;
        }

        const source = config && config.source;
        const type = source && source.type;

        // Só fontes vivas. 'csv' é estático (dado já salvo na config): pula.
        if (type !== 'sheets' && type !== 'meta') continue;

        const dataset = await fetchDataSet(type, source);
        if (!dataset) continue;

        const sql = `INSERT INTO ${TABLE} (dashboard_id, captured_at, dataset_json) VALUES (?, ?, ?)`;
        const params = [String(config.id), capturedAt, JSON.stringify(dataset)];
        await env.DASHBOARD_DB.prepare(sql).bind(...params).run();

        console.log(`snapshot: gravado ${config.id} (${dataset.rows.length} linhas).`);
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        console.log(`snapshot: falha em ${key}: ${msg}`);
      }
    }
  },
};

/**
 * Busca o DataSet atual da fonte viva. Devolve null se não souber lidar com o tipo.
 * @param {string} type
 * @param {Object} source
 * @returns {Promise<Object|null>} DataSet (Contrato 1)
 */
async function fetchDataSet(type, source) {
  if (type === 'sheets') {
    return await fetchSheetsDataSet(source);
  }
  if (type === 'meta') {
    return await fetchMetaDataSet(source);
  }
  return null;
}

/**
 * Fonte Google Sheets: monta o endpoint gviz CSV a partir do link, busca e parseia.
 * @param {{ url: string, gid?: string }} source
 * @returns {Promise<Object>} DataSet
 */
async function fetchSheetsDataSet(source) {
  const gid = (source && source.gid) || '0';
  const csvUrl = sheetUrlToCsv((source && source.url) || '', gid);

  const resp = await fetch(csvUrl, { redirect: 'follow' });
  if (!resp.ok) {
    throw new Error(`Planilha respondeu ${resp.status}. Confira se está pública.`);
  }
  const text = await resp.text();
  const { columns, rows } = parseCSV(text);
  return {
    columns,
    rows,
    meta: { source: 'sheets', fetchedAt: new Date().toISOString(), rowCount: rows.length },
  };
}

/**
 * Fonte Meta Ads: monta a chamada de insights da Graph API e mapeia a resposta.
 * Espera source.meta = { token, accountId, since?, until? }.
 * @param {{ meta: Object }} source
 * @returns {Promise<Object>} DataSet
 */
async function fetchMetaDataSet(source) {
  const meta = (source && source.meta) || {};
  const token = meta.token;
  // O wizard grava a conta como `account`; aceitamos os dois nomes.
  const accountId = meta.accountId || meta.account;
  if (!token) throw new Error('Meta Ads: access token ausente na config.');
  if (!accountId) throw new Error('Meta Ads: ad account id ausente na config.');

  const digits = String(accountId).replace(/^act_/, '');
  const params = new URLSearchParams();
  params.set('access_token', token);
  params.set('level', meta.level || 'campaign');
  params.set('time_increment', '1');
  params.set('fields', 'campaign_name,spend,impressions,clicks,actions,date_start');
  if (meta.since && meta.until) {
    params.set('time_range', JSON.stringify({ since: meta.since, until: meta.until }));
  }
  const url = `https://graph.facebook.com/v20.0/act_${digits}/insights?${params.toString()}`;

  const resp = await fetch(url, { redirect: 'follow' });
  const apiJson = await resp.json();
  if (apiJson && apiJson.error && apiJson.error.message) {
    throw new Error(apiJson.error.message);
  }

  const PURCHASE_ACTION_TYPES = ['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase'];
  const data = Array.isArray(apiJson.data) ? apiJson.data : [];
  const rows = data.map((item) => {
    const actions = Array.isArray(item.actions) ? item.actions : [];
    const leadAction = actions.find((a) => a && a.action_type === 'lead');
    const leads = leadAction ? String(leadAction.value) : '0';
    let conversoesSum = 0;
    let temConversao = false;
    for (const a of actions) {
      if (a && PURCHASE_ACTION_TYPES.includes(a.action_type)) {
        conversoesSum += Number(a.value) || 0;
        temConversao = true;
      }
    }
    return {
      Data: item.date_start != null ? String(item.date_start) : '',
      Campanha: item.campaign_name != null ? String(item.campaign_name) : '',
      Investimento: item.spend != null ? String(item.spend) : '',
      'Impressões': item.impressions != null ? String(item.impressions) : '',
      Cliques: item.clicks != null ? String(item.clicks) : '',
      Leads: leads,
      'Conversões': temConversao ? String(conversoesSum) : '0',
    };
  });

  return {
    columns: ['Data', 'Campanha', 'Investimento', 'Impressões', 'Cliques', 'Leads', 'Conversões'],
    rows,
    meta: { source: 'meta', fetchedAt: new Date().toISOString(), rowCount: rows.length },
  };
}
