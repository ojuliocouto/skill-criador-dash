// Raiz do site sem a chave de administrador (3.9.0, achado 6 da auditoria). ESM, puro.
//
// A lista de painéis passou a exigir a chave de administrador: antes ela entregava todo painel sem senha
// para qualquer um que abrisse a raiz do site. Quem recebeu o link de um painel continua abrindo direto
// por ele. Aqui fica só o texto da tela que pede a chave (a página liga os eventos em index-page.js).
import { esc } from './html.js';

const COMANDO = 'wrangler pages secret put ADMIN_TOKEN --project-name=&lt;seu-projeto&gt;';

/**
 * @param {{semConfig?:boolean, motivo?:string}} [opts]
 *   semConfig: o servidor não tem ADMIN_TOKEN (escrever a chave aqui não resolve).
 *   motivo: mensagem de erro da última tentativa (ex.: a chave não confere).
 * @returns {string} HTML
 */
export function pedidoDeChaveDaListaHtml({ semConfig = false, motivo = '' } = {}) {
  if (semConfig) {
    return `<div class="card empty-state" role="alert">` +
      `<h2 class="titulo-estado">Este site ainda não tem chave de administrador</h2>` +
      `<p class="subtitle">A lista de painéis só abre com ela. Quem instalou o site precisa definir ADMIN_TOKEN no servidor: no seu computador, uma linha ADMIN_TOKEN=sua-chave no arquivo .dev.vars; no site publicado, o comando abaixo, e publicar de novo.</p>` +
      `<p><code>${COMANDO}</code></p>` +
      `<p class="hint">Quem recebeu o link de um painel abre direto por ele, sem a lista.</p>` +
    `</div>`;
  }
  return `<div class="card empty-state">` +
    `<h2 class="titulo-estado">A lista de painéis é só de quem administra este site</h2>` +
    `<p class="subtitle">Quem recebeu o link de um painel abre direto por ele. Para ver todos os painéis, cole a chave de administrador: o valor de ADMIN_TOKEN no arquivo .dev.vars (site no seu computador) ou nas variáveis secretas do projeto na Cloudflare (site publicado).</p>` +
    `<div style="max-width:320px;margin:18px auto 0;display:flex;flex-direction:column;gap:10px">` +
      `<label class="lbl-senha" for="chaveLista">Chave de administrador</label>` +
      `<input id="chaveLista" class="input" type="password" autocomplete="off" />` +
      `<button id="chaveListaBtn" class="btn" type="button">Ver os painéis</button>` +
      `<p class="error" id="chaveListaErr" role="alert">${esc(motivo)}</p>` +
    `</div>` +
  `</div>`;
}
