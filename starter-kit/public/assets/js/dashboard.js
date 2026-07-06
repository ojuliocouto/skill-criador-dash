// Render do dashboard. ESM, roda no browser via <script type="module">.
// Le a config no KV pelo id da URL, busca os dados via conector, calcula as
// metricas do template e renderiza os widgets na ordem do layout.
//
// A logica pura de agrupar o layout (juntar kpis consecutivos em blocos) esta
// fatorada em planLayout(), que e testada em node:test sem tocar o DOM.

import { getDashboard, fetchDataForSource } from './lib/api-client.js';
import { getTemplate } from './templates/index.js';
import { computeAll, groupBy, timeSeries } from './lib/metrics.js';
import { render as renderKpi } from './widgets/kpi.js';
import { render as renderTimeseries } from './widgets/timeseries.js';
import { render as renderFunnel } from './widgets/funnel.js';
import { render as renderTable } from './widgets/table.js';
import { render as renderRanking } from './widgets/ranking.js';

const DEFAULT_ACCENT = '#6d28d9';

/**
 * Agrupa itens de layout: kpis consecutivos viram um unico bloco 'kpis';
 * qualquer outro widget vira um bloco 'single'.
 * @param {Array<{widget:string, props:object}>} layout
 * @returns {Array<{type:'kpis', items:Array}|{type:'single', item:object}>}
 */
export function planLayout(layout) {
  const items = Array.isArray(layout) ? layout : [];
  const blocks = [];
  let bucket = null; // acumula kpis consecutivos
  for (const item of items) {
    if (item && item.widget === 'kpi') {
      if (!bucket) {
        bucket = { type: 'kpis', items: [] };
        blocks.push(bucket);
      }
      bucket.items.push(item);
    } else {
      bucket = null;
      blocks.push({ type: 'single', item });
    }
  }
  return blocks;
}

// ---- Helpers de UI (browser) ----

function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Envolve o HTML de um widget num .card com titulo opcional.
function cardWith(title, innerHtml, extraClass = '') {
  const cls = `card${extraClass ? ' ' + extraClass : ''}`;
  const titleHtml = title
    ? `<div class="widget-title">${esc(title)}</div>`
    : '';
  return `<div class="${cls}"><div class="widget">${titleHtml}${innerHtml}</div></div>`;
}

// Mostra a tela de erro amigavel com um botao de acao.
function showError(app, message, action) {
  const btn = action
    ? `<a class="btn ghost" href="${esc(action.href)}">${esc(action.label)}</a>`
    : '';
  app.innerHTML =
    `<div class="empty-state">` +
      `<h2>Nao foi possivel abrir o dashboard</h2>` +
      `<p class="error">${esc(message)}</p>` +
      `<div class="row-actions" style="justify-content:center">${btn}</div>` +
    `</div>`;
}

// Localiza a MetricDef no template pelo key (para pegar label e format).
function findMetricDef(template, key) {
  const list = Array.isArray(template.metrics) ? template.metrics : [];
  return list.find((m) => m.key === key);
}

// Renderiza um bloco de kpis (.grid.kpis) a partir dos itens de layout.
function renderKpiBlock(items, template, computed) {
  const cards = items
    .map((item) => {
      const key = item.props && item.props.metricKey;
      const def = findMetricDef(template, key) || {};
      const label = def.label || key || '';
      const format = def.format || 'number';
      const value = computed[key];
      return renderKpi({ label, format, hint: item.props && item.props.hint }, value);
    })
    .join('');
  return `<div class="grid kpis">${cards}</div>`;
}

// Renderiza um widget "single" (nao-kpi) ja embrulhado num .card.
function renderSingle(item, ctx) {
  const { template, dataset, colMap, computed } = ctx;
  const props = (item && item.props) || {};
  const widget = item && item.widget;

  if (widget === 'timeseries') {
    const points = timeSeries(dataset.rows, colMap, props.dateSlot, props.valueSlot, 'sum');
    const title = props.title || 'Evolução no tempo';
    return cardWith(null, renderTimeseries({ title }, points), 'chart');
  }

  if (widget === 'ranking') {
    const items = groupBy(dataset.rows, colMap, props.dimensionSlot, props.valueSlot, 'sum');
    const title = props.title || `Ranking por ${props.dimensionSlot || ''}`.trim();
    // formato herda da MetricDef que casa com o valueSlot, se houver; senao number.
    const valDef = findMetricDef(template, props.valueSlot);
    const format = props.format || (valDef && valDef.format) || 'number';
    return cardWith(title, renderRanking({ title: '', format }, items));
  }

  if (widget === 'funnel') {
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
    const title = props.title || 'Funil';
    return cardWith(title, renderFunnel({ title: '' }, steps));
  }

  if (widget === 'table') {
    const title = props.title || 'Dados';
    return cardWith(
      title,
      renderTable({ title: '' }, { columns: dataset.columns, rows: dataset.rows }),
    );
  }

  // Widget desconhecido: nao quebra a pagina.
  return '';
}

