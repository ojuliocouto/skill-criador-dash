// Estado vazio do painel: UMA frase que diz por que não há número e um botão para o que fazer. ESM, puro.
//
// 3.9 (achado 7 da auditoria de 25/10/2026): um período sem dado (01/01 a 31/01, ou "Hoje" com a planilha
// parada) mostrava 7 cartões em R$ 0,00 e ROAS 0, sem explicar nada, e cada widget dizia "Sem dados"
// solto. Agora o corpo inteiro troca pela frase, e os widgets que ainda ficam vazios sozinhos usam a
// mesma frase curta (SEM_DADOS_NO_PERIODO).

import { esc } from './html.js';
import { isoParaBR } from './data-br.js';

/** A frase curta de todo widget sem dado. */
export const SEM_DADOS_NO_PERIODO = 'Nenhum dado neste período.';

const ACAO_TUDO = Object.freeze({ id: 'tudo', rotulo: 'Ver todo o período' });
const ACAO_LIMPAR = Object.freeze({ id: 'limpar', rotulo: 'Limpar filtros' });

/**
 * @param {object} p
 * @param {number} p.total      linhas da fonte inteira (sem filtro)
 * @param {{from?:string|null, to?:string|null, dims?:Object<string,string>}} [p.filtro]  filtro na tela (ISO)
 * @param {{min:string|null, max:string|null}} [p.limites]  primeiro e último dia com dado (ISO)
 * @param {Object<string,string>} [p.rotulos]  rótulo de cada campo de agrupar (canal -> 'Canal')
 * @returns {{frase:string, acao:{id:string, rotulo:string}|null}}
 */
export function estadoVazio({ total = 0, filtro = {}, limites = {}, rotulos = {} } = {}) {
  if (!(Number(total) > 0)) {
    return { frase: 'A fonte ainda não tem nenhuma linha: confira a planilha ou a conta ligada e clique em Atualizar.', acao: null };
  }
  const f = filtro || {};
  const { min, max } = limites || {};
  const dims = Object.entries(f.dims || {}).filter(([, v]) => v != null && v !== '');
  const de = f.from || min;
  const ate = f.to || max;
  const quando = de && ate
    ? (de === ate ? `em ${isoParaBR(de)}` : `entre ${isoParaBR(de)} e ${isoParaBR(ate)}`)
    : 'neste período';
  if (dims.length) {
    const quem = dims.map(([k, v]) => `${(rotulos && rotulos[k]) || k} ${v}`).join(' e ');
    return { frase: `Nenhum dado de ${quem} ${quando}.`, acao: ACAO_LIMPAR };
  }
  let motivo = '';
  if (max && de && de > max) motivo = `o último dado é de ${isoParaBR(max)}`;
  else if (min && ate && ate < min) motivo = `os dados começam em ${isoParaBR(min)}`;
  else if (min && max) motivo = `os dados vão de ${isoParaBR(min)} a ${isoParaBR(max)}`;
  return { frase: motivo ? `Nenhum dado ${quando}: ${motivo}.` : `Nenhum dado ${quando}.`, acao: ACAO_TUDO };
}

/** HTML do estado: uma frase e, quando há o que fazer, um botão (data-vazio-acao liga no dashboard.js). */
export function estadoVazioHtml({ frase = SEM_DADOS_NO_PERIODO, acao = null } = {}) {
  const botao = acao && acao.id
    ? `<button class="btn" type="button" data-vazio-acao="${esc(acao.id)}">${esc(acao.rotulo || '')}</button>`
    : '';
  return `<div class="empty-state" data-estado="vazio" role="status"><p>${esc(frase)}</p>${botao}</div>`;
}
