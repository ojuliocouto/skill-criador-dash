// Efeito 7, "tabela que reordena": clicar no cabeçalho ordena a coluna e as linhas trocam de
// lugar DESLIZANDO (cada uma sai de onde estava, só transform). Crescente, decrescente e a
// terceira volta devolve a ordem original. ESM.
//
// A conta (o que é número, data e texto; a ordem estável) é pura e tem teste. O DOM só reordena
// as linhas que já estão na tabela: o conteúdo de cada célula não muda.

import { parseNumberBR, parseDateBR } from './format.js';
import { menosMovimento, CURVA } from './movimento.js';

export const DURACAO_DA_ORDEM = 460;

/** Classifica o texto de uma célula pra comparar: número, data (ISO), texto ou vazio. */
export function valorDeOrdenacao(texto) {
  const t = String(texto == null ? '' : texto).trim();
  if (!t) return { tipo: 'vazio', v: null };
  const data = parseDateBR(t);
  if (data && /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/.test(t)) return { tipo: 'data', v: data };
  const n = parseNumberBR(t);
  if (Number.isFinite(n) && /^[R$\s\d.,%+-]+$/.test(t)) return { tipo: 'num', v: n };
  return { tipo: 'texto', v: t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() };
}

/** Próxima volta ao clicar de novo na mesma coluna: asc, desc, e depois a ordem original (null). */
export function proximaDirecao(atual) {
  if (atual === 'asc') return 'desc';
  if (atual === 'desc') return null;
  return 'asc';
}

/**
 * Índices das linhas na ordem nova. Estável no empate; vazio sempre no fim. Misturar tipos na
 * mesma coluna (raro) compara número com número, data com data e texto com texto, e os tipos
 * entre si nessa ordem.
 */
export function ordemDasLinhas(textos, direcao) {
  const sinal = direcao === 'desc' ? -1 : 1;
  const peso = { num: 0, data: 1, texto: 2 };
  const itens = (Array.isArray(textos) ? textos : []).map((t, i) => ({ i, ...valorDeOrdenacao(t) }));
  itens.sort((a, b) => {
    if (a.tipo === 'vazio' || b.tipo === 'vazio') return a.tipo === b.tipo ? a.i - b.i : (a.tipo === 'vazio' ? 1 : -1);
    if (a.tipo !== b.tipo) return (peso[a.tipo] - peso[b.tipo]) * sinal || a.i - b.i;
    const c = a.tipo === 'texto' ? a.v.localeCompare(b.v, 'pt-BR', { numeric: true }) : (a.v < b.v ? -1 : a.v > b.v ? 1 : 0);
    return c * sinal || a.i - b.i;
  });
  return itens.map((x) => x.i);
}

// ---------------------------------------------------------------- a ordem sobrevive ao repintar
// Filtro, troca de período e Atualizar repintam o corpo inteiro (tabela nova). A ordem que a
// pessoa escolheu fica guardada por aba e por tabela, e é devolvida a cada tabela que nasce,
// até ela clicar de novo no cabeçalho ou trocar de aba. Funções puras, com teste.

/** Identifica "a mesma tabela" entre repintes: os rótulos dos cabeçalhos, na ordem. */
export function assinaturaDaTabela(cabecalhos) {
  return (Array.isArray(cabecalhos) ? cabecalhos : []).map((c) => String(c).trim()).join('|');
}

/** Guarda (ou esquece, se `direcao` for nula) a ordem de uma tabela. Devolve o estado novo. */
export function registrarOrdem(estado, aba, assinatura, coluna, direcao) {
  const base = estado && estado.aba === aba ? estado.ordens : {};
  const ordens = { ...base };
  if (direcao) ordens[assinatura] = { coluna, direcao }; else delete ordens[assinatura];
  return { aba, ordens };
}

/**
 * Uma tabela acabou de nascer na `aba`: que ordem aplicar nela? Aba diferente da guardada
 * esquece tudo. Devolve { aplicar: {coluna, direcao} | null, estado }.
 */
export function reconciliarOrdem(estado, aba, assinatura) {
  if (!estado || estado.aba !== aba) return { aplicar: null, estado: { aba, ordens: {} } };
  return { aplicar: estado.ordens[assinatura] || null, estado };
}

// ---------------------------------------------------------------- DOM

