// Agregação do widget `resumo`: tabela por dimensão ou por período, com linha de TOTAL. ESM, puro.
//
// REGRA QUE NÃO PODE ERRAR: as métricas de cada linha saem do MESMO motor do resto do painel
// (computeAllMapped de lib/metrics.js) rodando em cima das linhas daquele grupo, e o TOTAL em
// cima de TODAS as linhas filtradas. Nada aqui soma nem tira média de taxa: CPL, CPA, CTR e
// ROAS de total são recalculados, e por isso batem com a faixa de indicadores.

import { computeAllMapped } from './metrics.js';
import { ehPeriodo, agruparPorPeriodo, rotuloDaDimensaoDePeriodo } from './periodo.js';

const LIMITE_PADRAO = 60;
// Folga da comparação com o total: diferença menor que 1% não ganha cor (seria ruído pintado).
const FOLGA = 0.01;

/**
 * Métrica de TAXA: o valor de um grupo é comparável com o do total (CPA do canal x CPA geral).
 * Métrica de volume não é: o investimento de um canal é sempre menor que o total.
 * Vale pra ratio, avg e pra derivada que declara `denominator` (ex: ROAS).
 */
export function ehMetricaDeTaxa(def) {
  if (!def) return false;
  return def.agg === 'ratio' || def.agg === 'avg' || typeof def.denominator === 'string';
}

// Chave da métrica cujo zero torna a taxa inexistente (CPA sem conversão não é R$ 0,00).
function denominadorDe(def) {
  if (!def) return null;
  if (def.agg === 'ratio' && Array.isArray(def.ratioOf)) return def.ratioOf[1];
  if (typeof def.denominator === 'string') return def.denominator;
  return null;
}

function normalizarMetricas(metrics, template) {
  const defs = (template && template.metrics) || [];
  const out = [];
  for (const m of (Array.isArray(metrics) ? metrics : [])) {
    const key = typeof m === 'string' ? m : (m && m.key);
    const def = defs.find((d) => d.key === key);
    if (!def) continue;
    out.push({ def, label: (m && typeof m === 'object' && m.label) || def.label || key });
  }
  return out;
}

function slotLabel(template, slot) {
  const s = ((template && template.slots) || []).find((x) => x.key === slot);
  return (s && s.label) || slot;
}

// Separa as linhas por valor de um slot de dimensão. Linha com a dimensão vazia não some: vai
// pro grupo "Não informado", senão a soma das linhas deixaria de fechar com o total.
function agruparPorDimensao(rows, col) {
  const mapa = new Map();
  const vazias = [];
  for (const row of rows) {
    const bruto = row == null ? '' : row[col];
    const chave = bruto == null ? '' : String(bruto).trim();
    if (!chave) { vazias.push(row); continue; }
    if (!mapa.has(chave)) mapa.set(chave, { key: chave, label: chave, rows: [] });
    mapa.get(chave).rows.push(row);
  }
  return { grupos: [...mapa.values()], vazias };
}

function valoresDoGrupo(colunas, defsDoTemplate, rows, colMap) {
  const { computed } = computeAllMapped(defsDoTemplate, rows, colMap);
  const valores = {};
  for (const c of colunas) {
    const den = denominadorDe(c.def);
    const semDenominador = den != null && !(Number(computed[den]) > 0);
    const v = computed[c.key];
    valores[c.key] = semDenominador || !Number.isFinite(v) ? null : v;
  }
  return valores;
}

function tonsDaLinha(colunas, valores, total) {
  const tons = {};
  for (const c of colunas) {
    if (!c.compara) continue;
    const v = valores[c.key];
    const t = total[c.key];
    if (v == null || t == null || t === 0) continue;
    const delta = (v - t) / Math.abs(t);
    if (Math.abs(delta) < FOLGA) continue;
    const maior = v > t;
    tons[c.key] = (c.betterWhen === 'higher' ? maior : !maior) ? 'bom' : 'ruim';
  }
  return tons;
}

/**
 * Monta os dados da tabela resumida.
 * @param {object} p
 * @param {Object[]} p.rows       linhas JÁ filtradas
 * @param {Object} p.colMap       slot -> coluna real
 * @param {object} p.template     template do domínio (metrics, slots, dateSlot)
 * @param {string} p.groupBy      slot de dimensão (ex: 'canal') OU 'dia' | 'semana' | 'mes'
 * @param {(string|{key:string,label?:string})[]} p.metrics  chaves de métrica do template
 * @param {number} [p.limit]      máximo de linhas mostradas (o total considera todas)
 * @param {string} [p.orderBy]    métrica que ordena as linhas de dimensão (não precisa ser coluna
 *                                da tabela). Sem ela, ordena pela primeira coluna.
 * @returns {{ok:false, motivo:string}|{ok:true, dimLabel:string, colunas:object[], ocultas:string[],
 *   linhas:{key:string,label:string,valores:object,tons:object}[], total:{label:string,valores:object},
 *   totalDeGrupos:number}}
 */
