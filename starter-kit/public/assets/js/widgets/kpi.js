// Widget KPI: card com label, valor formatado, hint opcional e tendencia opcional.
// Funcao de render pura -> retorna string HTML.

import { esc, fmtBy } from './_util.js';

/**
 * @param {{label:string, format?:string, hint?:string, trend?:{text:string, good?:boolean, rotulo?:string, titulo?:string}, goal?:{pct:number, text:string}, unmapped?:boolean, hero?:boolean, spark?:number[], semDado?:string, taxa?:string}} props
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
  const { label = '', format = 'number', hint, trend: trendDado, goal: goalDado, unmapped = false, hero = false, spark: sparkDado, heroCompacto = false, mini = false, semDado, taxa } = props;
  // semDado (3.9, achado 4): a taxa não existe neste período porque o denominador é zero (CPA sem
  // venda, CPL sem lead, ROAS sem investimento). Antes o cartão mostrava R$ 0,00 enquanto a tabela
  // logo abaixo dizia "sem dado" para o mesmo CPA. Agora o cartão diz "sem dado", igual à tabela, e o
  // motivo vai na dica. Sem seta, meta, contagem nem minigráfico: todos seriam feitos desse zero falso.
  const vazio = !unmapped && !!semDado;
  const trend = vazio ? undefined : trendDado;
  const goal = vazio ? undefined : goalDado;
  const spark = vazio ? undefined : sparkDado;
  // unmapped: a metrica depende de um slot SEM coluna mapeada (ex: export sem
  // "Leads" faz CPL depender de leads). O valor calculado nessa hora e sempre 0
  // pelo fallback de agregacao, mas 0 e um numero: mostrar "R$ 0,00" tem cara de
  // dado real quando na verdade e ausencia de dado. Em vez disso, mostra um
  // traco (hifen) e explica o motivo no hint (ignorando trend/goal, que tambem
  // seriam calculados sobre esse mesmo zero falso).
  // T4 (02/10/2026): o traço "-" passava por placeholder de carregamento e o gate de tela
  // aprovava o painel. Agora o card diz o que aconteceu e o que fazer.
  const valor = unmapped ? 'Não mapeada' : (vazio ? 'sem dado' : fmtBy(format, value));
  const hintText = unmapped ? 'Coluna não mapeada: mapeie a coluna ou oculte esta métrica' : (vazio ? String(semDado) : hint);
  const hintHtml = hintText
    ? `<div class="kpi__hint">${esc(hintText)}</div>`
    : '';
  // neutral: variacao sem julgamento (metrica sem betterWhen). Nem verde nem vermelho.
  const trendClasse = trend && trend.neutral ? 'is-neutral' : (trend && trend.good ? 'is-good' : 'is-bad');
  // A seta diz com o que compara (3.9, achado 3): "vs. 7 dias anteriores", com as datas exatas na dica.
  // Quem chama sem rótulo (consumidor antigo) ganha o genérico, nunca o "vs. início" que mentia.
  const trendCap = (trend && trend.rotulo) || 'vs. período anterior';
  const trendTitulo = trend && trend.titulo ? ` title="${esc(trend.titulo)}"` : '';
  const trendHtml = !unmapped && trend && trend.text
    ? `<div class="kpi__trend ${trendClasse}"${trendTitulo}>` +
        `${esc(trend.text)}` +
        `<span class="kpi__trend-cap"> ${esc(trendCap)}</span>` +
      `</div>`
    : '';
  let goalHtml = '';
  if (!unmapped && goal && Number.isFinite(goal.pct)) {
    const w = Math.max(0, Math.min(100, goal.pct * 100));
    // Comparação proporcional (justa === false) mostra o percentual, mas nunca o selo "Meta batida".
    const done = goal.pct >= 1 && goal.justa !== false ? ' is-done' : '';
    goalHtml =
      `<div class="kpi__goal">` +
        `<div class="kpi__goal-track"><div class="kpi__goal-fill${done}" style="width:${w.toFixed(1)}%"></div></div>` +
        `<div class="kpi__goal-text">${esc(goal.text)}${done ? `<span class="kpi__selo"><svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.4 6.3l2.4 2.4 4.8-5.2" /></svg>Meta batida</span>` : ''}</div>` +
      `</div>`;
  }
  // Sem coluna mapeada o valor e 0 por fallback: desenhar a serie disso mostraria um
  // grafico de dado que nao existe. Mesma regra que ja vale pra trend e goal.
  const sparkHtml = !unmapped && (hero || mini) ? sparkSvg(spark) : '';
  // Vizinho do destaque com série: minigráfico e variação lado a lado. Sem série não há o que desenhar: o cartão fica como era.
  const ehMini = mini && !hero && !!sparkHtml;
  // Contagem visual do indicador (dashboard.js): o texto final já sai aqui, pronto pra leitor de
  // tela e pra quem copia. O valor e o formato vão em atributos só pra animação saber até onde
  // contar. Indicador sem coluna não conta (seria animar um zero que não existe).
  const contaAttrs = !unmapped && !vazio && Number.isFinite(Number(value))
    ? ` data-conta-valor="${esc(Number(value))}" data-conta-formato="${esc(format)}"`
    : '';
  return (
    // data-taxa="custo": taxa em dinheiro (CPA, CPL, CPC, custo por resultado). A prova de tela reprova
    // R$ 0,00 nela: custo por X zerado é divisão por zero que escapou (scripts/prova-dash.js).
    `<div class="kpi${ehMini ? ' kpi--mini' : ''}${hero ? ' kpi--hero' : ''}${hero && heroCompacto ? ' kpi--hero-compacto' : ''}${unmapped ? ' is-unmapped' : ''}${vazio ? ' is-sem-dado' : ''}"${unmapped ? ' data-estado="nao-mapeada"' : ''}${vazio ? ' data-estado="sem-dado"' : ''}${taxa ? ` data-taxa="${esc(taxa)}"` : ''}${contaAttrs}>` +
      `<div class="kpi__label">${esc(label)}</div>` +
      `<div class="kpi__value">${esc(valor)}</div>` +
      (ehMini ? `<div class="kpi__linha">${sparkHtml}${trendHtml}</div>` : sparkHtml) +
      goalHtml +
      (ehMini ? '' : trendHtml) +
      hintHtml +
    `</div>`
  );
}
