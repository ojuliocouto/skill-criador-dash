// Registro (registry) de FONTES de dados (conectores). ESM.
//
// Este e o registry de fontes, espelho de widgets/index.js e templates/index.js.
// Cada entrada mapeia o TIPO da fonte (source.type) para um descritor com o que
// o resto do app precisa decidir sobre aquela fonte, sem espalhar ternarios e
// condicionais hardcoded pelos arquivos:
//   - label: nome amigavel mostrado na UI (ex: rodape do dashboard).
//   - canHistory: se a fonte suporta o modo historico (snapshot no D1 via cron).
//       Fontes vivas (planilha, Meta) suportam; fontes estaticas (CSV) e a
//       propria leitura de D1 nao suportam (o CSV ja esta salvo na config e o
//       D1 ja e o historico).
//
// Objetivo: adicionar uma fonte nova = 1 entrada aqui + o handler de fetch em
// lib/api-client.js (fetch live no browser) e, se a fonte tiver canHistory:true,
// tambem no Worker de snapshot (fetch server-side). Os pontos de decisao (label
// na dashboard.js, canHistory no config-wizard.js) leem daqui, em vez de
// reimplementar a lista.
//
// Por que o "como buscar" NAO mora inteiro aqui: o fetch live usa APIs de browser
// (chama as Functions via fetch relativo, le localStorage/sessionStorage) e o
// fetch do Worker usa a Graph API / gviz direto. Sao ambientes diferentes. Se
// este modulo importasse qualquer um dos dois, viraria impuro e o Worker (que
// tambem importa este arquivo) quebraria. Entao aqui ficam METADADOS + um
// identificador estavel (o proprio `type`) + helpers de iteracao; cada consumidor
// registra os fetchers no seu ambiente e VALIDA as chaves contra este registry
// (ver historyTypes() e o teste de paridade em test/sources.test.js). Assim,
// adicionar uma fonte sem o fetcher correspondente quebra o teste, nao a producao.

/**
 * @typedef {Object} SourceDescriptor
 * @property {string} type       Identificador do tipo (chave do registry).
 * @property {string} label      Nome amigavel para a UI.
 * @property {boolean} canHistory Se suporta o modo historico (snapshot no D1).
 */

/** @type {Object<string, SourceDescriptor>} */
export const SOURCES = {
  sheets: { type: 'sheets', label: 'Google Sheets', canHistory: true },
  csv: { type: 'csv', label: 'CSV', canHistory: false },
  meta: { type: 'meta', label: 'Meta Ads', canHistory: true },
  d1: { type: 'd1', label: 'Historico (D1)', canHistory: false },
};

/**
 * Retorna o descritor da fonte pelo tipo, ou undefined se nao existir.
 * @param {string} type
 * @returns {SourceDescriptor|undefined}
 */
export function getSource(type) {
  return SOURCES[type];
}

/**
 * Lista estavel de todos os `type` conhecidos (chaves do registry).
 * Consumidores (api-client, Worker) iteram/validam a partir daqui, em vez de
 * manter uma lista solta que diverge em silencio.
 * @returns {string[]}
 */
export function sourceTypes() {
  return Object.keys(SOURCES);
}

/**
 * Lista dos `type` que suportam o modo historico (canHistory:true). E a fonte de
 * verdade de "quais fontes o Worker de snapshot precisa saber buscar". O Worker
 * valida seu mapa local de fetchers contra esta lista (ver teste de paridade).
 * @returns {string[]}
 */
export function historyTypes() {
  return sourceTypes().filter((type) => SOURCES[type].canHistory);
}
