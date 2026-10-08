// Senha pedida DENTRO da aba de um grupo. Um painel com senha pode ser aba de um grupo: a aba mostra o campo,
// a pessoa digita, e o painel abre ali mesmo (antes era um beco sem saída, "não pode ser embutida no grupo").
// A parte pura (o HTML) é testada em node; a ligação com o DOM é pequena e provada no navegador
// (scripts/test-grupo-no-navegador.cjs). A senha vira SHA-256 antes de sair do navegador e fica só na sessão.

import { sha256Hex } from './auth.js';
import { setDashboardAuth } from './api-client.js';

/**
 * HTML do pedido de senha da aba.
 * @param {{ jaTentou?: boolean }} [o] jaTentou: já havia uma senha guardada (errada) nesta sessão
 * @returns {string}
 */
export function pedidoDeSenhaDaAbaHtml({ jaTentou = false } = {}) {
  return `<div class="empty-state aba-senha">` +
    `<h2>Esta aba tem senha</h2>` +
    `<p class="subtitle">Digite a senha deste painel para abrir a aba.</p>` +
    `<div style="max-width:320px;margin:18px auto 0;display:flex;flex-direction:column;gap:10px">` +
      `<input id="abaSenha" class="input" type="password" placeholder="Senha" aria-label="Senha do painel desta aba" autocomplete="current-password" />` +
      `<button id="abaSenhaBtn" class="btn" type="button">Abrir a aba</button>` +
      `<p class="error" id="abaSenhaErro" role="alert">${jaTentou ? 'Senha incorreta. Tente de novo.' : ''}</p>` +
    `</div>` +
  `</div>`;
}

/**
 * Desenha o pedido de senha dentro de `painel` e, ao enviar, guarda o hash na sessão e chama `tentarDeNovo`.
 * @param {HTMLElement} painel
 * @param {string} id id do painel protegido (a aba)
 * @param {() => void} tentarDeNovo recarrega a aba
 */
export function pedirSenhaNaAba(painel, id, tentarDeNovo) {
  let jaTentou = false;
  try { jaTentou = !!sessionStorage.getItem(`dashauth:${id}`); } catch { /* sem sessionStorage */ }
  painel.innerHTML = pedidoDeSenhaDaAbaHtml({ jaTentou });
  const campo = painel.querySelector('#abaSenha');
  const botao = painel.querySelector('#abaSenhaBtn');
  const enviar = async () => {
    if (!campo.value) { campo.focus(); return; }
    botao.disabled = true;
    setDashboardAuth(id, await sha256Hex(campo.value));
    tentarDeNovo();
  };
  botao.addEventListener('click', enviar);
  campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); });
  campo.focus();
}
