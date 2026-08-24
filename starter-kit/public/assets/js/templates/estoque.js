// Template de dominio: Estoque (produtos).
// Slots semanticos, metricas (base antes das derivadas) e layout.
// Cada linha e um produto/movimento: quantidade vendida, saldo em estoque e
// faturamento, com produto e categoria. ESM, sem dependencias externas.

export const template = {
  id: 'estoque',
  label: 'Estoque',
  // Metrica sugerida para a meta opcional (meta vs realizado).
  primaryMetric: 'receita',
  // Slot semantico do eixo de TEMPO (usado pela tendencia no dashboard.js).
  dateSlot: 'data',
  slots: [
    { key: 'data', label: 'Data', required: false, aliases: ['data', 'dia', 'date', 'competencia'] },
    { key: 'produto', label: 'Produto', required: true, aliases: ['produto', 'item', 'sku', 'mercadoria', 'nome', 'descricao'] },
    { key: 'categoria', label: 'Categoria', required: false, aliases: ['categoria', 'tipo', 'departamento', 'secao', 'grupo', 'marca'] },
    { key: 'quantidade', label: 'Qtd. vendida', required: true, aliases: ['quantidade', 'qtd', 'qtde', 'vendidos', 'quantidade vendida', 'unidades', 'unidades vendidas'] },
    { key: 'estoque', label: 'Em estoque', required: false, aliases: ['estoque', 'estoque atual', 'em estoque', 'saldo', 'disponivel', 'quantidade em estoque'] },
    { key: 'valor', label: 'Faturamento', required: false, aliases: ['valor', 'faturamento', 'receita', 'total', 'valor total', 'preco'] },
  ],
  metrics: [
    // Base (ordem antes das derivadas).
    { key: 'itens_vendidos', label: 'Itens vendidos', agg: 'sum', column: 'quantidade', format: 'integer', betterWhen: 'higher' },
    { key: 'receita', label: 'Faturamento', agg: 'sum', column: 'valor', format: 'currency', betterWhen: 'higher' },
    { key: 'estoque_atual', label: 'Em estoque', agg: 'sum', column: 'estoque', format: 'integer' },
    { key: 'skus', label: 'Produtos ativos', agg: 'countDistinct', column: 'produto', format: 'integer', betterWhen: 'higher' },
    // Derivadas: giro = itens vendidos por unidade parada em estoque.
    { key: 'giro', label: 'Giro', agg: 'ratio', ratioOf: ['itens_vendidos', 'estoque_atual'], format: 'number', betterWhen: 'higher' },
  ],
  layout: [
    { widget: 'kpi', props: { metricKey: 'receita' } },
    { widget: 'kpi', props: { metricKey: 'itens_vendidos' } },
    { widget: 'kpi', props: { metricKey: 'estoque_atual' } },
    { widget: 'kpi', props: { metricKey: 'skus' } },
    { widget: 'kpi', props: { metricKey: 'giro' } },
    { widget: 'timeseries', col: 8, props: { dateSlot: 'data', valueSlot: 'valor', title: 'Faturamento no tempo' } },
    { widget: 'ranking', col: 4, props: { dimensionSlot: 'categoria', valueSlot: 'valor', title: 'Faturamento por categoria' } },
    { widget: 'ranking', col: 6, props: { dimensionSlot: 'produto', valueSlot: 'quantidade', title: 'Mais vendidos (qtd)' } },
    { widget: 'ranking', col: 6, props: { dimensionSlot: 'produto', valueSlot: 'valor', title: 'Top produtos por faturamento' } },
    { widget: 'table', col: 12, props: {} },
  ],
};
