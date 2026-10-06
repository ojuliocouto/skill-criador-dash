// Barra do topo do painel: monograma da marca (quando não há logotipo), subtítulo com a área
// e as ações com ícone. Funções puras que devolvem texto ou HTML; quem liga o clique de
// "Copiar link" é ligarCopiarLink, chamada pelo dashboard.js depois de montar a barra.
import { esc } from './html.js';

const AREAS = {
  marketing: 'Painel de marketing',
  vendas: 'Painel de vendas',
  suporte: 'Painel de suporte',
  financeiro: 'Painel financeiro',
  estoque: 'Painel de estoque',
};

// Iniciais das duas primeiras palavras que começam com letra ("Studio Equilíbrio - Anúncios"
// vira "SE"). Sem nome, D de Dashboard.
export function monograma(nome) {
  const palavras = String(nome || '').trim().split(/\s+/).filter((p) => /^\p{L}/u.test(p));
  if (!palavras.length) return 'D';
  return palavras.slice(0, 2).map((p) => Array.from(p)[0].toLocaleUpperCase('pt-BR')).join('');
}

export function subtituloDoPainel(dominio) {
  return AREAS[dominio] || 'Painel';
}

const ICONE = {
  link: '<svg class="btn-icone" viewBox="0 0 20 20" aria-hidden="true"><path d="M8.5 11.5a3.2 3.2 0 0 0 4.5 0l2.6-2.6a3.2 3.2 0 0 0-4.5-4.5l-.9.9M11.5 8.5a3.2 3.2 0 0 0-4.5 0l-2.6 2.6a3.2 3.2 0 0 0 4.5 4.5l.9-.9"/></svg>',
  ajustes: '<svg class="btn-icone" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h7M14 6h3M3 14h3M10 14h7"/><circle cx="12" cy="6" r="2"/><circle cx="8" cy="14" r="2"/></svg>',
  paineis: '<svg class="btn-icone" viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/></svg>',
};

// Ações da barra. Grupo de abas não tem "Reconfigurar" (o assistente ainda não edita grupo).
export function acoesHtml({ id, grupo = false } = {}) {
  const config = `/config.html?id=${encodeURIComponent(id || '')}`;
  const copiar = `<button type="button" class="btn ghost btn-barra" data-copiar-link aria-label="Copiar o link deste painel">${ICONE.link}<span class="btn-texto">Copiar link</span></button>`;
  const reconfigurar = grupo ? '' : `<a class="btn ghost btn-barra" href="${esc(config)}" aria-label="Reconfigurar este painel">${ICONE.ajustes}<span class="btn-texto">Reconfigurar</span></a>`;
  const paineis = `<a class="btn btn-barra btn-barra--principal" href="/" aria-label="Ver meus painéis">${ICONE.paineis}<span class="btn-texto">Meus painéis</span></a>`;
  return copiar + reconfigurar + paineis;
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
