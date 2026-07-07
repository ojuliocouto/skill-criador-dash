// Template de dominio: Marketing.
// Slots semanticos, metricas (ordem importa: base antes das derivadas) e layout.
// ESM, sem dependencias externas.

export const template = {
  id: 'marketing',
  label: 'Marketing',
  // Metrica sugerida para a meta opcional (meta vs realizado).
  primaryMetric: 'leads',
  // Slot semantico que representa o eixo de TEMPO deste dominio. O dashboard.js
  // le daqui para calcular a tendencia (2a metade vs 1a metade do periodo), em
  // vez de assumir 'data'. Mantem o contrato slot-agnostico: se um dominio novo
  // chamar o slot de tempo de outra coisa, basta declarar aqui.
  dateSlot: 'data',
  slots: [
    { key: 'data', label: 'Data', required: true, aliases: ['data', 'dia', 'date'] },
    { key: 'canal', label: 'Canal', required: false, aliases: ['canal', 'origem', 'fonte', 'plataforma', 'campanha'] },
    { key: 'investimento', label: 'Investimento', required: true, aliases: ['investimento', 'gasto', 'custo', 'valor gasto', 'spend', 'amount spent'] },
    { key: 'impressoes', label: 'Impressões', required: false, aliases: ['impressoes', 'impressions', 'impressao'] },
    { key: 'cliques', label: 'Cliques', required: false, aliases: ['cliques', 'clicks', 'clique'] },
    { key: 'leads', label: 'Leads', required: false, aliases: ['leads', 'lead', 'cadastros'] },
    { key: 'conversoes', label: 'Conversões', required: false, aliases: ['conversoes', 'conversao', 'vendas', 'purchases', 'compras'] },
    { key: 'receita', label: 'Receita', required: false, aliases: ['receita', 'faturamento', 'revenue', 'valor de conversao'] },
  ],
  metrics: [
    // Base (ordem antes das derivadas)
    { key: 'investimento', label: 'Investimento', agg: 'sum', column: 'investimento', format: 'currency' },
    { key: 'impressoes', label: 'Impressões', agg: 'sum', column: 'impressoes', format: 'integer', betterWhen: 'higher' },
    { key: 'cliques', label: 'Cliques', agg: 'sum', column: 'cliques', format: 'integer', betterWhen: 'higher' },
    { key: 'leads', label: 'Leads', agg: 'sum', column: 'leads', format: 'integer', betterWhen: 'higher' },
    { key: 'conversoes', label: 'Conversões', agg: 'sum', column: 'conversoes', format: 'integer', betterWhen: 'higher' },
    { key: 'receita', label: 'Receita', agg: 'sum', column: 'receita', format: 'currency', betterWhen: 'higher' },
    // Derivadas
    { key: 'CTR', label: 'CTR', agg: 'ratio', ratioOf: ['cliques', 'impressoes'], format: 'percent', betterWhen: 'higher' },
    { key: 'CPC', label: 'CPC', agg: 'ratio', ratioOf: ['investimento', 'cliques'], format: 'currency', betterWhen: 'lower' },
    { key: 'CPL', label: 'CPL', agg: 'ratio', ratioOf: ['investimento', 'leads'], format: 'currency', betterWhen: 'lower' },
    { key: 'CPA', label: 'CPA', agg: 'ratio', ratioOf: ['investimento', 'conversoes'], format: 'currency', betterWhen: 'lower' },
    {
      key: 'ROAS',
      label: 'ROAS',
      agg: 'derived',
      format: 'number',
      betterWhen: 'higher',
      compute: ({ computed }) => (computed.investimento ? computed.receita / computed.investimento : 0),
    },
  ],
  layout: [
    { widget: 'kpi', props: { metricKey: 'investimento' } },
    { widget: 'kpi', props: { metricKey: 'leads' } },
    { widget: 'kpi', props: { metricKey: 'CTR' } },
    { widget: 'kpi', props: { metricKey: 'CPL' } },
    { widget: 'kpi', props: { metricKey: 'CPA' } },
    { widget: 'kpi', props: { metricKey: 'ROAS' } },
    { widget: 'timeseries', col: 8, props: { dateSlot: 'data', valueSlot: 'investimento', title: 'Investimento no tempo' } },
    { widget: 'funnel', col: 4, props: { title: 'Funil de conversão', steps: [
      { label: 'Impressões', metricKey: 'impressoes' },
      { label: 'Cliques', metricKey: 'cliques' },
      { label: 'Leads', metricKey: 'leads' },
      { label: 'Conversões', metricKey: 'conversoes' },
    ] } },
    { widget: 'ranking', col: 4, props: { dimensionSlot: 'canal', valueSlot: 'investimento', title: 'Ranking por canal' } },
    { widget: 'table', col: 8, props: {} },
  ],
};
