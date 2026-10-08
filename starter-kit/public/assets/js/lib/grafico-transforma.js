// Efeito 2, "gráfico que se transforma": ao trocar período ou filtro, a linha do gráfico vai do
// desenho antigo ao novo (os pontos se interpolam) e as barras de ranking, funil e meta crescem
// ou encolhem do valor antigo ao novo. Antes, tudo trocava seco. ESM.
//
// As barras animam SÓ por transform (scaleX a partir da esquerda). A linha é geometria SVG, o
// único jeito de interpolar pontos: anima o atributo `points` por quadro, em poucos pontos, e no
// fim devolve o desenho exato que o render já tinha. O estado final é sempre o do render.

import { suavizar, menosMovimento, CURVA } from './movimento.js';

/** Quanto dura a transição dos dados (ms). Espelha --dur-dados do efeitos.css. */
export const DURACAO_DOS_DADOS = 640;
const TETO_DA_ESCALA = 8;

// ---------------------------------------------------------------- parte pura

/** Reduz ou estica uma lista de pontos pra `n` pontos, mantendo as pontas. Nunca devolve a mesma lista. */
export function reamostrar(pontos, n) {
  const lista = Array.isArray(pontos) ? pontos : [];
  if (!lista.length || !(n > 0)) return [];
  if (lista.length === n) return lista.map((p) => ({ x: p.x, y: p.y }));
  if (lista.length === 1) return Array.from({ length: n }, () => ({ x: lista[0].x, y: lista[0].y }));
  if (n === 1) return [{ x: lista[0].x, y: lista[0].y }];
  const saida = [];
  for (let i = 0; i < n; i++) {
    const pos = (i / (n - 1)) * (lista.length - 1);
    const a = Math.floor(pos);
    const b = Math.min(lista.length - 1, a + 1);
    const f = pos - a;
    saida.push({ x: lista[a].x + (lista[b].x - lista[a].x) * f, y: lista[a].y + (lista[b].y - lista[a].y) * f });
  }
  return saida;
}

/** Pontos a caminho de `de` até `para` (t de 0 a 1). Em t >= 1 é EXATAMENTE `para`; sem `de`, é `para`. */
export function interpolarPontos(de, para, t) {
  const alvo = Array.isArray(para) ? para : [];
  if (!alvo.length) return [];
  if (!Array.isArray(de) || !de.length) return alvo.map((p) => ({ x: p.x, y: p.y }));
  if (t >= 1) return alvo.map((p) => ({ x: p.x, y: p.y }));
  const k = Math.max(0, Number(t) || 0);
  const origem = reamostrar(de, alvo.length);
  return alvo.map((p, i) => ({ x: origem[i].x + (p.x - origem[i].x) * k, y: origem[i].y + (p.y - origem[i].y) * k }));
}

const arredonda = (n) => Math.round(n * 100) / 100;

/** Lê o atributo `points` de um SVG ("x,y x,y ...") como lista de pontos. Lixo vira lista vazia, nunca NaN. */
export function textoParaPontos(texto) {
  const lista = String(texto == null ? '' : texto).trim().split(/\s+/).filter(Boolean).map((par) => {
    const [x, y] = par.split(',').map(Number);
    return { x, y };
  });
  return lista.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) ? lista : [];
}

/** Lista de pontos no formato do atributo `points` do SVG. */
export function pontosParaTexto(pontos) {
  return (Array.isArray(pontos) ? pontos : []).map((p) => `${arredonda(p.x)},${arredonda(p.y)}`).join(' ');
}

/**
 * scaleX de onde a barra PARTE pra chegar à largura nova (que já é a do HTML). Largura antiga
 * 40% e nova 80%: parte de 0,5. Barra que não existia ou zerada cresce do zero. Valor novo zero
 * não tem o que escalar (1). Teto de 8 pra uma barra de 900% não virar uma faixa na tela.
 */
