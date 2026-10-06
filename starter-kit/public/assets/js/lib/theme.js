// Modo claro e escuro. Aplica o modo com que a página abre, monta o fundo vivo e injeta o botão
// de alternar na barra do topo. ESM. Basta incluir <script type="module" src=".../lib/theme.js">.
//
// Quem decide o modo inicial (regra pura e testada em lib/tema-inicial.js; o script inline das
// páginas decide a MESMA coisa antes do primeiro quadro pintado):
//   1. a escolha do visitante naquele painel;
//   2. o modo que o dono do painel escolheu (o servidor marca em <html data-modo>);
//   3. a escolha geral guardada no navegador e, por fim, o sistema.
// O botão guarda a escolha do visitante só pra ele: no painel aberto, vale só praquele painel;
// na lista e no assistente, é a escolha geral.

import { DEFAULT_ACCENT } from './color.js';
import { aplicarMarca } from './marca.js';
import { montarFundo } from './fundo.js';
import { revelarModo } from './transicao.js';
import {
  CHAVE_GERAL, chaveDoTemaDoPainel, chaveParaGuardar, idDoPainelNaUrl, resolverTemaInicial, temaDoModo,
} from './tema-inicial.js';

const noNavegador = typeof document !== 'undefined';
const idDoPainel = noNavegador ? idDoPainelNaUrl(window.location.pathname, window.location.search) : null;

const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

function guardado(chave) {
  try { return chave ? localStorage.getItem(chave) : null; } catch { return null; }
}

function preferido() {
  let sistemaClaro = false;
  try { sistemaClaro = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches); } catch { /* ignora */ }
  return resolverTemaInicial({
    escolhaNoPainel: guardado(chaveDoTemaDoPainel(idDoPainel)),
    modoDoPainel: document.documentElement.getAttribute('data-modo'),
    escolhaGeral: guardado(CHAVE_GERAL),
    sistemaClaro,
  });
}

function aplicar(tema) {
  const root = document.documentElement;
  root.dataset.theme = tema;
  // Recalibra as cores derivadas da cor da marca pro modo novo (texto, anel de foco, gráfico) e
  // o fundo vivo. A cor atual vem do dataset (gravado pelo painel ou pelo assistente) ou da
  // variável --accent que o servidor já mandou no HTML; sem nenhuma, a cor padrão.
  const custom = root.dataset.accent;
  const cssAccent = root.style.getPropertyValue('--accent').trim();
  aplicarMarca(root, custom || cssAccent || DEFAULT_ACCENT, tema !== 'light');
}

let redesenharBotao = () => {};

/**
 * O painel chama quando a configuração chega: se o dono escolheu um modo e o servidor não tinha
 * marcado (painel protegido por senha, por exemplo), o modo passa a valer agora. A escolha do
 * visitante naquele painel continua ganhando.
 * @param {string|undefined} modo  config.tema
 */
export function sincronizarModoDoPainel(modo) {
  if (!noNavegador) return;
  const root = document.documentElement;
  if (temaDoModo(modo)) root.setAttribute('data-modo', modo); else root.removeAttribute('data-modo');
  const tema = preferido();
  if (root.dataset.theme !== tema) {
    aplicar(tema);
    redesenharBotao();
  }
}

function montarBotao() {
  const bar = document.querySelector('.topbar');
  if (!bar || bar.querySelector('.theme-toggle')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'theme-toggle';

  const desenhar = () => {
    // Mostra o ícone do que vai virar ao clicar: no escuro, um sol (ir pro claro).
    const claro = document.documentElement.dataset.theme === 'light';
    btn.innerHTML = claro ? MOON : SUN;
    // Rótulo e título dizem pra onde o clique leva, não o estado atual.
    const alvo = claro ? 'Mudar para o modo escuro' : 'Mudar para o modo claro';
    btn.setAttribute('aria-label', alvo);
    btn.setAttribute('title', alvo);
    // aria-pressed = modo claro ligado.
    btn.setAttribute('aria-pressed', String(claro));
  };
  redesenharBotao = desenhar;

  btn.addEventListener('click', () => {
    const proximo = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(chaveParaGuardar(idDoPainel), proximo); } catch { /* ignora */ }
    // O modo novo abre num círculo a partir do botão (ou num véu, onde o navegador não tem a
    // transição de página). O valor já foi guardado: recarregar no meio não perde a escolha.
    revelarModo(btn, proximo === 'dark', () => { aplicar(proximo); desenhar(); });
  });

  // Entra no grupo de utilidades (junto de Copiar link e Reconfigurar); sem grupo, no fim da barra.
  const actions = bar.querySelector('.actions');
  if (actions) actions.prepend(btn); else bar.append(btn);
  desenhar();
}

if (noNavegador) {
  // Aplica o quanto antes (o script inline já marcou o modo; aqui entram as cores calibradas).
  aplicar(preferido());
  const pronto = () => { montarFundo(); montarBotao(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pronto); else pronto();
}
