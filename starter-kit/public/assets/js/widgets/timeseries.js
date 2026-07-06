// Widget de serie temporal: grafico de linha em SVG puro (sem libs).
// Funcao de render pura -> retorna string HTML.

import { esc } from './_util.js';

const W = 600;
const H = 200;
const PAD = 20;

/**
 * @param {{title?:string}} props
 * @param {{date:string, value:number}[]} points
 * @returns {string} HTML
 */
export function render(props = {}, points) {
  const { title = '' } = props;
  const titleHtml = title ? `<div class="chart__title">${esc(title)}</div>` : '';
  const list = Array.isArray(points) ? points : [];

  if (list.length === 0) {
    return (
      `<div class="chart chart--timeseries">` +
        titleHtml +
        `<div class="chart__empty">Sem dados</div>` +
      `</div>`
    );
  }

  const values = list.map((p) => Number(p.value) || 0);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; } // evita divisao por zero na escala

  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const n = list.length;

  const coords = list.map((p, i) => {
    const x = n === 1 ? W / 2 : PAD + (i / (n - 1)) * innerW;
    const v = Number(p.value) || 0;
    const y = PAD + innerH - ((v - min) / (max - min)) * innerH;
    return { x: round(x), y: round(y) };
  });

  let body;
  if (n === 1) {
    const c = coords[0];
    body = `<circle class="chart__point" cx="${c.x}" cy="${c.y}" r="4" vector-effect="non-scaling-size" />`;
  } else {
    const pts = coords.map((c) => `${c.x},${c.y}`).join(' ');
    const dots = coords
      .map((c) => `<circle class="chart__point" cx="${c.x}" cy="${c.y}" r="3" vector-effect="non-scaling-size" />`)
      .join('');
    body = `<polyline class="chart__line" fill="none" points="${pts}" />${dots}`;
  }

  // aria-label descritivo para leitores de tela (o SVG e role=img).
  const label = title ? `Grafico de linha: ${title}` : 'Grafico de linha';
  // preserveAspectRatio="none" distorcia os circles (viravam ovais) ao esticar o viewBox.
  // Usamos vector-effect="non-scaling-size" nos pontos abaixo pra manter os circulos redondos.
  return (
    `<div class="chart chart--timeseries">` +
      titleHtml +
      `<svg class="chart__svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">` +
        body +
      `</svg>` +
    `</div>`
  );
}

function round(n) {
  return Math.round(n * 100) / 100;
}
