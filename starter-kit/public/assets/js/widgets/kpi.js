// Widget KPI: card com label, valor formatado, hint opcional e tendencia opcional.
// Funcao de render pura -> retorna string HTML.

import { esc, fmtBy } from './_util.js';

/**
 * @param {{label:string, format?:string, hint?:string, trend?:{text:string, good?:boolean}, goal?:{pct:number, text:string}, unmapped?:boolean}} props
 * @param {number} value
 * @returns {string} HTML
 */
export function render(props = {}, value) {
  const { label = '', format = 'number', hint, trend, goal, unmapped = false } = props;
  // unmapped: a metrica depende de um slot SEM coluna mapeada (ex: export sem
  // "Leads" faz CPL depender de leads). O valor calculado nessa hora e sempre 0
  // pelo fallback de agregacao, mas 0 e um numero: mostrar "R$ 0,00" tem cara de
  // dado real quando na verdade e ausencia de dado. Em vez disso, mostra um
  // traco (hifen) e explica o motivo no hint (ignorando trend/goal, que tambem
  // seriam calculados sobre esse mesmo zero falso).
  const valor = unmapped ? '-' : fmtBy(format, value);
  const hintText = unmapped ? 'Coluna não mapeada' : hint;
  const hintHtml = hintText
    ? `<div class="kpi__hint">${esc(hintText)}</div>`
    : '';
  const trendHtml = !unmapped && trend && trend.text
    ? `<div class="kpi__trend ${trend.good ? 'is-good' : 'is-bad'}">` +
        `${esc(trend.text)}` +
        `<span class="kpi__trend-cap"> vs. início</span>` +
      `</div>`
    : '';
  let goalHtml = '';
  if (!unmapped && goal && Number.isFinite(goal.pct)) {
    const w = Math.max(0, Math.min(100, goal.pct * 100));
    const done = goal.pct >= 1 ? ' is-done' : '';
    goalHtml =
      `<div class="kpi__goal">` +
        `<div class="kpi__goal-track"><div class="kpi__goal-fill${done}" style="width:${w.toFixed(1)}%"></div></div>` +
        `<div class="kpi__goal-text">${esc(goal.text)}</div>` +
      `</div>`;
  }
  return (
    `<div class="kpi${unmapped ? ' is-unmapped' : ''}">` +
      `<div class="kpi__label">${esc(label)}</div>` +
      `<div class="kpi__value">${esc(valor)}</div>` +
      goalHtml +
      trendHtml +
      hintHtml +
    `</div>`
  );
}