export function escalaInicialDaBarra(antes, depois) {
  const novo = Number(depois);
  if (!Number.isFinite(novo) || novo <= 0) return 1;
  const velho = Number(antes);
  if (antes == null || !Number.isFinite(velho) || velho <= 0) return 0;
  return Math.min(TETO_DA_ESCALA, velho / novo);
}

// ---------------------------------------------------------------- DOM

const larguraDe = (el) => {
  const v = parseFloat(el && el.style ? el.style.width : '');
  return Number.isFinite(v) ? v : null;
};

function pontosDaLinha(grafico) {
  return [...grafico.querySelectorAll('.chart__point')].map((c) => ({ x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) }));
}

/** Foto do que está na tela AGORA (antes do corpo ser trocado): linhas e larguras das barras. */
export function fotografarDados(raiz) {
  const foto = { graficos: [], ranking: new Map(), funil: new Map(), meta: [], sparks: new Map() };
  if (!raiz) return foto;
  raiz.querySelectorAll('.chart--timeseries').forEach((g) => {
    const svg = g.querySelector('.chart__svg');
    foto.graficos.push({ pontos: pontosDaLinha(g), largura: svg ? svg.getAttribute('viewBox') : '' });
  });
  raiz.querySelectorAll('.ranking__row').forEach((r) => {
    const chave = (r.querySelector('.ranking__key') || {}).textContent;
    const w = larguraDe(r.querySelector('.ranking__bar'));
    if (chave != null && w != null) foto.ranking.set(chave, w);
  });
  raiz.querySelectorAll('.funnel__step').forEach((r) => {
    const chave = (r.querySelector('.funnel__label') || {}).textContent;
    const w = larguraDe(r.querySelector('.funnel__bar'));
    if (chave != null && w != null) foto.funil.set(chave, w);
  });
  raiz.querySelectorAll('.kpi__goal-fill').forEach((b) => foto.meta.push(larguraDe(b)));
  // Minigráficos dos indicadores (e o do destaque): a linha de cada um, achada pelo nome do indicador.
  raiz.querySelectorAll('.kpi').forEach((k) => {
    const linha = k.querySelector('.kpi__spark polyline');
    const nome = (k.querySelector('.kpi__label') || {}).textContent;
    if (linha && nome) foto.sparks.set(nome, textoParaPontos(linha.getAttribute('points')));
  });
  return foto;
}

function crescerBarra(barra, antes) {
  const depois = larguraDe(barra);
  const de = escalaInicialDaBarra(antes, depois);
  if (de === 1) return;
  barra.style.transformOrigin = 'left center';
  if (typeof barra.animate !== 'function') return;
  barra.animate([{ transform: `scaleX(${de})` }, { transform: 'scaleX(1)' }],
    { duration: DURACAO_DOS_DADOS, easing: CURVA.saida, fill: 'backwards' });
}

function transformarLinha(grafico, antes) {
  const linha = grafico.querySelector('.chart__line');
  const area = grafico.querySelector('.chart__area');
  const circulos = [...grafico.querySelectorAll('.chart__point')];
  const novos = circulos.map((c) => ({ x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) }));
  if (!linha || !novos.length || !antes || !antes.pontos.length) return;
  const finalLinha = linha.getAttribute('points');
  const finalArea = area ? area.getAttribute('points') : null;
  const baseY = area ? Number(String(finalArea).trim().split(/\s+/)[0].split(',')[1]) : 0;
  const desenhar = (t) => {
    const pts = interpolarPontos(antes.pontos, novos, t);
    linha.setAttribute('points', pontosParaTexto(pts));
    if (area) area.setAttribute('points', `${pts[0].x},${baseY} ${pontosParaTexto(pts)} ${pts[pts.length - 1].x},${baseY}`);
    circulos.forEach((c, i) => { c.setAttribute('cx', String(arredonda(pts[i].x))); c.setAttribute('cy', String(arredonda(pts[i].y))); });
  };
  const fechar = () => {
    linha.setAttribute('points', finalLinha);
    if (area && finalArea != null) area.setAttribute('points', finalArea);
    circulos.forEach((c, i) => { c.setAttribute('cx', String(novos[i].x)); c.setAttribute('cy', String(novos[i].y)); });
  };
  desenhar(0);
  // Eixos: os números da escala mudam, então a grade e os rótulos entram de leve.
  grafico.querySelectorAll('.chart__ytick, .chart__grid').forEach((el) => {
    if (typeof el.animate === 'function') el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURACAO_DOS_DADOS * 0.7, easing: CURVA.saida, fill: 'backwards' });
  });
  let feito = false;
  const inicio = performance.now();
  const quadro = (agora) => {
    if (feito || !linha.isConnected) return;
    const p = (agora - inicio) / DURACAO_DOS_DADOS;
    if (p >= 1) { feito = true; fechar(); return; }
    desenhar(suavizar(p));
    requestAnimationFrame(quadro);
  };
  requestAnimationFrame(quadro);
  // Aba em segundo plano congela o requestAnimationFrame: o temporizador garante o estado final.
  setTimeout(() => { if (!feito) { feito = true; fechar(); } }, DURACAO_DOS_DADOS + 250);
}

