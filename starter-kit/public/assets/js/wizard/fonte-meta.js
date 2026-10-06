// Formulário do Meta Ads (passo 2, só na área de Marketing). Separado do passo pra cada
// arquivo ter uma responsabilidade. Os textos são os validados no teste com aluno (T11).

import { el, campo } from './dom.js';
import { mascaraDataBR, brParaISO } from '../lib/data-br.js';

// Guia do token do Meta Ads: a pessoa gera o PRÓPRIO token, passo a passo.
const META_GUIA_URL = 'https://github.com/ojuliocouto/skill-criador-dash/blob/main/references/token-meta-ads.md';

/**
 * @param {object} guardado  state.fonte.meta: o que já foi digitado (não se perde ao trocar de origem)
 * @returns {{no:HTMLElement, botao:HTMLButtonElement, ler:()=>({token:string, account:string, since?:string, until?:string})}}
 */
export function formularioMeta(guardado) {
  const g = guardado;
  const guardar = (chave) => (ev) => { g[chave] = ev.target.value; };
  const data = (chave) => (ev) => { ev.target.value = mascaraDataBR(ev.target.value); g[chave] = ev.target.value; };
  const token = el('input', { class: 'input', type: 'password', placeholder: 'EAAB...', autocomplete: 'off', value: g.token || '', oninput: guardar('token') });
  const conta = el('input', { class: 'input', type: 'text', placeholder: 'act_1234567890 ou 1234567890', value: g.account || '', oninput: guardar('account') });
  const de = el('input', { class: 'input fb-date', type: 'text', inputmode: 'numeric', maxlength: '10', placeholder: 'dd/mm/aaaa', value: g.since || '', oninput: data('since') });
  const ate = el('input', { class: 'input fb-date', type: 'text', inputmode: 'numeric', maxlength: '10', placeholder: 'dd/mm/aaaa', value: g.until || '', oninput: data('until') });
  const botao = el('button', { class: 'btn', id: 'connectMeta', type: 'button', text: 'Conectar Meta Ads' });

  const no = el('div', { class: 'origem-form' }, [
    el('p', { class: 'origem-form__texto', text: 'Puxa os números das campanhas direto da Meta. Você precisa de um token de usuário do sistema (um usuário de robô, criado no Gerenciador de Negócios, que só lê os anúncios e não depende da sua senha), com validade Nunca e as permissões ads_read e read_insights, e do ID da conta de anúncios, o número depois de act= no endereço do Gerenciador de Anúncios. O token fica só no servidor e nunca aparece no painel.' }),
    el('p', { class: 'origem-form__texto' }, [
      el('a', { href: META_GUIA_URL, target: '_blank', rel: 'noopener noreferrer', text: 'Como gerar o seu token' }),
      ' (passo a passo, com o que fazer em cada erro da Meta).',
    ]),
    campo({ id: 'metaToken', rotulo: 'Token de acesso', controle: token }),
    campo({ id: 'metaAccount', rotulo: 'ID da conta de anúncios', controle: conta }),
    el('div', { class: 'origem-form__par' }, [
      campo({ id: 'metaSince', rotulo: 'De (opcional)', controle: de }),
      campo({ id: 'metaUntil', rotulo: 'Até (opcional)', controle: ate }),
    ]),
    botao,
  ]);

  return {
    no,
    botao,
    ler: () => ({
      token: token.value.trim(),
      account: conta.value.trim(),
      // Datas digitadas em dd/mm/aaaa; a Graph API recebe ISO (aaaa-mm-dd).
      since: brParaISO(de.value) || undefined,
      until: brParaISO(ate.value) || undefined,
    }),
  };
}

export const ERRO_META_INCOMPLETO = 'Informe o token de acesso e o ID da conta de anúncios.';
