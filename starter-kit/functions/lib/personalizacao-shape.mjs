// Valida a FORMA da personalização do dashboard (T7): heroMetric e hiddenMetrics.
// O servidor não conhece os templates (moram no front), então valida só a forma: chave curta
// de métrica, sem caractere que vire HTML ou CSS. Chave que não existe no template é ignorada
// na hora de renderizar (lib/personalizacao.js), nunca quebra o painel.
const CHAVE = /^[A-Za-z0-9_]{1,40}$/;
const MAX_OCULTAS = 30;

/** @returns {string|null} mensagem de erro em PT-BR, ou null se a forma está certa */
export function validarPersonalizacao(config) {
  const c = config && typeof config === 'object' ? config : {};
  if (c.heroMetric != null && c.heroMetric !== '' && !(typeof c.heroMetric === 'string' && CHAVE.test(c.heroMetric))) {
    return 'Número herói (heroMetric) inválido. Use a chave de uma métrica do domínio, como "CPA" ou "leads".';
  }
  if (c.hiddenMetrics != null) {
    if (!Array.isArray(c.hiddenMetrics)) {
      return 'Métricas ocultas (hiddenMetrics) precisam ser uma lista, como ["CTR"].';
    }
    if (c.hiddenMetrics.length > MAX_OCULTAS) {
      return `Métricas ocultas (hiddenMetrics): no máximo ${MAX_OCULTAS} itens.`;
    }
    if (!c.hiddenMetrics.every((k) => typeof k === 'string' && CHAVE.test(k))) {
      return 'Métricas ocultas (hiddenMetrics): cada item é a chave de uma métrica, como "CTR".';
    }
  }
  return null;
}
