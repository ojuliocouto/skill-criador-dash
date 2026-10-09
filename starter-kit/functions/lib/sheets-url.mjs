// Lógica pura de conversão de link do Google Sheets, compartilhada pelos
// conectores e pelo Worker de snapshot. Sem rede, sem estado global, sem
// dependências externas. Testável em node:test.
//
// Manter esta função em um único lugar evita drift: o handler de Pages
// (functions/api/connectors/sheets.js) e o Worker de snapshot
// (workers/snapshot/src/index.js) importam daqui a MESMA lógica.

/**
 * Acha o gid (a aba) escrito no próprio link: `...edit#gid=777` ou `...edit?gid=777`.
 * @param {string} url
 * @returns {string|null} só dígitos, ou null se o link não traz aba
 */
function gidDoLink(url) {
  const m = String(url || '').match(/[#?&]gid=(\d+)/);
  return m ? m[1] : null;
}

/**
 * Converte um link de planilha Google no endpoint gviz que devolve CSV.
 * Extrai o ID do trecho /spreadsheets/d/{ID}/ do link.
 *
 * A aba: um `gid` explícito diferente de 0 manda; senão vale o `gid` do próprio link (quem copia o link da
 * segunda aba recebe `...#gid=777`); senão a primeira aba (gid 0). O gid só aceita dígitos, então nada além
 * do número da aba entra na URL que o servidor busca.
 * @param {string} url   link completo da planilha
 * @param {string} [gid] aba (gid), default '0'
 * @returns {string} endpoint gviz que responde CSV
 * @throws {Error} se o link não contiver um ID de planilha válido
 */
export function sheetUrlToCsv(url, gid = '0') {
  const match = String(url || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    throw new Error('Link de planilha Google inválido. Cole o link completo da planilha.');
  }
  const id = match[1];
  const explicito = /^\d+$/.test(String(gid || '')) ? String(gid) : '0';
  const aba = explicito !== '0' ? explicito : (gidDoLink(url) || '0');
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${aba}`;
}
