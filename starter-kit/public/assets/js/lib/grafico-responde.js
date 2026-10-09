// Efeito 1, "gráfico que responde": passar o mouse (ou tocar) no gráfico de linha mostra uma
// régua vertical, o ponto do dia e uma etiqueta com data e valor. Só com teclado (3.7.3): Tab no gráfico e as setas
// esquerda e direita andam pelos dias; o valor é anunciado numa região aria-live. A régua e a etiqueta DESLIZAM
// de um dia pro outro (só transform), não pulam. ESM.
//
// A parte com conta é pura e fica no topo (testada em test/grafico-responde.test.js). O DOM vem
// depois e só roda no navegador: o painel liga UMA vez no #dashbody, que não é recriado, e o
// gráfico novo de cada redesenho já nasce coberto pela delegação.

import { fmtBy } from '../widgets/_util.js';
import { parseDateBR } from './format.js';

/** Quanto a régua e a etiqueta levam pra ir de um dia ao outro (ms). Espelha --dur-regua. */
export const DURACAO_DA_REGUA = 140;

/** Índice do x mais perto de `x`. No empate vale o da esquerda. Lista vazia: -1. */
export function indiceMaisProximo(xs, x) {
  if (!Array.isArray(xs) || !xs.length) return -1;
  let melhor = 0;
  let menor = Math.abs(xs[0] - x);
  for (let i = 1; i < xs.length; i++) {
    const d = Math.abs(xs[i] - x);
    if (d < menor) { menor = d; melhor = i; }
  }
  return melhor;
}

/**
 * Onde a etiqueta fica, em pixels dentro da caixa do gráfico. Centrada no ponto e presa às duas
 * bordas. Na altura, vai pro TOPO da área do desenho (`topo`), longe da linha, desde que sobre
 * `respiro` pixels entre ela e o ponto; sem esse espaço, vai pra BAIXO do ponto. Nunca cobre o
 * ponto que descreve.
 * @returns {{x:number, y:number, abaixo:boolean}}
 */
export function posicaoDaDica({ ponto, dica, caixa, topo = 0, folga = 12, respiro = 14 }) {
  const x = Math.min(Math.max(0, ponto.x - dica.w / 2), Math.max(0, caixa.w - dica.w));
  const y = topo + 4;
  if (ponto.y - (y + dica.h) >= respiro) return { x, y, abaixo: false };
  return { x, y: ponto.y + folga, abaixo: true };
}

/**
 * Para onde vai o dia em foco quando uma tecla é apertada no gráfico (3.7.3, uso só com teclado). Setas andam um dia,
 * Home e End vão às pontas. Sem dia em foco (`atual` -1) as duas setas partem do último dia. Tecla que não é do
 * gráfico: null (o navegador segue o caminho dele).
 */
