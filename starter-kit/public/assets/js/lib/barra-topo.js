// Barra do topo do painel, no formato de trilha: "Meus painéis / Nome do painel  Área" à
// esquerda e um grupo único de utilidades à direita (tema, copiar link, reconfigurar).
// Funções puras que devolvem texto ou HTML; ligarCopiarLink liga o clique depois de montar.
import { esc } from './html.js';

const AREAS = { marketing: 'Marketing', vendas: 'Vendas', suporte: 'Suporte', financeiro: 'Financeiro', estoque: 'Estoque' };

// Nome da área pra etiqueta ao lado do nome. Área desconhecida não ganha etiqueta inventada.
export function areaDoPainel(dominio) {
  return AREAS[dominio] || '';
}

const ICONE = {
  voltar: '<svg class="trilha-icone" viewBox="0 0 20 20" aria-hidden="true"><path d="M12 4 6 10l6 6"/></svg>',
  link: '<svg class="btn-icone" viewBox="0 0 20 20" aria-hidden="true"><path d="M8.5 11.5a3.2 3.2 0 0 0 4.5 0l2.6-2.6a3.2 3.2 0 0 0-4.5-4.5l-.9.9M11.5 8.5a3.2 3.2 0 0 0-4.5 0l-2.6 2.6a3.2 3.2 0 0 0 4.5 4.5l.9-.9"/></svg>',
  ajustes: '<svg class="btn-icone" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h7M14 6h3M3 14h3M10 14h7"/><circle cx="12" cy="6" r="2"/><circle cx="8" cy="14" r="2"/></svg>',
};

// Começo da trilha: o caminho de volta pra lista de painéis, antes do nome.
export function trilhaHtml() {
  return `<a class="trilha-volta" href="/" aria-label="Voltar para meus painéis">${ICONE.voltar}<span class="trilha-texto">Meus painéis</span></a><span class="trilha-sep" aria-hidden="true">/</span>`;
}

// Utilidades da barra. Grupo de abas não tem "Reconfigurar" (o assistente ainda não edita grupo).
export function acoesHtml({ id, grupo = false } = {}) {
  const config = `/config.html?id=${encodeURIComponent(id || '')}`;
  const copiar = `<button type="button" class="btn-barra" data-copiar-link aria-label="Copiar o link deste painel">${ICONE.link}<span class="btn-texto">Copiar link</span></button>`;
  const reconfigurar = grupo ? '' : `<a class="btn-barra" href="${esc(config)}" aria-label="Reconfigurar este painel">${ICONE.ajustes}<span class="btn-texto">Reconfigurar</span></a>`;
  return copiar + reconfigurar;
}

// Liga o botão "Copiar link": copia o endereço da página e confirma no próprio botão.
export function ligarCopiarLink(raiz, endereco) {
  const botao = raiz && raiz.querySelector('[data-copiar-link]');
  if (!botao) return;
  const texto = botao.querySelector('.btn-texto');
  const original = texto ? texto.textContent : '';
  botao.addEventListener('click', async () => {
    let ok = true;
    try { await navigator.clipboard.writeText(endereco); } catch { ok = false; }
    if (texto) texto.textContent = ok ? 'Link copiado' : 'Copie da barra de endereço';
    botao.toggleAttribute('data-copiado', ok);
    setTimeout(() => {
      if (texto) texto.textContent = original;
      botao.removeAttribute('data-copiado');
    }, 1800);
  });
}

/** A página saiu do topo? Pura: um respiro de 8 px evita piscar com o tremor da rolagem. */
export function paginaRolada(scrollY) {
  return Number(scrollY) > 8;
}

/** Põe `is-rolado` na barra fixa quando a página sai do topo (o CSS a deixa opaca). Devolve quem desliga. */
export function ligarBarraSolida(barra) {
  if (!barra || typeof window === 'undefined') return () => {};
  let esperando = false;
  const atualizar = () => { esperando = false; barra.classList.toggle('is-rolado', paginaRolada(window.scrollY)); };
  const aoRolar = () => { if (!esperando) { esperando = true; requestAnimationFrame(atualizar); } };
  window.addEventListener('scroll', aoRolar, { passive: true });
  atualizar();
  return () => window.removeEventListener('scroll', aoRolar);
}
