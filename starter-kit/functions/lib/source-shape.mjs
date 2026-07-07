// Validacao de FORMA da fonte de um dashboard (puro, testavel).
// Chamada pelo POST de functions/api/dashboards.js antes de gravar a config.
//
// Por que existe (achado de auditoria): sem esta checagem, uma config com a
// fonte malformada (ex: csv com o conteudo num campo "csvText" em vez de
// "data") era aceita com 200 e gravada no KV; o erro so aparecia depois, na
// renderizacao ("O CSV enviado esta vazio"), longe da causa. Validar no POST
// devolve 400 apontando o campo exato, no momento do engano.
//
// Contrato: ESTRITA nos tipos conhecidos (csv/sheets/meta, as formas que o
// wizard grava), PERMISSIVA nos desconhecidos: conector sob medida define os
// proprios campos, entao um type fora da lista passa sem exigencias.

/**
 * Valida a forma de `source` conforme o tipo.
 * @param {object} source objeto ja garantido pelo handler (typeof === 'object')
 * @returns {string|null} mensagem de erro em PT-BR, ou null se valida
 */
export function validarFonte(source) {
  const type = typeof source.type === 'string' ? source.type.trim() : '';
  if (!type) {
    return 'A fonte precisa do campo "type" (ex: sheets, csv, meta).';
  }
  if (type === 'csv') {
    if (typeof source.data !== 'string' || !source.data.trim()) {
      return 'Fonte csv: falta o campo "data" com o conteúdo do CSV (string). É "data", não "csvText".';
    }
    return null;
  }
  if (type === 'sheets') {
    if (typeof source.url !== 'string' || !source.url.trim()) {
      return 'Fonte sheets: falta o campo "url" com o link da planilha.';
    }
    return null;
  }
  if (type === 'meta') {
    const meta = source.meta;
    const faltando = [];
    if (!meta || typeof meta !== 'object' || !String(meta.token || '').trim()) faltando.push('meta.token');
    if (!meta || typeof meta !== 'object' || !String(meta.account || '').trim()) faltando.push('meta.account');
    if (faltando.length) {
      return `Fonte meta: falta ${faltando.join(' e ')}.`;
    }
    return null;
  }
  // Tipo fora da lista = conector sob medida: a forma e do conector, nao daqui.
  return null;
}
