// Widget KPI: card com label, valor formatado, hint opcional e tendencia opcional.
// Funcao de render pura -> retorna string HTML.

import { esc, fmtBy } from './_util.js';

/**
 * @param {{label:string, format?:string, hint?:string, trend?:{text:string, good?:boolean}, goal?:{pct:number, text:string}}} props
 * @param {number} value
 * @returns {string} HTML
 */
export function render(props = {}, value) {
  const { label = '', format = 'number', hint, trend, goal } = props;
  const valor = fmtBy(format, value);
  const hintHtml = hint
    ? `<div class="kpi__hint">${esc(hint)}</div>`
    : '';
  const trendHtml = trend && trend.text
    ? `<div class="kpi__trend ${trend.good ? 'is-good' : 'is-bad'}">` +
        `${esc(trend.text)}` +
        `<span class="kpi__trend-cap"> vs início do período</span>` +
      `</div>`
    : '';
  let goalHtml = '';
  if (goal && Number.isFinite(goal.pct)) {
    const w = Math.max(0, Math.min(100, goal.pct * 100));
    const done = goal.pct >= 1 ? ' is-done' : '';
    goalHtml =
      `<div class="kpi__goal">` +
        `<div class="kpi__goal-track"><div class="kpi__goal-fill${done}" style="width:${w.toFixed(1)}%"></div></div>` +
        `<div class="kpi__goal-text">${esc(goal.text)}</div>` +
      `</div>`;
  }
  return (
    `<div class="kpi">` +
      `<div class="kpi__label">${esc(label)}</div>` +
      `<div class="kpi__value">${esc(valor)}</div>` +
      goalHtml +
      trendHtml +
      hintHtml +
    `</div>`
  );
}
