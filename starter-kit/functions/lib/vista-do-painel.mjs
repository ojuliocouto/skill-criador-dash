// Vista do painel: o que sai para quem ABRE um painel (não para quem o administra). ESM, puro.
//
// Achado 6 da auditoria de 25/10/2026 [Alto]: GET /api/dashboards?id=<id> devolvia a config inteira, com o
// CSV todo (colunas que o painel nem usa, como e-mail e telefone do comprador) e o link da planilha do
// Google (quem tem o link abre a planilha inteira). Quem abre o painel precisa só do que o painel mostra.
//
// Regra:
//  - colunas do painel = os valores do colMap (data, canal, investimento, receita...). Só elas saem.
//  - CSV: o texto guardado é podado para essas colunas (o painel continua mandando o texto para
//    /api/connectors/csv, que lê igual).
//  - planilha: o link e a aba não saem. O painel pede os dados por id (/api/connectors/sheets?id=), e o
//    servidor usa o link guardado.
//  - Meta Ads: só o tipo. A conta e o período ficam no servidor (o token já nunca saía).
//  - fonte sob medida: só o tipo e os campos que não soam a credencial (o handler já varre os segredos).
//
// Quem tem a chave de administrador recebe a config inteira (sem segredo): é o que o assistente usa para
// editar um painel.

import { parseCSV, detectDelimiter } from './csv.mjs';

/**
 * Colunas da fonte que o painel usa: os valores do colMap, sem repetição, na ordem do colMap.
 * @param {object} config
 * @returns {string[]}
 */
export function colunasDoPainel(config) {
  const colMap = config && config.colMap && typeof config.colMap === 'object' ? config.colMap : {};
  const vistas = new Set();
  const out = [];
  for (const v of Object.values(colMap)) {
    if (typeof v !== 'string') continue;
    const nome = v.trim();
    if (!nome || vistas.has(nome)) continue;
    vistas.add(nome);
    out.push(nome);
  }
  return out;
}

function celulaCsv(valor) {
  const v = valor == null ? '' : String(valor);
  return /[",\r\n]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Poda um texto CSV para só as colunas pedidas, na ordem do arquivo. Valores ficam crus (como o parse lê).
 * Sai sempre separado por vírgula, com aspas quando o valor tem vírgula, aspas ou quebra de linha.
 * @param {string} texto
 * @param {string[]} colunas
 * @returns {string}
 */
export function podarCsv(texto, colunas) {
  if (!texto || typeof texto !== 'string') return '';
  const { columns, rows } = parseCSV(texto, { delimiter: detectDelimiter(texto) });
  const ficam = columns.filter((c) => colunas.includes(c));
  const linhas = [ficam.map(celulaCsv).join(',')];
  for (const r of rows) linhas.push(ficam.map((c) => celulaCsv(r[c])).join(','));
  return linhas.join('\n') + '\n';
}

/**
 * Poda um DataSet ({ columns, rows, meta }) para só as colunas pedidas.
 * @param {{columns?:string[], rows?:object[], meta?:object}} dataset
 * @param {string[]} colunas
 * @returns {{columns:string[], rows:object[], meta:object}}
 */
export function podarDataSet(dataset, colunas) {
  const ds = dataset && typeof dataset === 'object' ? dataset : {};
  const cols = (Array.isArray(ds.columns) ? ds.columns : []).filter((c) => colunas.includes(c));
  const rows = (Array.isArray(ds.rows) ? ds.rows : []).map((r) => {
    const o = {};
    for (const c of cols) o[c] = r && r[c] != null ? r[c] : '';
    return o;
  });
  return { ...ds, columns: cols, rows };
}

/**
 * Se o DataSet daquela fonte deve ser podado para as colunas do painel. O Meta Ads tem colunas fixas
 * do conector (e o painel liga Resultados e Receita sozinho quando elas chegam): fica inteiro.
 * @param {object} config
 * @returns {boolean}
 */
export function podaOsDados(config) {
  const tipo = config && config.source && config.source.type;
  return tipo !== 'meta';
}

/**
 * A fonte como o painel precisa dela. Recebe a fonte JÁ sem segredo.
 * @param {object} source
 * @param {string[]} colunas
 * @returns {object|undefined}
 */
function fonteDoPainel(source, colunas) {
  if (!source || typeof source !== 'object') return source;
  const tipo = source.type;
  if (tipo === 'csv') return { type: 'csv', data: podarCsv(source.data, colunas) };
  if (tipo === 'sheets' || tipo === 'meta' || tipo === 'd1') return { type: tipo };
  // Fonte sob medida: sem link nem conta (campos comuns de endereço e de conta saem).
  const out = {};
  for (const [k, v] of Object.entries(source)) {
    if (/^(url|link|endpoint|gid|account|conta|meta|sheet|planilha)$/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * A config como quem abre o painel recebe. Recebe a config JÁ sem segredo (stripSecrets) e devolve uma
 * cópia com a fonte reduzida. Grupo (kind:'group') não tem fonte: sai como veio.
 * @param {object} configSemSegredo
 * @returns {object}
 */
export function vistaDoPainel(configSemSegredo) {
  if (!configSemSegredo || typeof configSemSegredo !== 'object') return configSemSegredo;
  const c = { ...configSemSegredo };
  if (c.source) c.source = fonteDoPainel(c.source, colunasDoPainel(c));
  return c;
}
