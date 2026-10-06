// Ajudantes de tela do assistente: criar elemento, campo com rótulo de verdade, aviso, botão
// carregando e o "chama atenção uma vez" do campo com erro. Sem estado, sem regra de negócio.

import { animar, DURACAO } from '../lib/movimento.js';

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function limpar(node) {
  if (node) node.innerHTML = '';
  return node;
}

/**
 * Campo com rótulo associado (label for + id) e dica ligada por aria-describedby.
 * @param {{id:string, rotulo:string, controle:HTMLElement, dica?:string|HTMLElement, soLeitor?:boolean}} p
 */
export function campo({ id, rotulo, controle, dica, soLeitor = false }) {
  controle.id = id;
  const filhos = [el('label', { class: `campo__rotulo${soLeitor ? ' so-leitor' : ''}`, for: id, text: rotulo }), controle];
  if (dica) {
    const dicaEl = typeof dica === 'string' ? el('p', { class: 'campo__dica hint', text: dica }) : dica;
    dicaEl.id = `${id}-dica`;
    controle.setAttribute('aria-describedby', dicaEl.id);
    filhos.push(dicaEl);
  }
  return el('div', { class: 'campo' }, filhos);
}

/** Mensagem de erro que diz o que fazer. role=alert: leitor de tela anuncia na hora. */
export function erro(texto) {
  return el('p', { class: 'error', role: 'alert', text: texto });
}

/** Retorno neutro ou de andamento ("Conectando..."). */
export function recado(texto) {
  return el('p', { class: 'hint recado', role: 'status', text: texto });
}

/**
 * Botão carregando: o texto vira o estado de progresso e a largura fica travada na de antes,
 * então o botão não encolhe nem empurra o vizinho.
 */
export function ocupar(btn, texto) {
  if (!btn || btn.classList.contains('is-loading')) return;
  btn.style.minWidth = `${btn.offsetWidth}px`;
  btn.dataset.rotulo = btn.textContent;
  btn.textContent = texto;
  btn.classList.add('is-loading');
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;
}

export function liberar(btn) {
  if (!btn || !btn.classList.contains('is-loading')) return;
  btn.textContent = btn.dataset.rotulo || btn.textContent;
  btn.classList.remove('is-loading');
  btn.removeAttribute('aria-busy');
  btn.style.minWidth = '';
  btn.disabled = false;
}

/** Campo com erro chama atenção UMA vez (um balanço curto), sem ficar piscando. */
export function chamarAtencao(node) {
  animar(node, [
    { transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' },
    { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' },
  ], { duration: DURACAO.troca + 80, easing: 'ease-out' });
}

/** Conteúdo novo entra subindo um pouco (confirmação de conexão, aviso da chave). */
export function entrar(node, atraso = 0) {
  animar(node, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
    { duration: DURACAO.entrada, delay: atraso, fill: 'backwards' });
  return node;
}

/** Linha de ações do passo: Voltar à esquerda e UMA ação principal. */
export function acoes({ aoVoltar, extra } = {}, principal) {
  const row = el('div', { class: 'row-actions' });
  if (aoVoltar) row.appendChild(el('button', { class: 'btn ghost', type: 'button', onclick: aoVoltar, text: 'Voltar' }));
  if (extra) row.appendChild(extra);
  if (principal) row.appendChild(principal);
  return row;
}

// Ícones fixos (texto do código, nunca dado da pessoa).
export const SVG_CHECK = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>';
export const SVG_CHECK_GRANDE = '<svg class="sucesso__check" viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle class="sucesso__anel" cx="24" cy="24" r="20"/><path class="sucesso__traco" d="M15 24.5l6.2 6.2L33.5 18"/></svg>';
