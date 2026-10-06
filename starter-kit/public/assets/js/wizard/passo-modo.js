// Presença do painel no passo "Deixe com a sua cara": a escolha do modo (claro, escuro ou
// acompanhar o aparelho de quem abre), com duas amostras lado a lado do painel DA PESSOA nos
// dois modos e uma sugestão que vem marcada, e os campos de "Mais opções" (quem o painel
// cumprimenta, saudação e movimento do fundo). A regra da sugestão é pura e testada
// (lib/modo-sugerido.js); quem decide é a pessoa.

import { el, campo } from './dom.js';
import { sugerirModo } from '../lib/modo-sugerido.js';
import { desenharAmostra } from '../lib/amostra-de-modo.js';
import { LIMITE_DA_SAUDACAO } from '../lib/saudacao.js';

const NOMES = { claro: 'Modo claro', escuro: 'Modo escuro' };

/**
 * @param {{state:object, configAtual:()=>object, aoMudar:()=>void}} p
 *   configAtual: a config que a prévia está desenhando (cor, logotipo e nome de agora).
 * @returns {{el:HTMLElement, atualizar:()=>void}}  atualizar redesenha as amostras e a sugestão
 */
export function criarEscolhaDeModo({ state, configAtual, aoMudar }) {
  const opcoes = {};
  const amostras = el('div', { class: 'modo__amostras' });
  for (const modo of ['claro', 'escuro']) {
    const entrada = el('input', { class: 'so-leitor', type: 'radio', name: 'dashModo', value: modo, id: `dashModo-${modo}` });
    const amostra = el('span', { class: 'modo__amostra', 'aria-hidden': 'true' });
    const sugerido = el('span', { class: 'modo__sugerido', text: 'Sugerido para a sua marca', hidden: true });
    const opcao = el('label', { class: 'modo__opcao', for: entrada.id, 'data-modo': modo }, [
      entrada, amostra, el('span', { class: 'modo__nome', text: NOMES[modo] }), sugerido,
    ]);
    opcoes[modo] = { opcao, entrada, amostra, sugerido };
    amostras.appendChild(opcao);
  }
  const auto = el('input', { id: 'dashModo-auto', type: 'radio', name: 'dashModo', value: 'auto' });
  const motivo = el('p', { class: 'hint modo__motivo', role: 'status' });

  function marcar() {
    const atual = state.tema === 'claro' || state.tema === 'escuro' ? state.tema : 'auto';
    for (const modo of ['claro', 'escuro']) {
      opcoes[modo].entrada.checked = atual === modo;
      opcoes[modo].opcao.classList.toggle('is-escolhida', atual === modo);
    }
    auto.checked = atual === 'auto';
  }
  function atualizar() {
    const config = configAtual();
    for (const modo of ['claro', 'escuro']) desenharAmostra(opcoes[modo].amostra, config, state.dataset, modo);
    const sugestao = sugerirModo({ accent: state.accent, logoFundo: state.logo ? state.logoFundo : '' });
    for (const modo of ['claro', 'escuro']) opcoes[modo].sugerido.hidden = sugestao.modo !== modo;
    motivo.textContent = `Sugestão: ${NOMES[sugestao.modo].toLowerCase()}. ${sugestao.motivo} A escolha é sua.`;
    marcar();
  }
  const escolher = (modo) => { state.tema = modo; marcar(); aoMudar(); };
  for (const modo of ['claro', 'escuro']) opcoes[modo].entrada.addEventListener('change', () => escolher(modo));
  auto.addEventListener('change', () => escolher('auto'));

  const grupo = el('fieldset', { class: 'campo modo', id: 'modoDoPainel' }, [
    el('legend', { class: 'campo__rotulo', text: 'Modo do painel' }),
    amostras,
    el('label', { class: 'marcar modo__auto', for: 'dashModo-auto' }, [auto, el('span', { text: 'Acompanhar o aparelho de quem abre' })]),
    motivo,
    el('p', { class: 'hint', text: 'Quem abre o painel pode trocar o modo no botão do topo. A troca vale só para ela.' }),
  ]);
  // As amostras são reduzidas pela largura da caixa: redesenha quando a caixa muda de tamanho.
  if (typeof ResizeObserver === 'function') {
    let largura = 0;
    new ResizeObserver(() => {
      const nova = opcoes.claro.amostra.clientWidth;
      if (nova && nova !== largura) { largura = nova; atualizar(); }
    }).observe(amostras);
  }
  return { el: grupo, atualizar };
}

/**
 * Campos de presença que ficam em "Mais opções".
 * @param {{state:object, aoMudar:()=>void}} p
 * @returns {HTMLElement[]}
 */
export function criarCamposDePresenca({ state, aoMudar }) {
  const nome = el('input', { class: 'input', type: 'text', maxlength: String(LIMITE_DA_SAUDACAO), placeholder: 'Ex.: Carla', value: state.saudacao || '' });
  nome.addEventListener('input', () => { state.saudacao = nome.value; aoMudar(); });
  const saudar = el('input', { id: 'dashSaudacaoLigada', type: 'checkbox' });
  saudar.checked = state.saudacaoLigada !== false;
  saudar.addEventListener('change', () => { state.saudacaoLigada = saudar.checked; nome.disabled = !saudar.checked; aoMudar(); });
  nome.disabled = !saudar.checked;
  const mover = el('input', { id: 'dashFundoAnimado', type: 'checkbox' });
  mover.checked = state.fundoAnimado !== false;
  mover.addEventListener('change', () => { state.fundoAnimado = mover.checked; aoMudar(); });
  return [
    el('div', { class: 'campo presenca' }, [
      el('label', { class: 'marcar', for: 'dashSaudacaoLigada' }, [saudar, el('span', { text: 'Cumprimentar quem abre o painel' })]),
      campo({
        id: 'dashSaudacao', rotulo: 'Quem o painel cumprimenta (opcional)', controle: nome,
        dica: 'Ao abrir, o painel diz "Olá," e este nome. Em branco, ele usa o nome do painel.',
      }),
    ]),
    el('div', { class: 'campo presenca' }, [
      el('label', { class: 'marcar', for: 'dashFundoAnimado' }, [mover, el('span', { text: 'Fundo com movimento' })]),
      el('p', { class: 'hint', text: 'O fundo do painel leva a cor da sua marca e se move devagar. Desmarcado, ele fica parado.' }),
    ]),
  ];
}
