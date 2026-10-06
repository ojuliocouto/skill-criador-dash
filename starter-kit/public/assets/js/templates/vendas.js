// Template de dominio: Vendas.
// Slots semanticos, metricas (base antes das derivadas) e layout.
// ESM, sem dependencias externas.

import { parseNumberBR } from '../lib/format.js';

// Valores de status que contam como venda ganha/fechada.
// Busca parcial contava "não pago" e "fechada perdida" como receita recebida.
const WON = /^(?:ganh[ao]s?|won|closed won|fechad[ao](?: ganh[ao])?|pag[oa]s?|aprovad[ao]s?|concluid[ao]s?|faturad[ao]s?|finalizad[ao]s?)$/;

// Separa as linhas ganhas. Se nao houver coluna de status mapeada, ou se
// nenhuma linha tiver status preenchido, assume que todas sao vendas (fallback).
function ganhasRows(rows, colMap) {
  const col = colMap && colMap.status;
  if (!col) return rows;
  let anyStatus = false;
  const won = [];
  for (const r of rows) {
    const v = String(r[col] == null ? '' : r[col]).trim();
    if (v) {
      anyStatus = true;
      const normalizado = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (WON.test(normalizado)) won.push(r);
    }
  }
  return anyStatus ? won : rows;
}

function somaValor(rows, colMap) {
  const col = (colMap && colMap.valor) || 'valor';
  return rows.reduce((acc, r) => {
    const n = parseNumberBR(r[col]);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

export const template = {
  id: 'vendas',
  label: 'Vendas',
  // Frase do cartão da área no assistente (passo 1). Palavra comum, sem jargão.
  descricao: 'Negócios fechados: quanto vendeu, quem vendeu e o quê.',
  // Metrica sugerida para a meta opcional (meta vs realizado).
  primaryMetric: 'faturamento',
  // Slot semantico do eixo de TEMPO (usado pela tendencia no dashboard.js).
  dateSlot: 'data',
  slots: [
    { key: 'data', label: 'Data', required: true, aliases: ['data', 'dia', 'date'] },
    { key: 'vendedor', label: 'Vendedor', required: false, aliases: ['vendedor', 'vendedora', 'responsavel', 'sdr', 'closer', 'seller'] },
    { key: 'produto', label: 'Produto', required: false, aliases: ['produto', 'item', 'plano', 'oferta'] },
    // format: 'currency' declara que a coluna é dinheiro (a tabela "Dados" mostra com R$). Aqui
    // precisa ser explícito: nenhuma métrica SOMA este slot direto (num_vendas só conta linhas).
    { key: 'valor', label: 'Valor', required: true, format: 'currency', aliases: ['valor', 'preco', 'faturamento', 'receita', 'total', 'amount'] },
    // semColuna: o que muda quando a coluna falta (o assistente mostra no passo das colunas).
    { key: 'status', label: 'Status', required: false, aliases: ['status', 'situacao', 'stage', 'etapa'],
      semColuna: 'Sem ela, todo negócio conta como venda ganha.' },
  ],
  metrics: [
    // Base: total de negocios registrados (todas as linhas).
    { key: 'num_vendas', label: 'Negócios', agg: 'count', column: 'valor', format: 'integer', betterWhen: 'higher' },
    // Ganhas: linhas com status de venda fechada (ou todas, no fallback).
    { key: 'vendas_ganhas', label: 'Vendas ganhas', agg: 'derived', format: 'integer', betterWhen: 'higher',
      compute: ({ rows, colMap }) => ganhasRows(rows, colMap).length },
    // Faturamento: soma do valor apenas das ganhas.
    { key: 'faturamento', label: 'Faturamento', agg: 'derived', format: 'currency', betterWhen: 'higher',
      compute: ({ rows, colMap }) => somaValor(ganhasRows(rows, colMap), colMap) },
    // Ticket medio: faturamento por venda ganha.
    { key: 'ticket_medio', label: 'Ticket médio', agg: 'derived', format: 'currency', betterWhen: 'higher',
      compute: ({ computed }) => (computed.vendas_ganhas ? computed.faturamento / computed.vendas_ganhas : 0) },
    // Taxa de conversao: ganhas sobre total de negocios.
    { key: 'taxa_conversao', label: 'Taxa de conversão', agg: 'derived', format: 'percent', betterWhen: 'higher',
      compute: ({ computed }) => (computed.num_vendas ? computed.vendas_ganhas / computed.num_vendas : 0) },
  ],
  layout: [
    { widget: 'kpi', props: { metricKey: 'faturamento' } },
    { widget: 'kpi', props: { metricKey: 'num_vendas' } },
    { widget: 'kpi', props: { metricKey: 'vendas_ganhas' } },
    { widget: 'kpi', props: { metricKey: 'taxa_conversao' } },
    { widget: 'kpi', props: { metricKey: 'ticket_medio' } },
    { widget: 'timeseries', col: 12, props: { dateSlot: 'data', valueSlot: 'valor', title: 'Faturamento no tempo' } },
    { widget: 'funnel', col: 4, props: { title: 'Funil de fechamento', steps: [
      { label: 'Negócios', metricKey: 'num_vendas' },
      { label: 'Ganhas', metricKey: 'vendas_ganhas' },
    ] } },
    // format: 'currency' explicito porque nenhuma MetricDef daqui tem key
    // 'valor' (o registry so herda formato da MetricDef que casa por KEY com o
    // valueSlot; sem essa declaracao o ranking caia no formato 'number' padrao
    // e mostrava o valor sem "R$" e com casa decimal cortada, ex "9.640,2").
    { widget: 'ranking', col: 4, props: { dimensionSlot: 'vendedor', valueSlot: 'valor', title: 'Ranking por vendedor', format: 'currency' } },
    { widget: 'ranking', col: 4, props: { dimensionSlot: 'produto', valueSlot: 'valor', title: 'Ranking por produto', format: 'currency' } },
    { widget: 'table', col: 12, props: {} },
  ],
};
