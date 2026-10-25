// Saudação de abertura: a parte de tela. ESM, navegador.
//
// A coreografia é toda do CSS (presenca.css) e começa no primeiro quadro em que a tela de
// saudação aparece. Este módulo só: (1) decide se há saudação quando o servidor não marcou
// (painel protegido, depois da senha), (2) avisa o painel do instante em que a cortina começa a
// descer, pra ele desenhar o conteúdo em sequência com ela, (3) pula no clique ou na tecla e
// (4) tira a tela do caminho no fim. As regras e os tempos estão em lib/saudacao.js.

import {
  TEMPOS, chaveDaSaudacao, chaveDaContagem, deveSaudar, deveContar, textoDaSaudacao, saudacaoHtml, classeDaSaudacao,
} from './saudacao.js';
import { menosMovimento, DURACAO } from './movimento.js';
import { safeLogoSrc } from './brand.js';
import { accentText, accentSolid, parseHex, DEFAULT_ACCENT } from './color.js';

// 3.9: a marca vai no localStorage (o aparelho), não só na sessão: a saudação é da primeira visita.
// A marca de sessão continua, porque o script inline (com hash na CSP) ainda lê a de sessão.
function jaSaudou(id) {
  try { return !!(localStorage.getItem(chaveDaSaudacao(id)) || sessionStorage.getItem(chaveDaSaudacao(id))); } catch { return false; }
}
function marcarSaudado(id) {
  try { sessionStorage.setItem(chaveDaSaudacao(id), '1'); } catch { /* sessão bloqueada */ }
  try { localStorage.setItem(chaveDaSaudacao(id), '1'); } catch { /* aparelho bloqueado: saúda de novo na próxima */ }
}
function jaContou(id) {
  try { return !!localStorage.getItem(chaveDaContagem(id)); } catch { return false; }
}
// Depois da primeira contagem, nenhum número conta do zero de novo (nem na troca de aba).
function encerrarContagem(id) {
  document.documentElement.setAttribute('data-sem-contagem', '');
  try { localStorage.setItem(chaveDaContagem(id), '1'); } catch { /* aparelho bloqueado: conta de novo na próxima */ }
}

function preencher(tela, config) {
  const { ola, nome } = textoDaSaudacao(config);
  tela.className = `${classeDaSaudacao(nome)}${tela.classList.contains('saudacao--local') ? ' saudacao--local' : ''}`;
  const olaEl = tela.querySelector('.saudacao__ola');
  const nomeEl = tela.querySelector('.saudacao__nome');
  if (olaEl) olaEl.textContent = ola;
  if (nomeEl) nomeEl.textContent = nome;
  const placa = tela.querySelector('.saudacao__logo');
  const img = tela.querySelector('.saudacao__logo-img');
  const src = safeLogoSrc(config && config.logo);
  if (placa && img) {
    placa.hidden = !src;
    placa.classList.toggle('saudacao__logo--escuro', !!src && config.logoFundo === 'escuro');
    if (src) img.setAttribute('src', src); else img.removeAttribute('src');
  }
}

/**
 * Prepara a abertura da página do painel. Chamar UMA vez, logo que o script carrega.
 * @param {string} id  id do painel
 * @returns {{comConfig:(config:object)=>void, quandoRevelar:(fn:(comCortina:boolean)=>void)=>void, tocando:()=>boolean}}
 */
