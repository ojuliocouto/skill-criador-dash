// Render do dashboard. ESM, roda no browser via <script type="module">.
// Le a config no KV pelo id da URL, busca os dados via conector, calcula as
// metricas do template e renderiza os widgets na ordem do layout.
//
// Template com `tabs` (hoje o Marketing): o corpo abre dividido em abas, cada uma com o seu
// layout. A aba ativa mora no hash da URL (#canais) e sobrevive ao repaint dos filtros. A
// lógica pura das abas está em lib/abas.js; a da faixa de marca, em lib/cabecalho.js.
//
// A logica pura de agrupar o layout (juntar kpis consecutivos em blocos) esta
// fatorada em planLayout(), que e testada em node:test sem tocar o DOM.

import { getDashboard, fetchDataForSource, fetchD1, setDashboardAuth } from './lib/api-client.js';
import { getTemplate } from './templates/index.js';
import { computeAll, computeAllMapped, timeSeries } from './lib/metrics.js';
import { parseDateBR, fmtPercent } from './lib/format.js';
import { sha256Hex } from './lib/auth.js';
import { render as renderKpi } from './widgets/kpi.js';
import { getWidget } from './widgets/index.js';
import { getSource } from './sources/index.js';
import { DEFAULT_ACCENT } from './lib/color.js';
import { aplicarMarca } from './lib/marca.js';
import { moverFundo } from './lib/fundo.js';
import { esqueletoHtml } from './lib/esqueleto.js';
import { erroHtml, explicarFalha } from './lib/estado-de-erro.js';
import { textoAtualizado, proximaTroca, horaCurta } from './lib/atualizado.js';
import { prepararAbertura } from './lib/abertura.js';
import { comecarProgresso, terminarProgresso } from './lib/carregamento.js';
import { sincronizarModoDoPainel } from './lib/theme.js';
import { TEMPOS } from './lib/saudacao.js';
import { esc } from './lib/html.js';
import { brandInnerHtml } from './lib/brand.js';
import { areaDoPainel, trilhaHtml, acoesHtml, ligarCopiarLink } from './lib/barra-topo.js';
import { aplicarPersonalizacao } from './lib/personalizacao.js';
import { aplicarRotulos } from './lib/rotulos.js';
import { DURACAO, CURVA, textoDaContagemEntre, transformDoMarcador, menosMovimento, animar } from './lib/movimento.js';
import { brParaISO, isoParaBR, mascaraDataBR } from './lib/data-br.js';
import {
  dimensionSlots, distinctValues, dateBounds, emptyFilterState, applyFilters,
} from './lib/filters.js';
import {
  abasDoTemplate, abasVisiveis, abaDoHash, resolverAba, layoutDaAba, proximaAba, barraDeAbasHtml, idDoBotaoDaAba,
} from './lib/abas.js';
import { periodoDosDados, cabecalhoHtml, estadoDosDadosHtml } from './lib/cabecalho.js';
import { saidaDoElemento } from './widgets/meta.js';
import { ocupar } from './wizard/dom.js';
import { ligarGraficoResponde } from './lib/grafico-responde.js';
import { fotografarDados, transformarDados } from './lib/grafico-transforma.js';
import { rolarIndicadores } from './lib/numero-roleta.js';
import { atalhosHtml, ligarAtalhos } from './lib/periodo-atalhos.js';
import { cruzouMeta, marcarMetaBatida } from './lib/meta-batida.js';
import { prepararCapa, levantarCapa } from './lib/cartao-vira-tela.js';
import { ligarTabelaOrdena } from './lib/tabela-ordena.js';

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
    const c = cur[m.key];
    const p = prev[m.key];
    if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) continue;
    const delta = (c - p) / Math.abs(p);
    if (Math.abs(delta) < 0.0005) continue; // praticamente estavel
    const up = c > p;
    const text = `${up ? '▲' : '▼'} ${fmtPercent(Math.abs(delta))}`;
    // Metrica SEM betterWhen (ex: Investimento: gastar mais nao e bom nem ruim por si, depende
    // do retorno) antes nao mostrava variacao nenhuma, e o card ficava orfao no meio da faixa,
    // uma linha mais curto que os vizinhos. Agora a variacao aparece em tom NEUTRO: a
    // informacao existe, o julgamento de valor e que nao. Pintar de verde seria inventar uma
    // opiniao que o template deliberadamente nao deu.
    if (!m.betterWhen) {
      trends[m.key] = { text, neutral: true };
      continue;
    }
    const good = m.betterWhen === 'higher' ? up : !up;
    trends[m.key] = { text, good };
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
 * `mapped` (opcional, key->boolean vindo de computeAllMapped) evita montar a
 * barra de progresso contra um valor que so e 0 por falta de coluna mapeada:
 * chave ausente do mapa e tratada como mapeada (compatibilidade com chamadas
 * antigas que nao passam `mapped`).
 */
export function buildGoal(config, computed, mapped = {}, template = null) {
  const g = config && config.goal;
  if (!g || !g.metricKey) return null;
  if (mapped[g.metricKey] === false) return null;
  const target = Number(g.value);
  if (!Number.isFinite(target) || target <= 0) return null;
  const val = computed[g.metricKey];
  if (!Number.isFinite(val)) return null;
  // Metrica "menor e melhor" (CPA, CPL): bater a meta e ficar ABAIXO dela. Com o heroi
  // escolhido pela config (T7) a meta passou a poder cair num CPA, e val/target dizia
  // "95% da meta" pra um CPA que ja estava melhor que o alvo.
  const def = template && findMetricDef(template, g.metricKey);
  const menorMelhor = def && def.betterWhen === 'lower';
  if (menorMelhor && val <= 0) return null;
  const pct = menorMelhor ? target / val : val / target;
  return { metricKey: g.metricKey, pct, text: `${fmtPercent(pct)} da meta` };
}

/**
 * Template de UM painel: o do domínio com a personalização (número em destaque, números
 * escondidos) e os nomes trocados pela pessoa (config.labels). É a mesma resolução no painel
 * publicado e na prévia ao vivo do assistente. Config simples devolve o template intacto.
 * @param {object} config
 * @returns {object|undefined} undefined quando o domínio não existe
 */
export function templateDoPainel(config) {
  const c = config && typeof config === 'object' ? config : {};
  return aplicarRotulos(aplicarPersonalizacao(getTemplate(c.domain), c), c.labels);
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
    recomecar(app);
  };
  btn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  input.focus();
}

// Erro que tentar de novo NÃO resolve (endereço sem painel, modelo que não existe): diz o que
// aconteceu, o que fazer e dá o caminho de saída.
function showError(app, message, action) {
  app.innerHTML = erroHtml({
    titulo: 'Não deu para abrir este painel',
    mensagem: message,
    oQueFazer: 'Confira o endereço que você recebeu ou use o botão abaixo.',
    acao: action,
    tentar: false,
  });
  terminarProgresso();
}

// Falha que pode passar sozinha (rede, fonte fora do ar): estado de erro com "Tentar de novo".
// `tentar` refaz a busca que falhou; o botão mostra que está tentando.
function mostrarFalha(container, { err, contexto, acao, tentar }) {
  container.innerHTML = erroHtml({ ...explicarFalha(err, contexto), acao, tentar: typeof tentar === 'function' });
  terminarProgresso();
  const btn = container.querySelector('[data-tentar]');
  if (btn && typeof tentar === 'function') {
    btn.addEventListener('click', () => { ocupar(btn, 'Tentando...'); tentar(); });
  }
}

