// Template de domínio: Marketing.
// Slots semânticos, métricas (ordem importa: base antes das derivadas), layout e abas.
// ESM, sem dependencias externas.
//
// O Marketing declara `tabs`: o painel abre dividido em cinco abas (Visão geral, Canais,
// Evolução, Funil e Dados), cada uma com o seu layout. O `layout` plano continua declarado:
// é o que vale pra quem lê o template sem abas (wizard, personalização, consumidor antigo).

const FUNIL = [
  { label: 'Impressões', metricKey: 'impressoes' },
  { label: 'Cliques', metricKey: 'cliques' },
  { label: 'Leads', metricKey: 'leads' },
  { label: 'Conversões', metricKey: 'conversoes' },
];

export const template = {
  id: 'marketing',
  label: 'Marketing',
  // Frase do cartão da área no assistente (passo 1). Palavra comum, sem jargão.
  descricao: 'Anúncios e campanhas: quanto você investiu e o que voltou.',
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
    // Taxas entre etapas do funil (aba Funil): quanto de uma etapa chega na seguinte.
    { key: 'taxa_lead', label: 'Cliques que viram lead', agg: 'ratio', ratioOf: ['leads', 'cliques'], format: 'percent', betterWhen: 'higher' },
    { key: 'taxa_conversao', label: 'Leads que viram conversão', agg: 'ratio', ratioOf: ['conversoes', 'leads'], format: 'percent', betterWhen: 'higher' },
    {
      key: 'ROAS',
      label: 'ROAS',
      agg: 'derived',
      format: 'number',
      betterWhen: 'higher',
      // Sem Receita mapeada o ROAS seria "0" com cara de numero certo: vira "Nao mapeada".
      dependsOn: ['receita', 'investimento'],
      // Métrica cujo zero torna a taxa inexistente: sem investimento não existe ROAS. Também
      // marca o ROAS como taxa (comparável com o total) na tabela resumida.
      denominator: 'investimento',
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
    { widget: 'timeseries', col: 12, props: { dateSlot: 'data', valueSlot: 'investimento', title: 'Investimento no tempo' } },
    { widget: 'funnel', col: 6, props: { title: 'Funil de conversão', steps: FUNIL } },
    { widget: 'ranking', col: 6, props: { dimensionSlot: 'canal', valueSlot: 'investimento', title: 'Ranking por canal' } },
    { widget: 'table', col: 12, props: {} },
  ],
  tabs: [
    {
      id: 'visao-geral',
      label: 'Visão geral',
      layout: [
        { widget: 'kpi', props: { metricKey: 'investimento' } },
        { widget: 'kpi', props: { metricKey: 'leads' } },
        { widget: 'kpi', props: { metricKey: 'CPL' } },
        { widget: 'kpi', props: { metricKey: 'conversoes' } },
        { widget: 'kpi', props: { metricKey: 'CPA' } },
        { widget: 'kpi', props: { metricKey: 'receita' } },
        { widget: 'kpi', props: { metricKey: 'ROAS' } },
        { widget: 'resumo', col: 8, props: {
          title: 'Resultado por canal',
          groupBy: 'canal',
          metrics: ['investimento', 'leads', 'CPL', 'conversoes', 'CPA', 'receita', 'ROAS'],
        } },
        { widget: 'meta', col: 4, props: {
          title: 'Calculadora de meta',
          label: 'Meta de conversões no período',
          unit: 'conversão',
          targetKey: 'conversoes',
          costKey: 'investimento',
          leadKey: 'leads',
          revenueKey: 'receita',
        } },
      ],
    },
    {
      id: 'canais',
      label: 'Canais',
      layout: [
        { widget: 'resumo', col: 12, props: {
          title: 'Todos os números por canal',
          groupBy: 'canal',
          metrics: ['investimento', 'impressoes', 'cliques', 'CTR', 'CPC', 'leads', 'CPL', 'conversoes', 'CPA', 'receita', 'ROAS'],
        } },
        { widget: 'ranking', col: 4, props: { dimensionSlot: 'canal', valueSlot: 'investimento', title: 'Investimento por canal' } },
        { widget: 'ranking', col: 4, props: { dimensionSlot: 'canal', valueSlot: 'conversoes', title: 'Conversões por canal' } },
        { widget: 'ranking', col: 4, props: { dimensionSlot: 'canal', valueSlot: 'receita', title: 'Receita por canal' } },
      ],
    },
    {
      id: 'evolucao',
      label: 'Evolução',
      layout: [
        { widget: 'resumo', col: 12, props: {
          title: 'Resultado por semana',
          groupBy: 'semana',
          metrics: ['investimento', 'leads', 'CPL', 'conversoes', 'CPA', 'receita', 'ROAS'],
        } },
        { widget: 'timeseries', col: 12, props: { dateSlot: 'data', valueSlot: 'investimento', title: 'Investimento por dia' } },
        { widget: 'timeseries', col: 6, props: { dateSlot: 'data', valueSlot: 'leads', title: 'Leads por dia' } },
        { widget: 'timeseries', col: 6, props: { dateSlot: 'data', valueSlot: 'conversoes', title: 'Conversões por dia' } },
      ],
    },
    {
      id: 'funil',
      label: 'Funil',
      layout: [
        { widget: 'funnel', col: 5, props: { title: 'Funil de conversão', steps: FUNIL } },
        { widget: 'resumo', col: 7, props: {
          title: 'Quanto passa de uma etapa pra outra, por canal',
          groupBy: 'canal',
          // Canais na mesma ordem das outras abas (por investimento), não pela primeira taxa.
          orderBy: 'investimento',
          metrics: [
            { key: 'CTR', label: 'Impressões que viram clique' },
            'taxa_lead',
            'taxa_conversao',
          ],
        } },
      ],
    },
    {
      id: 'dados',
      label: 'Dados',
      layout: [
        { widget: 'table', col: 12, props: { title: 'Dados linha a linha' } },
      ],
    },
  ],
};