export function prepararAbertura(id) {
  const root = document.documentElement;
  const tela = document.getElementById('saudacao');
  let estado = 'sem'; // 'sem' | 'tocando' | 'revelada'
  let fila = [];
  let relogio = 0;
  let inicio = 0;
  // Contagem do zero: só na primeira carga deste aparelho. Fora dela, o número final na hora.
  const conta = !!id && deveContar({ jaContou: jaContou(id), menosMovimento: menosMovimento() });
  if (id && !conta) root.setAttribute('data-sem-contagem', '');
  let contagemProgramada = false;
  // Fim da primeira contagem: o painel conta 200 ms depois da primeira peça (dashboard.js) e leva
  // DURACAO.contagem. Depois disso, marca o aparelho e desliga a contagem pro resto da visita.
  const programarFimDaContagem = (espera) => {
    if (!conta || contagemProgramada) return;
    contagemProgramada = true;
    setTimeout(() => encerrarContagem(id), espera + TEMPOS.entradaBase + 200 + DURACAO.contagem + 300);
  };

  const limpar = () => {
    document.removeEventListener('keydown', pular, true);
    if (tela) {
      tela.removeEventListener('pointerdown', pular);
      tela.classList.remove('saudacao--pular');
    }
    root.removeAttribute('data-saudar');
  };
  const revelar = (espera) => {
    if (estado !== 'tocando') return;
    estado = 'revelada';
    clearTimeout(relogio);
    const chamar = fila;
    fila = [];
    for (const fn of chamar) fn(true);
    setTimeout(limpar, espera + 60);
  };
  function pular() {
    if (estado !== 'tocando') return;
    tela.classList.add('saudacao--pular');
    revelar(TEMPOS.pular + 50);
  }
  const tocar = (decorrido) => {
    estado = 'tocando';
    inicio = Date.now() - decorrido;
    marcarSaudado(id);
    tela.addEventListener('pointerdown', pular);
    document.addEventListener('keydown', pular, true);
    relogio = setTimeout(() => revelar(TEMPOS.cortina + TEMPOS.folhaAtraso), Math.max(0, TEMPOS.revelar - decorrido));
  };

  // O script inline já ligou a saudação (o servidor mandou o nome no HTML): a coreografia está
  // correndo desde o primeiro quadro. Descobre quanto já passou pra acertar o relógio.
  if (tela && id && root.hasAttribute('data-saudar') && !menosMovimento()) {
    const folha = tela.querySelector('.saudacao__folha');
    const anim = folha && folha.getAnimations ? folha.getAnimations()[0] : null;
    const decorrido = anim && Number.isFinite(Number(anim.currentTime)) ? Number(anim.currentTime) : 0;
    tocar(decorrido);
  } else if (root.hasAttribute('data-saudar')) {
    root.removeAttribute('data-saudar');
  }

  return {
    /** A config chegou: se o servidor não marcou a saudação e ela vale, começa agora. */
    comConfig(config) {
      if (!tela || estado !== 'sem') return;
      if (!deveSaudar({ config, id, jaSaudou: jaSaudou(id), menosMovimento: menosMovimento() })) return;
      preencher(tela, config);
      root.setAttribute('data-saudar', '');
      tocar(0);
    },
    /** Chama `fn` no instante em que o painel pode aparecer: já, ou quando a cortina começar a descer. */
    quandoRevelar(fn) {
      if (estado === 'tocando') {
        programarFimDaContagem(Math.max(0, TEMPOS.revelar - (Date.now() - inicio)));
        fila.push(fn);
      } else {
        programarFimDaContagem(0);
        fn(false);
      }
    },
    tocando: () => estado === 'tocando',
  };
}

/**
 * Toca a abertura dentro de um trecho da página (a prévia do assistente), com a marca escolhida.
 * @param {HTMLElement} onde
 * @param {object} config   name, saudacao, logo, logoFundo, accent, accent2
 * @param {()=>void} [aoRevelar]  chamado quando a cortina começa a descer
 * @returns {boolean} false quando não tocou (movimento reduzido)
 */
export function tocarAberturaEm(onde, config, aoRevelar) {
  if (!onde || menosMovimento()) return false;
  for (const antiga of onde.querySelectorAll('.saudacao--local')) antiga.remove();
  const molde = document.createElement('div');
  molde.innerHTML = saudacaoHtml({ nome: 'x' });
  const tela = molde.firstChild;
  tela.removeAttribute('id');
  tela.classList.add('saudacao--local');
  preencher(tela, config);
  const cor = parseHex(config && config.accent) ? config.accent : DEFAULT_ACCENT;
  tela.style.setProperty('--accent', cor);
  tela.style.setProperty('--accent-2', parseHex(config && config.accent2) ? config.accent2 : cor);
  tela.style.setProperty('--accent-solido', accentSolid(cor));
  tela.style.setProperty('--saud-ola', accentText(cor, true));
  onde.appendChild(tela);
  setTimeout(() => { if (typeof aoRevelar === 'function') aoRevelar(); }, TEMPOS.revelar);
  setTimeout(() => tela.remove(), TEMPOS.revelar + TEMPOS.folhaAtraso + TEMPOS.cortina + 80);
  return true;
}
