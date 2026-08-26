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
    { widget: 'timeseries', col: 12, props: { dateSlot: 'data', valueSlot: 'entrada', title: 'Entradas no tempo' } },
    // hideZeros: no fluxo de caixa a MESMA coluna de categoria descreve os dois
    // lados (Fornecedor e despesa, Vendas balcão e receita). Sem o filtro, o
    // ranking de saídas lista as categorias de receita zeradas e o de entradas
    // lista as de despesa zeradas, enchendo a tela de barra vazia. O flag manda
    // o widget descartar a linha cujo valor agregado deu zero.
    // format: 'currency' explicito: o registry herda formato da MetricDef que
    // casa por KEY com o valueSlot, mas as chaves aqui sao 'saidas'/'entradas'
    // (plural) e os slots 'saida'/'entrada' (singular) nunca casam. Sem isso o
    // ranking caia no formato 'number' padrao, sem "R$" e com casa decimal
    // cortada (ex "9.640,2" em vez de "R$ 9.640,20").
    { widget: 'ranking', col: 6, props: { dimensionSlot: 'categoria', valueSlot: 'saida', title: 'Saídas por categoria', hideZeros: true, format: 'currency' } },
    { widget: 'ranking', col: 6, props: { dimensionSlot: 'categoria', valueSlot: 'entrada', title: 'Entradas por categoria', hideZeros: true, format: 'currency' } },
    { widget: 'table', col: 12, props: {} },
  ],
};
