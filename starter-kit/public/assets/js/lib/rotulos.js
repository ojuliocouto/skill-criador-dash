// Nomes trocados pela pessoa (config.labels): "Conversões" vira "Alunas novas". ESM, puro.
//
// config.labels é um mapa opcional { chave de campo ou de número -> rótulo }. Este módulo
// devolve uma CÓPIA do template com os rótulos trocados, e o painel inteiro lê dali: faixa de
// indicadores e tabela resumida (rótulo do número), tabela de dados e filtros (rótulo do
// campo), funil (etapa), calculadora de meta (campo e frase) e o título do bloco que cita o
// nome antigo. Sem labels, devolve o MESMO template: nada muda.
//
// O texto nunca vira HTML aqui: quem desenha escapa (esc). A forma é validada no servidor
// (functions/lib/labels-shape.mjs) com a mesma regra de rotuloValido.

export const LIMITE_DO_ROTULO = 40;
const CHAVE = /^[A-Za-z0-9_]{1,40}$/;
const CONTROLE = /[\u0000-\u001f\u007f]/;

/** Texto curto, sem sinal de tag e sem caractere de controle. */
export function rotuloValido(v) {
  return typeof v === 'string' && v.trim().length >= 1 && v.length <= LIMITE_DO_ROTULO
    && !/[<>]/.test(v) && !CONTROLE.test(v);
}

/** Só as entradas válidas, com o texto aparado. Qualquer outra coisa some. */
export function limparRotulos(labels) {
  const out = {};
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) return out;
  for (const [k, v] of Object.entries(labels)) {
    if (CHAVE.test(k) && rotuloValido(v)) out[k] = v.trim();
  }
  return out;
}

/** O que gravar: só nome válido que difere do padrão do modelo. */
export function rotulosParaSalvar(template, digitados) {
  const limpos = limparRotulos(digitados);
  const padrao = {};
  for (const m of ((template && template.metrics) || [])) if (m && m.key) padrao[m.key] = m.label;
  for (const s of ((template && template.slots) || [])) if (s && s.key) padrao[s.key] = s.label;
  const out = {};
  for (const [k, v] of Object.entries(limpos)) {
    if (k in padrao && v !== padrao[k]) out[k] = v;
  }
  return out;
}

const escaparRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const palavraInteira = (s) => new RegExp(`(?<![\\p{L}\\p{N}])${escaparRegex(s)}(?![\\p{L}\\p{N}])`, 'gu');
const comMinuscula = (s) => s.charAt(0).toLowerCase() + s.slice(1);
// "Origem" pode virar "origem" no meio da frase; sigla ("ROI") e nome todo em maiúscula não.
const podeMinuscula = (s) => s.length > 1 && s.charAt(1) === s.charAt(1).toLowerCase() && s.charAt(1) !== s.charAt(1).toUpperCase();

function trocarNoTexto(texto, pares) {
  let out = texto;
  for (const [antigo, novo] of pares) {
    if (!antigo || antigo === novo) continue;
    const exato = palavraInteira(antigo);
    if (exato.test(out)) { out = out.replace(palavraInteira(antigo), novo); continue; }
    const baixo = comMinuscula(antigo);
    if (baixo !== antigo && palavraInteira(baixo).test(out)) {
      out = out.replace(palavraInteira(baixo), podeMinuscula(novo) ? comMinuscula(novo) : novo);
    }
  }
  return out;
}

const chaveDe = (m) => (typeof m === 'string' ? m : (m && m.key));

// Chaves (de campo ou de número) que um bloco do layout usa.
function chavesDoBloco(item) {
  const p = (item && item.props) || {};
  const out = [p.valueSlot, p.dimensionSlot, p.dateSlot, p.groupBy, p.metricKey, p.targetKey, p.costKey, p.leadKey, p.revenueKey];
  for (const s of (Array.isArray(p.steps) ? p.steps : [])) out.push(s && s.metricKey, s && s.valueSlot);
  for (const m of (Array.isArray(p.metrics) ? p.metrics : [])) out.push(chaveDe(m));
  return out.filter(Boolean);
}

/**
 * @param {object} template  template do domínio (ou já personalizado). Não é alterado.
 * @param {object} labels    config.labels
 * @returns {object} template novo, ou o mesmo quando não há o que trocar
 */
