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
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  // Escala "bonita": dominio + ticks em passos redondos (1/2/2.5/5 x 10^n), em vez
  // de min/meio/max cru (que gerava rotulo tipo "2.775,25" com casas decimais, cara
  // de numero gerado por maquina). O dominio arredondado ainda da folga pra linha.
  const { niceMin: min, niceMax: max, ticks: yTicksVals } = niceScale(dataMin, dataMax, 4);

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

  // Eixo Y: ticks redondos (de niceScale) com gridlines horizontais discretas.
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
    // Area preenchida sob a linha (do traço ate a base do plot): o grafico ganha
    // corpo em vez de uma linha fina flutuando num card vazio (tell de "meio pronto"
    // pego na auditoria). Fecha o poligono no rodape da area de plotagem.
    const baseline = round(plotY + plotH);
    const areaPts = `${coords[0].x},${baseline} ${pts} ${coords[coords.length - 1].x},${baseline}`;
    const dots = coords
      .map((c) => `<circle class="chart__point" cx="${c.x}" cy="${c.y}" r="3" />`)
      .join('');
    series = `<polygon class="chart__area" points="${areaPts}" />` +
      `<polyline class="chart__line" fill="none" points="${pts}" />${dots}`;
  }

  // aria-label descritivo para leitores de tela (o SVG e role=img).
  // Inclui titulo, numero de pontos e a faixa de valores pra dar contexto sem depender do visual.
  const pointsLabel = n === 1 ? '1 ponto' : `${n} pontos`;
  const rangeLabel = `de ${fmtNumber(dataMin)} a ${fmtNumber(dataMax)}`;
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

// Arredonda um intervalo pro "numero bonito" mais proximo (1/2/2.5/5 x 10^n).
// round=true escolhe o passo mais proximo; round=false arredonda pra cima o alcance.
function niceNum(range, round) {
  if (!(range > 0)) return 1;
  const exp = Math.floor(Math.log10(range));
  const f = range / Math.pow(10, exp);
  let nf;
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * Math.pow(10, exp);
}

// Escala de eixo com dominio e ticks redondos. Exportada pra testar a logica pura.
export function niceScale(dataMin, dataMax, maxTicks = 4) {
  let min = Number.isFinite(dataMin) ? dataMin : 0;
  let max = Number.isFinite(dataMax) ? dataMax : 1;
  if (min === max) { min -= 1; max += 1; }
  const step = niceNum(niceNum(max - min, false) / Math.max(1, maxTicks - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  // Passo em ponto flutuante pode acumular erro; arredonda cada tick pra multiplo do passo.
  const decimals = step < 1 ? Math.ceil(-Math.log10(step)) : 0;
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) {
    ticks.push(decimals ? Number(v.toFixed(decimals)) : Math.round(v));
  }
  return { niceMin, niceMax, ticks };
}
