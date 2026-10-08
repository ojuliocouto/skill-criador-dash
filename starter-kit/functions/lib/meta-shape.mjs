// Valida a FORMA de config.goal: { metricKey, value, periodo? }. `periodo` diz a que período a meta se refere
// (mensal, semanal, periodo, total). Ausente é válido: painel antigo continua comparando com o período filtrado.
// A lista é a MESMA de PERIODOS_DA_META no navegador (public/assets/js/lib/meta-periodo.js; paridade coberta por teste).
export const PERIODOS_ACEITOS = new Set(['mensal', 'semanal', 'periodo', 'total']);

/** @returns {string|null} mensagem de erro em PT-BR, ou null se a forma está certa */
export function validarMeta(config) {
  const g = config && typeof config === 'object' ? config.goal : undefined;
  if (g == null) return null;
  if (typeof g !== 'object' || Array.isArray(g)) {
    return 'Meta (goal) precisa ser um objeto, como { "metricKey": "leads", "value": 400 } mais o período da meta.';
  }
  if (typeof g.metricKey !== 'string' || !/^[A-Za-z0-9_]{1,40}$/.test(g.metricKey)) {
    return 'Meta (goal): metricKey precisa ser a chave do número, como "leads".';
  }
  if (typeof g.value !== 'number' || !Number.isFinite(g.value) || g.value <= 0) {
    return 'Meta (goal): value precisa ser um número maior que zero.';
  }
  if (g.periodo != null && (typeof g.periodo !== 'string' || !PERIODOS_ACEITOS.has(g.periodo))) {
    return `Meta (goal): o período da meta é inválido. Use um destes valores: ${[...PERIODOS_ACEITOS].map((p) => `"${p}"`).join(', ')}.`;
  }
  return null;
}
