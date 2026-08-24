// Template de dominio: Financeiro (fluxo de caixa).
// Slots semanticos, metricas (base antes das derivadas) e layout.
// Cada linha da planilha e um lancamento: entrada (dinheiro que entra) e/ou
// saida (dinheiro que sai), com data e categoria. ESM, sem dependencias externas.

export const template = {
  id: 'financeiro',
  label: 'Financeiro',
  // Metrica sugerida para a meta opcional (meta vs realizado).
  primaryMetric: 'saldo',
  // Slot semantico do eixo de TEMPO (usado pela tendencia no dashboard.js).
  dateSlot: 'data',
  slots: [
    { key: 'data', label: 'Data', required: true, aliases: ['data', 'dia', 'date', 'competencia', 'vencimento'] },
    { key: 'categoria', label: 'Categoria', required: false, aliases: ['categoria', 'tipo', 'conta', 'descricao', 'classificacao', 'centro de custo', 'natureza'] },
    { key: 'entrada', label: 'Entrada', required: true, aliases: ['entrada', 'entradas', 'receita', 'recebimento', 'recebido', 'credito', 'faturamento', 'valor recebido'] },
    { key: 'saida', label: 'Saída', required: false, aliases: ['saida', 'saidas', 'despesa', 'despesas', 'pagamento', 'pago', 'debito', 'custo', 'valor pago'] },
  ],
  metrics: [
    // Base (ordem antes das derivadas).
    { key: 'entradas', label: 'Entradas', agg: 'sum', column: 'entrada', format: 'currency', betterWhen: 'higher' },
    { key: 'saidas', label: 'Saídas', agg: 'sum', column: 'saida', format: 'currency', betterWhen: 'lower' },
    // Derivadas
    { key: 'saldo', label: 'Saldo', agg: 'derived', format: 'currency', betterWhen: 'higher',
      compute: ({ computed }) => (computed.entradas || 0) - (computed.saidas || 0) },
    // Margem: quanto do que entrou sobrou como saldo (saldo / entradas).
    { key: 'margem', label: 'Margem', agg: 'ratio', ratioOf: ['saldo', 'entradas'], format: 'percent', betterWhen: 'higher' },
  ],
  layout: [
    { widget: 'kpi', props: { metricKey: 'entradas' } },
    { widget: 'kpi', props: { metricKey: 'saidas' } },
    { widget: 'kpi', props: { metricKey: 'saldo' } },
    { widget: 'kpi', props: { metricKey: 'margem' } },
    { widget: 'timeseries', col: 8, props: { dateSlot: 'data', valueSlot: 'entrada', title: 'Entradas no tempo' } },
    { widget: 'ranking', col: 4, props: { dimensionSlot: 'categoria', valueSlot: 'saida', title: 'Saídas por categoria' } },
    { widget: 'ranking', col: 12, props: { dimensionSlot: 'categoria', valueSlot: 'entrada', title: 'Entradas por categoria' } },
    { widget: 'table', col: 12, props: {} },
  ],
};
