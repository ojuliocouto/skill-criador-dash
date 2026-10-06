// Monta a config do painel a partir das escolhas do assistente. ESM, puro.
// A prévia ao vivo e o salvar usam a MESMA função: o que a pessoa vê é o que vai ser gravado.
// A senha fica de fora de propósito (não muda o desenho e nunca passa pela prévia).

import { getSource } from '../sources/index.js';
import { parseNumberBR } from './format.js';
import { rotulosParaSalvar } from './rotulos.js';
import { fundoValido } from './logo.js';
import { temaDoModo } from './tema-inicial.js';
import { limparSaudacao, saudacaoValida } from './saudacao.js';

/**
 * Número em destaque e números escondidos. Devolve só o que difere do padrão do modelo e
 * ignora chave que não existe no template.
 * @returns {{heroMetric?:string, hiddenMetrics?:string[]}}
 */
export function montarPersonalizacao(tpl, heroi, ocultas) {
  const chaves = new Set(((tpl && tpl.metrics) || []).map((m) => m.key));
  const out = {};
  if (heroi && chaves.has(heroi) && heroi !== (tpl && tpl.primaryMetric)) out.heroMetric = heroi;
  const lista = (Array.isArray(ocultas) ? ocultas : []).filter((k) => chaves.has(k) && k !== (heroi || (tpl && tpl.primaryMetric)));
  if (lista.length) out.hiddenMetrics = [...new Set(lista)];
  return out;
}

function lerMeta(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseNumberBR(String(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * @param {object} estado  estado do assistente (name, domain, source, colMap, accent, accent2,
 *   logo, logoFundo, heroMetric, hiddenMetrics, goal, labels, storage, id, tema, saudacao,
 *   saudacaoLigada, fundoAnimado)
 * @param {object} tpl     template do domínio
 * @returns {object} config pronta pro POST /api/dashboards (sem auth)
 */
export function montarConfig(estado, tpl) {
  const e = estado || {};
  const config = {
    name: String(e.name == null ? '' : e.name).trim(),
    domain: e.domain,
    source: e.source,
    colMap: e.colMap,
    accent: e.accent,
  };
  // Editando um painel existente: o id volta junto, senão o servidor cria outro e o original
  // fica órfão e público.
  if (e.id) config.id = e.id;
  const logo = typeof e.logo === 'string' ? e.logo.trim() : '';
  if (logo) {
    config.logo = logo;
    if (fundoValido(e.logoFundo)) config.logoFundo = e.logoFundo;
  }
  if (e.accent2) config.accent2 = e.accent2;

  // Presença do painel. Só entra o que a pessoa mudou em relação ao padrão: modo automático,
  // saudação ligada e fundo com movimento são o padrão e não vão pra config.
  if (temaDoModo(e.tema)) config.tema = e.tema;
  const saudacao = limparSaudacao(e.saudacao);
  if (saudacao && saudacaoValida(saudacao)) config.saudacao = saudacao;
  if (e.saudacaoLigada === false) config.saudacaoLigada = false;
  if (e.fundoAnimado === false) config.fundoAnimado = false;

  Object.assign(config, montarPersonalizacao(tpl, e.heroMetric, e.hiddenMetrics));

  const destaque = config.heroMetric || (tpl && tpl.primaryMetric);
  const meta = lerMeta(e.goal);
  if (destaque && meta) config.goal = { metricKey: destaque, value: meta };

  const labels = rotulosParaSalvar(tpl, e.labels);
  if (Object.keys(labels).length) config.labels = labels;

  const fonte = getSource(e.source && e.source.type);
  if (e.storage === 'd1' && fonte && fonte.canHistory) config.storage = 'd1';
  return config;
}