export function resumir({ rows, colMap, template, groupBy, metrics, limit, orderBy } = {}) {
  const lista = Array.isArray(rows) ? rows : [];
  if (!lista.length) return { ok: false, motivo: 'sem-linhas' };
  const pedidas = normalizarMetricas(metrics, template);
  if (!pedidas.length) return { ok: false, motivo: 'sem-metricas' };

  const porPeriodo = ehPeriodo(groupBy);
  const slotDoGrupo = porPeriodo ? ((template && template.dateSlot) || 'data') : groupBy;
  const col = colMap && colMap[slotDoGrupo];
  if (!col) return { ok: false, motivo: 'sem-agrupamento' };

  const defs = (template && template.metrics) || [];
  const geral = computeAllMapped(defs, lista, colMap);
  const colunas = [];
  const ocultas = [];
  for (const { def, label } of pedidas) {
    if (geral.mapped[def.key] === false) { ocultas.push(label); continue; }
    colunas.push({
      key: def.key, label, format: def.format || 'number', betterWhen: def.betterWhen,
      compara: ehMetricaDeTaxa(def) && !!def.betterWhen, def,
    });
  }
  if (!colunas.length) return { ok: false, motivo: 'sem-metricas' };

  let grupos;
  if (porPeriodo) {
    const r = agruparPorPeriodo(lista, colMap, slotDoGrupo, groupBy);
    grupos = r.grupos;
    if (!grupos.length) return { ok: false, motivo: 'sem-agrupamento' };
    if (r.semData.length) grupos.push({ key: '', label: 'Sem data', rows: r.semData });
  } else {
    const r = agruparPorDimensao(lista, col);
    grupos = r.grupos;
    if (!grupos.length) return { ok: false, motivo: 'sem-agrupamento' };
    if (r.vazias.length) grupos.push({ key: '', label: 'Não informado', rows: r.vazias });
  }

  // Métrica que ordena as linhas de dimensão: a pedida em orderBy (se existir e tiver coluna),
  // senão a primeira coluna da tabela. Serve pra manter os canais na MESMA ordem em todas as
  // abas (por investimento), mesmo numa tabela que só mostra taxas.
  const defDaOrdem = defs.find((d) => d.key === orderBy);
  const chaveDaOrdem = defDaOrdem && geral.mapped[orderBy] !== false ? orderBy : colunas[0].key;
  const colunasDeCalculo = colunas.some((c) => c.key === chaveDaOrdem)
    ? colunas
    : colunas.concat([{ key: chaveDaOrdem, def: defDaOrdem }]);

  const total = valoresDoGrupo(colunas, defs, lista, colMap);
  let linhas = grupos.map((g) => {
    const todos = valoresDoGrupo(colunasDeCalculo, defs, g.rows, colMap);
    const valores = {};
    for (const c of colunas) valores[c.key] = todos[c.key];
    return {
      key: g.key, label: g.label, valores, tons: tonsDaLinha(colunas, valores, total), ordem: todos[chaveDaOrdem],
    };
  });

  // Dimensão: do maior pro menor pela métrica da ordem, com o grupo sem nome sempre no fim.
  // Período já vem em ordem cronológica.
  if (!porPeriodo) {
    const peso = (l) => (l.ordem == null ? -Infinity : l.ordem);
    linhas.sort((a, b) => {
      if ((a.key === '') !== (b.key === '')) return a.key === '' ? 1 : -1;
      return peso(b) - peso(a);
    });
  }
  linhas = linhas.map(({ ordem, ...resto }) => resto);

  const totalDeGrupos = linhas.length;
  const max = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : LIMITE_PADRAO;
  if (linhas.length > max) linhas = linhas.slice(0, max);

  return {
    ok: true,
    dimLabel: porPeriodo ? rotuloDaDimensaoDePeriodo(groupBy) : slotLabel(template, groupBy),
    colunas: colunas.map(({ def, ...resto }) => resto),
    ocultas,
    linhas,
    total: { label: 'Total', valores: total },
    totalDeGrupos,
  };
}
