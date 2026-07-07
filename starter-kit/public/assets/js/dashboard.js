// Render do dashboard. ESM, roda no browser via <script type="module">.
// Le a config no KV pelo id da URL, busca os dados via conector, calcula as
// metricas do template e renderiza os widgets na ordem do layout.
//
// A logica pura de agrupar o layout (juntar kpis consecutivos em blocos) esta
// fatorada em planLayout(), que e testada em node:test sem tocar o DOM.

import { getDashboard, fetchDataForSource, fetchD1, setDashboardAuth } from './lib/api-client.js';
import { getTemplate } from './templates/index.js';
import { computeAll } from './lib/metrics.js';
import { parseDateBR, fmtPercent } from './lib/format.js';
import { sha256Hex } from './lib/auth.js';
import { render as renderKpi } from './widgets/kpi.js';
import { getWidget } from './widgets/index.js';
import { getSource } from './sources/index.js';
import { DEFAULT_ACCENT, aplicarAccent } from './lib/color.js';
import { esc } from './lib/html.js';
import { brandInnerHtml } from './lib/brand.js';
import {
  dimensionSlots, distinctValues, dateBounds, emptyFilterState, applyFilters,
} from './lib/filters.js';

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
 * Resolve o slot semantico do eixo de TEMPO a partir do contrato do template.
 * LE de template.dateSlot (declarado por cada dominio), em vez de assumir 'data'.
 * Fallback seguro pra 'data' quando o template nao declara (ex: template custom
 * antigo), preservando o comportamento historico.
 * @param {object|null|undefined} template
 * @returns {string}
 */