// A linha do minigráfico vai do desenho antigo ao novo (mesmos 100 x 26 do viewBox) e fecha no exato.
function transformarSpark(linha, antes) {
  const final = linha.getAttribute('points');
  const novos = textoParaPontos(final);
  if (!antes || !antes.length || !novos.length) return;
  linha.setAttribute('points', pontosParaTexto(interpolarPontos(antes, novos, 0)));
  let feito = false;
  const inicio = performance.now();
  const quadro = (agora) => {
    if (feito || !linha.isConnected) return;
    const p = (agora - inicio) / DURACAO_DOS_DADOS;
    if (p >= 1) { feito = true; linha.setAttribute('points', final); return; }
    linha.setAttribute('points', pontosParaTexto(interpolarPontos(antes, novos, suavizar(p))));
    requestAnimationFrame(quadro);
  };
  requestAnimationFrame(quadro);
  setTimeout(() => { if (!feito) { feito = true; linha.setAttribute('points', final); } }, DURACAO_DOS_DADOS + 250);
}

/** Depois do corpo novo na tela: leva linhas e barras do desenho da `foto` ao novo. */
export function transformarDados(raiz, foto) {
  if (!raiz || !foto || menosMovimento() || typeof requestAnimationFrame !== 'function') return;
  raiz.querySelectorAll('.chart--timeseries').forEach((g, i) => {
    const antes = foto.graficos[i];
    const svg = g.querySelector('.chart__svg');
    // Largura de quadro diferente (girou o celular) = outro sistema de coordenadas: sem morfar.
    if (antes && svg && antes.largura === svg.getAttribute('viewBox')) transformarLinha(g, antes);
  });
  raiz.querySelectorAll('.ranking__row').forEach((r) => {
    const chave = (r.querySelector('.ranking__key') || {}).textContent;
    const barra = r.querySelector('.ranking__bar');
    if (barra) crescerBarra(barra, foto.ranking.has(chave) ? foto.ranking.get(chave) : null);
  });
  raiz.querySelectorAll('.funnel__step').forEach((r) => {
    const chave = (r.querySelector('.funnel__label') || {}).textContent;
    const barra = r.querySelector('.funnel__bar');
    if (barra) crescerBarra(barra, foto.funil.has(chave) ? foto.funil.get(chave) : null);
  });
  raiz.querySelectorAll('.kpi__goal-fill').forEach((b, i) => { if (foto.meta[i] != null) crescerBarra(b, foto.meta[i]); });
  if (foto.sparks) {
    raiz.querySelectorAll('.kpi').forEach((k) => {
      const linha = k.querySelector('.kpi__spark polyline');
      const nome = (k.querySelector('.kpi__label') || {}).textContent;
      if (linha && foto.sparks.has(nome)) transformarSpark(linha, foto.sparks.get(nome));
    });
  }
}
