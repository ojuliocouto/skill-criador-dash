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

// Agregacoes que groupBy/timeSeries sabem aplicar por bucket. 'ratio'/'derived'
// nao fazem sentido por bucket (dependem de multiplas metricas), entao caem no
// fallback abaixo.
const BUCKET_AGGS = new Set(['sum', 'avg', 'count', 'countDistinct']);

// Deriva a agregacao de bucket para um `valueSlot` de widget (ranking/timeseries).
//
// CONTRATO (explicito, testavel):
//   `valueSlot` e um SLOT semantico. findMetricDef, porem, casa por `metric.key`.
//   Slot e metric-key sao namespaces DIFERENTES: por sorte coincidem nos 3
//   templates atuais (ex: slot 'investimento' == metric.key 'investimento'), mas
//   numa extensao futura poderiam colidir (slot X e uma metrica X que agrega de
//   forma diferente), grudando o `agg` da metrica ERRADA e trocando avg por sum
//   silenciosamente.
//
//   Por isso so herdamos o `agg` da MetricDef quando ela e, sem ambiguidade, a
//   metrica-BASE daquele slot: o `metric.key` casa com o valueSlot E o
//   `metric.column` referencia o MESMO slot (ou seja, a metrica descreve a
//   coluna crua daquele slot, nao uma derivada que por acaso tem o mesmo nome).
//   Fora desse casamento estrito, fallback seguro pra 'sum' (o volume total, que
//   e o comportamento historico e o unico coerente por bucket para uma coluna
//   crua). Assim o agg herdado nunca vem de uma metrica que apenas colide de nome.
function bucketAggFor(template, findMetricDef, valueSlot) {
  if (valueSlot == null) return 'sum';
  const def = findMetricDef(template, valueSlot);
  // So confia no agg quando a MetricDef e a base do proprio slot (key == slot e
  // column == slot). Isso torna a resolucao slot->agg inequivoca e a prova de
  // colisao de namespace, sem exigir um mapa slot->metrica separado por template.
  const isBaseMetricOfSlot = def && def.key === valueSlot && def.column === valueSlot;
  const agg = isBaseMetricOfSlot ? def.agg : undefined;
  return BUCKET_AGGS.has(agg) ? agg : 'sum';
}

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
      const { template, dataset, colMap, findMetricDef, card } = ctx;
      const props = (item && item.props) || {};
      // Sem coluna de data mapeada, nao ha o que plotar: pula o widget.
      if (!colMap[props.dateSlot]) return '';
      // Agregacao por dia deriva do `agg` da MetricDef do valueSlot (ex: 'avg'
      // para CSAT/tempo), com fallback seguro pra 'sum' quando nao ha MetricDef.
      const agg = bucketAggFor(template, findMetricDef, props.valueSlot);
      const points = timeSeries(dataset.rows, colMap, props.dateSlot, props.valueSlot, agg);
      const title = props.title || 'Evolução no tempo';
      // repassa o span da celula: a proporcao do grafico depende da largura que ele vai ocupar
      return card(null, renderTimeseries({ title, col: item && item.col }, points), 'chart');
    },
  },

  ranking: {
    render: renderRanking,
    toHtml(item, ctx) {
      const { template, dataset, colMap, findMetricDef, card } = ctx;
      const props = (item && item.props) || {};
      // Sem a coluna da dimensao (ex canal, vendedor), pula em vez de mostrar vazio.
      if (!colMap[props.dimensionSlot]) return '';
      // Agregacao por dimensao deriva do `agg` da MetricDef do valueSlot (ex:
      // 'avg' para CSAT), com fallback seguro pra 'sum' quando nao ha MetricDef.
      const agg = bucketAggFor(template, findMetricDef, props.valueSlot);
      let items = groupBy(dataset.rows, colMap, props.dimensionSlot, props.valueSlot, agg);
      // hideZeros: descarta a linha cujo valor agregado deu zero. Existe pro
      // financeiro, onde a MESMA coluna de categoria descreve os dois lados do
      // caixa (entrada e saida): sem o filtro, o ranking de saidas listaria as
      // categorias de receita zeradas e vice-versa, enchendo a tela de barra vazia.
      if (props.hideZeros) items = items.filter((it) => Number(it.value) !== 0);
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
      const { dataset, colMap, computed, template, findMetricDef, card } = ctx;
      const props = (item && item.props) || {};
      // Funil generico: props.steps = [{ label, metricKey }] ou [{ label, valueSlot }].
      // Cada etapa vira { label, value }, puxando de computed (metricKey) ou
      // somando o valueSlot via groupBy total. Sem dados o widget trata vazio.
      //
      // BUG REAL (achado 1b): uma etapa cujo SLOT nao esta mapeado (ex: "Leads"
      // sem coluna) sempre calcula valor 0 (fallback de agregacao). Antes, so a
      // ponta do funil era aparada quando dava zero; uma etapa zerada no MEIO
      // (nao mapeada) ficava como uma barra 0%, e a etapa SEGUINTE comparava
      // contra esse zero falso e saia marcada como 0% mesmo tendo volume real
      // (ex: "926 conversoes" aparecendo como 0,00%). Agora a etapa sem slot
      // mapeado e DESCARTADA (nao vira barra), entao a conversao da etapa
      // seguinte compara com a etapa anterior de verdade.
      const defs = Array.isArray(props.steps) ? props.steps : [];
      const stepSlotMapped = (s) => {
        // valueSlot: o proprio slot precisa estar no colMap.
        if (s.valueSlot != null) return !!(colMap && colMap[s.valueSlot]);
        // metricKey: so sabemos o slot por tras quando a MetricDef agrega UMA
        // coluna direta (sum/avg/count/countDistinct: def.column E o slot).
        // ratio/derived podem ter fallback proprio (ex: vendas_ganhas assume
        // "todas ganhas" sem status mapeado) e continuam confiando no valor
        // computado, como antes.
        if (s.metricKey != null && template && typeof findMetricDef === 'function') {
          const def = findMetricDef(template, s.metricKey);
          if (def && ['sum', 'avg', 'count', 'countDistinct'].includes(def.agg)) {
            return !!(colMap && colMap[def.column]);
          }
        }
        return true;
      };
      const steps = defs
        .filter(stepSlotMapped)
        .map((s) => {
          let value = 0;
          if (s.metricKey != null && computed[s.metricKey] != null) {
            value = Number(computed[s.metricKey]) || 0;
          } else if (s.valueSlot != null) {
            // Etapa de funil e sempre VOLUME TOTAL da coluna (nao deriva da
            // MetricDef): um funil conta quanto passou por cada etapa, entao 'sum'
            // e o unico agg coerente aqui. Aplicar 'avg' por bucket somaria medias,
            // o que nao faz sentido para uma etapa de funil.
            const rows = groupBy(dataset.rows, colMap, s.valueSlot, s.valueSlot, 'sum');
            value = rows.reduce((a, b) => a + (Number(b.value) || 0), 0);
          }
          return { label: s.label || s.metricKey || s.valueSlot || '', value };
        });
      // Apara etapas do TOPO com valor zero DE VERDADE (coluna mapeada, soma deu
      // 0), pra o funil comecar na primeira etapa com dado, em vez de uma barra
      // vazia. Etapas nao mapeadas ja foram descartadas acima, entao esse zero
      // aqui e sempre "mapeado e zerado", nunca "sem coluna".
      while (steps.length && Number(steps[0].value) === 0) steps.shift();
      // Sem nenhuma etapa restante (todas descartadas ou zeradas), pula o funil.
      if (!steps.length) return '';
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
