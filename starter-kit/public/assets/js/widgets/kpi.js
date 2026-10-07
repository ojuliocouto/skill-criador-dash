// Widget KPI: card com label, valor formatado, hint opcional e tendencia opcional.
// Funcao de render pura -> retorna string HTML.

import { esc, fmtBy } from './_util.js';

/**
 * @param {{label:string, format?:string, hint?:string, trend?:{text:string, good?:boolean}, goal?:{pct:number, text:string}, unmapped?:boolean, hero?:boolean, spark?:number[]}} props
 * @param {number} value
 * @returns {string} HTML
 */
// Sparkline do KPI heroi: SVG inline, sem dependencia e sem eixo. Nao e um grafico, e uma
// pista de direcao ao lado do numero, que e o que Linear/Vercel/Stripe fazem no card principal.
//
// Recusa desenhar o que enganaria:
//   - menos de 2 pontos validos: uma "linha" de 1 ponto sugere tendencia que nao existe;
//   - valor nao numerico: vira NaN no atributo points e o SVG some ou desenha torto.
// Serie achatada (todos iguais) e legitima: desenha reta no meio, sem dividir por zero.
function sparkSvg(serie) {
  const pontos = (Array.isArray(serie) ? serie : [])
    .map(Number)
    .filter((n) => Number.isFinite(n));
  if (pontos.length < 2) return '';
  const min = Math.min(...pontos);
  const max = Math.max(...pontos);
  const amp = max - min;
  const L = 100;
  const A = 26;
  const passo = L / (pontos.length - 1);
  const coords = pontos.map((v, i) => {
    const x = i * passo;
    // amp 0 (serie achatada) manda a linha pro meio em vez de dividir por zero.
    const y = amp === 0 ? A / 2 : A - ((v - min) / amp) * A;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    `<svg class="kpi__spark" viewBox="0 0 ${L} ${A}" preserveAspectRatio="none" aria-hidden="true" focusable="false">` +
      `<polyline points="${coords}" fill="none" vector-effect="non-scaling-stroke" />` +
    `</svg>`
  );
}

export function render(props = {}, value) {
  const { label = '', format = 'number', hint, trend, goal, unmapped = false, hero = false, spark, heroCompacto = false } = props;
  // unmapped: a metrica depende de um slot SEM coluna mapeada (ex: export sem
  // "Leads" faz CPL depender de leads). O valor calculado nessa hora e sempre 0
  // pelo fallback de agregacao, mas 0 e um numero: mostrar "R$ 0,00" tem cara de
  // dado real quando na verdade e ausencia de dado. Em vez disso, mostra um
  // traco (hifen) e explica o motivo no hint (ignorando trend/goal, que tambem
  // seriam calculados sobre esse mesmo zero falso).
  // T4 (02/10/2026): o traço "-" passava por placeholder de carregamento e o gate de tela
  // aprovava o painel. Agora o card diz o que aconteceu e o que fazer.
  const valor = unmapped ? 'Não mapeada' : fmtBy(format, value);
  const hintText = unmapped ? 'Coluna não mapeada: mapeie a coluna ou oculte esta métrica' : hint;
  const hintHtml = hintText
    ? `<div class="kpi__hint">${esc(hintText)}</div>`
    : '';
  // neutral: variacao sem julgamento (metrica sem betterWhen). Nem verde nem vermelho.
  const trendClasse = trend && trend.neutral ? 'is-neutral' : (trend && trend.good ? 'is-good' : 'is-bad');
  const trendHtml = !unmapped && trend && trend.text
    ? `<div class="kpi__trend ${trendClasse}">` +
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
        `<div class="kpi__goal-text">${esc(goal.text)}${done ? `<span class="kpi__selo"><svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.4 6.3l2.4 2.4 4.8-5.2" /></svg>Meta batida</span>` : ''}</div>` +
      `</div>`;
  }
  // Sem coluna mapeada o valor e 0 por fallback: desenhar a serie disso mostraria um
  // grafico de dado que nao existe. Mesma regra que ja vale pra trend e goal.
  const sparkHtml = !unmapped && hero ? sparkSvg(spark) : '';
  // Contagem visual do indicador (dashboard.js): o texto final já sai aqui, pronto pra leitor de
  // tela e pra quem copia. O valor e o formato vão em atributos só pra animação saber até onde
  // contar. Indicador sem coluna não conta (seria animar um zero que não existe).
  const contaAttrs = !unmapped && Number.isFinite(Number(value))
    ? ` data-conta-valor="${esc(Number(value))}" data-conta-formato="${esc(format)}"`
    : '';
  return (
    `<div class="kpi${hero ? ' kpi--hero' : ''}${hero && heroCompacto ? ' kpi--hero-compacto' : ''}${unmapped ? ' is-unmapped' : ''}"${unmapped ? ' data-estado="nao-mapeada"' : ''}${contaAttrs}>` +
      `<div class="kpi__label">${esc(label)}</div>` +
      `<div class="kpi__value">${esc(valor)}</div>` +
      sparkHtml +
      goalHtml +
      trendHtml +
      hintHtml +
    `</div>`
  );
}
