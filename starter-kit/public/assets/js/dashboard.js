// Render do dashboard. ESM, roda no browser via <script type="module">.
// Le a config no KV pelo id da URL, busca os dados via conector, calcula as
// metricas do template e renderiza os widgets na ordem do layout.
//
// A logica pura de agrupar o layout (juntar kpis consecutivos em blocos) esta
// fatorada em planLayout(), que e testada em node:test sem tocar o DOM.

import { getDashboard, fetchDataForSource, fetchD1, setDashboardAuth } from './lib/api-client.js';
import { getTemplate } from './templates/index.js';
import { computeAll, groupBy, timeSeries } from './lib/metrics.js';
import { parseDateBR, fmtPercent } from './lib/format.js';
import { sha256Hex } from './lib/auth.js';
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

/**
 * Divide as linhas em duas metades por data: a primeira metade das datas
 * distintas (previous) e a segunda (current). Serve para calcular tendencia
 * dentro do proprio periodo. Se houver menos de 2 datas validas, nao ha
 * comparacao possivel e previous volta null.
 * @returns {{current:Object[], previous:Object[]|null}}
 */
export function splitByPeriod(rows, colMap, dateSlot) {
  const col = (colMap && colMap[dateSlot]) || dateSlot;
  const dated = [];
  for (const r of (rows || [])) {
    const iso = parseDateBR(r[col]);
    if (iso) dated.push({ iso, r });
  }
  const uniq = [...new Set(dated.map((d) => d.iso))].sort();
  if (uniq.length < 2) return { current: rows || [], previous: null };
  // Metades com o MESMO numero de datas, para que somas sejam comparaveis.
  // Se o total de datas for impar, a data do meio fica de fora das duas metades.
  const half = Math.floor(uniq.length / 2);
  const prevDates = new Set(uniq.slice(0, half));
  const curDates = new Set(uniq.slice(uniq.length - half));
  const previous = [];
  const current = [];
  for (const d of dated) {
    if (prevDates.has(d.iso)) previous.push(d.r);
    else if (curDates.has(d.iso)) current.push(d.r);
  }
  if (!previous.length || !current.length) return { current: rows || [], previous: null };
  return { current, previous };
}

/**
 * Monta o mapa de tendencias por metrica (2a metade vs 1a metade do periodo).
 * So gera tendencia para metricas com betterWhen definido e denominador nao-zero.
 * @returns {Object<string,{text:string, good:boolean}>}
 */
export function buildTrends(metrics, curRows, prevRows, colMap) {
  if (!prevRows || !prevRows.length) return {};
  const cur = computeAll(metrics, curRows, colMap);
  const prev = computeAll(metrics, prevRows, colMap);
  const trends = {};
  for (const m of (metrics || [])) {
    if (!m.betterWhen) continue;
    const c = cur[m.key];
    const p = prev[m.key];
    if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) continue;
    const delta = (c - p) / Math.abs(p);
    if (Math.abs(delta) < 0.0005) continue; // praticamente estavel
    const up = c > p;
    const good = m.betterWhen === 'higher' ? up : !up;
    trends[m.key] = { text: `${up ? '▲' : '▼'} ${fmtPercent(Math.abs(delta))}`, good };
  }
  return trends;
}

/**
 * Monta o progresso da meta (meta vs realizado) para a metrica configurada.
 * config.goal = { metricKey, value }. Retorna { metricKey, pct, text } ou null.
 */
