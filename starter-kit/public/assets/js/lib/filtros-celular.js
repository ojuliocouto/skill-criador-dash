// Filtros recolhidos no celular (3.9). ESM.
//
// No celular a barra de filtros (período, canal, limpar) ocupava cerca de 230 px antes do primeiro
// número. Agora ela fica atrás do botão "Filtros" da faixa (lib/cabecalho.js): celular.css esconde
// a barra enquanto o botão diz aria-expanded="false". Este módulo só liga o clique e marca no botão
// se há filtro aplicado (um ponto na cor da marca avisa que o número na tela está filtrado).
//
// O estado mora no próprio botão: quando o painel se redesenha (Atualizar, troca de aba de grupo),
// o botão novo nasce fechado e a barra nasce escondida, sempre de acordo. No computador o botão
// não aparece e a barra fica como sempre.

/**
 * Texto do botão. Aberto: "Fechar". Fechado sem filtro: "Filtros". Fechado com filtro: o
 * filtro em uso ("7 dias", "Meta Ads"), pra quem lê o número saber que ele está filtrado.
 * @param {{aberto?:boolean, aplicado?:boolean, atalho?:string, dims?:string[]}} p
 *   atalho: o texto do atalho de período marcado ("Tudo", "7 dias", "Personalizado")
 */
export function rotuloDoBotao({ aberto = false, aplicado = false, atalho = '', dims = [] } = {}) {
  if (aberto) return 'Fechar';
  if (!aplicado) return 'Filtros';
  if (atalho && atalho !== 'Tudo') return atalho;
  const dim = (Array.isArray(dims) ? dims : []).find((v) => !!v);
  return dim || 'Filtrado';
}

/** Próximo estado do botão. */
export function alternarFiltros(aberto) {
  const abrir = !aberto;
  return { aberto: abrir, expandido: abrir ? 'true' : 'false', rotulo: abrir ? 'Fechar' : 'Filtros' };
}

/**
 * Há filtro aplicado? Período diferente de "Tudo" (ou datas digitadas) ou alguma dimensão escolhida.
 * @param {{atalho?:string|null, de?:string, ate?:string, dims?:string[]}} estado
 */
export function temFiltroAplicado({ atalho = null, de = '', ate = '', dims = [] } = {}) {
  if (atalho && atalho !== 'tudo') return true;
  if (!atalho && (de || ate)) return true;
  return (Array.isArray(dims) ? dims : []).some((v) => !!v);
}

// ---- DOM ----

function lerEstado(doc) {
  const barra = doc.getElementById('filterbar');
  if (!barra) return {};
  const valor = (id) => { const el = doc.getElementById(id); return el && el.value ? el.value : ''; };
  return {
    atalho: barra.dataset.periodo || null,
    de: valor('fb-from'),
    ate: valor('fb-to'),
    dims: [...barra.querySelectorAll('select[data-slot]')].map((s) => s.value),
  };
}

function textoDoAtalho(doc) {
  const marcado = doc.querySelector('#filterbar .atalho[aria-checked="true"]');
  return marcado ? marcado.textContent.trim() : '';
}

function atualizarBotao(doc) {
  const botao = doc.querySelector('.filtros-abrir');
  if (!botao) return;
  const estado = lerEstado(doc);
  const aplicado = temFiltroAplicado(estado);
  botao.toggleAttribute('data-aplicado', aplicado);
  const rotulo = botao.querySelector('.filtros-abrir__rotulo');
  if (rotulo) rotulo.textContent = rotuloDoBotao({ aberto: botao.getAttribute('aria-expanded') === 'true', aplicado, atalho: textoDoAtalho(doc), dims: estado.dims });
}

export function ligarFiltrosDoCelular(doc = document) {
  if (!doc || !doc.addEventListener) return;
  doc.addEventListener('click', (ev) => {
    const botao = ev.target && ev.target.closest ? ev.target.closest('.filtros-abrir') : null;
    if (botao) {
      const r = alternarFiltros(botao.getAttribute('aria-expanded') === 'true');
      botao.setAttribute('aria-expanded', r.expandido);
      atualizarBotao(doc);
      return;
    }
    // Clique dentro da barra (atalho de período, Limpar): o estado muda depois do clique.
    if (ev.target && ev.target.closest && ev.target.closest('#filterbar')) setTimeout(() => atualizarBotao(doc), 0);
  });
  doc.addEventListener('change', (ev) => {
    if (ev.target && ev.target.closest && ev.target.closest('#filterbar')) atualizarBotao(doc);
  });
  // Painel redesenhado (Atualizar devolve os filtros aos campos): o botão novo diz o filtro em uso.
  const app = doc.getElementById && doc.getElementById('app');
  if (app && typeof MutationObserver === 'function') new MutationObserver(() => atualizarBotao(doc)).observe(app, { childList: true });
}

if (typeof document !== 'undefined') ligarFiltrosDoCelular(document);
