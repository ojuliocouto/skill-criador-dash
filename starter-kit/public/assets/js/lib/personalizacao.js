// Personalização por dashboard: número herói e métricas que não entram. ESM, puro.
//
// Por que existe (T7, teste com aluno de 02/10/2026): o passo 2.5 decide o número herói e o
// que NÃO entra, mas o único lugar pra isso era templates/<dominio>.js, compartilhado por
// TODO dashboard daquele domínio. O aluno editou o template à mão e derrubou 2 testes.
// Agora a decisão mora na config do dashboard (KV), que é da pessoa:
//   config.heroMetric    chave de uma métrica do template (ex: 'CPA')
//   config.hiddenMetrics lista de chaves que não aparecem na faixa de KPI nem no funil
// Nada aqui muta o template original: devolve um template novo pra este dashboard.

function chavesDeMetrica(template) {
  return new Set(((template && template.metrics) || []).map((m) => m && m.key).filter(Boolean));
}

/**
 * Lista as métricas do template pro wizard oferecer como herói ou como "não entra".
 * @returns {{key:string, label:string, naFaixa:boolean}[]}
 */
export function metricasDoPainel(template) {
  const layout = (template && template.layout) || [];
  const naFaixa = new Set(layout.filter((i) => i && i.widget === 'kpi').map((i) => i.props && i.props.metricKey));
  return ((template && template.metrics) || [])
    .filter((m) => m && m.key)
    .map((m) => ({ key: m.key, label: m.label || m.key, naFaixa: naFaixa.has(m.key) }));
}

/**
 * Devolve o template deste dashboard com a personalização aplicada.
 * Herói desconhecido é ignorado; o herói nunca fica oculto; herói fora da faixa entra nela,
 * sempre como primeiro card.
 * @param {object} template template do domínio (não é alterado)
 * @param {object} config config do dashboard
 * @returns {object} template novo
 */
export function aplicarPersonalizacao(template, config) {
  if (!template) return template;
  const c = config && typeof config === 'object' ? config : {};
  const chaves = chavesDeMetrica(template);
  const heroi = typeof c.heroMetric === 'string' && chaves.has(c.heroMetric) ? c.heroMetric : null;
  const ocultas = new Set((Array.isArray(c.hiddenMetrics) ? c.hiddenMetrics : [])
    .filter((k) => typeof k === 'string' && chaves.has(k) && k !== heroi));
  if (!heroi && !ocultas.size) return template;

  const layoutOriginal = Array.isArray(template.layout) ? template.layout : [];
  const layout = [];
  let primeiroKpi = -1;
  let heroiNaFaixa = false;
  for (const item of layoutOriginal) {
    if (!item) continue;
    if (item.widget === 'kpi') {
      const k = item.props && item.props.metricKey;
      if (ocultas.has(k)) continue;
      if (primeiroKpi < 0) primeiroKpi = layout.length;
      if (k === heroi) heroiNaFaixa = true;
      layout.push(item);
      continue;
    }
    if (item.widget === 'funnel' && item.props && Array.isArray(item.props.steps)) {
      const steps = item.props.steps.filter((s) => !(s && ocultas.has(s.metricKey)));
      layout.push({ ...item, props: { ...item.props, steps } });
      continue;
    }
    layout.push(item);
  }

  if (heroi) {
    const cardHeroi = { widget: 'kpi', props: { metricKey: heroi } };
    if (heroiNaFaixa) {
      // Move o herói pro começo da faixa: é ali que o olho pousa.
      const idx = layout.findIndex((i) => i.widget === 'kpi' && i.props && i.props.metricKey === heroi);
      const [card] = layout.splice(idx, 1);
      layout.splice(primeiroKpi, 0, card);
    } else {
      layout.splice(primeiroKpi < 0 ? 0 : primeiroKpi, 0, cardHeroi);
    }
  }

  return { ...template, primaryMetric: heroi || template.primaryMetric, layout };
}
