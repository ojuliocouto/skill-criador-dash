// Efeito 6, "cartão que vira a tela": na lista de painéis, clicar num painel faz o cartão dele
// crescer até cobrir a tela na cor da marca daquele painel, e a abertura do dash continua dessa
// mesma cor. São duas páginas, mas a passagem parece uma coisa só. ESM.
//
// NÃO usa transição de página entre documentos do navegador (@view-transition): foi medido que
// trava a gravação sem janela. O que atravessa de uma página pra outra é um aviso no
// sessionStorage ({ cor, nome, t }): a lista grava e navega; a página do painel acende uma capa
// da mesma cor no primeiro quadro (lib/cobertura-boot.js, script clássico no <head>) e a levanta
// quando o painel já desenhou. Tudo só com transform e opacity.

import { menosMovimento, CURVA } from './movimento.js';

export const CHAVE_DO_AVISO = 'cd-capa';
export const VALIDADE_DO_AVISO_MS = 8000;
export const TEMPOS_DA_CAPA = Object.freeze({ cresce: 540, nome: 240, levanta: 520 });
const COR_PADRAO = '#5b62d6';

/** Hexadecimal de verdade (#rgb ou #rrggbb) em minúsculas de 6 dígitos; qualquer outra coisa vira a cor padrão. */
export function normalizarCor(cor) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(cor == null ? '' : cor).trim());
  if (!m) return COR_PADRAO;
  const h = m[1].toLowerCase();
  return `#${h.length === 3 ? h.split('').map((c) => c + c).join('') : h}`;
}

/** Cor do texto que se lê sobre `cor`: branco em fundo escuro, quase preto em fundo claro. */
export function corDoTextoSobre(cor) {
  const h = normalizarCor(cor).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminancia > 0.4 ? '#14171d' : '#ffffff';
}

/** Transform que faz uma camada de tela cheia (origem no canto) ocupar o retângulo do cartão. */
export function transformDoCartao(rect, largura, altura) {
  const ok = rect && [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;
  if (!ok || !(largura > 0) || !(altura > 0)) return 'none';
  const n = (v) => Math.round(v * 1000) / 1000;
  return `translate(${n(rect.left)}px, ${n(rect.top)}px) scale(${n(rect.width / largura)}, ${n(rect.height / altura)})`;
}

/** O aviso que a lista deixa pra página do painel. */
export function montarAviso({ cor, nome }, agora) {
  return { cor: normalizarCor(cor), nome: String(nome == null ? '' : nome).replace(/[<>]/g, '').slice(0, 40), t: agora };
}

/** O aviso serve se tem cor de verdade, hora e ainda é recente. */
export function avisoValido(aviso, agora) {
  if (!aviso || typeof aviso !== 'object') return false;
  if (!/^#[0-9a-f]{6}$/i.test(String(aviso.cor || ''))) return false;
  if (!Number.isFinite(aviso.t)) return false;
  return agora - aviso.t >= 0 && agora - aviso.t <= VALIDADE_DO_AVISO_MS;
}

// ---------------------------------------------------------------- DOM: saída (na lista)

/**
 * Faz o cartão crescer até cobrir a tela e então navega. Devolve false (e não faz nada) com
 * movimento reduzido, pra quem chamou navegar do jeito de sempre.
 */
export function cartaoViraTela(cartao, { cor, nome, destino, idDoPainel }) {
  if (menosMovimento() || !cartao || typeof cartao.animate !== 'function') return false;
  const rect = cartao.getBoundingClientRect();
  const corLimpa = normalizarCor(cor);
  const capa = document.createElement('div');
  capa.className = 'capa';
  capa.setAttribute('aria-hidden', 'true');
  capa.style.background = corLimpa;
  capa.style.width = `${window.innerWidth}px`;
  capa.style.height = `${window.innerHeight}px`;
  const rotulo = document.createElement('span');
  rotulo.className = 'capa__nome';
  rotulo.style.color = corDoTextoSobre(corLimpa);
  rotulo.textContent = nome || '';
  document.body.append(capa, rotulo);
  const de = transformDoCartao(rect, window.innerWidth, window.innerHeight);
  capa.animate([{ transform: de }, { transform: 'translate(0px, 0px) scale(1, 1)' }],
    { duration: TEMPOS_DA_CAPA.cresce, easing: 'cubic-bezier(0.7, 0, 0.2, 1)', fill: 'forwards' });
  rotulo.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
    { duration: TEMPOS_DA_CAPA.nome, delay: TEMPOS_DA_CAPA.cresce - 200, easing: CURVA.saida, fill: 'both' });
  try {
    sessionStorage.setItem(CHAVE_DO_AVISO, JSON.stringify(montarAviso({ cor: corLimpa, nome }, Date.now())));
    // A capa é a abertura: a saudação do painel não toca por cima dela.
    if (idDoPainel) sessionStorage.setItem(`cd-saudou:${idDoPainel}`, '1');
  } catch { /* sessão bloqueada: o painel abre sem capa, como sempre */ }
  setTimeout(() => { window.location.href = destino; }, TEMPOS_DA_CAPA.cresce + 40);
  // Voltou pela seta com a página guardada: tira a capa.
  window.addEventListener('pageshow', (ev) => { if (ev.persisted) { capa.remove(); rotulo.remove(); } }, { once: true });
  return true;
}

// ---------------------------------------------------------------- DOM: chegada (no painel)

/** Põe o nome e a cor do texto na capa que o cobertura-boot.js acendeu. */
export function prepararCapa() {
  const capa = document.getElementById('cobertura');
  if (!capa || !document.documentElement.hasAttribute('data-cobertura')) return false;
  const cor = document.documentElement.style.getPropertyValue('--cobertura-cor') || COR_PADRAO;
  const nome = capa.querySelector('.cobertura__nome');
  if (nome) {
    nome.textContent = document.documentElement.getAttribute('data-cobertura') || '';
    nome.style.color = corDoTextoSobre(cor);
  }
  return true;
}

/** O painel já desenhou: a capa sobe e deixa a abertura dele à vista. */
export function levantarCapa() {
  const raiz = document.documentElement;
  const capa = document.getElementById('cobertura');
  if (!capa || !raiz.hasAttribute('data-cobertura')) return;
  const tirar = () => { raiz.removeAttribute('data-cobertura'); raiz.style.removeProperty('--cobertura-cor'); };
  if (menosMovimento() || typeof capa.animate !== 'function') { tirar(); return; }
  const nome = capa.querySelector('.cobertura__nome');
  if (nome && typeof nome.animate === 'function') nome.animate([{ opacity: 1 }, { opacity: 0 }], { duration: TEMPOS_DA_CAPA.nome, easing: CURVA.saida, fill: 'forwards' });
  const anim = capa.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }],
    { duration: TEMPOS_DA_CAPA.levanta, delay: 140, easing: 'cubic-bezier(0.7, 0, 0.2, 1)', fill: 'forwards' });
  const fim = () => { tirar(); capa.getAnimations().forEach((a) => a.cancel()); if (nome) nome.getAnimations().forEach((a) => a.cancel()); };
  anim.onfinish = fim;
  setTimeout(fim, TEMPOS_DA_CAPA.levanta + 400);
}
