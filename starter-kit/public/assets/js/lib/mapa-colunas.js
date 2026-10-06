// Passo "Confira as colunas" do assistente. ESM, puro.
//   - validateRequired: campos obrigatórios sem coluna (trava de avançar);
//   - placarDoMapa / textoDoPlacar: "Encontramos 8 de 8 colunas";
//   - exemplosDaColuna: 2 ou 3 valores da coluna, pra pessoa conferir com o olho;
//   - oQueSePerdeSem / fraseDoQueSePerde: o que o painel deixa de mostrar sem um dado. Sai do
//     MOTOR (isMetricMapped) e dos blocos do template, nunca de lista escrita à mão.

import { isMetricMapped } from './metrics.js';
import { abasDoTemplate } from './abas.js';
import { ehPeriodo } from './periodo.js';
import { listaEmFrase } from './area-resumo.js';

const escolhida = (v) => v != null && String(v).trim() !== '';

/**
 * Campos obrigatórios que não têm coluna escolhida.
 * @param {{key:string,label:string,required:boolean}[]} slots
 * @param {{ [chave:string]: string|null }} colMap
 * @returns {{key:string,label:string}[]}
 */
export function validateRequired(slots, colMap) {
  const map = colMap || {};
  return (slots || [])
    .filter((s) => s && s.required)
    .filter((s) => !escolhida(map[s.key]))
    .map((s) => ({ key: s.key, label: s.label }));
}

/**
 * Quantos campos do modelo têm coluna. Com `columns`, coluna escolhida que não existe no
 * arquivo não conta (ex: trocou a planilha e o nome antigo ficou).
 */
export function placarDoMapa(slots, colMap, columns) {
  const lista = (slots || []).filter(Boolean);
  const map = colMap || {};
  const existentes = Array.isArray(columns) ? new Set(columns) : null;
  const achou = (s) => escolhida(map[s.key]) && (!existentes || existentes.has(map[s.key]));
  const faltam = lista.filter((s) => !achou(s)).map((s) => ({ key: s.key, label: s.label, required: !!s.required }));
  return {
    total: lista.length,
    encontradas: lista.length - faltam.length,
    faltamObrigatorias: faltam.filter((s) => s.required).map(({ key, label }) => ({ key, label })),
    faltamOpcionais: faltam.filter((s) => !s.required).map(({ key, label }) => ({ key, label })),
  };
}

export function textoDoPlacar(placar) {
  const p = placar || { total: 0, encontradas: 0 };
  return `Encontramos ${p.encontradas} de ${p.total} ${p.total === 1 ? 'coluna' : 'colunas'}`;
}

const CORTE = 28;

/** Primeiros valores distintos e não vazios da coluna, cortados pra caber na linha. */
export function exemplosDaColuna(rows, coluna, n = 3) {
  if (!coluna || !Array.isArray(rows)) return [];
  const vistos = new Set();
  const out = [];
  for (const r of rows) {
    const cru = r == null ? null : r[coluna];
    const v = cru == null ? '' : String(cru).trim();
    if (!v || vistos.has(v)) continue;
    vistos.add(v);
    out.push(v.length > CORTE ? `${v.slice(0, CORTE - 3)}...` : v);
    if (out.length >= n) break;
  }
  return out;
}

// Layouts que a pessoa de fato vê: os das abas, quando o modelo tem abas; senão o layout único.
function layoutsVisiveis(template) {
  const abas = abasDoTemplate(template);
  if (abas.length) return abas.map((a) => a.layout);
  return [Array.isArray(template.layout) ? template.layout : []];
}

function blocoUsaOCampo(item, chave, campoDeData) {
  const p = (item && item.props) || {};
  if (p.dimensionSlot === chave || p.valueSlot === chave || p.dateSlot === chave) return true;
  if (item.widget === 'resumo' && p.groupBy) {
    return p.groupBy === chave || (ehPeriodo(p.groupBy) && campoDeData === chave);
  }
  return false;
}

/**
 * O que o painel deixa de mostrar se o campo `chave` ficar sem coluna.
 * @returns {{numeros:string[], blocos:string[], nota:string}}
 *   numeros: rótulo dos números que viram "Não mapeada" (pelo mesmo motor do painel);
 *   blocos:  título dos blocos que dependem direto da coluna;
 *   nota:    texto do próprio campo (slot.semColuna) quando a falta muda uma conta.
 */
export function oQueSePerdeSem(template, chave) {
  const t = template && typeof template === 'object' ? template : {};
  const slots = Array.isArray(t.slots) ? t.slots : [];
  const campo = slots.find((s) => s && s.key === chave);
  // Mapa de faz de conta: tudo com coluna, menos o campo em questão. O motor diz o que cai.
  const colMap = {};
  for (const s of slots) if (s && s.key !== chave) colMap[s.key] = s.key;
  const mapeada = {};
  const numeros = [];
  for (const def of (t.metrics || [])) {
    if (!def || !def.key) continue;
    mapeada[def.key] = isMetricMapped(def, colMap, [], mapeada);
    if (mapeada[def.key] === false) numeros.push(def.label || def.key);
  }
  const campoDeData = t.dateSlot || 'data';
  const blocos = [];
  for (const layout of layoutsVisiveis(t)) {
    for (const item of layout) {
      if (!item || item.widget === 'kpi' || !blocoUsaOCampo(item, chave, campoDeData)) continue;
      const titulo = item.props && item.props.title;
      if (titulo && !blocos.includes(titulo)) blocos.push(titulo);
    }
  }
  return { numeros, blocos, nota: (campo && typeof campo.semColuna === 'string') ? campo.semColuna : '' };
}

const MAX_NA_FRASE = 4;

/** Frase pronta pra tela. Campo desconhecido devolve ''. */
export function fraseDoQueSePerde(template, chave) {
  const campo = ((template && template.slots) || []).find((s) => s && s.key === chave);
  if (!campo) return '';
  const nome = campo.label || chave;
  const { numeros, blocos, nota } = oQueSePerdeSem(template, chave);
  const itens = [...numeros, ...blocos.filter((b) => !numeros.includes(b))];
  if (!itens.length) return nota || `O painel funciona sem ${nome}.`;
  const lista = itens.length <= MAX_NA_FRASE
    ? listaEmFrase(itens)
    : `${itens.slice(0, MAX_NA_FRASE - 1).join(', ')} e mais ${itens.length - (MAX_NA_FRASE - 1)}`;
  return `Sem ${nome} o painel não mostra: ${lista}.${nota ? ` ${nota}` : ''}`;
}