export function proximoDia({ atual, tecla, total }) {
  if (!(total > 0)) return null;
  const ultimo = total - 1;
  if (tecla === 'Home') return 0;
  if (tecla === 'End') return ultimo;
  if (tecla !== 'ArrowLeft' && tecla !== 'ArrowRight') return null;
  if (!(atual >= 0)) return ultimo;
  const passo = tecla === 'ArrowRight' ? 1 : -1;
  return Math.min(ultimo, Math.max(0, atual + passo));
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** 'sáb' pra '2026-10-03'; texto que não é data: ''. */
export function diaDaSemanaCurto(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(dt.getTime()) ? '' : DIAS[dt.getUTCDay()];
}

/** Texto da etiqueta: 'sáb, 03/10' e o valor no formato da série. */
export function rotuloDaDica(data, valor, formato) {
  const iso = parseDateBR(data);
  if (!iso) return { data: '', valor: fmtBy(formato || 'number', Number(valor) || 0) };
  return {
    data: `${diaDaSemanaCurto(iso)}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`,
    valor: fmtBy(formato || 'number', Number(valor) || 0),
  };
}

/** O que o leitor de tela fala ao mudar de dia: "sáb, 03/10: R$ 1.234,50, dia 3 de 60". */
export function textoDoDia({ data, valor, formato, posicao, total }) {
  const r = rotuloDaDica(data, valor, formato);
  const quando = r.data || String(data || '').trim();
  return `${quando ? `${quando}: ` : ''}${r.valor}, dia ${posicao + 1} de ${total}`;
}

// ---------------------------------------------------------------- DOM (só no navegador)

const NS = 'http://www.w3.org/2000/svg';

function pontosDoSvg(svg) {
  return [...svg.querySelectorAll('.chart__point')].map((c) => ({
    x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')),
    data: c.getAttribute('data-d') || '', valor: Number(c.getAttribute('data-v')),
  }));
}

// Régua, ponto em foco e etiqueta nascem na primeira passada do ponteiro e morrem com o gráfico.
function pecasDoGrafico(svg) {
  const cartao = svg.closest('.chart');
  let regua = svg.querySelector('.chart__regua');
  if (!regua) {
    const piso = Number(svg.viewBox.baseVal.height) || 240;
    regua = document.createElementNS(NS, 'line');
    regua.setAttribute('class', 'chart__regua');
    regua.setAttribute('x1', '0'); regua.setAttribute('x2', '0');
    regua.setAttribute('y1', '12'); regua.setAttribute('y2', String(piso - 26));
    const foco = document.createElementNS(NS, 'circle');
    foco.setAttribute('class', 'chart__foco');
    foco.setAttribute('r', '5.5'); foco.setAttribute('cx', '0'); foco.setAttribute('cy', '0');
    svg.append(regua, foco);
  }
  let dica = cartao.querySelector('.chart__dica');
  if (!dica) {
    dica = document.createElement('div');
    dica.className = 'chart__dica';
    dica.setAttribute('aria-hidden', 'true');
    dica.innerHTML = '<span class="chart__dica-data"></span><strong class="chart__dica-valor"></strong>';
    cartao.append(dica);
  }
  return { regua, foco: svg.querySelector('.chart__foco'), dica, cartao };
}

function mostrar(svg, ev) {
  const pontos = pontosDoSvg(svg);
  if (pontos.length < 2) return;
  const ctm = svg.getScreenCTM();
  if (!ctm) return;
  const p = svg.createSVGPoint();
  p.x = ev.clientX; p.y = ev.clientY;
  const user = p.matrixTransform(ctm.inverse());
  const i = indiceMaisProximo(pontos.map((q) => q.x), user.x);
  if (i < 0) return;
  focarDia(svg, pontos, i, ctm);
}

// Põe a régua, o ponto e a etiqueta no dia `i`. Vale para o mouse, o toque e o teclado.
function focarDia(svg, pontos, i, ctm) {
  const alvo = pontos[i];
  const pecas = pecasDoGrafico(svg);
  if (pecas.cartao.dataset.diaEmFoco === String(i) && pecas.dica.classList.contains('is-ativa')) return;
  pecas.cartao.dataset.diaEmFoco = String(i);

  const rotulo = rotuloDaDica(alvo.data, alvo.valor, svg.getAttribute('data-formato'));
  pecas.dica.querySelector('.chart__dica-data').textContent = rotulo.data;
  pecas.dica.querySelector('.chart__dica-valor').textContent = rotulo.valor;

  // Pixel do ponto dentro do cartão do gráfico.
  const tela = svg.createSVGPoint();
  tela.x = alvo.x; tela.y = alvo.y;
  const naTela = tela.matrixTransform(ctm);
  const caixa = pecas.cartao.getBoundingClientRect();
  const ponto = { x: naTela.x - caixa.left, y: naTela.y - caixa.top };
  const dicaTam = { w: pecas.dica.offsetWidth, h: pecas.dica.offsetHeight };
  const topo = svg.getBoundingClientRect().top - caixa.top;
  const pos = posicaoDaDica({ ponto, dica: dicaTam, caixa: { w: caixa.width, h: caixa.height }, topo });

  const primeira = !pecas.dica.classList.contains('is-ativa');
  if (primeira) pecas.cartao.classList.add('chart--sem-deslize');
  pecas.regua.style.transform = `translateX(${alvo.x}px)`;
  pecas.foco.style.transform = `translate(${alvo.x}px, ${alvo.y}px)`;
  pecas.dica.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  pecas.dica.classList.toggle('is-abaixo', pos.abaixo);
  if (primeira) {
    // Na primeira passada vai direto pro lugar (sem deslizar do canto); depois desliza.
    void pecas.dica.offsetWidth;
    pecas.cartao.classList.remove('chart--sem-deslize');
  }
  pecas.cartao.classList.add('chart--em-foco');
  pecas.regua.classList.add('is-ativa');
  pecas.foco.classList.add('is-ativa');
  pecas.dica.classList.add('is-ativa');
}

function esconder(svg) {
  const cartao = svg.closest('.chart');
  if (!cartao) return;
  cartao.classList.remove('chart--em-foco');
  delete cartao.dataset.diaEmFoco;
  svg.querySelectorAll('.chart__regua, .chart__foco').forEach((el) => el.classList.remove('is-ativa'));
  const dica = cartao.querySelector('.chart__dica');
  if (dica) dica.classList.remove('is-ativa');
}

// Teclado: o gráfico recebe foco (Tab), as setas andam pelos dias e o valor do dia vai para a região aria-live
// que fica ao lado do gráfico (dentro do svg role=img nada é lido). O dia em foco segue a mesma régua do mouse.
function diaEmFocoDoTeclado(svg) {
  const cartao = svg.closest('.chart');
  const v = cartao && cartao.dataset.diaEmFoco;
  return v === undefined ? -1 : Number(v);
}

function aoApertarTecla(ev) {
  const svg = ev.target && ev.target.closest ? ev.target.closest('.chart--timeseries .chart__svg') : null;
  if (!svg || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.key === 'Escape') { esconder(svg); return; }
  const pontos = pontosDoSvg(svg);
  const i = proximoDia({ atual: diaEmFocoDoTeclado(svg), tecla: ev.key, total: pontos.length });
  if (i === null || pontos.length < 2) return;
  ev.preventDefault(); // as setas não rolam a página enquanto leem o gráfico
  mostrarDiaDoTeclado(svg, pontos, i);
}

function mostrarDiaDoTeclado(svg, pontos, i) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return;
  focarDia(svg, pontos, i, ctm);
  const cartao = svg.closest('.chart');
  const anuncio = cartao && cartao.querySelector('.chart__anuncio');
  if (anuncio) anuncio.textContent = textoDoDia({ data: pontos[i].data, valor: pontos[i].valor, formato: svg.getAttribute('data-formato'), posicao: i, total: pontos.length });
}