export function aplicarRotulos(template, labels) {
  if (!template) return template;
  const limpos = limparRotulos(labels);
  const slots = Array.isArray(template.slots) ? template.slots : [];
  const metrics = Array.isArray(template.metrics) ? template.metrics : [];
  const ehCampo = new Set(slots.map((s) => s && s.key));
  const ehNumero = new Set(metrics.map((m) => m && m.key));
  const aplicados = {};
  for (const [k, v] of Object.entries(limpos)) if (ehCampo.has(k) || ehNumero.has(k)) aplicados[k] = v;
  if (!Object.keys(aplicados).length) return template;

  // Pares [nome antigo, nome novo] por chave, pra etapa de funil e título de bloco.
  const trocas = new Map();
  const anotar = (chave, antigo, novo) => {
    if (antigo === novo) return;
    if (!trocas.has(chave)) trocas.set(chave, []);
    trocas.get(chave).push([antigo, novo]);
  };

  const novosSlots = slots.map((s) => {
    if (!s || !(s.key in aplicados) || !ehCampo.has(s.key)) return s;
    anotar(s.key, s.label, aplicados[s.key]);
    return { ...s, label: aplicados[s.key] };
  });
  const novasMetricas = metrics.map((m) => {
    if (!m) return m;
    // A chave do próprio número vence. Sem ela, o número que SOMA (ou tira média de) uma coluna
    // herda o nome trocado do campo; contagem de linhas é outra coisa e fica como está.
    let novo = null;
    if (m.key in aplicados) novo = aplicados[m.key];
    else if ((m.agg === 'sum' || m.agg === 'avg') && m.column in aplicados && ehCampo.has(m.column)) novo = aplicados[m.column];
    if (novo == null || novo === m.label) return m;
    anotar(m.key, m.label, novo);
    return { ...m, label: novo };
  });
  const rotuloDoNumero = (key) => { const d = novasMetricas.find((m) => m && m.key === key); return d ? d.label : null; };
  const mudou = (key) => trocas.has(key);

  const reescrever = (layout) => (Array.isArray(layout) ? layout : []).map((item) => {
    if (!item || !item.props) return item;
    const usadas = chavesDoBloco(item).filter(mudou);
    if (!usadas.length) return item;
    const pares = usadas.flatMap((k) => trocas.get(k));
    const props = { ...item.props };
    if (typeof props.title === 'string') props.title = trocarNoTexto(props.title, pares);
    if (item.widget === 'funnel' && Array.isArray(props.steps)) {
      props.steps = props.steps.map((s) => {
        const k = s && (s.metricKey || s.valueSlot);
        if (!k || !mudou(k) || typeof s.label !== 'string') return s;
        return { ...s, label: trocarNoTexto(s.label, trocas.get(k)) };
      });
    }
    if (item.widget === 'meta') {
      // Com nome trocado a frase pronta ("por conversão", "Leads necessários") deixaria de
      // concordar. A calculadora passa a escrever em forma neutra com os nomes atuais.
      const nome = (k) => (k ? rotuloDoNumero(k) : null);
      props.nomes = { alvo: nome(props.targetKey), custo: nome(props.costKey), leads: nome(props.leadKey), receita: nome(props.revenueKey) };
      if (mudou(props.targetKey)) props.label = `Meta de ${props.nomes.alvo} no período`;
      props.labels = {
        ...(props.labels || {}),
        ...(mudou(props.costKey) ? { cost: `Quanto precisa de ${props.nomes.custo}` } : {}),
        ...(mudou(props.leadKey) ? { leads: `Quanto precisa de ${props.nomes.leads}` } : {}),
        ...(mudou(props.revenueKey) ? { revenue: `Quanto deve entrar de ${props.nomes.receita}` } : {}),
      };
    }
    return { ...item, props };
  });

  const out = { ...template, slots: novosSlots, metrics: novasMetricas, layout: reescrever(template.layout), rotulosTrocados: aplicados };
  if (Array.isArray(template.tabs)) {
    out.tabs = template.tabs.map((t) => (t && Array.isArray(t.layout) ? { ...t, layout: reescrever(t.layout) } : t));
  }
  return out;
}
