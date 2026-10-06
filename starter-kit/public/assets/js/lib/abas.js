// Abas DENTRO de um dashboard (template.tabs). ESM, puro, sem DOM.
//
// Um template pode declarar `tabs: [{ id, label, layout: [...] }]`. Cada aba tem o seu próprio
// layout de widgets. Template sem `tabs` continua renderizando pelo `layout`, como sempre.
//
// Não confundir com o GRUPO (config.kind === 'group'), que junta vários dashboards num link e
// guarda a aba em ?tab=. Aqui a aba ativa mora no HASH (#canais): é o mesmo painel, a mesma
// fonte e o mesmo filtro, só muda a seção, e o link de uma aba pode ser mandado pra alguém.

import { esc } from './html.js';

/**
 * Abas válidas do template: precisa de id e de layout em lista. Id repetido vale a primeira.
 * @returns {{id:string, label:string, layout:object[]}[]}  lista vazia = template sem abas
 */
export function abasDoTemplate(template) {
  const bruto = template && Array.isArray(template.tabs) ? template.tabs : [];
  const vistos = new Set();
  const out = [];
  for (const t of bruto) {
    if (!t || typeof t.id !== 'string' || !t.id || !Array.isArray(t.layout)) continue;
    if (vistos.has(t.id)) continue;
    vistos.add(t.id);
    out.push({ id: t.id, label: t.label || t.id, layout: t.layout });
  }
  return out;
}

/** '#canais' -> 'canais'. Hash vazio ou com codificação quebrada -> null. */
export function abaDoHash(hash) {
  if (hash == null) return null;
  const cru = String(hash).replace(/^#/, '').trim();
  if (!cru) return null;
  try {
    return decodeURIComponent(cru) || null;
  } catch {
    return null;
  }
}

/** A aba pedida, se existir; senão a primeira; sem abas, null. */
export function resolverAba(abas, pedido) {
  const lista = Array.isArray(abas) ? abas.filter((t) => t && t.id) : [];
  if (!lista.length) return null;
  if (pedido && lista.some((t) => t.id === pedido)) return pedido;
  return lista[0].id;
}

/**
 * Layout que deve ir pra tela: o da aba ativa quando o template tem abas, senão o `layout`
 * do template (o mesmo objeto, intacto).
 */
export function layoutDaAba(template, abaId) {
  const abas = abasDoTemplate(template);
  if (!abas.length) return (template && Array.isArray(template.layout)) ? template.layout : [];
  const id = resolverAba(abas, abaId);
  return abas.find((t) => t.id === id).layout;
}

/**
 * Navegação por teclado na barra de abas: setas andam (dando a volta), Home e End vão pras
 * pontas. Outra tecla devolve null (não troca de aba).
 */
export function proximaAba(abas, atualId, tecla) {
  const lista = Array.isArray(abas) ? abas : [];
  if (!lista.length) return null;
  const i = Math.max(0, lista.findIndex((t) => t.id === atualId));
  switch (tecla) {
    case 'ArrowRight': return lista[(i + 1) % lista.length].id;
    case 'ArrowLeft': return lista[(i - 1 + lista.length) % lista.length].id;
    case 'Home': return lista[0].id;
    case 'End': return lista[lista.length - 1].id;
    default: return null;
  }
}

/** Id do botão de uma aba (o painel aponta pra ele em aria-labelledby). */
export function idDoBotaoDaAba(abaId) {
  return `aba-${abaId}`;
}

/**
 * HTML da barra de abas, com os papéis ARIA de abas. Só a aba ativa fica no caminho do Tab
 * (tabindex 0); as outras se alcançam pelas setas.
 * @param {{id:string,label:string}[]} abas
 * @param {string} ativaId
 * @param {string} painelId  id do elemento que faz o papel de tabpanel
 */
export function barraDeAbasHtml(abas, ativaId, painelId) {
  const lista = Array.isArray(abas) ? abas : [];
  if (!lista.length) return '';
  const botoes = lista.map((t) => {
    const ativa = t.id === ativaId;
    return (
      `<button class="aba" type="button" role="tab" id="${esc(idDoBotaoDaAba(t.id))}" ` +
        `data-aba="${esc(t.id)}" aria-controls="${esc(painelId)}" ` +
        `aria-selected="${ativa ? 'true' : 'false'}" tabindex="${ativa ? '0' : '-1'}">` +
        `${esc(t.label)}</button>`
    );
  }).join('');
  return `<div class="abas" role="tablist" aria-label="Seções do painel">${botoes}</div>`;
}

/**
 * Tira da barra a aba que não teria nada pra mostrar (ex: "Canais" num painel sem a coluna de
 * canal mapeada): aba vazia com cara de erro é pior que aba ausente. `desenha(aba)` devolve
 * algo verdadeiro quando a aba tem conteúdo. Se o teste de uma aba lançar erro, ela FICA: é
 * melhor mostrar a aba e deixar o erro aparecer nela do que esconder o problema.
 * @param {{id:string}[]} abas
 * @param {(aba:object)=>*} desenha
 */
export function abasVisiveis(abas, desenha) {
  const lista = Array.isArray(abas) ? abas : [];
  return lista.filter((t) => {
    try {
      return !!desenha(t);
    } catch {
      return true;
    }
  });
}
