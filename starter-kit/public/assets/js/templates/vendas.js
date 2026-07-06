// Template de dominio: Vendas.
// Slots semanticos, metricas (base antes das derivadas) e layout.
// ESM, sem dependencias externas.

export const template = {
  id: 'vendas',
  label: 'Vendas',
  slots: [
    { key: 'data', label: 'Data', required: true, aliases: ['data', 'dia', 'date'] },
    { key: 'vendedor', label: 'Vendedor', required: false, aliases: ['vendedor', 'vendedora', 'responsavel', 'sdr', 'closer', 'seller'] },
    { key: 'produto', label: 'Produto', required: false, aliases: ['produto', 'item', 'plano', 'oferta'] },
    { key: 'valor', label: 'Valor', required: true, aliases: ['valor', 'preco', 'faturamento', 'receita', 'total', 'amount'] },
    { key: 'status', label: 'Status', required: false, aliases: ['status', 'situacao', 'stage', 'etapa'] },
  ],
  metrics: [
    { key: 'faturamento', label: 'Faturamento', agg: 'sum', column: 'valor', format: 'currency' },
    { key: 'num_vendas', label: 'Número de vendas', agg: 'count', column: 'valor', format: 'integer' },
    { key: 'ticket_medio', label: 'Ticket médio', agg: 'avg', column: 'valor', format: 'currency' },
  ],
  layout: [
    { widget: 'kpi', props: { metricKey: 'faturamento' } },
    { widget: 'kpi', props: { metricKey: 'num_vendas' } },
    { widget: 'kpi', props: { metricKey: 'ticket_medio' } },
    { widget: 'timeseries', props: { dateSlot: 'data', valueSlot: 'valor' } },
    { widget: 'ranking', props: { dimensionSlot: 'vendedor', valueSlot: 'valor' } },
    { widget: 'ranking', props: { dimensionSlot: 'produto', valueSlot: 'valor' } },
    { widget: 'table', props: {} },
  ],
};
