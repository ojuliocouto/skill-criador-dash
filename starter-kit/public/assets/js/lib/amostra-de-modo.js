// Amostra do painel num modo (claro ou escuro), pro assistente: a faixa com o nome e o logotipo
// da pessoa, as abas e os primeiros indicadores com os números DELA, na cor da marca. É uma
// miniatura de verdade (as mesmas funções que desenham o painel), não um desenho genérico.
// ESM. A parte pura monta o HTML; desenharAmostra aplica num elemento.

import { renderKpiBlock, templateDoPainel, planLayout, sparkForHero } from '../dashboard.js';
import { computeAllMapped } from './metrics.js';
import { cabecalhoHtml } from './cabecalho.js';
import { abasDoTemplate, layoutDaAba } from './abas.js';
import { aplicarMarca } from './marca.js';
import { DEFAULT_ACCENT } from './color.js';
import { esc } from './html.js';

// Largura em que a amostra é desenhada antes de ser reduzida (px).
export const LARGURA_DA_AMOSTRA = 620;
const INDICADORES = 3;
const ABAS = 4;

/**
 * HTML da amostra. Pura. Sem id nenhum (a prévia ao lado usa os ids do painel de verdade).
 * @param {object} config   a mesma config que vai ser gravada (montarConfig)
 * @param {object} dataset  { rows }
 * @param {object} [modelo] modelo do painel; sem ele, o do domínio da config (com as escolhas dela)
 * @returns {string} '' quando não dá pra desenhar (modelo desconhecido, sem dados)
 */
export function amostraDoPainelHtml(config, dataset, modelo) {
  const template = modelo || templateDoPainel(config);
  if (!template || !dataset || !Array.isArray(dataset.rows)) return '';
  const colMap = (config && config.colMap) || {};
  const { computed, mapped } = computeAllMapped(template.metrics, dataset.rows, colMap);
  const abas = abasDoTemplate(template).slice(0, ABAS);
  const faixa = planLayout(layoutDaAba(template, null)).find((b) => b.type === 'kpis');
  const itens = faixa ? faixa.items.slice(0, INDICADORES) : [];
  const indicadores = itens.length
    ? renderKpiBlock(itens, template, computed, mapped, {}, null, sparkForHero(template, dataset.rows, colMap))
    : '';
  const barra = abas.length
    ? `<div class="abas">${abas.map((t, i) => `<span class="aba" aria-selected="${i === 0 ? 'true' : 'false'}">${esc(t.label)}</span>`).join('')}</div>`
    : '';
  const cabecalho = cabecalhoHtml({ nome: config.name, dominio: template.label, logo: config.logo, logoFundo: config.logoFundo })
    .replace(/ id="[^"]*"/g, '')
    // A amostra é enfeite (aria-hidden): o título dela não pode virar mais um título da página.
    .replace('<h1 ', '<div ').replace('</h1>', '</div>');
  return `${cabecalho}${barra}${indicadores ? `<section class="section">${indicadores}</section>` : ''}`;
}

/**
 * Desenha a amostra em `el`, no modo pedido, com a cor da marca valendo só ali dentro.
 * @param {HTMLElement} el
 * @param {object} config
 * @param {object} dataset
 * @param {'claro'|'escuro'} modo
 */
export function desenharAmostra(el, config, dataset, modo) {
  if (!el) return;
  const escuro = modo !== 'claro';
  el.setAttribute('data-theme', escuro ? 'dark' : 'light');
  el.classList.add('escopo-de-cor');
  aplicarMarca(el, (config && config.accent) || DEFAULT_ACCENT, escuro, (config && config.accent2) || '');
  let escala = el.querySelector('.modo__escala');
  if (!escala) {
    escala = document.createElement('div');
    escala.className = 'modo__escala';
    escala.inert = true;
    el.appendChild(escala);
  }
  escala.innerHTML = amostraDoPainelHtml(config, dataset);
  escala.style.width = `${LARGURA_DA_AMOSTRA}px`;
  const fator = el.clientWidth > 0 ? el.clientWidth / LARGURA_DA_AMOSTRA : 0.28;
  escala.style.transform = `scale(${Math.round(fator * 1000) / 1000})`;
}
