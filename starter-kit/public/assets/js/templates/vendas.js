// Template de dominio: Vendas.
// Slots semanticos, metricas (base antes das derivadas) e layout.
// ESM, sem dependencias externas.

import { parseNumberBR } from '../lib/format.js';

// Valores de status que contam como venda ganha/fechada.
const WON = /ganh|won|fechad|pago|aprovad|conclu/i;

// Separa as linhas ganhas. Se nao houver coluna de status mapeada, ou se
// nenhuma linha tiver status preenchido, assume que todas sao vendas (fallback).
function ganhasRows(rows, colMap) {
  const col = colMap && colMap.status;
  if (!col) return rows;
  let anyStatus = false;
  const won = [];
  for (const r of rows) {
    const v = String(r[col] == null ? '' : r[col]).trim();
    if (v) { anyStatus = true; if (WON.test(v)) won.push(r); }
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
  // Metrica sugerida para a meta opcional (meta vs realizado).
  primaryMetric: 'faturamento',
  slots: [
    { key: 'data', label: 'Data', required: true, aliases: ['data', 'dia', 'date'] },
    { key: 'vendedor', label: 'Vendedor', required: false, aliases: ['vendedor', 'vendedora', 'responsavel', 'sdr', 'closer', 'seller'] },
    { key: 'produto', label: 'Produto', required: false, aliases: ['produto', 'item', 'plano', 'oferta'] },
    { key: 'valor', label: 'Valor', required: true, aliases: ['valor', 'preco', 'faturamento', 'receita', 'total', 'amount'] },
    { key: 'status', label: 'Status', required: false, aliases: ['status', 'situacao', 'stage', 'etapa'] },
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
    { widget: 'funnel', props: { title: 'Funil de fechamento', steps: [
      { label: 'Negócios', metricKey: 'num_vendas' },
      { label: 'Ganhas', metricKey: 'vendas_ganhas' },
    ] } },
    { widget: 'timeseries', props: { dateSlot: 'data', valueSlot: 'valor', title: 'Faturamento no tempo' } },
    { widget: 'ranking', props: { dimensionSlot: 'vendedor', valueSlot: 'valor', title: 'Ranking por vendedor' } },
    { widget: 'ranking', props: { dimensionSlot: 'produto', valueSlot: 'valor', title: 'Ranking por produto' } },
    { widget: 'table', props: {} },
  ],
};
