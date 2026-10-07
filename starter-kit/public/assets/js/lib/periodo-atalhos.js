// Efeito 4, "período em um clique": atalhos (Hoje, 7 dias, 30 dias, Este mês, Tudo) num controle
// segmentado com uma pílula que desliza até o escolhido. O campo de data digitado continua, como
// a opção "Personalizado". Um clique dispara a transição dos dados (efeitos 2 e 3). ESM.
//
// "Hoje" e os intervalos contam a partir do ÚLTIMO DIA COM DADO, não do calendário: um painel com
// dados até 04/10 não pode mostrar "Hoje" vazio. A parte pura (faixa de datas, atalho ativo, HTML)
// fica no topo e tem teste; a ligação com o DOM vem depois.

import { esc } from './html.js';
import { isoParaBR } from './data-br.js';
import { transformDoMarcador, animar, DURACAO, CURVA } from './movimento.js';

/** Quanto a pílula leva pra deslizar de um atalho ao outro (ms). */
export const DURACAO_DA_PILULA = DURACAO.troca + 60;

export const ATALHOS = Object.freeze([
  { id: 'hoje', rotulo: 'Hoje' },
  { id: '7d', rotulo: '7 dias' },
  { id: '30d', rotulo: '30 dias' },
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'tudo', rotulo: 'Tudo' },
  { id: 'personalizado', rotulo: 'Personalizado' },
]);

const DIA = 86400000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const paraData = (iso) => { const m = ISO.exec(iso || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
const paraIso = (dt) => dt.toISOString().slice(0, 10);

/**
 * Faixa de datas (ISO, inclusiva) de um atalho, contada do último dia com dado e nunca antes do
 * primeiro. 'tudo' = sem filtro ({from:null,to:null}). 'personalizado', atalho desconhecido ou
 * dados sem data = null (quem chama não mexe nos campos).
 */
export function faixaDoAtalho(id, limites) {
  const { min, max } = limites || {};
  const fim = paraData(max);
  const ini = paraData(min);
  if (!fim || !ini) return null;
  const aparar = (dt) => (dt < ini ? ini : dt);
  switch (id) {
    case 'tudo': return { from: null, to: null };
    case 'hoje': return { from: max, to: max };
    case '7d': return { from: paraIso(aparar(new Date(fim.getTime() - 6 * DIA))), to: max };
    case '30d': return { from: paraIso(aparar(new Date(fim.getTime() - 29 * DIA))), to: max };
    case 'mes': return { from: paraIso(aparar(new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), 1)))), to: max };
    default: return null;
  }
}

/** Qual atalho corresponde a uma faixa já escolhida; faixa que não é de nenhum é 'personalizado'. */
export function atalhoAtivo(estado, limites) {
  const from = (estado && estado.from) || null;
  const to = (estado && estado.to) || null;
  if (!from && !to) return 'tudo';
  for (const id of ['tudo', 'hoje', '7d', '30d', 'mes']) {
    const f = id === 'tudo' ? { from: limites && limites.min, to: limites && limites.max } : faixaDoAtalho(id, limites);
    if (f && f.from === from && f.to === to) return id;
  }
  return 'personalizado';
}

/** HTML do controle segmentado. A pílula entra pelo JS (sem JS, o item marcado já se destaca). */
export function atalhosHtml(ativo = 'tudo') {
  const itens = ATALHOS.map((a) =>
    `<button type="button" role="radio" class="atalho" data-atalho="${esc(a.id)}" aria-checked="${a.id === ativo ? 'true' : 'false'}" tabindex="${a.id === ativo ? 0 : -1}">${esc(a.rotulo)}</button>`,
  ).join('');
  return `<div class="fb-field fb-atalhos-campo"><span class="fb-label" id="fb-atalhos-rotulo">Período</span>` +
    `<div class="atalhos" id="fb-atalhos" role="radiogroup" aria-labelledby="fb-atalhos-rotulo">${itens}</div></div>`;
}

// ---------------------------------------------------------------- DOM

const retangulo = (el) => ({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });

/**
 * Liga o controle. `limites` {min,max} são as datas dos dados; `aoMudar` é chamado depois que
 * os campos De e Até já têm a faixa nova. Devolve { selecionar(id, {silencioso}), ativo() }.
 */
