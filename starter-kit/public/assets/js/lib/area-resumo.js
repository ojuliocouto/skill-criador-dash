// O que cada área mostra no painel e o que a planilha precisa ter. ESM, puro.
//
// Passo 1 do assistente: a lista do cartão de cada área sai do TEMPLATE (números da faixa,
// abas ou blocos reais). Texto escrito à mão desatualiza no dia em que alguém mexe no modelo.
// Passo 2: as colunas esperadas saem dos campos do template e o modelo pra baixar é o CSV de
// exemplo daquela área (examples/, com cópia servida em public/modelos/).

import { DOMAINS } from '../domains.mjs';
import { abasDoTemplate } from './abas.js';

// Nome de um bloco que o template não batizou: o tipo dele, em palavra comum.
const NOME_DO_TIPO = {
  timeseries: 'Evolução no tempo',
  funnel: 'Funil',
  ranking: 'Ranking',
  table: 'Dados linha a linha',
  resumo: 'Tabela resumida',
  meta: 'Calculadora de meta',
};

/** 'A', 'A e B', 'A, B e C'. */
export function listaEmFrase(itens) {
  const l = (Array.isArray(itens) ? itens : []).filter(Boolean);
  if (l.length <= 1) return l.join('');
  return `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`;
}

function semRepetir(lista) {
  return [...new Set(lista.filter(Boolean))];
}

/**
 * @param {object} template
 * @returns {{numeros:string[], abas:string[], blocos:string[]}} números da primeira faixa de
 *   indicadores; nome das abas (modelo com abas) ou título dos blocos (modelo sem abas)
 */
export function resumoDaArea(template) {
  const t = template && typeof template === 'object' ? template : {};
  const abas = abasDoTemplate(t);
  const layout = abas.length ? abas[0].layout : (Array.isArray(t.layout) ? t.layout : []);
  const rotuloDe = (key) => {
    const def = (t.metrics || []).find((m) => m && m.key === key);
    return def ? (def.label || key) : null;
  };
  const numeros = semRepetir(layout.filter((i) => i && i.widget === 'kpi').map((i) => rotuloDe(i.props && i.props.metricKey)));
  const blocos = abas.length ? [] : semRepetir(layout
    .filter((i) => i && i.widget && i.widget !== 'kpi')
    .map((i) => (i.props && i.props.title) || NOME_DO_TIPO[i.widget] || null));
  return { numeros, abas: abas.map((a) => a.label), blocos };
}

/** Colunas que a planilha precisa ter (obrigatórias) e as que melhoram o painel (opcionais). */
export function colunasEsperadas(template) {
  const slots = (template && Array.isArray(template.slots)) ? template.slots : [];
  const enxuto = (s) => ({ key: s.key, label: s.label || s.key });
  return {
    obrigatorias: slots.filter((s) => s && s.required).map(enxuto),
    opcionais: slots.filter((s) => s && !s.required).map(enxuto),
  };
}

/** 'vendas' -> 'vendas-exemplo.csv'; área desconhecida -> null. */
export function nomeDoArquivoModelo(area) {
  return DOMAINS.includes(area) ? `${area}-exemplo.csv` : null;
}

/** Endereço do CSV modelo da área (servido de public/modelos/), ou null. */
export function caminhoDoModelo(area) {
  const nome = nomeDoArquivoModelo(area);
  return nome ? `/modelos/${nome}` : null;
}