export function buildGoal(config, computed) {
  const g = config && config.goal;
  if (!g || !g.metricKey) return null;
  const target = Number(g.value);
  if (!Number.isFinite(target) || target <= 0) return null;
  const val = computed[g.metricKey];
  if (!Number.isFinite(val)) return null;
  const pct = val / target;
  return { metricKey: g.metricKey, pct, text: `${fmtPercent(pct)} da meta` };
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

// Tela de senha para dashboards protegidos. Ao enviar, guarda o hash na sessao
// e refaz o init. Se ja havia um hash guardado (tentativa anterior), avisa que
// a senha esta incorreta.
function renderPasswordPrompt(app, id) {
  let jaTentou = false;
  try { jaTentou = !!sessionStorage.getItem(`dashauth:${id}`); } catch { /* ignora */ }
  app.innerHTML =
    `<div class="empty-state">` +
      `<h2>Dashboard protegido</h2>` +
      `<p class="subtitle">Digite a senha para acessar este dashboard.</p>` +
      `<div style="max-width:320px;margin:18px auto 0;display:flex;flex-direction:column;gap:10px">` +
        `<input id="pwInput" class="input" type="password" placeholder="Senha" autocomplete="current-password" />` +
        `<button id="pwBtn" class="btn" type="button">Acessar</button>` +
        `<p class="error" id="pwErr">${jaTentou ? 'Senha incorreta. Tente de novo.' : ''}</p>` +
      `</div>` +
    `</div>`;
  const input = document.getElementById('pwInput');
  const btn = document.getElementById('pwBtn');
  const submit = async () => {
    if (!input.value) return;
    btn.disabled = true;
    const hash = await sha256Hex(input.value);
    setDashboardAuth(id, hash);
    init();
  };
  btn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  input.focus();
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
function renderKpiBlock(items, template, computed, trends = {}, goal = null) {
  const cards = items
    .map((item) => {
      const key = item.props && item.props.metricKey;
      const def = findMetricDef(template, key) || {};
      const label = def.label || key || '';
      const format = def.format || 'number';
      const value = computed[key];
      const goalForKpi = goal && goal.metricKey === key ? goal : undefined;
      return renderKpi(
        { label, format, hint: item.props && item.props.hint, trend: trends[key], goal: goalForKpi },
        value,
      );
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
    // Sem coluna de data mapeada, nao ha o que plotar: pula o widget.
    if (!colMap[props.dateSlot]) return '';
    const points = timeSeries(dataset.rows, colMap, props.dateSlot, props.valueSlot, 'sum');
    const title = props.title || 'Evolução no tempo';
    return cardWith(null, renderTimeseries({ title }, points), 'chart');
  }

  if (widget === 'ranking') {
    // Sem a coluna da dimensao (ex canal, vendedor), pula em vez de mostrar vazio.
    if (!colMap[props.dimensionSlot]) return '';
    const items = groupBy(dataset.rows, colMap, props.dimensionSlot, props.valueSlot, 'sum');
    if (!items.length) return '';
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
    // Apara etapas do TOPO com valor zero (ex: impressoes nao mapeada), pra o
    // funil comecar na primeira etapa com dado, em vez de uma barra vazia.
    while (steps.length && Number(steps[0].value) === 0) steps.shift();
    // Se nenhuma etapa tem valor (colunas nao mapeadas), pula o funil.
    if (!steps.some((s) => Number(s.value) > 0)) return '';
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
        return `<section class="section">${renderKpiBlock(block.items, template, ctx.computed, ctx.trends, ctx.goal)}</section>`;
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
    if (err && err.needsPassword) {
      renderPasswordPrompt(app, id);
      return;
    }
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
    // Modo historico: le o snapshot mais recente do D1. Ao vivo: busca a fonte na hora.
    dataset = config.storage === 'd1'
      ? await fetchD1(id)
      : await fetchDataForSource(config.source, id);
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

  // 5. Metricas + tendencia (2a metade vs 1a metade do periodo) + render
  const colMap = config.colMap || {};
  const computed = computeAll(template.metrics, dataset.rows, colMap);
  const tsItem = (template.layout || []).find((l) => l.widget === 'timeseries');
  const dateSlot = (tsItem && tsItem.props && tsItem.props.dateSlot) || 'data';
  const { current, previous } = splitByPeriod(dataset.rows, colMap, dateSlot);
  const trends = buildTrends(template.metrics, current, previous, colMap);
  const goal = buildGoal(config, computed);
  renderDashboard(app, { config, template, dataset, colMap, computed, trends, goal });
}

// So dispara no browser. Em node:test o import so pega planLayout.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
