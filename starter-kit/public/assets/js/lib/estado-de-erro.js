// Estado de erro do painel: o que aconteceu, o que fazer e "Tentar de novo". Nunca tela vazia.
// ESM, puro (monta string HTML já escapada). Quem liga o clique do botão é o dashboard.js.

import { esc } from './html.js';

const PADRAO = {
  dados: {
    titulo: 'Não deu para carregar os números',
    mensagem: 'A fonte dos números não respondeu.',
    oQueFazer: 'Clique em Tentar de novo. Se continuar, confira se a planilha ou o arquivo ainda está no lugar e se o link continua aberto para leitura.',
  },
  painel: {
    titulo: 'Não deu para abrir este painel',
    mensagem: 'A configuração do painel não chegou.',
    oQueFazer: 'Clique em Tentar de novo. Se continuar, confira o endereço ou volte à lista de painéis.',
  },
};
const SEM_REDE = 'Não deu para falar com o servidor: a conexão caiu ou a internet está fora.';
const O_QUE_FAZER_SEM_REDE = 'Confira a sua internet e clique em Tentar de novo. Nada do painel foi perdido.';

/**
 * Traduz uma falha em texto de tela.
 * @param {Error|null} err
 * @param {'dados'|'painel'} contexto  o que estava sendo buscado
 * @returns {{titulo:string, mensagem:string, oQueFazer:string}}
 */
export function explicarFalha(err, contexto = 'dados') {
  const base = PADRAO[contexto] || PADRAO.dados;
  const texto = err && typeof err.message === 'string' ? err.message.trim() : '';
  // O navegador lança TypeError quando a requisição nem sai (sem rede, servidor fora do ar).
  const semRede = (err && err.name === 'TypeError') || /failed to fetch|networkerror|load failed/i.test(texto);
  if (semRede) return { titulo: base.titulo, mensagem: SEM_REDE, oQueFazer: O_QUE_FAZER_SEM_REDE };
  return { titulo: base.titulo, mensagem: texto || base.mensagem, oQueFazer: base.oQueFazer };
}

/**
 * @param {{titulo?:string, mensagem?:string, oQueFazer?:string, acao?:{href:string,label:string}, tentar?:boolean}} [p]
 * @returns {string}
 */
export function erroHtml({ titulo, mensagem, oQueFazer, acao, tentar = true } = {}) {
  const t = titulo || PADRAO.dados.titulo;
  const m = mensagem || PADRAO.dados.mensagem;
  const f = oQueFazer || PADRAO.dados.oQueFazer;
  const botao = tentar ? `<button class="btn" type="button" data-tentar>Tentar de novo</button>` : '';
  const link = acao && acao.href ? `<a class="btn ghost" href="${esc(acao.href)}">${esc(acao.label || 'Voltar')}</a>` : '';
  return (
    `<div class="card estado-erro" role="alert">` +
      `<h2 class="estado-erro__titulo">${esc(t)}</h2>` +
      `<p class="estado-erro__mensagem">${esc(m)}</p>` +
      `<p class="estado-erro__fazer">${esc(f)}</p>` +
      `<div class="row-actions estado-erro__acoes">${botao}${link}</div>` +
    `</div>`
  );
}