// Localiza a MetricDef no template pelo key (para pegar label e format).
function findMetricDef(template, key) {
  const list = Array.isArray(template.metrics) ? template.metrics : [];
  return list.find((m) => m.key === key);
}

// Renderiza um bloco de kpis (.grid.kpis) a partir dos itens de layout.
// `mapped` (key->boolean, de computeAllMapped) diz se a metrica tem coluna/
// dependencia mapeada: quando false, o card mostra "sem dado" (kpi.js resolve
// o traco) em vez do valor calculado (que seria 0 so por falta de coluna, um
// numero com cara de certo). Default {} preserva o comportamento antigo (tudo
// mapeado) para quem ainda chama sem o 4o argumento.
export function renderKpiBlock(items, template, computed, mapped = {}, trends = {}, goal = null, sparks = {}) {
  // HIERARQUIA (26/08/2026): o template SEMPRE declarou `primaryMetric`, e o layout jogava
  // esse dado fora: os 6 KPIs saiam com peso visual identico e o olho nao sabia onde pousar.
  // Agora a metrica principal daquele dominio vira o card heroi (dobro de largura, valor maior,
  // sparkline). E o que separa um painel de ferramenta de uma fileira de numeros.
  //
  // Tres recusas deliberadas, porque destaque errado e pior que destaque nenhum:
  //   - primaryMetric fora deste bloco: NAO promove outro no lugar (nao inventa hierarquia);
  //   - menos de 3 KPIs: faixa curta demais, o heroi so desequilibra;
  //   - metrica sem coluna mapeada: seria dar o maior card do painel a um zero falso.
  const heroKey = template && template.primaryMetric;
  const temHero =
    !!heroKey &&
    items.length >= 3 &&
    items.some((it) => it && it.props && it.props.metricKey === heroKey) &&
    mapped[heroKey] !== false;
  // Herói sem série (T7, teste com aluno): ocupava 2 colunas com metade do card vazia. Agora
  // só ganha a largura dupla quando tem sparkline pra preencher; sem ela, fica com 1 coluna e
  // continua herói pelo tamanho do número.
  const serieHeroi = temHero ? (sparks && sparks[heroKey]) : null;
  const heroLargo = temHero && Array.isArray(serieHeroi) && serieHeroi.filter((v) => Number.isFinite(Number(v))).length >= 2;

  const cards = items
    .map((item) => {
      const key = item.props && item.props.metricKey;
      const def = findMetricDef(template, key) || {};
      const label = def.label || key || '';
      const format = def.format || 'number';
      const isMapped = mapped[key] !== false;
      const value = computed[key];
      const goalForKpi = isMapped && goal && goal.metricKey === key ? goal : undefined;
      const isHero = temHero && key === heroKey;
      return renderKpi(
        {
          label,
          format,
          hint: item.props && item.props.hint,
          trend: isMapped ? trends[key] : undefined,
          goal: goalForKpi,
          unmapped: !isMapped,
          hero: isHero,
          spark: isHero ? sparks[key] : undefined,
          heroCompacto: isHero && !heroLargo,
        },
        value,
      );
    })
    .join('');
  // O heroi ocupa 2 unidades da faixa. Com `auto-fit` o navegador escolhia o numero de
  // colunas sem saber disso, e o ultimo card caia numa segunda linha com um buraco cinza ao
  // lado. Regressao pega pelo SCREENSHOT: os testes e o gate automatico passaram os dois.
  // Agora a contagem vai explicita e o CSS monta a faixa com o numero certo de colunas.
  const unidades = items.length + (heroLargo ? 1 : 0);
  return `<div class="grid kpis" style="--kpi-cols:${faixaDeKpi(unidades)}">${cards}</div>`;
}