export function ligarAtalhos(barra, limites, aoMudar) {
  const grupo = barra && barra.querySelector('#fb-atalhos');
  if (!grupo) return null;
  const de = barra.querySelector('#fb-from');
  const ate = barra.querySelector('#fb-to');
  const datas = barra.querySelector('.fb-datas');
  const pilula = document.createElement('span');
  pilula.className = 'atalhos__pilula';
  pilula.setAttribute('aria-hidden', 'true');
  grupo.insertBefore(pilula, grupo.firstChild);
  const botoes = () => [...grupo.querySelectorAll('[data-atalho]')];
  const marcado = () => grupo.querySelector('[aria-checked="true"]');

  const posicionar = (deslizar) => {
    const alvo = marcado();
    if (!alvo) return;
    const antes = retangulo(pilula);
    const depois = retangulo(alvo);
    Object.assign(pilula.style, { left: `${depois.left}px`, top: `${depois.top}px`, width: `${depois.width}px`, height: `${depois.height}px` });
    grupo.classList.add('atalhos--pilula');
    // Mantém o escolhido à vista quando o controle rola por dentro (celular).
    if (grupo.scrollWidth > grupo.clientWidth) {
      const esquerda = alvo.offsetLeft - 8;
      const direita = alvo.offsetLeft + alvo.offsetWidth + 8 - grupo.clientWidth;
      if (esquerda < grupo.scrollLeft) grupo.scrollLeft = Math.max(0, esquerda);
      else if (direita > grupo.scrollLeft) grupo.scrollLeft = direita;
    }
    if (!deslizar) return;
    const saida = transformDoMarcador(antes, depois);
    if (saida !== 'none') animar(pilula, [{ transform: saida }, { transform: 'none' }], { duration: DURACAO_DA_PILULA, easing: CURVA.vaiVolta });
  };

  const marcar = (id) => {
    botoes().forEach((b) => {
      const on = b.dataset.atalho === id;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    grupo.dataset.ativo = id;
    barra.dataset.periodo = id;
  };

  const mostrarDatas = (visivel) => {
    if (!datas) return;
    const mudou = datas.hidden === visivel;
    datas.hidden = !visivel;
    if (visivel && mudou) animar(datas, [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: DURACAO.troca });
  };

  const selecionar = (id, { silencioso = false, deslizar = true } = {}) => {
    if (!ATALHOS.some((a) => a.id === id)) return;
    marcar(id);
    posicionar(deslizar);
    if (id === 'personalizado') {
      // Os campos começam na faixa que já valia; quem digita ajusta a partir dela.
      if (de && ate && !de.value && !ate.value && limites && limites.min && limites.max) {
        de.value = isoParaBR(limites.min); ate.value = isoParaBR(limites.max);
      }
      mostrarDatas(true);
      if (!silencioso && de) de.focus({ preventScroll: true });
      return;
    }
    mostrarDatas(false);
    const faixa = faixaDoAtalho(id, limites);
    if (faixa && de && ate) {
      de.value = faixa.from ? isoParaBR(faixa.from) : '';
      ate.value = faixa.to ? isoParaBR(faixa.to) : '';
    }
    if (!silencioso && typeof aoMudar === 'function') aoMudar(id);
  };

  grupo.addEventListener('click', (e) => {
    const b = e.target.closest('[data-atalho]');
    if (b && b.dataset.atalho !== grupo.dataset.ativo) selecionar(b.dataset.atalho);
  });
  grupo.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const lista = botoes();
    const i = lista.findIndex((b) => b === document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const prox = lista[(i + (e.key === 'ArrowRight' ? 1 : lista.length - 1)) % lista.length];
    prox.focus({ preventScroll: true });
    selecionar(prox.dataset.atalho);
  });

  // Estado de partida: o que os campos já dizem (Atualizar devolve o filtro de antes).
  const inicial = barra.dataset.periodo || 'tudo';
  marcar(inicial);
  mostrarDatas(inicial === 'personalizado');
  posicionar(false);
  const reposicionar = () => posicionar(false);
  window.addEventListener('resize', reposicionar);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(reposicionar).catch(() => {});
  return { selecionar, ativo: () => grupo.dataset.ativo, soltar: () => window.removeEventListener('resize', reposicionar) };
}

