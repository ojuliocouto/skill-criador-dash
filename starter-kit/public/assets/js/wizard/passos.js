// Barra de passos do assistente e a troca de conteúdo entre um passo e outro.
// Número é número (sem bolinha): o passo atual leva um marcador que DESLIZA até ele, e o passo
// concluído troca o número por um check que se desenha. A troca de conteúdo tem direção:
// avançar sai pra esquerda e entra pela direita; voltar faz o contrário.

import { el, SVG_CHECK } from './dom.js';
import { animar, menosMovimento, transformDoMarcador, direcaoDoPasso, DURACAO, CURVA } from '../lib/movimento.js';

export const PASSOS = [
  { n: 1, rotulo: 'Área' },
  { n: 2, rotulo: 'Números' },
  { n: 3, rotulo: 'Colunas' },
  { n: 4, rotulo: 'Aparência' },
];

const retangulo = (node) => ({ left: node.offsetLeft, top: node.offsetTop, width: node.offsetWidth, height: node.offsetHeight });

function posicionarMarcador(bar, deslizar) {
  const marcador = bar.querySelector('.passos__marcador');
  const atual = bar.querySelector('.passo[aria-current="step"]');
  if (!marcador || !atual) return;
  const de = retangulo(marcador);
  const base = retangulo(atual);
  const para = { left: base.left, top: base.top + base.height - 2, width: base.width, height: 2 };
  marcador.style.left = `${para.left}px`;
  marcador.style.top = `${para.top}px`;
  marcador.style.width = `${para.width}px`;
  if (!deslizar || !de.width) return;
  const saida = transformDoMarcador({ ...de, height: 2 }, para);
  if (saida !== 'none') animar(marcador, [{ transform: saida }, { transform: 'none' }], { duration: DURACAO.troca, easing: CURVA.vaiVolta });
}

/**
 * Desenha (ou atualiza) a barra. Os botões são criados uma vez e só mudam de estado, pra o
 * marcador ter de onde deslizar.
 * @param {HTMLElement} bar
 * @param {number} atual  passo atual (1 a 4)
 * @param {(n:number)=>void} irPara  chamado ao clicar num passo já concluído
 */
export function desenharPassos(bar, atual, irPara) {
  if (!bar) return;
  bar.hidden = false;
  if (!bar.querySelector('.passos__lista')) {
    const lista = el('ol', { class: 'passos__lista' }, PASSOS.map((p) => el('li', {}, [
      el('button', { class: 'passo', type: 'button', 'data-passo': String(p.n), onclick: () => irPara(p.n) }, [
        el('span', { class: 'passo__num', text: String(p.n) }),
        el('span', { class: 'passo__rotulo', text: p.rotulo }),
      ]),
    ])));
    bar.appendChild(lista);
    bar.appendChild(el('span', { class: 'passos__marcador', 'aria-hidden': 'true' }));
    window.addEventListener('resize', () => posicionarMarcador(bar, false));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => posicionarMarcador(bar, false)).catch(() => {});
  }
  for (const btn of bar.querySelectorAll('.passo')) {
    const n = Number(btn.dataset.passo);
    const feito = n < atual;
    const eAtual = n === atual;
    const num = btn.querySelector('.passo__num');
    const jaFeito = btn.classList.contains('is-feito');
    btn.classList.toggle('is-feito', feito);
    btn.classList.toggle('is-atual', eAtual);
    btn.disabled = !feito;
    if (eAtual) btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
    btn.setAttribute('aria-label', `Passo ${n}: ${PASSOS[n - 1].rotulo}${feito ? ' (concluído, voltar a ele)' : ''}`);
    // O check entra quando o passo ACABA de ser concluído: o SVG novo nasce com a animação.
    if (feito && !jaFeito) num.innerHTML = SVG_CHECK;
    if (!feito) num.textContent = String(n);
  }
  posicionarMarcador(bar, true);
}

export function esconderPassos(bar) {
  if (bar) bar.hidden = true;
}

let vez = 0;

/**
 * Troca o conteúdo do passo com direção. `desenhar` roda SEMPRE (por temporizador, nunca por
 * evento de fim de animação): com movimento reduzido, na hora.
 * @param {HTMLElement} corpo
 * @param {number} de
 * @param {number} para
 * @param {()=>void} desenhar
 */
export function trocarPasso(corpo, de, para, desenhar) {
  vez += 1;
  const minha = vez;
  if (menosMovimento() || de === para || !corpo.firstChild) { desenhar(); return; }
  const lado = direcaoDoPasso(de, para) === 'frente' ? -1 : 1;
  const saida = DURACAO.toque - 20;
  corpo.classList.add('is-saindo');
  animar(corpo, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${lado * 28}px)` }],
    { duration: saida, easing: 'ease-in', fill: 'forwards' });
  setTimeout(() => {
    if (minha !== vez) return; // outra troca chegou no meio: ela desenha
    for (const a of (corpo.getAnimations ? corpo.getAnimations() : [])) a.cancel();
    corpo.classList.remove('is-saindo');
    desenhar();
    // As peças do passo novo entram em sequência curta, vindas do lado pra onde a pessoa foi
    // (título, texto, cartões), em vez de o bloco inteiro de uma vez.
    [...corpo.children].forEach((peca, i) => {
      animar(peca, [{ opacity: 0, transform: `translateX(${-lado * 24}px)` }, { opacity: 1, transform: 'none' }],
        { duration: DURACAO.troca + 80, delay: Math.min(i, 5) * 45, fill: 'backwards' });
    });
  }, saida);
}
