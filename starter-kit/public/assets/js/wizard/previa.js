// Prévia ao vivo do passo "Deixe com a sua cara": o painel DE VERDADE (renderDashboard, a
// mesma função da página do painel), com os dados da pessoa e as escolhas atuais.
//
// Em tela larga a prévia fica ao lado do formulário: o painel é desenhado numa largura fixa de
// computador e reduzido por transform (uma miniatura fiel, não um layout espremido). Em tela
// estreita ela vai abaixo, em tamanho real.
//
// A cor e o modo escolhidos valem só dentro da prévia (.escopo-de-cor e data-theme no
// main.css): o assistente em volta não muda. A prévia também mostra o fundo vivo na cor
// escolhida e toca a abertura (a saudação) quando a pessoa pede. Ao redesenhar, a imagem
// anterior fica por cima e some em fade (só opacity), então mudar cor, modo ou número em
// destaque transiciona em vez de piscar.

import { renderDashboard, templateDoPainel } from '../dashboard.js';
import { DEFAULT_ACCENT } from '../lib/color.js';
import { aplicarMarca } from '../lib/marca.js';
import { montarFundo, moverFundo } from '../lib/fundo.js';
import { temaDoModo } from '../lib/tema-inicial.js';
import { tocarAberturaEm } from '../lib/abertura.js';
import { TEMPOS } from '../lib/saudacao.js';
import { el, limpar } from './dom.js';
import { animar, menosMovimento, DURACAO } from '../lib/movimento.js';

// 1240: a largura em que a tabela resumida ainda aparece como tabela (abaixo disso o cartão dela
// vira blocos empilhados) e a faixa de indicadores fica como no painel aberto num computador.
const LARGURA_DE_COMPUTADOR = 1240;
const LADO_A_LADO = '(min-width: 1100px)';

/**
 * @param {HTMLElement} moldura  caixa onde a prévia aparece
 * @returns {{atualizar:(config:object, dataset:object)=>void, tocarAbertura:()=>boolean, desligar:()=>void}}
 */
export function criarPrevia(moldura) {
  const palco = el('div', { class: 'previa__palco escopo-de-cor' });
  const escala = el('div', { class: 'previa__escala' }, [palco]);
  limpar(moldura).appendChild(escala);
  let painel = null;
  let primeira = true;
  let ultima = null;
  let fantasmaAtual = null;

  const ladoALado = () => window.matchMedia(LADO_A_LADO).matches;
  const paginaEscura = () => document.documentElement.dataset.theme !== 'light';
  // O modo da prévia é o que a pessoa escolheu; com "acompanhar o aparelho", o da página.
  const escuroNa = (config) => {
    const tema = temaDoModo(config && config.tema);
    return tema ? tema === 'dark' : paginaEscura();
  };
  // Fundo vivo dentro da moldura, atrás do painel.
  montarFundo(moldura, { local: true });

  function ajustar() {
    if (ladoALado()) {
      const fator = Math.min(1, moldura.clientWidth / LARGURA_DE_COMPUTADOR);
      escala.style.width = `${LARGURA_DE_COMPUTADOR}px`;
      escala.style.transform = `scale(${fator})`;
      moldura.style.height = `${Math.ceil(palco.offsetHeight * fator)}px`;
    } else {
      escala.style.width = '';
      escala.style.transform = '';
      moldura.style.height = '';
    }
  }

  function desenhar(config, dataset, extra = {}) {
    ultima = { config, dataset };
    const template = templateDoPainel(config);
    if (!template || !dataset) return;
    const escuro = escuroNa(config);
    const tema = escuro ? 'dark' : 'light';
    // A imagem de antes fica por cima e some: quem redesenha por baixo não pisca.
    if (!primeira && !extra.abertura && !menosMovimento()) {
      if (fantasmaAtual) fantasmaAtual.remove();
      const fantasma = palco.cloneNode(true);
      fantasma.className = 'previa__fantasma escopo-de-cor';
      fantasma.style.cssText = palco.style.cssText; // leva a cor ANTIGA junto (e o modo antigo vai no data-theme clonado)
      fantasma.setAttribute('aria-hidden', 'true');
      fantasma.inert = true;
      for (const n of fantasma.querySelectorAll('[id]')) n.removeAttribute('id');
      escala.appendChild(fantasma);
      fantasmaAtual = fantasma;
      animar(fantasma, [{ opacity: 1 }, { opacity: 0 }], { duration: DURACAO.troca, fill: 'forwards' });
      setTimeout(() => { fantasma.remove(); if (fantasmaAtual === fantasma) fantasmaAtual = null; }, DURACAO.troca + 30);
    }
    // Modo e cor valem no palco (o painel) e na moldura (o fundo dela e o fundo vivo).
    for (const alvo of [moldura, palco]) {
      alvo.setAttribute('data-theme', tema);
      aplicarMarca(alvo, config.accent || DEFAULT_ACCENT, escuro, config.accent2 || '');
    }
    moverFundo(config.fundoAnimado !== false, moldura);
    ajustar();
    const aba = painel ? painel.abaAtiva() : null;
    painel = renderDashboard(palco, { config, template, dataset, colMap: config.colMap || {} }, {
      previa: true, abaInicial: aba, semEntrada: !primeira && !extra.abertura,
      modo: extra.abertura ? 'abertura' : undefined, atrasoDaAbertura: extra.abertura ? TEMPOS.entradaBase : 0,
      larguraDaTela: ladoALado() ? LARGURA_DE_COMPUTADOR : undefined,
    });
    primeira = false;
    ajustar();
  }

  // A altura do painel muda (troca de aba, fonte que carrega): a moldura acompanha.
  const observador = typeof ResizeObserver === 'function' ? new ResizeObserver(() => ajustar()) : null;
  if (observador) { observador.observe(palco); observador.observe(moldura); }
  // Só redesenha quando o modo MUDOU de verdade (o navegador avisa também em mudanças que não
  // trocam nada, e redesenhar à toa faria a prévia piscar).
  let modo = ladoALado();
  const aoMudarLargura = () => {
    if (ladoALado() === modo) { ajustar(); return; }
    modo = ladoALado();
    if (ultima) desenhar(ultima.config, ultima.dataset);
  };
  const mq = window.matchMedia(LADO_A_LADO);
  mq.addEventListener('change', aoMudarLargura);
  // Trocou o modo da página: a prévia que acompanha o aparelho é recalibrada pro fundo novo.
  let temaAtual = paginaEscura();
  const tema = new MutationObserver(() => {
    if (paginaEscura() === temaAtual) return;
    temaAtual = paginaEscura();
    if (ultima) desenhar(ultima.config, ultima.dataset);
  });
  tema.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  return {
    atualizar: desenhar,
    /** Toca a saudação dentro da moldura e, quando a cortina desce, o painel entra de novo. */
    tocarAbertura() {
      if (!ultima) return false;
      const { config, dataset } = ultima;
      moldura.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return tocarAberturaEm(moldura, config, () => { primeira = true; desenhar(config, dataset, { abertura: true }); });
    },
    desligar() {
      if (observador) observador.disconnect();
      mq.removeEventListener('change', aoMudarLargura);
      tema.disconnect();
    },
  };
}
