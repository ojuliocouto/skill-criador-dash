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
 * Toda chave de número que ALGUM widget do painel mostra: cartão da faixa, passo do funil, coluna de tabela
 * por canal, semana ou dados. Plano e abas. É a lista do que a pessoa pode querer esconder.
 * @returns {Set<string>}
 */
export function numerosExibidos(template) {
  const out = new Set();
  const visitar = (item) => {
    const p = (item && item.props) || {};
    if (!item) return;
    if (item.widget === 'kpi' && p.metricKey) out.add(p.metricKey);
    if (item.widget === 'funnel' && Array.isArray(p.steps)) p.steps.forEach((s) => s && s.metricKey && out.add(s.metricKey));
    if (item.widget === 'resumo' && Array.isArray(p.metrics)) p.metrics.forEach((m) => { const k = chaveDe(m); if (k) out.add(k); });
  };
  ((template && template.layout) || []).forEach(visitar);
  ((template && Array.isArray(template.tabs)) ? template.tabs : []).forEach((t) => ((t && t.layout) || []).forEach(visitar));
  return out;
}

/**
 * Lista as métricas do template pro wizard oferecer como herói ou como "não entra".
 * @returns {{key:string, label:string, naFaixa:boolean, exibido:boolean}[]} `exibido`: algum widget mostra esse número
 */
export function metricasDoPainel(template) {
  // "Na faixa" olha o layout plano e o de cada aba: com abas, o que a pessoa vê é a faixa da aba.
  const layouts = [(template && template.layout) || []]
    .concat(((template && Array.isArray(template.tabs)) ? template.tabs : []).map((t) => (t && t.layout) || []));
  const naFaixa = new Set(layouts.flat().filter((i) => i && i.widget === 'kpi').map((i) => i.props && i.props.metricKey));
  const exibidos = numerosExibidos(template);
  return ((template && template.metrics) || [])
    .filter((m) => m && m.key)
    .map((m) => ({ key: m.key, label: m.label || m.key, naFaixa: naFaixa.has(m.key), exibido: exibidos.has(m.key) }));
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

  // Layout plano: o herói sempre entra (mesmo sem faixa, como antes das abas).
  const layout = personalizarLayout(template.layout, heroi, ocultas, true);
  const out = { ...template, primaryMetric: heroi || template.primaryMetric, layout };
  // Abas: a mesma regra em cada aba. O herói só entra onde já existe faixa de indicador: uma
  // aba só de tabela não ganha uma faixa de um card só.
  if (Array.isArray(template.tabs)) {
    out.tabs = template.tabs.map((t) => (t && Array.isArray(t.layout)
      ? { ...t, layout: personalizarLayout(t.layout, heroi, ocultas, false) }
      : t));
  }
  return out;
}

const chaveDe = (m) => (typeof m === 'string' ? m : (m && m.key));

// Aplica herói e métricas ocultas a UM layout (o plano ou o de uma aba). Não muta a entrada.
function personalizarLayout(layoutOriginal, heroi, ocultas, inserirSemFaixa) {
  const original = Array.isArray(layoutOriginal) ? layoutOriginal : [];
  const layout = [];
  let primeiroKpi = -1;
  let heroiNaFaixa = false;
  for (const item of original) {
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
    // Resumo: a métrica oculta sai da tabela; resumo que ficou sem métrica nenhuma some.
    if (item.widget === 'resumo' && item.props && Array.isArray(item.props.metrics) && ocultas.size) {
      const metrics = item.props.metrics.filter((m) => !ocultas.has(chaveDe(m)));
      if (!metrics.length) continue;
      layout.push({ ...item, props: { ...item.props, metrics } });
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
    } else if (primeiroKpi >= 0) {
      layout.splice(primeiroKpi, 0, cardHeroi);
    } else if (inserirSemFaixa) {
      layout.splice(0, 0, cardHeroi);
    }
  }
  return layout;
}
