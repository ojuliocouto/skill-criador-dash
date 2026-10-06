// Chave de administrador: UM lugar fixo, acima do formulário, e a pessoa fica sabendo ANTES de
// preencher os quatro passos (antes o aviso nascia embaixo do formulário, depois de clicar em
// criar). A checagem usa POST /api/admin-check, que não muta nada.
//
// Guarda: a mesma de sempre. A chave vai pro localStorage deste navegador (setAdminToken), e
// só depois de conferida (ou quando não deu pra conferir, caso em que vale a regra antiga:
// guarda e o servidor confere na hora de salvar). Nunca vai pra URL.

import { el, limpar, campo, erro, recado, ocupar, liberar, chamarAtencao, entrar } from './dom.js';
import { checarChaveAdmin, setAdminToken } from '../lib/api-client.js';

const EXPLICA = 'Este site só deixa criar ou alterar painéis com a chave de administrador (token): a senha de quem instalou o site. '
  + 'Ela está na linha ADMIN_TOKEN do arquivo .dev.vars (site rodando no seu computador) ou nas variáveis secretas do projeto na Cloudflare (site publicado).';

/**
 * @param {HTMLElement} lugar  o #adminGate da página
 * @returns {{iniciar:()=>Promise<void>, estado:()=>string, exigir:(motivo:string, depois?:()=>void)=>void, semConfig:()=>void}}
 */
export function criarPortao(lugar) {
  let estado = 'desconhecido';
  let depois = null;

  function mostrarSemConfig() {
    estado = 'sem-config';
    limpar(lugar);
    lugar.appendChild(entrar(el('div', { class: 'card portao', role: 'alert', tabindex: '-1' }, [
      el('h2', { text: 'Este site ainda não tem chave de administrador' }),
      el('p', { class: 'portao__texto', text: 'Sem ela ninguém consegue criar nem alterar painéis, e escrever uma chave aqui não resolve: quem instalou o site precisa definir ADMIN_TOKEN no servidor.' }),
      el('p', { class: 'portao__texto', text: 'No seu computador: uma linha ADMIN_TOKEN=sua-chave no arquivo .dev.vars. No site publicado, rode o comando abaixo e publique de novo. Depois recarregue esta página.' }),
      el('code', { class: 'portao__comando', text: 'wrangler pages secret put ADMIN_TOKEN --project-name=<seu-projeto>' }),
      el('p', { class: 'hint', text: 'Você pode olhar os passos, mas o painel só é criado depois disso.' }),
    ])));
  }

  function mostrarPedido(motivo) {
    estado = 'precisa';
    limpar(lugar);
    const entrada = el('input', { class: 'input', type: 'password', autocomplete: 'off', placeholder: 'Cole a chave aqui' });
    const retorno = el('div', { class: 'portao__retorno' });
    const botao = el('button', { class: 'btn ghost', type: 'button', text: 'Conferir chave' });
    if (motivo) retorno.appendChild(erro(motivo));

    const conferir = async () => {
      const valor = entrada.value.trim();
      limpar(retorno);
      if (!valor) {
        retorno.appendChild(erro('Cole a chave de administrador antes de conferir.'));
        chamarAtencao(entrada);
        entrada.focus();
        return;
      }
      ocupar(botao, 'Conferindo...');
      const resposta = await checarChaveAdmin(valor);
      liberar(botao);
      if (resposta === 'sem-config') { mostrarSemConfig(); return; }
      if (resposta === 'precisa') {
        retorno.appendChild(erro('Essa chave não confere. Copie de novo o valor de ADMIN_TOKEN, sem espaço no começo nem no fim, e tente outra vez.'));
        chamarAtencao(entrada);
        entrada.select();
        return;
      }
      if (resposta === 'espere') {
        retorno.appendChild(erro('Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.'));
        return;
      }
      setAdminToken(valor);
      estado = resposta === 'confere' ? 'confere' : 'indisponivel';
      limpar(lugar);
      lugar.appendChild(entrar(el('p', {
        class: 'portao__ok', role: 'status',
        text: resposta === 'confere'
          ? 'Chave conferida e guardada neste navegador. Pode seguir.'
          : 'Não deu para conferir a chave agora. Ela ficou guardada neste navegador e será conferida na hora de salvar.',
      })));
      const proximo = depois;
      depois = null;
      if (proximo) proximo();
    };
    botao.addEventListener('click', conferir);
    entrada.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') conferir(); });

    lugar.appendChild(entrar(el('div', { class: 'card portao' }, [
      el('h2', { text: 'Antes de começar: a chave de administrador' }),
      el('p', { class: 'portao__texto', text: EXPLICA }),
      el('div', { class: 'portao__linha' }, [
        campo({ id: 'adminToken', rotulo: 'Chave de administrador', controle: entrada }),
        botao,
      ]),
      retorno,
    ])));
    return entrada;
  }

  return {
    estado: () => estado,
    /** Pergunta ao servidor como está a chave guardada e mostra o que for preciso. */
    async iniciar() {
      const resposta = await checarChaveAdmin();
      if (resposta === 'sem-config') { mostrarSemConfig(); return; }
      if (resposta === 'precisa') { mostrarPedido(''); return; }
      estado = resposta === 'confere' ? 'confere' : 'indisponivel';
    },
    /** O servidor recusou (ou a pessoa tentou salvar sem a chave): pede aqui em cima e segue depois. */
    exigir(motivo, aoConfirmar) {
      depois = aoConfirmar || null;
      const entrada = mostrarPedido(motivo);
      lugar.scrollIntoView({ block: 'start', behavior: 'auto' });
      chamarAtencao(lugar.firstChild);
      entrada.focus({ preventScroll: true });
    },
    semConfig() {
      mostrarSemConfig();
      lugar.scrollIntoView({ block: 'start', behavior: 'auto' });
      if (lugar.firstChild && lugar.firstChild.focus) lugar.firstChild.focus({ preventScroll: true });
    },
    /** Aviso solto (ex: a pessoa já tinha a chave e o servidor demorou). */
    avisar(texto) { limpar(lugar).appendChild(recado(texto)); },
  };
}