// Quantas colunas a faixa de indicadores declara. Até 7 unidades cabem numa linha. De 8 em
// diante (a Visão geral do Marketing tem 7 indicadores + o herói em largura dupla = 8) uma
// linha só espreme o valor ("R$ 140.600,00" não cabe), então a faixa quebra em DUAS linhas
// iguais. Só quebra com número par: com ímpar sobraria uma célula vazia na segunda linha, o
// mesmo buraco cinza da regressão de 26/08/2026. Pura e exportada pra ter teste.
export function faixaDeKpi(unidades) {
  const n = Number(unidades) || 0;
  return n >= 8 && n % 2 === 0 ? n / 2 : n;
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
    console.error(`[dashboard] widget desconhecido no layout: "${tipo}". Não existe no registry de widgets.`);
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

/**
 * Plano do esqueleto de carregamento a partir do modelo do painel: as abas, quantos
 * indicadores a aba que vai abrir tem (e qual é o destaque) e os cartões dela. Com isso o
 * esqueleto ocupa o lugar que o conteúdo vai ocupar. Pura (o HTML sai de lib/esqueleto.js).
 * @param {object} template
 * @param {string|null} abaId  aba pedida na URL (ou null: a primeira)
 * @param {object} [colMap]    colunas ligadas no painel: diz quais filtros vão existir
 */
export function planoDoEsqueleto(template, abaId, colMap) {
  const t = template && typeof template === 'object' ? template : {};
  const abas = abasDoTemplate(t);
  const blocos = planLayout(layoutDaAba(t, abaId));
  const faixa = blocos.find((b) => b.type === 'kpis');
  const kpis = faixa ? faixa.items.length : 0;
  // Mesma regra do renderKpiBlock: destaque só em faixa de 3 ou mais indicadores.
  const heroi = faixa && kpis >= 3 && t.primaryMetric
    ? faixa.items.findIndex((it) => it && it.props && it.props.metricKey === t.primaryMetric)
    : -1;
  const ligadas = colMap && typeof colMap === 'object' ? colMap : null;
  return {
    abas: abas.map((a) => a.label),
    // Filtros que a barra vai ter: datas se a coluna de data está ligada e um seletor por campo
    // de agrupar ligado. Sem saber as colunas, o formato geral (datas e um seletor).
    filtros: ligadas
      ? { datas: !!ligadas[resolveDateSlot(t)], campos: dimensionSlots(t).filter((d) => ligadas[d.key]).length }
      : { datas: true, campos: 1 },
    kpis,
    heroi,
    colunas: faixaDeKpi(kpis + (heroi >= 0 ? 1 : 0)) || 1,
    blocos: blocos
      .filter((b) => b.type === 'single' && b.item)
      .map((b) => ({ col: ALLOWED_SPANS.has(b.item.col) ? b.item.col : null, tipo: b.item.widget })),
  };
}

// Resolve qual aba de um grupo deve abrir: a pedida (?tab=) se for uma aba valida,
// senao a primeira; null se nao ha abas. Puro e testavel.
export function resolveActiveTab(tabs, requested) {
  // Mesma regra das abas de dentro do dashboard (lib/abas.js): uma fonte só.
  return resolverAba(tabs, requested);
}

// Serie temporal do KPI heroi, para a sparkline. Devolve {} sempre que desenhar seria mentir:
//   - metrica DERIVADA (ROAS, CTR): a serie por dia nao e a agregacao da derivada, e a linha
//     sairia com uma forma que nao corresponde ao numero do card;
//   - coluna fora do colMap: viraria uma serie de zeros com cara de dado real;
//   - menos de 2 dias: uma "tendencia" de um ponto so.
// Pura e exportada de proposito: e a unica parte com regra de negocio aqui, entao e a que
// precisa de teste.
export function sparkForHero(template, rows, colMap) {
  const key = template && template.primaryMetric;
  const dateSlot = template && template.dateSlot;
  if (!key || !dateSlot || !Array.isArray(rows) || rows.length < 2) return {};
  const def = findMetricDef(template, key);
  if (!def) return {};
  if (def.column) {
    if (!colMap || !colMap[def.column]) return {};   // coluna nao mapeada
    const pontos = timeSeries(rows, colMap, dateSlot, def.column, def.agg || 'sum');
    if (!pontos || pontos.length < 2) return {};
    return { [key]: pontos.map((p) => p.value) };
  }
  // Derivada (T7): CPA ou ROAS como heroi ficavam sem sparkline e com metade do card vazia.
  // A serie honesta e a MESMA conta feita dia a dia (CPA de cada dia), so quando a gente
  // sabe do que ela depende: ratio (ratioOf) ou derived com dependsOn. Dia sem denominador
  // fica de fora: um zero ali seria dado inventado.
  const deps = def.agg === 'ratio' ? def.ratioOf : (def.agg === 'derived' ? def.dependsOn : null);
  if (!Array.isArray(deps) || !deps.length) return {};
  const metrics = Array.isArray(template.metrics) ? template.metrics : [];
  const col = colMap && colMap[dateSlot];
  if (!col) return {};
  const porDia = new Map();
  for (const r of rows) {
    const iso = parseDateBR(r[col]);
    if (!iso) continue;
    if (!porDia.has(iso)) porDia.set(iso, []);
    porDia.get(iso).push(r);
  }
  const serie = [];
  for (const iso of [...porDia.keys()].sort()) {
    const { computed, mapped } = computeAllMapped(metrics, porDia.get(iso), colMap);
    if (mapped[key] === false) return {};
    if (def.agg === 'ratio' && !Number(computed[def.ratioOf[1]])) continue;
    const v = computed[key];
    if (Number.isFinite(v)) serie.push(v);
  }
  return serie.length >= 2 ? { [key]: serie } : {};
}

// Monta so o corpo de widgets (grid + sections de kpi) a partir de um ctx JA
// calculado (computed/trends/goal/dataset ja refletem o filtro atual). Devolve
// string HTML. Chamado a cada mudanca de filtro para repintar so o #dashbody.
function buildBodyHtml(ctx) {
  const { template } = ctx;
  // Template com abas: vai pra tela o layout que o renderBody escolheu (o da aba ativa).
  // Sem abas (ou chamada sem layout escolhido): o layout de sempre do template.
  const blocks = planLayout(Array.isArray(ctx.layout) ? ctx.layout : template.layout);

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
      parts.push(`<section class="section">${renderKpiBlock(block.items, template, ctx.computed, ctx.mapped, ctx.trends, ctx.goal,
        sparkForHero(template, ctx.dataset && ctx.dataset.rows, ctx.colMap))}</section>`);
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
    // A idade dos números ("Atualizado há 3 min") fica na faixa; aqui vai a hora exata da leitura.
    when ? `Lido em ${when}` : '',
  ].filter(Boolean).join(' · ');
}

