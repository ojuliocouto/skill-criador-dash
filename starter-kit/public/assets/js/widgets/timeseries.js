// Widget de serie temporal: grafico de linha em SVG puro (sem libs).
// Funcao de render pura -> retorna string HTML.

import { esc } from './_util.js';
import { fmtNumber } from '../lib/format.js';

// viewBox com margem reservada: esquerda pros ticks do eixo Y, base pros rotulos de data.
const W = 600;
const H = 240;
const M = { top: 12, right: 14, bottom: 26, left: 48 };

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

  // area de plotagem (dentro das margens dos eixos).
  const plotX = M.left;
  const plotY = M.top;
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const n = list.length;

  const xAt = (i) => (n === 1 ? plotX + plotW / 2 : plotX + (i / (n - 1)) * plotW);
  const yAt = (v) => plotY + plotH - ((v - min) / (max - min)) * plotH;

  const coords = list.map((p, i) => ({
    x: round(xAt(i)),
    y: round(yAt(Number(p.value) || 0)),
  }));

  // Eixo Y: 3 ticks (min, meio, max) com gridlines horizontais discretas.
  const yTicksVals = [min, (min + max) / 2, max];
  const gridHtml = yTicksVals
    .map((v) => {
      const y = round(yAt(v));
      return (
        `<line class="chart__grid" x1="${round(plotX)}" y1="${y}" x2="${round(plotX + plotW)}" y2="${y}" />` +
        `<text class="chart__ytick" x="${round(plotX - 6)}" y="${round(y + 3)}" text-anchor="end">${esc(fmtNumber(v))}</text>`
      );
    })
    .join('');

  // Eixo X: rotulos de data no primeiro e no ultimo ponto (data curta DD/MM).
  const xLabelsHtml = renderXLabels(list, coords, plotY + plotH);

  let series;
  if (n === 1) {
    const c = coords[0];
    series = `<circle class="chart__point" cx="${c.x}" cy="${c.y}" r="4" />`;
  } else {
    const pts = coords.map((c) => `${c.x},${c.y}`).join(' ');
    const dots = coords
      .map((c) => `<circle class="chart__point" cx="${c.x}" cy="${c.y}" r="3" />`)
      .join('');
    series = `<polyline class="chart__line" fill="none" points="${pts}" />${dots}`;
  }

  // aria-label descritivo para leitores de tela (o SVG e role=img).
  // Inclui titulo, numero de pontos e a faixa de valores pra dar contexto sem depender do visual.
  const pointsLabel = n === 1 ? '1 ponto' : `${n} pontos`;
  const rangeLabel = `de ${fmtNumber(min)} a ${fmtNumber(max)}`;
  const label = title
    ? `Grafico de linha: ${title}, ${pointsLabel}, ${rangeLabel}`
    : `Grafico de linha, ${pointsLabel}, ${rangeLabel}`;

  // Sem preserveAspectRatio="none": o SVG escala uniformemente (xMidYMid meet, padrao),
  // entao a curva mantem a inclinacao fiel e os pontos ficam redondos, nao ovais.
  return (
    `<div class="chart chart--timeseries">` +
      titleHtml +
      `<svg class="chart__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">` +
        gridHtml +
        series +
        xLabelsHtml +
      `</svg>` +
    `</div>`
  );
}

// Rotulos de data no eixo X: sempre o primeiro e o ultimo ponto (evita poluir com todos).
function renderXLabels(list, coords, baselineY) {
  const y = round(baselineY + 16);
  const single = list.length === 1;
  const idxs = single ? [0] : [0, list.length - 1];
  return idxs
    .map((i) => {
      const anchor = single ? 'middle' : (i === 0 ? 'start' : 'end');
      const label = shortDate(list[i].date);
      if (!label) return '';
      return `<text class="chart__xtick" x="${coords[i].x}" y="${y}" text-anchor="${anchor}">${esc(label)}</text>`;
    })
    .join('');
}

// Data curta DD/MM a partir de ISO (AAAA-MM-DD) ou de outros formatos com dia/mes.
function shortDate(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // ISO
  if (m) return `${m[3]}/${m[2]}`;
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})/); // DD/MM na frente
  if (m) return `${String(m[1]).padStart(2, '0')}/${String(m[2]).padStart(2, '0')}`;
  return s; // ultimo recurso: mostra como veio
}

function round(n) {
  return Math.round(n * 100) / 100;
}