// Monta o cabecalho (nome + acoes) e a area de widgets.
function renderDashboard(app, ctx) {
  const { config, template, dataset } = ctx;
  const blocks = planLayout(template.layout);

  const body = blocks
    .map((block) => {
      if (block.type === 'kpis') {
        return `<section class="section">${renderKpiBlock(block.items, template, ctx.computed)}</section>`;
      }
      const html = renderSingle(block.item, ctx);
      return html ? `<section class="section">${html}</section>` : '';
    })
    .join('');

  const meta = dataset.meta || {};
  const fetchedAt = meta.fetchedAt ? new Date(meta.fetchedAt) : null;
  const when = fetchedAt && !Number.isNaN(fetchedAt.getTime())
    ? fetchedAt.toLocaleString('pt-BR')
    : '';
  const rowCount = meta.rowCount != null ? meta.rowCount : (dataset.rows || []).length;
  const sourceLabel = meta.source === 'sheets' ? 'Google Sheets' : meta.source === 'csv' ? 'CSV' : (meta.source || 'fonte');
  const metaBits = [
    `Fonte: ${sourceLabel}`,
    `${rowCount} linha${rowCount === 1 ? '' : 's'}`,
    when ? `Atualizado em ${when}` : '',
  ].filter(Boolean).join(' · ');

  app.innerHTML =
    `<div class="list-item">` +
      `<div>` +
        `<h1>${esc(config.name || 'Dashboard')}</h1>` +
        `<p class="subtitle">${esc(template.label || '')}</p>` +
      `</div>` +
    `</div>` +
    body +
    `<p class="hint" style="margin-top:28px">${esc(metaBits)}</p>`;
}

// Preenche a topbar com nome + botoes de navegacao.
function renderTopbar(config, id) {
  const brand = document.querySelector('.topbar .brand .name');
  if (brand) brand.textContent = config.name || 'Dashboard';
  const actions = document.querySelector('.topbar .actions');
  if (actions) {
    const cfgHref = `/config.html?id=${encodeURIComponent(id)}`;
    actions.innerHTML =
      `<a class="btn ghost" href="${esc(cfgHref)}">Reconfigurar</a>` +
      `<a class="btn ghost" href="/">Voltar</a>`;
  }
}

async function init() {
  const app = document.getElementById('app');
  if (!app) return;

  const params = new URLSearchParams(location.search);
  const id = params.get('id');

  if (!id) {
    showError(app, 'Nenhum dashboard informado na URL.', { href: '/', label: 'Ver meus dashboards' });
    return;
  }

  // 1. Config
  let config;
  try {
    config = await getDashboard(id);
  } catch (err) {
    showError(app, err && err.message ? err.message : 'Falha ao carregar a configuracao.', {
      href: '/', label: 'Ver meus dashboards',
    });
    return;
  }
  if (!config || !config.id) {
    showError(app, 'Dashboard nao encontrado.', { href: '/', label: 'Ver meus dashboards' });
    return;
  }

  // 2. Cor de destaque + topbar
  const accent = config.accent || DEFAULT_ACCENT;
  document.documentElement.style.setProperty('--accent', accent);
  renderTopbar(config, id);

  // 3. Template
  const template = getTemplate(config.domain);
  if (!template) {
    showError(app, `Dominio desconhecido: ${config.domain}.`, {
      href: `/config.html?id=${encodeURIComponent(id)}`, label: 'Reconfigurar',
    });
    return;
  }

  // 4. Dados
  app.innerHTML = `<div class="empty-state"><p>Carregando dados...</p></div>`;
  let dataset;
  try {
    dataset = await fetchDataForSource(config.source);
  } catch (err) {
    showError(app, err && err.message ? err.message : 'Falha ao buscar os dados da fonte.', {
      href: `/config.html?id=${encodeURIComponent(id)}`, label: 'Reconfigurar',
    });
    return;
  }
  if (!dataset || !Array.isArray(dataset.rows)) {
    showError(app, 'A fonte nao devolveu dados validos.', {
      href: `/config.html?id=${encodeURIComponent(id)}`, label: 'Reconfigurar',
    });
    return;
  }

  // 5. Metricas + render
  const colMap = config.colMap || {};
  const computed = computeAll(template.metrics, dataset.rows, colMap);
  renderDashboard(app, { config, template, dataset, colMap, computed });
}

// So dispara no browser. Em node:test o import so pega planLayout.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