function ordenar(tabela, indiceDaColuna, direcao, animar = true) {
  const corpo = tabela.tBodies[0];
  if (!corpo) return;
  const linhas = [...corpo.rows];
  linhas.forEach((tr, i) => { if (tr.dataset.ordemOriginal == null) tr.dataset.ordemOriginal = String(i); });
  const antes = new Map(linhas.map((tr) => [tr, tr.getBoundingClientRect().top]));
  let novas;
  if (direcao) {
    const textos = linhas.map((tr) => (tr.cells[indiceDaColuna] ? tr.cells[indiceDaColuna].textContent : ''));
    novas = ordemDasLinhas(textos, direcao).map((i) => linhas[i]);
  } else {
    novas = [...linhas].sort((a, b) => Number(a.dataset.ordemOriginal) - Number(b.dataset.ordemOriginal));
  }
  novas.forEach((tr) => corpo.appendChild(tr));
  if (!animar || menosMovimento() || typeof Element.prototype.animate !== 'function') return;
  // Linha que viaja longe (a lista embaralhou) sai de perto e aparece: senão a tabela fica em
  // branco enquanto as linhas atravessam a tela vindas de fora dela.
  const TETO = 120;
  novas.forEach((tr, i) => {
    const dy = antes.get(tr) - tr.getBoundingClientRect().top;
    if (!dy) return;
    const longe = Math.abs(dy) > TETO;
    const de = longe ? Math.sign(dy) * TETO : dy;
    tr.animate([{ transform: `translateY(${de}px)`, opacity: longe ? 0 : 1 }, { transform: 'none', opacity: 1 }],
      { duration: DURACAO_DA_ORDEM, delay: Math.min(i, 12) * 8, easing: CURVA.saida, fill: 'backwards' });
  });
}

/** Liga o clique nos cabeçalhos das tabelas de dados do painel (uma vez, no #dashbody). */
export function ligarTabelaOrdena(raiz, opcoes = {}) {
  if (!raiz || typeof raiz.addEventListener !== 'function') return () => {};
  const abaAtual = () => { try { return String((opcoes && typeof opcoes.aba === 'function' ? opcoes.aba() : '') || ''); } catch (_) { return ''; } };
  let estado = null;
  const cabecalhosDe = (tabela) => [...tabela.querySelectorAll('thead th')].map((th) => th.textContent);
  // Tabela recém-nascida (filtro, período, Atualizar, troca de aba): devolve a ordem guardada, sem deslizar.
  const reaplicar = () => {
    raiz.querySelectorAll('.table .table__el').forEach((tabela) => {
      if (tabela.dataset.ordemChecada) return;
      tabela.dataset.ordemChecada = '1';
      const r = reconciliarOrdem(estado, abaAtual(), assinaturaDaTabela(cabecalhosDe(tabela)));
      estado = r.estado;
      if (!r.aplicar) return;
      const th = tabela.querySelectorAll('thead th')[r.aplicar.coluna];
      if (!th) return;
      th.setAttribute('aria-sort', r.aplicar.direcao === 'asc' ? 'ascending' : 'descending');
      ordenar(tabela, r.aplicar.coluna, r.aplicar.direcao, false);
    });
  };
  const preparar = () => {
    raiz.querySelectorAll('.table .table__el thead th').forEach((th) => {
      if (th.dataset.ordenavel) return;
      th.dataset.ordenavel = '1';
      th.tabIndex = 0;
      th.setAttribute('role', 'columnheader');
      th.setAttribute('aria-sort', 'none');
    });
    reaplicar(); // depois dos cabeçalhos: o aria-sort devolvido não pode ser apagado
  };
  const alternar = (th) => {
    const tabela = th.closest('table');
    const indice = [...th.parentElement.children].indexOf(th);
    const atual = th.getAttribute('aria-sort');
    const nova = proximaDirecao(atual === 'ascending' ? 'asc' : atual === 'descending' ? 'desc' : null);
    tabela.querySelectorAll('thead th').forEach((o) => o.setAttribute('aria-sort', 'none'));
    th.setAttribute('aria-sort', nova === 'asc' ? 'ascending' : nova === 'desc' ? 'descending' : 'none');
    estado = registrarOrdem(estado, abaAtual(), assinaturaDaTabela(cabecalhosDe(tabela)), indice, nova);
    ordenar(tabela, indice, nova);
  };
  const aoClicar = (e) => { const th = e.target.closest ? e.target.closest('.table .table__el thead th') : null; if (th) { preparar(); alternar(th); } };
  const aoTeclar = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.table .table__el thead th')) { e.preventDefault(); alternar(e.target); } };
  raiz.addEventListener('click', aoClicar);
  raiz.addEventListener('keydown', aoTeclar);
  // Cada repintar do corpo traz tabela nova: o observador deixa os cabeçalhos prontos (foco e aria).
  const obs = typeof MutationObserver === 'function' ? new MutationObserver(preparar) : null;
  if (obs) obs.observe(raiz, { childList: true, subtree: true });
  preparar();
  return () => { raiz.removeEventListener('click', aoClicar); raiz.removeEventListener('keydown', aoTeclar); if (obs) obs.disconnect(); };
}
