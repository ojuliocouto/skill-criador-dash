// Template de dominio: Suporte (atendimento).
// Slots semanticos, metricas (base antes das derivadas) e layout.
// Colunas numericas somaveis (volume): timeSeries e groupBy usam agg 'sum'.
// ESM, sem dependencias externas.

export const template = {
  id: 'suporte',
  label: 'Suporte',
  // Metrica sugerida para a meta opcional (meta vs realizado).
  primaryMetric: 'atendimentos',
  // Slot semantico do eixo de TEMPO (usado pela tendencia no dashboard.js).
  dateSlot: 'data',
  slots: [
    { key: 'data', label: 'Data', required: true, aliases: ['data', 'dia', 'date'] },
    { key: 'canal', label: 'Canal', required: false, aliases: ['canal', 'origem', 'fila', 'setor', 'time'] },
    { key: 'atendimentos', label: 'Atendimentos', required: true, aliases: ['atendimentos', 'tickets', 'chamados', 'conversas', 'volume', 'atendimento'] },
    { key: 'resolvidos', label: 'Resolvidos', required: false, aliases: ['resolvidos', 'resolvido', 'fechados', 'concluidos', 'solved', 'closed'] },
    { key: 'tempo_resposta', label: 'Tempo de resposta', required: false, aliases: ['tempo de resposta', 'tempo resposta', 'tempo primeira resposta', 'first response', 'tempo medio', 'tma'] },
    { key: 'csat', label: 'CSAT', required: false, aliases: ['csat', 'satisfacao', 'nota', 'avaliacao', 'nps'] },
  ],
  metrics: [
    // Base (ordem antes das derivadas). Volume e neutro: sem betterWhen.
    { key: 'atendimentos', label: 'Atendimentos', agg: 'sum', column: 'atendimentos', format: 'integer' },
    { key: 'resolvidos', label: 'Resolvidos', agg: 'sum', column: 'resolvidos', format: 'integer', betterWhen: 'higher' },
    { key: 'tempo_resposta', label: 'Tempo de resposta', agg: 'avg', column: 'tempo_resposta', format: 'number', betterWhen: 'lower' },
    { key: 'csat', label: 'CSAT', agg: 'avg', column: 'csat', format: 'number', betterWhen: 'higher' },
    // Derivadas
    { key: 'taxa_resolucao', label: 'Taxa de resolução', agg: 'ratio', ratioOf: ['resolvidos', 'atendimentos'], format: 'percent', betterWhen: 'higher' },
  ],
  layout: [
    { widget: 'kpi', props: { metricKey: 'atendimentos' } },
    { widget: 'kpi', props: { metricKey: 'resolvidos' } },
    { widget: 'kpi', props: { metricKey: 'taxa_resolucao' } },
    { widget: 'kpi', props: { metricKey: 'tempo_resposta' } },
    { widget: 'kpi', props: { metricKey: 'csat' } },
    { widget: 'funnel', props: { title: 'Resolução', steps: [
      { label: 'Atendimentos', metricKey: 'atendimentos' },
      { label: 'Resolvidos', metricKey: 'resolvidos' },
    ] } },
    { widget: 'timeseries', props: { dateSlot: 'data', valueSlot: 'atendimentos', title: 'Atendimentos no tempo' } },
    { widget: 'ranking', props: { dimensionSlot: 'canal', valueSlot: 'atendimentos', title: 'Atendimentos por canal' } },
    { widget: 'table', props: {} },
  ],
};
