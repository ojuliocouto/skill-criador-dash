// Saudação de abertura do painel: a parte pura. ESM.
// Quem o painel cumprimenta, quando a saudação aparece, o HTML da tela e os tempos da
// coreografia (espelho dos tokens --saud-* do presenca.css; há teste de paridade).

import { esc } from './html.js';
import { safeLogoSrc } from './brand.js';

export const LIMITE_DA_SAUDACAO = 40;
const CONTROLE = /[\u0000-\u001f\u007f]/;

// Em milissegundos, contados do primeiro quadro da saudação.
//   texto        cada peça (logotipo, "Olá,", nome) sobe e aparece
//   linhaInicio  a linha da marca começa a se desenhar embaixo do nome
//   linha        quanto ela leva pra se completar (é o tempo de ler o nome)
//   revelar      a cortina começa a descer e o painel começa a entrar
//   cortina      quanto a cortina leva pra sair da tela
//   folhaAtraso  a folha na cor da marca desce logo atrás da cortina
//   pular        no clique ou na tecla, a saída é esta (curta)
//   entradaBase  atraso da primeira peça do painel depois de a cortina começar a descer
//   entrada      da primeira à última peça do painel parada (faixa, abas, números, gráficos)
export const TEMPOS = Object.freeze({
  texto: 440, linhaInicio: 300, linha: 900, revelar: 1300, cortina: 560, folhaAtraso: 90, pular: 220,
  entradaBase: 120, entrada: 1100,
});

/** Do primeiro quadro da saudação até a última peça do painel parada. */
export function duracaoDaAbertura() {
  const cortina = TEMPOS.revelar + TEMPOS.folhaAtraso + TEMPOS.cortina;
  const painel = TEMPOS.revelar + TEMPOS.entradaBase + TEMPOS.entrada;
  return Math.max(cortina, painel);
}

/** Texto pronto pra gravar: espaços aparados e colapsados, cortado no limite. */
export function limparSaudacao(v) {
  if (typeof v !== 'string') return '';
  return v.replace(/\s+/g, ' ').trim().slice(0, LIMITE_DA_SAUDACAO).trim();
}

/** Mesma regra do servidor (functions/lib/aparencia-shape.mjs). */
export function saudacaoValida(v) {
  return typeof v === 'string' && v.trim().length >= 1 && v.length <= LIMITE_DA_SAUDACAO
    && !/[<>]/.test(v) && !CONTROLE.test(v);
}

/** O nome escolhido pelo dono; sem ele (ou se não serve), o nome do painel. */
export function quemCumprimentar(config) {
  const c = config && typeof config === 'object' ? config : {};
  if (saudacaoValida(c.saudacao)) return limparSaudacao(c.saudacao);
  return typeof c.name === 'string' ? c.name.trim() : '';
}

/** @returns {{ola:string, nome:string}} o "Olá," vai na cor da marca */
export function textoDaSaudacao(config) {
  const nome = quemCumprimentar(config);
  return { ola: nome ? 'Olá,' : 'Olá', nome };
}

/**
 * Porte do texto: nome curto vai enorme; nome comprido encolhe pra caber em poucas linhas.
 * Mesma régua no servidor (functions/lib/abertura-do-painel.mjs), com teste de paridade.
 * @returns {''|'media'|'longa'}
 */
export function porteDaSaudacao(nome) {
  const n = String(nome == null ? '' : nome).length;
  if (n <= 12) return '';
  return n <= 24 ? 'media' : 'longa';
}

/** Classe da tela de saudação pro porte do nome. */
export function classeDaSaudacao(nome) {
  const porte = porteDaSaudacao(nome);
  return `saudacao${porte ? ` saudacao--${porte}` : ''}`;
}

export function chaveDaSaudacao(id) {
  return `cd-saudou:${id}`;
}

/**
 * Mostra a saudação? Nasce ligada (painel antigo, sem o campo, saúda), uma vez por sessão do
 * navegador por painel, e nunca pra quem pediu menos movimento.
 * @param {{config:object|null, id:string, jaSaudou:boolean, menosMovimento:boolean}} p
 */
export function deveSaudar({ config, id, jaSaudou, menosMovimento } = {}) {
  if (!config || typeof config !== 'object' || !id) return false;
  if (config.saudacaoLigada === false) return false;
  if (menosMovimento || jaSaudou) return false;
  return quemCumprimentar(config) !== '';
}

/**
 * Tela de saudação. Duas folhas: a da frente (escura, com o logotipo e o texto) e a de trás
 * (na cor da marca), que descem uma depois da outra e revelam o painel de cima pra baixo.
 * É enfeite de abertura (aria-hidden): o leitor de tela vai direto pro painel.
 * @param {{nome?:string, logo?:unknown, logoFundo?:string, comVirgula?:boolean}} [p]
 */
export function saudacaoHtml({ nome = '', logo, logoFundo, comVirgula = false } = {}) {
  const src = safeLogoSrc(logo);
  const escuro = logoFundo === 'escuro' ? ' saudacao__logo--escuro' : '';
  return (
    `<div class="${classeDaSaudacao(nome)}" id="saudacao" aria-hidden="true">` +
      `<div class="saudacao__marca"></div>` +
      `<div class="saudacao__folha">` +
        `<div class="saudacao__brilho"></div>` +
        `<div class="saudacao__centro">` +
          `<span class="saudacao__logo${escuro}"${src ? '' : ' hidden'}><img class="saudacao__logo-img" alt=""${src ? ` src="${esc(src)}"` : ''} /></span>` +
          `<p class="saudacao__frase">` +
            `<span class="saudacao__mascara"><span class="saudacao__ola">${nome || comVirgula ? 'Olá,' : 'Olá'}</span></span> ` +
            `<span class="saudacao__mascara"><span class="saudacao__nome">${esc(nome)}</span></span>` +
          `</p>` +
          `<span class="saudacao__linha"></span>` +
        `</div>` +
      `</div>` +
    `</div>`
  );
}