export function resolveDateSlot(template) {
  return (template && template.dateSlot) || 'data';
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

// Renderiza um widget "single" (nao-kpi) ja embrulhado num .card, despachando
// pelo registry de widgets em vez de um if-chain por tipo. Cada entrada faz a
// preparacao de dados especifica e chama o render puro. Passamos os helpers de UI
// (findMetricDef, cardWith) no ctx pra o registry nao precisar reimplementa-los.
function renderSingle(item, ctx) {
  // Despacha pela fronteira getWidget() em vez de acessar o registry direto.
  const entry = item ? getWidget(item.widget) : undefined;
  // Widget desconhecido (ou sem toHtml): loga um erro claro e nao quebra a pagina
  // (uma config com widget invalido nao deve derrubar o dashboard inteiro).
  if (!entry || typeof entry.toHtml !== 'function') {
    const tipo = item && item.widget;
    console.error(`[dashboard] widget desconhecido no layout: "${tipo}". Nao existe no registry de widgets.`);
    return '';
  }
  return entry.toHtml(item, { ...ctx, findMetricDef, card: cardWith });
}

// Spans de coluna permitidos no grid de 12 colunas. Um `col` fora dessa lista
// (ou ausente) cai no full-width (span 12), sem classe. Espelha o .span-N do CSS.
const ALLOWED_SPANS = new Set([3, 4, 5, 6, 7, 8]);
export function cellSpanClass(col) {
  return ALLOWED_SPANS.has(col) ? ` span-${col}` : '';
}

// Resolve qual aba de um grupo deve abrir: a pedida (?tab=) se for uma aba valida,
// senao a primeira; null se nao ha abas. Puro e testavel.
export function resolveActiveTab(tabs, requested) {
  const list = Array.isArray(tabs) ? tabs.filter((t) => t && t.id) : [];
  if (!list.length) return null;
  if (requested && list.some((t) => t.id === requested)) return requested;
  return list[0].id;
}

// Monta so o corpo de widgets (grid + sections de kpi) a partir de um ctx JA
// calculado (computed/trends/goal/dataset ja refletem o filtro atual). Devolve
// string HTML. Chamado a cada mudanca de filtro para repintar so o #dashbody.
function buildBodyHtml(ctx) {
  const { template } = ctx;
  const blocks = planLayout(template.layout);

  // Os widgets nao-kpi entram num unico .dash-grid (12 colunas), cada um numa
  // .dash-cell com o span vindo do `col` do layout. Blocos de kpi continuam em
  // .section full-width. Runs consecutivos de singles viram um grid so; um bloco
  // de kpi no meio fecha o grid corrente e abre outro depois. Widget que devolve
  // '' (coluna nao mapeada) nao vira celula vazia.
  const parts = [];
  let cells = null;
  const flush = () => {
    if (cells && cells.length) parts.push(`<div class="dash-grid">${cells.join('')}</div>`);
    cells = null;
  };
  for (const block of blocks) {
    if (block.type === 'kpis') {
      flush();
      parts.push(`<section class="section">${renderKpiBlock(block.items, template, ctx.computed, ctx.trends, ctx.goal)}</section>`);
      continue;
    }
    const html = renderSingle(block.item, ctx);
    if (!html) continue;
    if (!cells) cells = [];
    const col = block.item && block.item.col;
    cells.push(`<div class="dash-cell${cellSpanClass(col)}">${html}</div>`);
  }
  flush();
  return parts.join('');
}

// Texto do rodape (fonte, contagem de linhas JA filtradas, quando atualizou).
function buildMetaText(dataset) {
  const meta = dataset.meta || {};
  const fetchedAt = meta.fetchedAt ? new Date(meta.fetchedAt) : null;
  const when = fetchedAt && !Number.isNaN(fetchedAt.getTime())
    ? fetchedAt.toLocaleString('pt-BR')
    : '';
  // rowCount reflete o dataset corrente (apos filtro), nao o total original.
  const rowCount = (dataset.rows || []).length;
  const sourceLabel = (getSource(meta.source) && getSource(meta.source).label) || meta.source || 'fonte';
  return [
    `Fonte: ${sourceLabel}`,
    `${rowCount} linha${rowCount === 1 ? '' : 's'}`,
    when ? `Atualizado em ${when}` : '',
  ].filter(Boolean).join(' · ');
}

// HTML da barra de filtros: periodo (de/ate) quando ha coluna de data, e um
// seletor por dimensao mapeada com 2..200 valores distintos. Devolve '' quando
// nao ha nada filtravel (ai a barra nem aparece). Cada controle carrega um id/
// data-slot estavel pra o wireFilters ler o estado sem reprocessar o template.
function buildFilterBar(template, dataset, colMap) {
  const rows = dataset.rows || [];
  const fields = [];

  const dateSlot = resolveDateSlot(template);
  const dateCol = (colMap && colMap[dateSlot]) || null;
  if (dateCol) {
    const { min, max } = dateBounds(rows, dateCol);
    if (min && max) {
      const bounds = `min="${esc(min)}" max="${esc(max)}"`;
      fields.push(
        `<div class="fb-field"><span class="fb-label">De</span>` +
          `<input id="fb-from" type="date" class="input fb-input" ${bounds} value="" /></div>`,
        `<div class="fb-field"><span class="fb-label">Até</span>` +
          `<input id="fb-to" type="date" class="input fb-input" ${bounds} value="" /></div>`,
      );
    }
  }

  for (const dim of dimensionSlots(template)) {
    const col = colMap && colMap[dim.key];
    if (!col) continue;
    const values = distinctValues(rows, col);
    if (values.length < 2 || values.length > 200) continue;
    const opts = [`<option value="">Todos</option>`]
      .concat(values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`))
      .join('');
    fields.push(
      `<div class="fb-field"><span class="fb-label">${esc(dim.label)}</span>` +
        `<select id="fb-dim-${esc(dim.key)}" data-slot="${esc(dim.key)}" class="input fb-input">${opts}</select></div>`,
    );
  }

  if (!fields.length) return '';
  fields.push(
    `<button id="fb-reset" class="btn ghost fb-reset" type="button">Limpar filtros</button>`,
  );
  return `<div id="filterbar" class="filterbar">${fields.join('')}</div>`;
}

// Le o estado de filtro atual direto dos controles do DOM (fonte da verdade).
function readFilterState() {
  const val = (id) => {
    const el = document.getElementById(id);
    return el && el.value ? el.value : null;
  };
  const dims = {};
  document.querySelectorAll('#filterbar [data-slot]').forEach((el) => {
    dims[el.dataset.slot] = el.value || '';
  });
  return { from: val('fb-from'), to: val('fb-to'), dims };
}

// Recalcula metricas/tendencia/meta em cima das linhas filtradas e repinta so o
// corpo (#dashbody) e o rodape (#dashmeta). NAO toca na barra de filtros (os
// controles sao a fonte da verdade do estado e nao podem ser recriados a cada
// mudanca, senao perderiam foco/valor).
function renderBody(baseCtx, state) {
  const { config, template, dataset, colMap } = baseCtx;
  const bodyEl = document.getElementById('dashbody');
  const metaEl = document.getElementById('dashmeta');
  if (!bodyEl) return;

  const rows = applyFilters(dataset.rows, colMap, template, state);
  const computed = computeAll(template.metrics, rows, colMap);
  const dateSlot = resolveDateSlot(template);
  const { current, previous } = splitByPeriod(rows, colMap, dateSlot);
  const trends = buildTrends(template.metrics, current, previous, colMap);
  const goal = buildGoal(config, computed);
  const ds = { columns: dataset.columns, rows, meta: dataset.meta };
  const ctx = { config, template, dataset: ds, colMap, computed, trends, goal };

  bodyEl.innerHTML = buildBodyHtml(ctx) || '<div class="empty-state"><p>Nenhum dado para os filtros selecionados.</p></div>';
  if (metaEl) metaEl.textContent = buildMetaText(ds);
}

// Fia os eventos da barra: qualquer 'change' (data ou select) recalcula; o botao
// Limpar zera os controles e volta ao periodo/valores completos.
function wireFilters(baseCtx) {
  const bar = document.getElementById('filterbar');
  if (!bar) return;
  bar.addEventListener('change', () => renderBody(baseCtx, readFilterState()));
  const reset = document.getElementById('fb-reset');
  if (reset) {
    reset.addEventListener('click', () => {
      bar.querySelectorAll('input, select').forEach((el) => { el.value = ''; });
      renderBody(baseCtx, emptyFilterState());
    });
  }
}

// Monta o "shell" (cabecalho + barra de filtros + area de corpo/rodape vazias) e
// pinta o corpo pela primeira vez (estado sem filtro). A barra fica FORA do
// #dashbody pra sobreviver aos repaints. opts.showHeader=false esconde o
// h1/subtitle (usado quando o dashboard e uma ABA de um grupo: o titulo do grupo
// e a propria aba ja identificam, entao o header do filho seria redundante).
function renderDashboard(app, baseCtx, opts = {}) {
  const { config, template, dataset, colMap } = baseCtx;
  const filterBar = buildFilterBar(template, dataset, colMap);
  const header = opts.showHeader === false
    ? ''
    : `<div class="list-item">` +
        `<div>` +
          `<h1>${esc(config.name || 'Dashboard')}</h1>` +
          `<p class="subtitle">${esc(template.label || '')}</p>` +
        `</div>` +
      `</div>`;

  app.innerHTML =
    header +
    filterBar +
    `<div id="dashbody"></div>` +
    `<p class="hint" id="dashmeta" style="margin-top:28px"></p>`;

  renderBody(baseCtx, emptyFilterState());
  wireFilters(baseCtx);
}

// Preenche a topbar com a marca (logo seguro ou .dot + nome) + botoes de navegacao.
function renderTopbar(config, id) {
  const brand = document.querySelector('.topbar .brand');
  // brandInnerHtml valida o src do logo no cliente (https/data:image) e escapa
  // nome e src; com logo seguro troca o .dot por <img class="brand-logo">.
  if (brand) brand.innerHTML = brandInnerHtml(config.name || 'Dashboard', config.logo);
  const actions = document.querySelector('.topbar .actions');
  if (actions) {
    // Grupo (abas) nao tem fluxo de reconfigurar no wizard ainda: so "Voltar".
    // Cada aba individual continua reconfiguravel abrindo o dashboard-filho direto.
    const isGroup = config && config.kind === 'group';
    const cfgHref = `/config.html?id=${encodeURIComponent(id)}`;
    const reconfig = isGroup ? '' : `<a class="btn ghost" href="${esc(cfgHref)}">Reconfigurar</a>`;
    actions.innerHTML =
      reconfig +
      `<a class="btn ghost" href="/">Voltar</a>`;
  }
}

// Aplica a cor de destaque da config no :root (calibrada pro tema atual). Extraida
// pra ser reusada pelo dashboard normal e pelo grupo (que usa o accent do grupo).
function applyAccent(config) {
  const accent = (config && config.accent) || DEFAULT_ACCENT;
  const root = document.documentElement;
  const isDark = root.dataset.theme !== 'light';
  // accent2 opcional tinge o fundo suave (area do grafico, soft dos badges).
  aplicarAccent(root, accent, isDark, config && config.accent2);
}

// Resolve template + busca dados de UM dashboard e renderiza dentro de `container`.
// Reusado pelo dashboard normal (container = #app) e por cada aba de um grupo
// (container = #tabpanel, com showHeader:false). Devolve true no sucesso.
async function loadDashboardInto(container, config, id, opts = {}) {
  const template = getTemplate(config.domain);
  if (!template) {
    showError(container, `Dominio desconhecido: ${config.domain}.`, {
      href: `/config.html?id=${encodeURIComponent(id)}`, label: 'Reconfigurar',
    });
    return false;
  }

  container.innerHTML = `<div class="empty-state"><p>Carregando dados...</p></div>`;
  let dataset;
  try {
    // Modo historico: le o snapshot mais recente do D1. Ao vivo: busca a fonte na hora.
    dataset = config.storage === 'd1'
      ? await fetchD1(id)
      : await fetchDataForSource(config.source, id);
  } catch (err) {
    showError(container, err && err.message ? err.message : 'Falha ao buscar os dados da fonte.', {
      href: `/config.html?id=${encodeURIComponent(id)}`, label: 'Reconfigurar',
    });
    return false;
  }
  if (!dataset || !Array.isArray(dataset.rows)) {
    showError(container, 'A fonte nao devolveu dados validos.', {
      href: `/config.html?id=${encodeURIComponent(id)}`, label: 'Reconfigurar',
    });
    return false;
  }

  const colMap = config.colMap || {};
  renderDashboard(container, { config, template, dataset, colMap }, opts);
  return true;
}

// Renderiza um GRUPO: titulo do grupo + barra de abas + painel. Cada aba carrega
// um dashboard-filho (por id) no painel, sem recarregar a pagina. As configs dos
// filhos sao buscadas sob demanda e cacheadas. A aba ativa reflete/atualiza ?tab=.
async function initGroup(app, group, groupId) {
  applyAccent(group);
  renderTopbar(group, groupId);

  const tabs = (group.tabs || []).filter((t) => t && t.id);
  if (!tabs.length) {
    showError(app, 'Este grupo nao tem abas configuradas.', { href: '/', label: 'Ver meus dashboards' });
    return;
  }
  const params = new URLSearchParams(location.search);
  const activeId = resolveActiveTab(tabs, params.get('tab'));

  app.innerHTML =
    `<div class="list-item"><div><h1>${esc(group.name || 'Dashboard')}</h1></div></div>` +
    `<div class="tabs">` +
      tabs.map((t) =>
        `<button class="tab${t.id === activeId ? ' active' : ''}" type="button" data-tab="${esc(t.id)}">` +
          `${esc(t.label || t.id)}</button>`,
      ).join('') +
    `</div>` +
    `<div id="tabpanel"></div>`;

  const panel = document.getElementById('tabpanel');
  const cache = {};

  const activate = async (childId) => {
    app.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === childId));
    // Reflete a aba na URL (compartilhavel) sem empilhar historico.
    try {
      const url = new URL(location.href);
      url.searchParams.set('tab', childId);
      history.replaceState(null, '', url);
    } catch { /* ambiente sem history: ignora */ }

    panel.innerHTML = `<div class="empty-state"><p>Carregando...</p></div>`;
    let cfg = cache[childId];
    if (!cfg) {
      try {
        cfg = await getDashboard(childId);
        cache[childId] = cfg;
      } catch (err) {
        const msg = err && err.needsPassword
          ? 'Esta aba e um dashboard protegido por senha e nao pode ser embutida no grupo.'
          : (err && err.message) || 'Falha ao carregar esta aba.';
        showError(panel, msg, { href: `/dashboard.html?id=${encodeURIComponent(childId)}`, label: 'Abrir direto' });
        return;
      }
    }
    await loadDashboardInto(panel, cfg, childId, { showHeader: false });
  };

  app.querySelectorAll('.tab').forEach((b) => {
    b.addEventListener('click', () => activate(b.dataset.tab));
  });
  await activate(activeId);
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

  // Grupo (dashboard com abas): fluxo proprio, agrega varios dashboards num link.
  if (config.kind === 'group' && Array.isArray(config.tabs)) {
    await initGroup(app, config, id);
    return;
  }

  // Dashboard comum: cor + topbar + carrega e renderiza no #app.
  applyAccent(config);
  renderTopbar(config, id);
  await loadDashboardInto(app, config, id);
}

// So dispara no browser. Em node:test o import so pega planLayout.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
