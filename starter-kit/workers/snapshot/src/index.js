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
import { buildInsightsUrl, mapInsightsToDataSet } from '../../../functions/lib/meta.mjs';
import { insertSnapshotSQL } from '../../../functions/lib/snapshots.mjs';
// Registry de fontes: qual tipo suporta snapshot historico (canHistory). Mesma
// fonte de verdade que o wizard usa, pra decidir aqui quais fontes tirar snapshot.
// O modulo e puro (sem DOM/browser), roda igual no runtime do Worker.
import { getSource, historyTypes } from '../../../public/assets/js/sources/index.js';

// Reexporta a lógica pura compartilhada para que o teste de paridade
// (test/worker-parity.test.js) possa importar daqui e conferir que é a MESMA
// função usada pelos conectores de Pages, sem cópia inline no Worker.
export { parseCSV, sheetUrlToCsv, buildInsightsUrl, mapInsightsToDataSet, insertSnapshotSQL };

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

        // Só fontes que suportam historico (canHistory no registry de fontes).
        // 'csv' é estático (dado já salvo na config) e 'd1' já é o proprio
        // historico: ambos tem canHistory=false e sao pulados aqui.
        const descriptor = getSource(type);
        if (!descriptor || !descriptor.canHistory) continue;

        const dataset = await fetchSnapshotDataSet(type, source);
        if (!dataset) continue;

        // Monta o INSERT pela MESMA função pura que os handlers de Pages usam
        // (functions/lib/snapshots.mjs). Zero SQL inline aqui: sem drift.
        const { sql, params } = insertSnapshotSQL(config.id, capturedAt, dataset);
        await env.DASHBOARD_DB.prepare(sql).bind(...params).run();

        console.log(`snapshot: gravado ${config.id} (${dataset.rows.length} linhas).`);
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        console.log(`snapshot: falha em ${key}: ${msg}`);
      }
    }
  },
};

// Fetchers de snapshot (server-side) por tipo de fonte. Cada closure fala com a
// API externa (gviz / Graph API) direto: e o "como buscar" do lado Worker, que
// NAO pode morar no registry puro (sources/index.js) porque este arquivo tambem
// importa aquele. O que colamos ao registry e a CHAVE: todo type com
// canHistory:true no registry TEM de ter uma entrada aqui, e vice-versa. A guarda
// abaixo (roda no import) falha alto se divergir, e o teste de paridade
// (test/sources.test.js) trava fonte nova sem fetcher antes de chegar em producao.
const SNAPSHOT_FETCHERS = {
  sheets: (source) => fetchSheetsDataSet(source),
  meta: (source) => fetchMetaDataSet(source),
};

// Guarda de co-localizacao (roda no import): as chaves de SNAPSHOT_FETCHERS tem
// de bater EXATAMENTE com os historyTypes() do registry. Sem isso, adicionar uma
// fonte historica sem fetcher (ou o contrario) passaria batido ate rodar o cron.
for (const type of Object.keys(SNAPSHOT_FETCHERS)) {
  const d = getSource(type);
  if (!d || !d.canHistory) {
    throw new Error(`SNAPSHOT_FETCHERS tem '${type}', mas o registry nao marca canHistory:true. Ajuste sources/index.js.`);
  }
}
for (const type of historyTypes()) {
  if (!SNAPSHOT_FETCHERS[type]) {
    throw new Error(`Fonte '${type}' tem canHistory:true no registry mas nao tem fetcher no Worker de snapshot.`);
  }
}

// Exposto para o teste de paridade conferir a cobertura sem duplicar a lista.
export function snapshotFetcherTypes() {
  return Object.keys(SNAPSHOT_FETCHERS);
}

/**
 * Busca o DataSet atual da fonte viva. Devolve null se não souber lidar com o tipo.
 * @param {string} type
 * @param {Object} source
 * @returns {Promise<Object|null>} DataSet (Contrato 1)
 */
async function fetchSnapshotDataSet(type, source) {
  const fetcher = SNAPSHOT_FETCHERS[type];
  if (!fetcher) return null;
  return await fetcher(source);
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
 * Espera source.meta = { token, accountId|account, since?, until?, level? }.
 * O Worker só faz o fetch: a montagem da URL e o mapeamento vêm das funções
 * puras compartilhadas de functions/lib/meta.mjs (mesmo padrão do CSV/Sheets),
 * então não há cópia inline da lógica do Meta aqui.
 * @param {{ meta: Object }} source
 * @returns {Promise<Object>} DataSet
 */
async function fetchMetaDataSet(source) {
  const meta = (source && source.meta) || {};

  // buildInsightsUrl aceita accountId e o alias account (nome que o wizard grava),
  // e valida token/conta ausentes lançando Error.
  const url = buildInsightsUrl({
    token: meta.token,
    accountId: meta.accountId,
    account: meta.account,
    since: meta.since,
    until: meta.until,
    level: meta.level,
  });

  const resp = await fetch(url, { redirect: 'follow' });
  const apiJson = await resp.json();

  // mapInsightsToDataSet já trata { error: { message } } lançando Error.
  const dataset = mapInsightsToDataSet(apiJson);

  // A função pura deixa fetchedAt null (não usa Date); o Worker carimba a data.
  dataset.meta.fetchedAt = new Date().toISOString();
  return dataset;
}
