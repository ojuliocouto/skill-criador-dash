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
// lib/api-client.js. Os pontos de decisao (label na dashboard.js, canHistory no
// config-wizard.js) leem daqui, em vez de reimplementar a lista.

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
