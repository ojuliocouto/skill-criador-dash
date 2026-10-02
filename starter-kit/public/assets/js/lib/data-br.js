// Data em formato brasileiro (dd/mm/aaaa) nos campos de filtro. ESM, puro.
//
// Por que existe (print real de 02/10/2026): o <input type="date"> segue o idioma do
// NAVEGADOR, não o lang="pt-BR" da página. Em Chrome em inglês a data aparecia mm/dd/yyyy.
// O campo agora é de texto com máscara, e a conversão pra ISO (que os filtros usam) é aqui.

/** '05/07/2026' -> '2026-07-05'; data incompleta ou que não existe -> null. */
export function brParaISO(texto) {
  const m = String(texto || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mes, a] = m;
  const dt = new Date(Date.UTC(Number(a), Number(mes) - 1, Number(d)));
  if (dt.getUTCFullYear() !== Number(a) || dt.getUTCMonth() !== Number(mes) - 1 || dt.getUTCDate() !== Number(d)) return null;
  return `${a}-${mes}-${d}`;
}

/** '2026-07-05' -> '05/07/2026'; fora do formato -> ''. */
export function isoParaBR(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Põe as barras enquanto a pessoa digita: '0507' -> '05/07'. Máximo dd/mm/aaaa. */
export function mascaraDataBR(texto) {
  const dig = String(texto || '').replace(/\D/g, '').slice(0, 8);
  if (dig.length <= 2) return dig;
  if (dig.length <= 4) return `${dig.slice(0, 2)}/${dig.slice(2)}`;
  return `${dig.slice(0, 2)}/${dig.slice(2, 4)}/${dig.slice(4)}`;
}
