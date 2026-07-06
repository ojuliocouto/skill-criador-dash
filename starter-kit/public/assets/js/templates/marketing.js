// Template de dominio: Marketing.
// Slots semanticos, metricas (ordem importa: base antes das derivadas) e layout.
// ESM, sem dependencias externas.

export const template = {
  id: 'marketing',
  label: 'Marketing',
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
    { key: 'impressoes', label: 'Impressões', agg: 'sum', column: 'impressoes', format: 'integer' },
    { key: 'cliques', label: 'Cliques', agg: 'sum', column: 'cliques', format: 'integer' },
    { key: 'leads', label: 'Leads', agg: 'sum', column: 'leads', format: 'integer' },
    { key: 'conversoes', label: 'Conversões', agg: 'sum', column: 'conversoes', format: 'integer' },
    { key: 'receita', label: 'Receita', agg: 'sum', column: 'receita', format: 'currency' },
    // Derivadas
    { key: 'CTR', label: 'CTR', agg: 'ratio', ratioOf: ['cliques', 'impressoes'], format: 'percent' },
    { key: 'CPC', label: 'CPC', agg: 'ratio', ratioOf: ['investimento', 'cliques'], format: 'currency' },
    { key: 'CPL', label: 'CPL', agg: 'ratio', ratioOf: ['investimento', 'leads'], format: 'currency' },
    { key: 'CPA', label: 'CPA', agg: 'ratio', ratioOf: ['investimento', 'conversoes'], format: 'currency' },
    {
      key: 'ROAS',
      label: 'ROAS',
      agg: 'derived',
      format: 'number',
      compute: ({ computed }) => (computed.investimento ? computed.receita / computed.investimento : 0),
    },
  ],
  layout: [
    { widget: 'kpi', props: { metricKey: 'investimento' } },
    { widget: 'kpi', props: { metricKey: 'cliques' } },
    { widget: 'kpi', props: { metricKey: 'CTR' } },
    { widget: 'kpi', props: { metricKey: 'CPL' } },
    { widget: 'kpi', props: { metricKey: 'CPA' } },
    { widget: 'kpi', props: { metricKey: 'ROAS' } },
    { widget: 'timeseries', props: { dateSlot: 'data', valueSlot: 'investimento' } },
    { widget: 'ranking', props: { dimensionSlot: 'canal', valueSlot: 'investimento' } },
    { widget: 'table', props: {} },
  ],
};
