// Modelo PRÓPRIO dos testes de biblioteca (regra da casa: test/*.test.js não depende do modelo
// de fábrica; quem confere o que vem de fábrica mora em test/layout-padrao/).
export const modeloComAbas = {
  id: 'marketing', label: 'Teste com abas', primaryMetric: 'leads', dateSlot: 'data',
  slots: [
    { key: 'data', label: 'Data', required: true, aliases: ['data'] },
    { key: 'canal', label: 'Canal', required: false, aliases: ['canal'] },
    { key: 'investimento', label: 'Investimento', required: true, aliases: ['investimento'] },
    { key: 'leads', label: 'Leads', required: false, aliases: ['leads'] },
  ],
  metrics: [
    { key: 'investimento', label: 'Investimento', agg: 'sum', column: 'investimento', format: 'currency' },
    { key: 'leads', label: 'Leads', agg: 'sum', column: 'leads', format: 'integer', betterWhen: 'higher' },
    { key: 'CPL', label: 'CPL', agg: 'ratio', ratioOf: ['investimento', 'leads'], format: 'currency', betterWhen: 'lower' },
  ],
  layout: [{ widget: 'kpi', props: { metricKey: 'investimento' } }],
  tabs: [
    {
      id: 'geral', label: 'Visão geral', layout: [
        { widget: 'kpi', props: { metricKey: 'investimento' } },
        { widget: 'kpi', props: { metricKey: 'leads' } },
        { widget: 'kpi', props: { metricKey: 'CPL' } },
        { widget: 'resumo', col: 8, props: { groupBy: 'canal', metrics: ['investimento', 'leads'], title: 'Por canal' } },
        { widget: 'ranking', col: 4, props: { dimensionSlot: 'canal', valueSlot: 'leads', title: 'Ranking' } },
      ],
    },
    { id: 'dados', label: 'Dados', layout: [{ widget: 'table', props: { title: 'Linha a linha' } }] },
  ],
};

export const modeloSemAbas = {
  id: 'vendas', label: 'Teste sem abas', primaryMetric: 'faturamento', dateSlot: 'data',
  slots: [
    { key: 'data', label: 'Data', required: true, aliases: ['data'] },
    { key: 'valor', label: 'Valor', required: true, aliases: ['valor'] },
  ],
  metrics: [
    { key: 'faturamento', label: 'Faturamento', agg: 'sum', column: 'valor', format: 'currency' },
    { key: 'vendas', label: 'Vendas', agg: 'count', column: 'valor', format: 'integer' },
  ],
  layout: [
    { widget: 'kpi', props: { metricKey: 'faturamento' } },
    { widget: 'kpi', props: { metricKey: 'vendas' } },
    { widget: 'timeseries', col: 6, props: { dateSlot: 'data', valueSlot: 'valor', title: 'No tempo' } },
    { widget: 'table', props: { title: 'Linha a linha' } },
  ],
};

export const estadoBase = {
  id: null, name: '  Estúdio  ', domain: 'marketing',
  source: { type: 'csv', data: 'Data,Investimento\n01/07/2026,10' },
  colMap: { data: 'Data', investimento: 'Investimento', canal: null },
  accent: '#2563eb', accent2: '', logo: '', logoFundo: '', heroMetric: '', hiddenMetrics: [],
  goal: '', labels: {}, storage: '',
};
