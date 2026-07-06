// Registro (registry) de widgets. ESM, espelha o registro de templates.
//
// Cada entrada mapeia o TIPO do widget (ex: timeseries, funnel, table, ranking)
// para uma funcao toHtml(item, ctx) que faz a preparacao de dados especifica
// daquele widget (antes espalhada no if-chain do renderSingle em dashboard.js) e
// chama o render puro do widget. Devolve o HTML ja embrulhado no .card, ou string
// vazia quando nao ha o que mostrar (os guards vivem aqui dentro).
//
// O 'kpi' e tratado a parte no dashboard.js (bloco agrupado de kpis), mas continua
// no registry por completude: o toHtml dele devolve string vazia, ja que kpi nunca
// entra pelo caminho "single".
//
// ctx = { template, dataset, colMap, computed, findMetricDef, card }
//   - card(title, innerHtml, extraClass) embrulha o HTML num .card (vem do dashboard.js)
//   - findMetricDef(template, key) acha a MetricDef pra herdar label/format

import { render as renderKpi } from './kpi.js';
import { render as renderTimeseries } from './timeseries.js';
import { render as renderFunnel } from './funnel.js';
import { render as renderTable } from './table.js';
import { render as renderRanking } from './ranking.js';
import { groupBy, timeSeries } from '../lib/metrics.js';

export const registry = {
  // kpi: agrupado no dashboard.js (bloco 'kpis'); nunca renderiza como single.
  kpi: {
    render: renderKpi,
    toHtml() {
      return '';
    },
  },

  timeseries: {
    render: renderTimeseries,
    toHtml(item, ctx) {
      const { dataset, colMap, card } = ctx;
      const props = (item && item.props) || {};
      // Sem coluna de data mapeada, nao ha o que plotar: pula o widget.
      if (!colMap[props.dateSlot]) return '';
      const points = timeSeries(dataset.rows, colMap, props.dateSlot, props.valueSlot, 'sum');
      const title = props.title || 'Evolução no tempo';
      return card(null, renderTimeseries({ title }, points), 'chart');
    },
  },

  ranking: {
    render: renderRanking,
    toHtml(item, ctx) {
      const { template, dataset, colMap, findMetricDef, card } = ctx;
      const props = (item && item.props) || {};
      // Sem a coluna da dimensao (ex canal, vendedor), pula em vez de mostrar vazio.
      if (!colMap[props.dimensionSlot]) return '';
      const items = groupBy(dataset.rows, colMap, props.dimensionSlot, props.valueSlot, 'sum');
      if (!items.length) return '';
      const title = props.title || `Ranking por ${props.dimensionSlot || ''}`.trim();
      // formato herda da MetricDef que casa com o valueSlot, se houver; senao number.
      const valDef = findMetricDef(template, props.valueSlot);
      const format = props.format || (valDef && valDef.format) || 'number';
      return card(title, renderRanking({ title: '', format }, items));
    },
  },

  funnel: {
    render: renderFunnel,
    toHtml(item, ctx) {
      const { dataset, colMap, computed, card } = ctx;
      const props = (item && item.props) || {};
      // Funil generico: props.steps = [{ label, metricKey }] ou [{ label, valueSlot }].
      // Cada etapa vira { label, value }, puxando de computed (metricKey) ou
      // somando o valueSlot via groupBy total. Sem dados o widget trata vazio.
      const defs = Array.isArray(props.steps) ? props.steps : [];
      const steps = defs.map((s) => {
        let value = 0;
        if (s.metricKey != null && computed[s.metricKey] != null) {
          value = Number(computed[s.metricKey]) || 0;
        } else if (s.valueSlot != null) {
          const rows = groupBy(dataset.rows, colMap, s.valueSlot, s.valueSlot, 'sum');
          value = rows.reduce((a, b) => a + (Number(b.value) || 0), 0);
        }
        return { label: s.label || s.metricKey || s.valueSlot || '', value };
      });
      // Apara etapas do TOPO com valor zero (ex: impressoes nao mapeada), pra o
      // funil comecar na primeira etapa com dado, em vez de uma barra vazia.
      while (steps.length && Number(steps[0].value) === 0) steps.shift();
      // Se nenhuma etapa tem valor (colunas nao mapeadas), pula o funil.
      if (!steps.some((s) => Number(s.value) > 0)) return '';
      const title = props.title || 'Funil';
      return card(title, renderFunnel({ title: '' }, steps));
    },
  },

  table: {
    render: renderTable,
    toHtml(item, ctx) {
      const { dataset, card } = ctx;
      const props = (item && item.props) || {};
      const title = props.title || 'Dados';
      return card(
        title,
        renderTable({ title: '' }, { columns: dataset.columns, rows: dataset.rows }),
      );
    },
  },
};

/**
 * Retorna a entrada do registry pelo tipo do widget, ou undefined se nao existir.
 * @param {string} type
 * @returns {{render:Function, toHtml:Function}|undefined}
 */
export function getWidget(type) {
  return registry[type];
}
