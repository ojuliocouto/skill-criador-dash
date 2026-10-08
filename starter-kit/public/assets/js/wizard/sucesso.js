// Tela de sucesso: o link do painel, copiar, abrir e criar outro. Antes o assistente só
// redirecionava pro painel e a pessoa ficava sem o link na mão. O fechamento é um check que
// se desenha e o conteúdo que entra em sequência curta (sem confete, sem emoji).

import { el, limpar, campo, entrar, SVG_CHECK_GRANDE } from './dom.js';
import { textoDaEntrega } from '../lib/entrega-texto.js';

async function copiar(texto, entrada) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(texto); return true; }
  } catch { /* cai no jeito antigo */ }
  try {
    entrada.focus();
    entrada.select();
    return document.execCommand('copy');
  } catch { return false; }
}

/**
 * @param {HTMLElement} corpo
 * @param {{id:string, nome:string, editando:boolean, comSenha:boolean}} p
 */
export function renderSucesso(corpo, { id, nome, editando, comSenha }) {
  limpar(corpo);
  const caminho = `/dashboard.html?id=${encodeURIComponent(id)}`;
  const link = `${window.location.origin}${caminho}`;
  const entrada = el('input', { class: 'input sucesso__link', type: 'text', readonly: true, value: link });
  entrada.addEventListener('focus', () => entrada.select());
  const retorno = el('p', { class: 'hint sucesso__retorno', role: 'status' });
  const marca = el('div', { class: 'sucesso__marca' });
  marca.innerHTML = SVG_CHECK_GRANDE;
  // O que a tela promete depende de onde o endereço está: localhost não é "no ar".
  const dito = textoDaEntrega({ host: window.location.hostname, nome, editando, comSenha });
  const titulo = el('h2', { class: 'sucesso__titulo', tabindex: '-1', text: dito.titulo });

  const btnCopiar = el('button', { class: 'btn ghost', type: 'button', text: 'Copiar link' });
  btnCopiar.addEventListener('click', async () => {
    const ok = await copiar(link, entrada);
    retorno.textContent = ok ? 'Link copiado. É só colar onde quiser mandar.' : 'Não deu para copiar sozinho. Selecione o link acima e copie.';
    entrar(retorno);
  });

  const blocos = [
    marca,
    titulo,
    el('p', { class: 'sucesso__texto', text: dito.texto }),
    ...(dito.proximoPasso ? [el('p', { class: 'hint sucesso__proximo', text: dito.proximoPasso })] : []),
    campo({ id: 'linkDoPainel', rotulo: 'Link do painel', controle: entrada }),
    el('div', { class: 'row-actions sucesso__acoes' }, [
      el('a', { class: 'btn', id: 'abrirPainel', href: caminho, text: 'Abrir painel' }),
      btnCopiar,
      el('a', { class: 'btn ghost', href: '/config.html', text: 'Criar outro' }),
    ]),
    retorno,
  ];
  const cartao = el('div', { class: 'card sucesso' }, blocos);
  corpo.appendChild(cartao);
  blocos.slice(1).forEach((b, i) => entrar(b, 120 + i * 60));
  titulo.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
