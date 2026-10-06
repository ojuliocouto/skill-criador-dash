// O que o assistente mostra depois de conectar a origem dos números. ESM, puro.
// Linhas, colunas, período detectado (primeira e última data), prévia das primeiras linhas e
// as colunas obrigatórias que não foram reconhecidas.

import { autoMap } from './automap.js';
import { parseDateBR } from './format.js';
import { dateBounds } from './filters.js';
import { isoParaBR } from './data-br.js';
import { validateRequired } from './mapa-colunas.js';

/** Código da aba (o número depois de gid= no endereço da planilha), ou null. */
export function gidDoLink(url) {
  const m = String(url == null ? '' : url).match(/[#?&]gid=(\d+)(?![\w-])/);
  return m ? m[1] : null;
}

function contaDatas(rows, coluna) {
  let preenchidas = 0;
  let datas = 0;
  for (const r of rows) {
    const v = r == null ? '' : r[coluna];
    if (v == null || String(v).trim() === '') continue;
    preenchidas += 1;
    if (parseDateBR(v)) datas += 1;
  }
  return { preenchidas, datas };
}

/**
 * Coluna de data do arquivo. Primeiro a que o reconhecimento automático casa com o campo de
 * tempo do modelo (se ela tiver data de verdade); senão, a primeira coluna em que pelo menos
 * 8 de cada 10 células preenchidas são data.
 * @returns {string|null}
 */
export function colunaDeData(dataset, template) {
  const columns = (dataset && Array.isArray(dataset.columns)) ? dataset.columns : [];
  const rows = (dataset && Array.isArray(dataset.rows)) ? dataset.rows : [];
  if (!columns.length || !rows.length) return null;
  const campoDeData = (template && template.dateSlot) || 'data';
  const palpite = autoMap((template && template.slots) || [], columns)[campoDeData];
  if (palpite && contaDatas(rows, palpite).datas > 0) return palpite;
  for (const c of columns) {
    const { preenchidas, datas } = contaDatas(rows, c);
    if (datas >= 1 && datas >= preenchidas * 0.8) return c;
  }
  return null;
}

/**
 * @returns {{coluna:string, de:string, ate:string, dias:number}|null} datas em dd/mm/aaaa;
 *   dias = quantas datas distintas existem no arquivo
 */
export function periodoDetectado(dataset, template) {
  const coluna = colunaDeData(dataset, template);
  if (!coluna) return null;
  const { min, max } = dateBounds(dataset.rows, coluna);
  if (!min || !max) return null;
  const distintas = new Set();
  for (const r of dataset.rows) { const iso = parseDateBR(r && r[coluna]); if (iso) distintas.add(iso); }
  return { coluna, de: isoParaBR(min), ate: isoParaBR(max), dias: distintas.size };
}

/** As n primeiras linhas, como listas de texto na ordem das colunas. */
export function primeirasLinhas(dataset, n = 3) {
  const columns = (dataset && Array.isArray(dataset.columns)) ? dataset.columns : [];
  const rows = (dataset && Array.isArray(dataset.rows)) ? dataset.rows : [];
  return {
    columns: [...columns],
    rows: rows.slice(0, n).map((r) => columns.map((c) => (r == null || r[c] == null ? '' : String(r[c])))),
  };
}

/** Tudo que a confirmação de conexão mostra. */
export function resumoDaConexao(dataset, template) {
  const columns = (dataset && Array.isArray(dataset.columns)) ? dataset.columns : [];
  const rows = (dataset && Array.isArray(dataset.rows)) ? dataset.rows : [];
  const informado = dataset && dataset.meta && dataset.meta.rowCount;
  const slots = (template && template.slots) || [];
  return {
    linhas: Number.isFinite(Number(informado)) && informado != null ? Number(informado) : rows.length,
    colunas: columns.length,
    periodo: periodoDetectado(dataset, template),
    previa: primeirasLinhas(dataset, 3),
    obrigatoriasAusentes: validateRequired(slots, autoMap(slots, columns)),
  };
}