// HTML da barra de filtros: periodo (de/ate) quando ha coluna de data, e um
// seletor por dimensao mapeada com 2..200 valores distintos. Devolve '' quando
// nao ha nada filtravel (ai a barra nem aparece). Cada controle carrega um id/
// data-slot estavel pra o wireFilters ler o estado sem reprocessar o template.
// opts.mostrarIntervalo=false tira a dica "Dados de X a Y": quando a faixa de marca está na
// tela ela já mostra o período dos dados, e repetir logo abaixo seria ruído. A dica continua
// no title de cada campo de data.
export function buildFilterBar(template, dataset, colMap, opts = {}) {
  const rows = dataset.rows || [];
  const fields = [];

  const dateSlot = resolveDateSlot(template);
  const dateCol = (colMap && colMap[dateSlot]) || null;
  if (dateCol) {
    const { min, max } = dateBounds(rows, dateCol);
    if (min && max) {
      // Campo de texto com máscara dd/mm/aaaa (nao type="date": o nativo segue o idioma do
      // navegador e saia mm/dd/yyyy). O periodo dos dados vai na dica, em formato brasileiro.
      const de = isoParaBR(min);
      const ate = isoParaBR(max);
      const campo = (id, rotulo, exemplo) =>
        `<div class="fb-field"><label class="fb-label" for="${id}">${rotulo}</label>` +
          `<input id="${id}" type="text" inputmode="numeric" autocomplete="off" maxlength="10" ` +
          `placeholder="dd/mm/aaaa" class="input fb-input fb-date" value="" ` +
          `title="Dados de ${esc(de)} a ${esc(ate)}. Ex: ${esc(exemplo)}" /></div>`;
      // Atalhos de período (um clique) e, como opção "Personalizado", os campos digitados.
      const intervalo = opts.mostrarIntervalo !== false ? `<span class="fb-range hint">Dados de ${esc(de)} a ${esc(ate)}</span>` : '';
      fields.push(atalhosHtml('tudo'));
      fields.push(`<div class="fb-datas" hidden>${campo('fb-from', 'De', de)}${campo('fb-to', 'Até', ate)}${intervalo}</div>`);
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
      `<div class="fb-field"><label class="fb-label" for="fb-dim-${esc(dim.key)}">${esc(dim.label)}</label>` +
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
  // Datas digitadas em dd/mm/aaaa viram ISO; data incompleta ou invalida nao filtra.
  const barra = document.getElementById('filterbar');
  return { from: brParaISO(val('fb-from')), to: brParaISO(val('fb-to')), dims, atalho: barra && barra.dataset.periodo ? barra.dataset.periodo : null };
}

// Monta o ctx de render (métricas, tendência e meta JÁ calculadas em cima das linhas
// filtradas pelo estado de filtro). Separado do renderBody porque o renderDashboard também
// precisa dele pra descobrir, antes de desenhar a barra, quais abas têm o que mostrar.
function montarCtx(baseCtx, state) {
  const { config, template, dataset, colMap } = baseCtx;
  const rows = applyFilters(dataset.rows, colMap, template, state);
  const { computed, mapped } = computeAllMapped(template.metrics, rows, colMap);
  const dateSlot = resolveDateSlot(template);
  const { current, previous } = splitByPeriod(rows, colMap, dateSlot);
  const trends = buildTrends(template.metrics, current, previous, colMap);
  const goal = buildGoal(config, computed, mapped, template);
  const ds = { columns: dataset.columns, rows, meta: dataset.meta };
  // ui = o que sobrevive ao repaint: as abas em uso, a aba ativa e o que foi digitado na
  // calculadora de meta. O corpo é trocado inteiro a cada mudança de filtro, então nada disso
  // pode morar no DOM dele.
  const ui = baseCtx.ui || { abas: [], abaAtiva: null, meta: {} };
  return {
    config, template, dataset: ds, colMap, computed, mapped, trends, goal,
    // Com abas em uso: o layout da aba ativa. Sem abas (template sem tabs, ou nenhuma aba com
    // conteúdo): o layout plano do template.
    layout: layoutDaAba({ ...template, tabs: ui.abas }, ui.abaAtiva),
    estado: { meta: ui.meta },
    // O gráfico de linha escolhe a proporção do desenho pela largura real da tela.
    // Na prévia do assistente o painel é desenhado numa largura fixa e reduzido: vale ela.
    larguraDaTela: baseCtx.larguraDaTela || (typeof window !== 'undefined' ? window.innerWidth : undefined),
  };
}

// Recalcula metricas/tendencia/meta em cima das linhas filtradas e repinta so o
// corpo (#dashbody) e o rodape (#dashmeta). NAO toca na barra de filtros (os
// controles sao a fonte da verdade do estado e nao podem ser recriados a cada
// mudanca, senao perderiam foco/valor).
//
// modo decide o movimento (lib/movimento.js):
//   'entrada': primeira carga e troca de aba. Indicadores, cartões e linhas entram em sequência
//              curta, as barras crescem, a linha do gráfico se desenha e os números contam.
//   'filtro':  mudança de filtro e botão Atualizar. Os indicadores contam do valor que estava na
//              tela até o novo (dá pra ver o que mudou) e os cartões entram de leve.
//   'quieto':  sem movimento (giro de tela, prévia do assistente sendo redesenhada).
// extra.atraso: a contagem espera esse tempo (na abertura, as peças entram depois da faixa).
// extra.antes:  valores dos indicadores antes da troca (quando o corpo já foi trocado por fora).
function renderBody(baseCtx, state, modo = 'quieto', extra = {}) {
  const bodyEl = document.getElementById('dashbody');
  const metaEl = document.getElementById('dashmeta');
  if (!bodyEl) return;
  const ctx = montarCtx(baseCtx, state);
  const antes = extra.antes || (modo === 'filtro' ? valoresDosIndicadores(bodyEl) : null);
  // Foto do gráfico e das barras que estão na tela, pra o desenho novo sair deles (efeito 2).
  const foto = modo === 'filtro' && !extra.antes ? fotografarDados(bodyEl) : null;

  // A classe entra ANTES do conteúdo: os elementos novos já nascem com a animação de entrada.
  // Fora da entrada ela sai, então o conteúdo novo nasce parado.
  bodyEl.classList.toggle('anima-entrada', modo === 'entrada');
  bodyEl.innerHTML = buildBodyHtml(ctx) || '<div class="empty-state"><p>Nenhum dado para os filtros selecionados.</p></div>';
  if (metaEl) metaEl.textContent = buildMetaText(ctx.dataset);
  if (modo === 'entrada') contarIndicadores(bodyEl, { atraso: extra.atraso || 0 });
  if (modo === 'filtro') {
    // Números de roleta (efeito 3) no lugar da contagem; gráfico e barras vão do desenho antigo
    // ao novo (efeito 2). Cartão que tem gráfico ou barras não recomeça: ele se transforma.
    rolarIndicadores(bodyEl, antes || []);
    if (foto) transformarDados(bodyEl, foto);
    bodyEl.querySelectorAll('.dash-cell').forEach((celula, i) => {
      if (celula.querySelector('.chart--timeseries, .ranking, .funnel')) return;
      animar(celula, [{ opacity: 0.35, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
        { duration: DURACAO.troca, delay: Math.min(i, 4) * 30, fill: 'backwards' });
    });
  }
  // Meta batida (efeito 5): o marco toca quando a barra CRUZA 100%, uma vez; continuar batida
  // depois não repete. A primeira carga só registra de onde se parte.
  if (ctx.goal && baseCtx.ui) {
    const cruzou = cruzouMeta(baseCtx.ui.pctMeta, ctx.goal.pct);
    baseCtx.ui.pctMeta = ctx.goal.pct;
    if (cruzou && (modo === 'filtro' || modo === 'entrada') && !extra.semMarco) marcarMetaBatida(bodyEl);
  }
}

// O valor de cada indicador que está na tela agora, na ordem em que aparecem (NaN pro que não
// tem número). Serve de ponto de partida pra contagem quando o filtro muda.
function valoresDosIndicadores(raiz) {
  if (!raiz) return [];
  return [...raiz.querySelectorAll('.kpi')].map((k) => (k.dataset.contaValor == null ? NaN : Number(k.dataset.contaValor)));
}

// Contagem dos indicadores: só visual. O texto final já está no DOM (kpi.js) e continua lá o
// tempo todo, invisível durante a contagem, pra leitor de tela e pra quem copia. Por cima vai
// um <span aria-hidden> em posição absoluta com o número do quadro: ele não empurra nada.
// Com movimento reduzido, nem começa. Um temporizador garante o estado final mesmo se a aba
// estiver em segundo plano (requestAnimationFrame parado).
//   opts.atraso  espera antes de começar a contar (o visor já mostra o ponto de partida);
//   opts.de      ponto de partida de cada indicador (mudança de filtro): só conta o que mudou.
function contarIndicadores(raiz, { atraso = 0, de = null } = {}) {
  if (menosMovimento() || typeof requestAnimationFrame !== 'function') return;
  raiz.querySelectorAll('.kpi').forEach((kpi, i) => {
    if (kpi.dataset.contaValor == null) return;
    const alvo = kpi.querySelector('.kpi__value');
    const final = Number(kpi.dataset.contaValor);
    if (!alvo || !Number.isFinite(final)) return;
    const partida = de ? Number(de[i]) : 0;
    // Entrada: zero não conta (seria animar um zero que já está lá). Filtro: só o que mudou.
    if (de ? (!Number.isFinite(partida) || partida === final) : final === 0) return;
    const formato = kpi.dataset.contaFormato || 'number';
    const visor = document.createElement('span');
    visor.className = 'kpi__conta';
    visor.setAttribute('aria-hidden', 'true');
    visor.textContent = textoDaContagemEntre(partida, final, formato, 0);
    alvo.classList.add('is-contando');
    alvo.appendChild(visor);
    let feito = false;
    const fechar = () => {
      if (feito) return;
      feito = true;
      visor.remove();
      alvo.classList.remove('is-contando');
    };
    const comecar = () => {
      const inicio = performance.now();
      const quadro = (agora) => {
        if (feito) return;
        const p = (agora - inicio) / DURACAO.contagem;
        if (p >= 1 || !visor.isConnected) { fechar(); return; }
        visor.textContent = textoDaContagemEntre(partida, final, formato, p);
        requestAnimationFrame(quadro);
      };
      requestAnimationFrame(quadro);
    };
    if (atraso > 0) setTimeout(comecar, atraso); else comecar();
    setTimeout(fechar, atraso + DURACAO.contagem + 300);
  });
}

// Marcador da aba ativa: uma pílula que DESLIZA até a aba nova. Ela é posicionada de uma vez
// no lugar da aba ativa (sem transição de largura) e o deslize é só transform, saindo de onde
// estava (transformDoMarcador). Sem o marcador (JS falhou, barra sem abas) vale o fundo da
// própria aba, como antes.
function retanguloDe(el) {
  return { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
}
function posicionarMarcador(app, { deslizar = false } = {}) {
  const barra = app.querySelector('.abas');
  const marcador = barra && barra.querySelector('.abas__marcador');
  const ativa = barra && barra.querySelector('[role="tab"][aria-selected="true"]');
  if (!marcador || !ativa) return;
  const de = retanguloDe(marcador);
  const para = retanguloDe(ativa);
  marcador.style.left = `${para.left}px`;
  marcador.style.top = `${para.top}px`;
  marcador.style.width = `${para.width}px`;
  marcador.style.height = `${para.height}px`;
  barra.classList.add('abas--marcador');
  if (!deslizar) return;
  const saida = transformDoMarcador(de, para);
  if (saida !== 'none') animar(marcador, [{ transform: saida }, { transform: 'none' }], { duration: DURACAO.troca, easing: CURVA.vaiVolta });
}

// Troca a aba ativa: marca o botão (aria-selected + roving tabindex), aponta o painel pro
// botão, grava a aba no hash da URL (link de uma aba dá pra mandar) e repinta só o corpo com
// o filtro que já estava aplicado. opts.foco leva o foco pro botão (navegação por teclado);
// opts.url=false não mexe na URL (quando a troca já veio de uma mudança de hash).
function ativarAba(app, baseCtx, id, opts = {}) {
  const ui = baseCtx.ui;
  if (!ui || !ui.abas.some((t) => t.id === id)) return;
  // Pra que lado a pessoa foi: aba à direita da atual entra pela direita, e vice-versa.
  const de = ui.abas.findIndex((t) => t.id === ui.abaAtiva);
  const para = ui.abas.findIndex((t) => t.id === id);
  const lado = para < de ? -1 : 1;
  ui.abaAtiva = id;
  app.querySelectorAll('.abas [role="tab"]').forEach((b) => {
    const ativa = b.dataset.aba === id;
    b.setAttribute('aria-selected', ativa ? 'true' : 'false');
    b.tabIndex = ativa ? 0 : -1;
    if (ativa && opts.foco) b.focus();
  });
  const painel = document.getElementById('dashbody');
  if (painel) painel.setAttribute('aria-labelledby', idDoBotaoDaAba(id));
  posicionarMarcador(app, { deslizar: true });
  // Na prévia do assistente a aba não vai pra URL (a página é a do assistente).
  if (opts.url !== false && !baseCtx.previa) {
    try {
      history.replaceState(null, '', `${location.pathname}${location.search}#${encodeURIComponent(id)}`);
    } catch { /* ambiente sem history: ignora */ }
  }
  trocarCorpo(baseCtx, lado);
}

// Troca o corpo do painel com direção: o conteúdo da aba antiga sai pro lado oposto e o da nova
// entra vindo do lado pra onde a pessoa foi, com as peças em sequência (só transform e opacity).
// A troca de verdade roda por temporizador, nunca por evento de fim de animação; com movimento
// reduzido, na hora. Outra troca no meio do caminho assume e a anterior desiste.
let vezDaTroca = 0;
function trocarCorpo(baseCtx, lado) {
  const bodyEl = document.getElementById('dashbody');
  if (!bodyEl) return;
  vezDaTroca += 1;
  const minha = vezDaTroca;
  const desenhar = () => renderBody(baseCtx, readFilterState(), 'entrada');
  if (menosMovimento() || !bodyEl.firstChild) { desenhar(); return; }
  const passo = 18; // px: cabe na margem da página mesmo no celular
  const saida = DURACAO.toque - 30;
  animar(bodyEl, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-lado * passo}px)` }],
    { duration: saida, easing: 'ease-in', fill: 'forwards' });
  setTimeout(() => {
    if (minha !== vezDaTroca) return;
    for (const a of (bodyEl.getAnimations ? bodyEl.getAnimations() : [])) a.cancel();
    bodyEl.style.setProperty('--entrada-x', `${lado * passo}px`);
    bodyEl.style.setProperty('--entrada-y', '0px');
    // Os cartões esperam 120 ms pelos indicadores. Aba sem faixa de indicadores (só gráficos ou
    // tabela) não tem por quem esperar: o primeiro cartão entra logo.
    const ui = baseCtx.ui || { abas: [], abaAtiva: null };
    const temIndicadores = planLayout(layoutDaAba({ ...baseCtx.template, tabs: ui.abas }, ui.abaAtiva)).some((b) => b.type === 'kpis');
    if (temIndicadores) bodyEl.style.removeProperty('--entrada-base'); else bodyEl.style.setProperty('--entrada-base', '-110ms');
    desenhar();
  }, saida);
}

// Ouvintes presos na JANELA (hash e largura de tela) pertencem a um dashboard renderizado.
// Num grupo, cada troca de aba do grupo renderiza outro dashboard-filho: os ouvintes do
// anterior precisam sair, senão ficariam apontando pra tela morta.
let ouvintesDaJanela = [];
function soltarOuvintesDaJanela() {
  for (const soltar of ouvintesDaJanela) soltar();
  ouvintesDaJanela = [];
}

// Girar o celular ou redimensionar a janela atravessando um corte de largura repinta o corpo:
// a proporção do gráfico de linha depende da largura da tela (ver larguraDoDesenho).
function wireLargura(baseCtx) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  for (const corte of [620, 760, 900]) {
    const mq = window.matchMedia(`(max-width: ${corte}px)`);
    const repintar = () => renderBody(baseCtx, readFilterState());
    mq.addEventListener('change', repintar);
    ouvintesDaJanela.push(() => mq.removeEventListener('change', repintar));
  }
}

// Fia a barra de abas: clique, teclado (setas, Home, End) e mudança de hash vinda de fora
// (alguém colou #canais na URL, ou voltou no histórico).
function wireAbas(app, baseCtx) {
  const barra = app.querySelector('.abas');
  if (!barra) return;
  // Marcador deslizante (ver posicionarMarcador). Entra por aqui, não no HTML puro da barra:
  // sem JS a barra continua completa e acessível.
  const marcador = document.createElement('span');
  marcador.className = 'abas__marcador';
  marcador.setAttribute('aria-hidden', 'true');
  barra.insertBefore(marcador, barra.firstChild);
  posicionarMarcador(app);
  const reposicionar = () => posicionarMarcador(app);
  window.addEventListener('resize', reposicionar);
  ouvintesDaJanela.push(() => window.removeEventListener('resize', reposicionar));
  // A fonte própria carrega depois do primeiro desenho e muda a largura das abas.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(reposicionar).catch(() => {});
  barra.addEventListener('click', (e) => {
    const b = e.target.closest('[role="tab"]');
    if (b) ativarAba(app, baseCtx, b.dataset.aba);
  });
  barra.addEventListener('keydown', (e) => {
    const b = e.target.closest('[role="tab"]');
    if (!b) return;
    const proxima = proximaAba(baseCtx.ui.abas, b.dataset.aba, e.key);
    if (!proxima) return;
    e.preventDefault();
    ativarAba(app, baseCtx, proxima, { foco: true });
  });
  if (baseCtx.previa) return; // na prévia do assistente o hash da URL não é do painel
  const aoMudarHash = () => {
    // Hash que não é de aba (ex: #main do "pular para o conteúdo") não troca nada.
    const pedido = abaDoHash(location.hash);
    if (!pedido || pedido === baseCtx.ui.abaAtiva) return;
    ativarAba(app, baseCtx, pedido, { url: false });
  };
  window.addEventListener('hashchange', aoMudarHash);
  ouvintesDaJanela.push(() => window.removeEventListener('hashchange', aoMudarHash));
}

// Calculadora de meta: a cada tecla guarda o que foi digitado (pra sobreviver ao repaint dos
// filtros) e troca SÓ a área de resultado do cartão. O campo não é recriado: não perde o foco.
// O ouvinte fica no #dashbody (que persiste), não no campo (que é recriado a cada repaint).
function wireMeta(baseCtx) {
  const bodyEl = document.getElementById('dashbody');
  if (!bodyEl) return;
  bodyEl.addEventListener('input', (e) => {
    const campo = e.target && e.target.closest ? e.target.closest('[data-meta-campo]') : null;
    if (!campo) return;
    const raiz = campo.closest('[data-widget="meta"]');
    if (!raiz) return;
    baseCtx.ui.meta[raiz.dataset.metaId] = campo.value;
    const saida = raiz.querySelector('[data-meta-saida]');
    if (saida) {
      saida.innerHTML = saidaDoElemento(raiz.dataset.metaDados, campo.value);
      // O resultado novo entra com uma transição curta em vez de trocar seco. O campo não é
      // tocado (não perde o foco) e o valor já está no DOM antes de a transição começar.
      animar(saida, [{ opacity: 0.3, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: DURACAO.toque });
    }
  });
}

// Fia os eventos da barra: qualquer 'change' (data ou select) recalcula; o botao
// Limpar zera os controles e volta ao periodo/valores completos.
function wireFilters(baseCtx) {
  const bar = document.getElementById('filterbar');
  if (!bar) return;
  // Atalhos de período (efeito 4): um clique põe a faixa nos campos e dispara a transição.
  const dateCol = baseCtx.colMap && baseCtx.colMap[resolveDateSlot(baseCtx.template)];
  const limites = dateCol ? dateBounds(baseCtx.dataset.rows, dateCol) : { min: null, max: null };
  baseCtx.atalhos = ligarAtalhos(bar, limites, () => renderBody(baseCtx, readFilterState(), 'filtro'));
  if (baseCtx.atalhos) ouvintesDaJanela.push(baseCtx.atalhos.soltar);
  bar.addEventListener('change', () => renderBody(baseCtx, readFilterState(), 'filtro'));
  // Mascara dd/mm/aaaa enquanto digita; filtra assim que a data fica completa ou vazia.
  bar.querySelectorAll('.fb-date').forEach((el) => {
    el.addEventListener('input', () => {
      const v = mascaraDataBR(el.value);
      if (v !== el.value) el.value = v;
      if (v.length === 10 || v.length === 0) renderBody(baseCtx, readFilterState(), 'filtro');
    });
  });
  const reset = document.getElementById('fb-reset');
  if (reset) {
    reset.addEventListener('click', () => {
      bar.querySelectorAll('input, select').forEach((el) => { el.value = ''; });
      if (baseCtx.atalhos) baseCtx.atalhos.selecionar('tudo', { silencioso: true });
      renderBody(baseCtx, emptyFilterState(), 'filtro');
    });
  }
}

// Monta o "shell" (faixa de marca + barra de abas, se o template tiver + barra de filtros +
// área de corpo e rodapé vazias) e pinta o corpo pela primeira vez (estado sem filtro). A barra fica FORA do
// #dashbody pra sobreviver aos repaints. opts.showHeader=false esconde o
// h1/subtitle (usado quando o dashboard e uma ABA de um grupo: o titulo do grupo
// e a propria aba ja identificam, entao o header do filho seria redundante).
//
// EXPORTADA: a prévia ao vivo do assistente monta o painel por aqui (o painel de verdade, não
// uma imitação). Opções da prévia:
//   opts.previa      não lê nem escreve o hash da URL e não ouve mudança de hash;
//   opts.abaInicial  aba que abre (a prévia lembra a aba entre um redesenho e outro);
//   opts.semEntrada  desenha parado (o assistente faz a transição dele por cima);
//   opts.larguraDaTela  largura em que o painel está sendo desenhado (o gráfico usa).
// Devolve { abaAtiva() } pra quem chamou saber em que aba a pessoa está.
export function renderDashboard(app, baseCtx, opts = {}) {
  baseCtx.previa = !!opts.previa;
  if (opts.larguraDaTela) baseCtx.larguraDaTela = opts.larguraDaTela;
  const { config, template, dataset, colMap } = baseCtx;
  // Faixa de marca: nome do painel, rótulo do domínio, período dos dados e o logo da config.
  // O período é o da FONTE inteira (não acompanha o filtro): o que está filtrado se lê nos
  // próprios campos De e Até, logo abaixo. Com opts.aoAtualizar a faixa também diz a idade dos
  // números e traz o botão Atualizar.
  const periodo = periodoDosDados(dataset.rows, colMap, resolveDateSlot(template));
  const comFaixa = opts.showHeader !== false;
  const dados = typeof opts.aoAtualizar === 'function'
    ? { texto: textoAtualizado(dataset.meta && dataset.meta.fetchedAt) }
    : null;
  const header = comFaixa
    ? cabecalhoHtml({ nome: config.name, dominio: template.label, periodo, logo: config.logo, logoFundo: config.logoFundo, dados })
    : '';
  // Sem faixa (aba de um grupo), a idade dos números e o Atualizar vão soltos, acima dos filtros.
  const dadosSoltos = !comFaixa && dados ? estadoDosDadosHtml({ ...dados, solto: true }) : '';
  const filterBar = buildFilterBar(template, dataset, colMap, { mostrarIntervalo: !(comFaixa && periodo) });

  // Abas do template (se houver). Só entra na barra a aba que tem o que mostrar com o
  // mapeamento deste painel (ex: sem a coluna de canal, "Canais" some): testa desenhando o
  // corpo de cada uma com os dados sem filtro. Se nenhuma sobrar, o painel cai no layout plano.
  // A aba pedida no hash da URL abre direto; senão, a primeira.
  baseCtx.ui = { abas: [], abaAtiva: null, meta: {} };
  const ctxSemFiltro = montarCtx(baseCtx, emptyFilterState());
  const abas = abasVisiveis(abasDoTemplate(template), (t) => buildBodyHtml({ ...ctxSemFiltro, layout: t.layout }));
  const abaAtiva = resolverAba(abas, opts.previa ? opts.abaInicial : abaDoHash(location.hash));
  // O que a pessoa digitou na calculadora de meta sobrevive a um Atualizar (opts.metaInicial).
  baseCtx.ui = { abas, abaAtiva, meta: opts.metaInicial || {}, pctMeta: opts.pctMetaInicial == null ? null : opts.pctMetaInicial };
  const abasHtml = barraDeAbasHtml(abas, abaAtiva, 'dashbody');
  const painelAttrs = abas.length
    ? ` role="tabpanel" tabindex="0" aria-labelledby="${esc(idDoBotaoDaAba(abaAtiva))}"`
    : '';

  // Valores na tela ANTES de trocar tudo: ponto de partida da contagem quando é um Atualizar.
  const antes = opts.modo === 'filtro' ? valoresDosIndicadores(document.getElementById('dashbody')) : null;

  // Abertura (primeira carga): a faixa, as abas e os filtros entram em sequência e o corpo vem
  // logo depois. Com saudação, opts.atrasoDaAbertura faz a primeira peça entrar junto com a
  // cortina. Fora da abertura estas peças nascem paradas.
  const abertura = opts.modo === 'abertura';
  const atraso = abertura ? (Number(opts.atrasoDaAbertura) || 0) : 0;
  vezDaAbertura += 1;
  const minhaAbertura = vezDaAbertura;
  app.classList.toggle('anima-abertura', abertura);
  if (abertura) {
    app.style.setProperty('--abertura-base', `${atraso}ms`);
    setTimeout(() => {
      if (minhaAbertura !== vezDaAbertura) return;
      app.classList.remove('anima-abertura');
      app.style.removeProperty('--abertura-base');
    }, atraso + TEMPOS.entrada + 400);
  } else {
    app.style.removeProperty('--abertura-base');
  }

  app.innerHTML =
    header +
    abasHtml +
    dadosSoltos +
    filterBar +
    `<div id="dashbody"${painelAttrs}></div>` +
    `<p class="hint" id="dashmeta" style="margin-top:28px"></p>`;

  // Filtros que estavam aplicados antes de um Atualizar voltam pros campos.
  const estado = restaurarFiltros(opts.estadoInicial) ? readFilterState() : emptyFilterState();
  const modo = opts.modo || (opts.semEntrada ? 'quieto' : 'entrada');
  if (modo === 'abertura') renderBody(baseCtx, estado, 'entrada', { atraso: atraso + 200 });
  else renderBody(baseCtx, estado, modo, { antes });
  soltarOuvintesDaJanela();
  wireFilters(baseCtx);
  wireAbas(app, baseCtx);
  wireMeta(baseCtx);
  wireLargura(baseCtx);
  ouvintesDaJanela.push(ligarGraficoResponde(document.getElementById('dashbody')));
  ouvintesDaJanela.push(ligarTabelaOrdena(document.getElementById('dashbody'), { aba: () => (baseCtx.ui ? baseCtx.ui.abaAtiva : '') }));
  wireAtualizar(app, baseCtx, opts);
  return { abaAtiva: () => (baseCtx.ui ? baseCtx.ui.abaAtiva : null) };
}
let vezDaAbertura = 0;

// Põe de volta nos campos o filtro que estava aplicado (datas em ISO, dimensões por campo).
// Valor que não existe mais na fonte nova (um canal que saiu) simplesmente não volta.
function restaurarFiltros(estado) {
  if (!estado || typeof estado !== 'object') return false;
  const barra = document.getElementById('filterbar');
  if (barra && estado.atalho) barra.dataset.periodo = estado.atalho;
  const por = (id, valor) => {
    const el = document.getElementById(id);
    if (el && valor) el.value = isoParaBR(valor);
  };
  por('fb-from', estado.from);
  por('fb-to', estado.to);
  for (const [slot, valor] of Object.entries(estado.dims || {})) {
    if (!valor) continue;
    const el = document.querySelector(`#filterbar [data-slot="${CSS.escape(slot)}"]`);
    if (el && [...el.options].some((o) => o.value === valor)) el.value = valor;
  }
  return true;
}

// Idade dos números ("Atualizado há 3 min", que se mantém sozinho) e o botão Atualizar: busca
// os números de novo sem recarregar a página, mantendo a aba, os filtros e o que foi digitado.
// Enquanto busca, o próprio botão mostra (ícone girando) e a barra do topo anda. Se a busca
// falhar, os números que estavam na tela FICAM, o texto diz de que hora eles são e o botão
// vira "Tentar de novo".
function wireAtualizar(app, baseCtx, opts) {
  const btn = app.querySelector('#dashatualizar');
  const texto = app.querySelector('#dashatualizado');
  if (!btn || !texto || typeof opts.aoAtualizar !== 'function') return;
  const lidoEm = () => baseCtx.dataset && baseCtx.dataset.meta && baseCtx.dataset.meta.fetchedAt;

  // O texto acorda só quando vai mudar (de "agora" pra "há 1 min", e assim por diante).
  let relogio = 0;
  const escrever = () => {
    if (!texto.isConnected) return;
    if (!texto.classList.contains('is-erro') && !btn.classList.contains('is-loading')) texto.textContent = textoAtualizado(lidoEm());
    const falta = proximaTroca(lidoEm());
    if (falta != null) relogio = setTimeout(escrever, falta + 40);
  };
  escrever();
  ouvintesDaJanela.push(() => clearTimeout(relogio));

  btn.addEventListener('click', async () => {
    if (btn.classList.contains('is-loading')) return;
    btn.classList.add('is-loading');
    btn.setAttribute('aria-busy', 'true');
    texto.classList.remove('is-erro');
    texto.removeAttribute('title');
    texto.textContent = 'Buscando os números...';
    comecarProgresso();
    try {
      const novo = await opts.aoAtualizar();
      if (!novo || !Array.isArray(novo.rows)) throw new Error('A fonte não devolveu dados válidos.');
      const estadoInicial = readFilterState();
      const metaInicial = baseCtx.ui ? baseCtx.ui.meta : {};
      baseCtx.dataset = novo;
      const pctMetaInicial = baseCtx.ui ? baseCtx.ui.pctMeta : null;
      renderDashboard(app, baseCtx, { ...opts, modo: 'filtro', estadoInicial, metaInicial, pctMetaInicial });
      const novoBotao = app.querySelector('#dashatualizar');
      if (novoBotao) novoBotao.focus({ preventScroll: true });
    } catch (err) {
      btn.classList.remove('is-loading');
      btn.removeAttribute('aria-busy');
      const rotulo = btn.querySelector('.dados-estado__rotulo');
      if (rotulo) rotulo.textContent = 'Tentar de novo';
      const hora = horaCurta(lidoEm());
      texto.textContent = hora ? `Não atualizou: números das ${hora}` : 'Não atualizou: números de antes';
      texto.title = `${explicarFalha(err, 'dados').mensagem} Os números na tela continuam os de antes.`;
      texto.classList.add('is-erro');
    } finally {
      terminarProgresso();
    }
  });
}

// Preenche a topbar com a marca (logo seguro ou .dot + nome) + botoes de navegacao.
function renderTopbar(config, id) {
  const brand = document.querySelector('.topbar .brand');
  // brandInnerHtml valida o src do logo no cliente (https/data:image) e escapa
  // nome e src; com logo seguro troca o .dot por <img class="brand-logo">.
  if (brand) {
    // Trilha: "Meus painéis / [marca] Nome  Área". A volta pra lista mora aqui, não num botão.
    brand.innerHTML = trilhaHtml() + brandInnerHtml(config.name || 'Dashboard', config.logo, config.logoFundo);
    const area = areaDoPainel(config && config.domain);
    if (area) {
      const etiqueta = document.createElement('span');
      etiqueta.className = 'trilha-area';
      etiqueta.textContent = area;
      brand.append(etiqueta);
    }
  }
  const bar = document.querySelector('.topbar');
  const actions = document.querySelector('.topbar .actions');
  if (actions) {
    // O botão de tema entra no mesmo grupo das utilidades (guarda antes de reescrever o grupo).
    const tema = bar && bar.querySelector('.theme-toggle');
    // Grupo (abas) nao tem fluxo de reconfigurar no wizard ainda.
    // Cada aba individual continua reconfiguravel abrindo o dashboard-filho direto.
    actions.innerHTML = acoesHtml({ id, grupo: !!(config && config.kind === 'group') });
    if (tema) actions.prepend(tema);
    ligarCopiarLink(actions, location.href);
  }
}

// Aplica a cor de destaque da config no :root (calibrada pro tema atual). Extraida
// pra ser reusada pelo dashboard normal e pelo grupo (que usa o accent do grupo).
function applyAccent(config) {
  const accent = (config && config.accent) || DEFAULT_ACCENT;
  const root = document.documentElement;
  const isDark = root.dataset.theme !== 'light';
  // accent2 opcional tinge o fundo suave (area do grafico, soft dos badges) e a segunda mancha
  // do fundo vivo. aplicarMarca = cores calibradas de sempre + fundo na cor da marca.
  aplicarMarca(root, accent, isDark, (config && config.accent2) || '');
  // O dono pode deixar o fundo parado (config.fundoAnimado: false). Ausente = com movimento.
  moverFundo(!(config && config.fundoAnimado === false));
}

// Resolve template + busca dados de UM dashboard e renderiza dentro de `container`.
// Reusado pelo dashboard normal (container = #app) e por cada aba de um grupo
// (container = #tabpanel, com showHeader:false). Devolve true no sucesso.
async function loadDashboardInto(container, config, id, opts = {}) {
  // Titulo da aba do navegador reflete o dashboard (ou a aba ativa de um grupo).
  // O preview de LINK ja vem do servidor (middleware); isto e so a aba aberta.
  if (config && config.name) document.title = config.name;
  // Personalização (número em destaque, números escondidos) e nomes trocados vêm da config
  // DESTE dashboard. Mesma resolução da prévia do assistente (templateDoPainel).
  const template = templateDoPainel(config);
  if (!template) {
    showError(container, `Domínio desconhecido: ${config.domain}.`, {
      href: `/config.html?id=${encodeURIComponent(id)}`, label: 'Reconfigurar',
    });
    return false;
  }

  // Esqueleto no formato DESTE painel (abas, quantos indicadores, cartões da aba que vai abrir):
  // cada bloco ocupa o lugar que o conteúdo vai ocupar, então nada pula quando ele entra.
  const comFaixa = opts.showHeader !== false;
  container.innerHTML = esqueletoHtml({ ...planoDoEsqueleto(template, abaDoHash(location.hash), config.colMap), comFaixa });

  // Modo historico: le o snapshot mais recente do D1. Ao vivo: busca a fonte na hora.
  const buscar = () => (config.storage === 'd1' ? fetchD1(id) : fetchDataForSource(config.source, id));
  let dataset;
  try {
    dataset = await buscar();
    if (!dataset || !Array.isArray(dataset.rows)) throw new Error('A fonte não devolveu dados válidos.');
  } catch (err) {
    mostrarFalha(container, {
      err,
      contexto: 'dados',
      acao: { href: `/config.html?id=${encodeURIComponent(id)}`, label: 'Reconfigurar' },
      tentar: () => { comecarProgresso(); loadDashboardInto(container, config, id, opts); },
    });
    return false;
  }

  const colMap = config.colMap || {};
  const baseCtx = { config, template, dataset, colMap };
  // Com saudação na tela, o painel é desenhado no instante em que a cortina começa a descer e
  // as peças dele entram em sequência com ela. Sem saudação, entra agora.
  const desenhar = (comCortina) => {
    if (!container.isConnected) return;
    // Com a capa da lista acesa, as peças do painel entram quando ela começa a subir.
    const comCapa = document.documentElement.hasAttribute('data-cobertura');
    renderDashboard(container, baseCtx, {
      ...opts, modo: 'abertura', atrasoDaAbertura: comCortina ? TEMPOS.entradaBase : (comCapa ? 200 : 0), aoAtualizar: buscar,
    });
    terminarProgresso();
    levantarCapa();
  };
  if (abertura) abertura.quandoRevelar(desenhar); else desenhar(false);
  return true;
}

// Renderiza um GRUPO: titulo do grupo + barra de abas + painel. Cada aba carrega
// um dashboard-filho (por id) no painel, sem recarregar a pagina. As configs dos
// filhos sao buscadas sob demanda e cacheadas. A aba ativa reflete/atualiza ?tab=.
async function initGroup(app, group, groupId) {
  renderTopbar(group, groupId);

  const tabs = (group.tabs || []).filter((t) => t && t.id);
  if (!tabs.length) {
    showError(app, 'Este grupo não tem abas configuradas.', { href: '/', label: 'Ver meus dashboards' });
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

    panel.innerHTML = esqueletoHtml({ comFaixa: false, abas: [] });
    comecarProgresso();
    let cfg = cache[childId];
    if (!cfg) {
      try {
        cfg = await getDashboard(childId);
        cache[childId] = cfg;
      } catch (err) {
        const abrirDireto = { href: `/dashboard.html?id=${encodeURIComponent(childId)}`, label: 'Abrir direto' };
        if (err && err.needsPassword) {
          showError(panel, 'Esta aba é um dashboard protegido por senha e não pode ser embutida no grupo.', abrirDireto);
          return;
        }
        mostrarFalha(panel, { err, contexto: 'painel', acao: abrirDireto, tentar: () => activate(childId) });
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

// A saudação de abertura é da página, não de uma tentativa de carregar: prepara uma vez.
let abertura = null;

// Refaz a carga inteira (depois de uma falha ou de digitar a senha), com o esqueleto de volta.
function recomecar(app) {
  app.innerHTML = esqueletoHtml();
  comecarProgresso();
  init();
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
  // Se o servidor já mandou a saudação no HTML, ela está na tela desde o primeiro quadro: acerta
  // o relógio dela antes de qualquer espera de rede.
  if (!abertura) abertura = prepararAbertura(id);

  prepararCapa();
  // 1. Config
  let config;
  try {
    config = await getDashboard(id);
  } catch (err) {
    if (err && err.needsPassword) {
      terminarProgresso();
      renderPasswordPrompt(app, id);
      return;
    }
    mostrarFalha(app, { err, contexto: 'painel', acao: { href: '/', label: 'Ver meus dashboards' }, tentar: () => recomecar(app) });
    return;
  }
  if (!config || !config.id) {
    showError(app, 'Dashboard não encontrado.', { href: '/', label: 'Ver meus dashboards' });
    return;
  }

  // Presença do painel: o modo que o dono escolheu (se o servidor não tinha marcado, vale a
  // partir daqui), a cor da marca com o fundo vivo e, quando cabe, a saudação.
  sincronizarModoDoPainel(config.tema);
  applyAccent(config);
  abertura.comConfig(config);

  // Grupo (dashboard com abas): fluxo proprio, agrega varios dashboards num link.
  if (config.kind === 'group' && Array.isArray(config.tabs)) {
    await initGroup(app, config, id);
    return;
  }

  // Dashboard comum: topbar + carrega e renderiza no #app.
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
