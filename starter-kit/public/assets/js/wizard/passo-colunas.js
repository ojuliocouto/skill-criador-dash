// Passo 3: "Confira as colunas". Placar no topo; cada linha mostra o dado, a coluna escolhida
// (seletor com rótulo de verdade) e valores de exemplo daquela coluna pra pessoa conferir com
// o olho. Dado opcional sem coluna diz o que o painel deixa de mostrar. E a pessoa pode trocar
// o nome que aparece no painel (config.labels).

import { el, limpar, campo, erro, chamarAtencao, acoes } from './dom.js';
import { getTemplate } from '../templates/index.js';
import { autoMapDetalhado } from '../lib/automap.js';
import { placarDoMapa, textoDoPlacar, exemplosDaColuna, fraseDoQueSePerde, validateRequired, pendentesDeConfirmacao } from '../lib/mapa-colunas.js';
import { listaEmFrase } from '../lib/area-resumo.js';
import { LIMITE_DO_ROTULO, rotuloValido } from '../lib/rotulos.js';

/**
 * @param {HTMLElement} corpo
 * @param {{state:object, ir:(n:number)=>void}} ctx
 */
export function renderColunas(corpo, ctx) {
  const { state } = ctx;
  const tpl = getTemplate(state.domain);
  if (!tpl || !state.dataset) {
    corpo.appendChild(erro('Antes de conferir as colunas, traga os seus números no passo anterior.'));
    corpo.appendChild(acoes({ aoVoltar: () => ctx.ir(2) }));
    return;
  }
  const columns = state.dataset.columns || [];
  const rows = state.dataset.rows || [];
  // Primeira vez com este arquivo: o reconhecimento automático preenche.
  if (!state.colMap || Object.keys(state.colMap).length === 0) {
    const r = autoMapDetalhado(tpl.slots, columns);
    state.colMap = r.mapa;
    // O que foi ligado só por semelhança de nome ("contatos" para Leads) a pessoa precisa confirmar.
    state.mapaFraco = r.fracos;
    state.mapaConfirmado = {};
  }
  if (!state.labels) state.labels = {};

  const placar = el('p', { class: 'placar', id: 'placar', role: 'status' });
  const retorno = el('div', { id: 'mapFeedback' });
  const atualizarPlacar = () => {
    const p = placarDoMapa(tpl.slots, state.colMap, columns);
    const falta = p.faltamObrigatorias.length
      ? ` Falta escolher: ${listaEmFrase(p.faltamObrigatorias.map((s) => s.label))}.`
      : (p.encontradas === p.total ? ' Está tudo ligado: é só conferir os exemplos.' : ' O que falta é opcional.');
    placar.textContent = `${textoDoPlacar(p)}.${falta}`;
  };

  corpo.appendChild(el('h2', { text: 'Confira as colunas' }));
  corpo.appendChild(placar);
  corpo.appendChild(el('p', { class: 'passo-lead', text: 'Ligamos cada dado do painel a uma coluna do seu arquivo. Confira pelos exemplos e troque se algum estiver errado.' }));

  const lista = el('div', { class: 'card colunas' }, [
    el('div', { class: 'colunas__cabeca', 'aria-hidden': 'true' }, [
      el('span', { text: 'Dado do painel' }), el('span', { text: 'Coluna do seu arquivo' }), el('span', { text: 'Nome no painel' }),
    ]),
  ]);

  for (const campoDoModelo of tpl.slots) {
    const chave = campoDoModelo.key;
    const nomePadrao = campoDoModelo.label;
    const nomeAtual = () => (rotuloValido(state.labels[chave]) ? state.labels[chave].trim() : nomePadrao);

    const seletor = el('select', { class: 'input', 'data-campo': chave });
    seletor.appendChild(el('option', { value: '', text: '(não tenho essa coluna)' }));
    for (const c of columns) seletor.appendChild(el('option', { value: c, text: c }));
    const atual = state.colMap[chave];
    seletor.value = atual != null && columns.includes(atual) ? atual : '';

    const exemplos = el('p', { class: 'coluna__exemplos' });
    const titulo = el('strong', { class: 'coluna__nome', text: nomePadrao });
    const tipo = el('span', { class: 'coluna__tipo', text: campoDoModelo.required ? 'obrigatória' : 'opcional' });
    const nomeArea = el('div', { class: 'coluna__renomear' });
    const aviso = el('div', { class: 'coluna__confirmar', 'data-confirmar': chave });
    const linha = el('div', { class: 'coluna', 'data-linha': chave }, [
      el('div', { class: 'coluna__dado' }, [titulo, tipo]),
      el('div', { class: 'coluna__escolha' }, [
        campo({ id: `coluna-${chave}`, rotulo: `Coluna de ${nomePadrao}`, controle: seletor, soLeitor: true }),
        exemplos,
        aviso,
      ]),
      nomeArea,
    ]);

    function desenharNome(editando) {
      limpar(nomeArea);
      if (!seletor.value) return; // sem coluna, o dado não aparece no painel: não há o que nomear
      if (!editando && !rotuloValido(state.labels[chave])) {
        nomeArea.appendChild(el('span', { class: 'coluna__nome-atual', text: nomePadrao }));
        nomeArea.appendChild(el('button', {
          class: 'link', type: 'button', 'data-renomear': chave, text: 'Trocar nome',
          'aria-label': `Trocar nome de ${nomePadrao}`, // 3.7.3: começa pelo texto visível (WCAG 2.5.3) e diz de qual campo é onclick: () => { desenharNome(true); nomeArea.querySelector('input').focus(); },
        }));
        return;
      }
      const entrada = el('input', { class: 'input', type: 'text', maxlength: String(LIMITE_DO_ROTULO), value: nomeAtual(), placeholder: nomePadrao });
      entrada.addEventListener('input', () => {
        const v = entrada.value.replace(/[<>]/g, '');
        if (v !== entrada.value) entrada.value = v;
        if (v.trim() && v.trim() !== nomePadrao) state.labels[chave] = v.trim(); else delete state.labels[chave];
      });
      nomeArea.appendChild(campo({
        id: `nome-${chave}`, rotulo: `Nome de ${nomePadrao} no painel`, controle: entrada, soLeitor: true,
        dica: `Como "${nomePadrao}" vai aparecer no painel. Em branco, fica o nome original.`,
      }));
    }

    // Ligado só por nome parecido: diz o que ligou e espera um "Está certo". Trocar a coluna também resolve.
    function desenharAviso() {
      limpar(aviso);
      if (!pendentesDeConfirmacao(state.mapaFraco, state.colMap, state.mapaConfirmado).includes(chave)) return;
      aviso.appendChild(el('p', { class: 'hint', role: 'status', text: `Ligamos "${state.colMap[chave]}" a ${nomePadrao} só pelo nome parecido. Confira os exemplos ao lado.` }));
      aviso.appendChild(el('button', {
        class: 'btn ghost', type: 'button', 'data-confirmar-coluna': chave, text: 'Está certo',
        onclick: () => { state.mapaConfirmado = { ...(state.mapaConfirmado || {}), [chave]: true }; limpar(retorno); desenharAviso(); },
      }));
    }

    function atualizar() {
      const col = seletor.value;
      state.colMap[chave] = col === '' ? null : col;
      linha.classList.toggle('is-faltando', !col && !!campoDoModelo.required);
      linha.classList.toggle('is-sem-coluna', !col && !campoDoModelo.required);
      if (col) {
        const ex = exemplosDaColuna(rows, col, 3);
        exemplos.textContent = ex.length ? `Exemplos: ${ex.join(' · ')}` : 'Esta coluna está vazia no arquivo.';
      } else if (campoDoModelo.required) {
        exemplos.textContent = `Obrigatória: escolha qual coluna do seu arquivo tem ${nomePadrao}.`;
      } else {
        exemplos.textContent = `Não encontramos. ${fraseDoQueSePerde(tpl, chave)}`;
      }
      desenharNome(false);
      desenharAviso();
      atualizarPlacar();
    }
    seletor.addEventListener('change', () => { limpar(retorno); atualizar(); });
    atualizar();
    lista.appendChild(linha);
  }
  corpo.appendChild(lista);
  corpo.appendChild(retorno);

  corpo.appendChild(acoes({ aoVoltar: () => ctx.ir(2) }, el('button', {
    class: 'btn', type: 'button', text: 'Continuar',
    onclick: () => {
      limpar(retorno);
      const faltam = validateRequired(tpl.slots, state.colMap);
      if (faltam.length) {
        retorno.appendChild(erro(`Falta escolher a coluna de: ${listaEmFrase(faltam.map((m) => m.label))}. Se o seu arquivo não tem esse dado, inclua a coluna na planilha e conecte de novo no passo anterior.`));
        for (const m of faltam) chamarAtencao(lista.querySelector(`[data-linha="${m.key}"]`));
        const primeiro = lista.querySelector(`#coluna-${faltam[0].key}`);
        if (primeiro) primeiro.focus();
        return;
      }
      const pendentes = pendentesDeConfirmacao(state.mapaFraco, state.colMap, state.mapaConfirmado);
      if (pendentes.length) {
        const nomes = pendentes.map((k) => (tpl.slots.find((s) => s.key === k) || { label: k }).label);
        retorno.appendChild(erro(`Confirme as colunas de ${listaEmFrase(nomes)}: ligamos só pelo nome parecido. Toque em "Está certo" na linha de cada uma, ou escolha outra coluna.`));
        for (const k of pendentes) chamarAtencao(lista.querySelector(`[data-linha="${k}"]`));
        return;
      }
      ctx.ir(4);
    },
  })));
}