function aoFocar(ev) {
  const svg = ev.target && ev.target.closest ? ev.target.closest('.chart--timeseries .chart__svg') : null;
  if (!svg || ev.target !== svg) return;
  // Foco que veio do mouse já tem o dia do ponteiro; o do teclado começa no último dia (o mais recente).
  if (diaEmFocoDoTeclado(svg) >= 0) return;
  const pontos = pontosDoSvg(svg);
  if (pontos.length >= 2) mostrarDiaDoTeclado(svg, pontos, pontos.length - 1);
}

function aoPerderFoco(ev) {
  const svg = ev.target && ev.target.closest ? ev.target.closest('.chart--timeseries .chart__svg') : null;
  if (svg && ev.target === svg) { esconder(svg); const a = svg.closest('.chart').querySelector('.chart__anuncio'); if (a) a.textContent = ''; }
}

/**
 * Liga a resposta ao ponteiro em `raiz` (o #dashbody). Uma vez só: quem repinta o corpo não
 * precisa ligar de novo. Mouse: segue o ponteiro e some ao sair. Toque: segue o dedo e fica até
 * a próxima toque fora do gráfico. Devolve a função que desliga.
 */
export function ligarGraficoResponde(raiz) {
  if (!raiz || typeof raiz.addEventListener !== 'function') return () => {};
  const alvoDe = (ev) => (ev.target && ev.target.closest ? ev.target.closest('.chart--timeseries .chart__svg') : null);
  const aoMover = (ev) => { const svg = alvoDe(ev); if (svg) mostrar(svg, ev); };
  const aoSair = (ev) => {
    if (ev.pointerType === 'touch') return;
    const svg = alvoDe(ev);
    if (svg && !(ev.relatedTarget && svg.closest('.chart').contains(ev.relatedTarget))) esconder(svg);
  };
  const aoTocarFora = (ev) => {
    const dentro = alvoDe(ev);
    raiz.querySelectorAll('.chart--em-foco .chart__svg').forEach((svg) => { if (svg !== dentro) esconder(svg); });
  };
  raiz.addEventListener('pointermove', aoMover);
  raiz.addEventListener('pointerdown', aoMover);
  raiz.addEventListener('pointerout', aoSair);
  raiz.addEventListener('keydown', aoApertarTecla);
  raiz.addEventListener('focusin', aoFocar);
  raiz.addEventListener('focusout', aoPerderFoco);
  document.addEventListener('pointerdown', aoTocarFora);
  return () => {
    raiz.removeEventListener('keydown', aoApertarTecla);
    raiz.removeEventListener('focusin', aoFocar);
    raiz.removeEventListener('focusout', aoPerderFoco);
    raiz.removeEventListener('pointermove', aoMover);
    raiz.removeEventListener('pointerdown', aoMover);
    raiz.removeEventListener('pointerout', aoSair);
    document.removeEventListener('pointerdown', aoTocarFora);
  };
}
