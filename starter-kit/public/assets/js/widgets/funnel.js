// Widget funil: uma barra por etapa, com o valor sempre legível e a taxa de passagem entre etapas.
// Funcao de render pura -> retorna string HTML.
//
// 3.9 (auditoria de 25/10/2026): o funil de marketing começa em impressões, e na escala linear
// Cliques, Leads e Conversões viravam fiapos (1,43%, 0,26% e 0,008% da largura). Regra nova:
//   - etapas comparáveis (a menor tem pelo menos 5% da maior): escala linear, como antes;
//   - etapa muito menor que a primeira: escala logarítmica, DITA na tela, com barra mínima
//     legível. Os números escritos são sempre os reais.

import { esc, fmtBy } from './_util.js';
import { fmtPercent } from '../lib/format.js';

const LIMIAR_LINEAR = 0.05; // a menor etapa com valor tem pelo menos 5% da maior: linear
const MINIMA_LOG = 8;       // barra mínima (% da largura) na escala logarítmica

/**
 * Largura de cada barra (% da trilha) e se a escala é logarítmica.
 * Zero continua zero: não existe barra fantasma pra etapa sem nada.
 * @param {number[]} valores
 * @returns {{larguras:number[], log:boolean}}
 */
export function larguraDasEtapas(valores) {
  const vs = (Array.isArray(valores) ? valores : []).map((v) => Math.max(0, Number(v) || 0));
  const max = Math.max(0, ...vs);
  if (!(max > 0)) return { larguras: vs.map(() => 0), log: false };
  const menor = Math.min(...vs.filter((v) => v > 0));
  const log = menor / max < LIMIAR_LINEAR && max > 1;
  if (!log) return { larguras: vs.map((v) => round((v / max) * 100)), log: false };
  // log10(1) = 0 fica na barra mínima e log10(max) em 100%.
  const topo = Math.log10(max);
  const larguras = vs.map((v) => {
    if (!(v > 0)) return 0;
    return round(MINIMA_LOG + (100 - MINIMA_LOG) * (Math.log10(Math.max(1, v)) / topo));
  });
  return { larguras, log: true };
}

/**
 * @param {{title?:string}} props
 * @param {{label:string, value:number}[]} steps
 * @returns {string} HTML
 */
export function render(props = {}, steps) {
  const { title = '' } = props;
  const titleHtml = title ? `<div class="funnel__title">${esc(title)}</div>` : '';
  const list = Array.isArray(steps) ? steps : [];

  if (list.length === 0) {
    return `<div class="funnel">${titleHtml}<div class="funnel__empty">Nenhum dado neste período.</div></div>`;
  }

  const { larguras, log } = larguraDasEtapas(list.map((s) => s.value));

  const rows = list.map((s, i) => {
    const val = Number(s.value) || 0;
    const width = larguras[i];
    // Taxa de passagem da etapa anterior pra esta, numa linha própria entre as barras: é a
    // pergunta que o funil responde ("de cada 100 cliques, quantos viram lead?").
    let convHtml = '';
    if (i > 0) {
      const anterior = list[i - 1];
      const prev = Number(anterior.value) || 0;
      const texto = prev > 0 ? `${fmtPercent(val / prev)} de ${anterior.label} para ${s.label}` : `Sem ${anterior.label} no período`;
      convHtml = `<div class="funnel__conv">${esc(texto)}</div>`;
    }
    // Valor DENTRO da barra só quando ela é larga o bastante pro número caber legível (texto
    // claro sobre o preenchimento). Barra curta: valor FORA, à direita dela, em cor de texto.
    const inside = width >= 28;
    const valueHtml = inside
      ? `<span class="funnel__value">${esc(fmtBy('number', val))}</span>`
      : `<span class="funnel__value funnel__value--out" style="left:calc(${width}% + 8px)">${esc(fmtBy('number', val))}</span>`;
    return (
      convHtml +
      `<div class="funnel__step">` +
        `<div class="funnel__label" title="${esc(s.label)}">${esc(s.label)}</div>` +
        `<div class="funnel__bar-wrap">` +
          `<div class="funnel__bar" style="width:${width}%"></div>` +
          valueHtml +
        `</div>` +
      `</div>`
    );
  });

  const nota = log
    ? `<p class="funnel__nota">Barras em escala logarítmica: as etapas são muito menores que a primeira. Os números são os reais.</p>`
    : '';
  return `<div class="funnel${log ? ' funnel--log' : ''}">${titleHtml}${rows.join('')}${nota}</div>`;
}

function round(n) {
  return Math.round(n * 100) / 100;
}
