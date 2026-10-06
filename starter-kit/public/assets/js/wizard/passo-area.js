// Passo 1: "O que você quer acompanhar?". Cada área diz o que a pessoa vai ver no painel, e a
// lista sai do template (lib/area-resumo.js), não de texto escrito à mão.

import { el, acoes } from './dom.js';
import { templates } from '../templates/index.js';
import { resumoDaArea, listaEmFrase } from '../lib/area-resumo.js';

function linha(rotulo, itens) {
  if (!itens.length) return null;
  return el('div', { class: 'escolha__linha' }, [
    el('dt', { text: rotulo }),
    el('dd', { text: listaEmFrase(itens) }),
  ]);
}

/**
 * @param {HTMLElement} corpo
 * @param {{state:object, escolherArea:(id:string)=>void, ir:(n:number)=>void}} ctx
 */
export function renderArea(corpo, ctx) {
  const { state } = ctx;
  corpo.appendChild(el('h2', { text: 'O que você quer acompanhar?' }));
  corpo.appendChild(el('p', { class: 'passo-lead', text: 'Escolha a área. Cada uma já vem com o painel montado: você só traz os seus números.' }));

  const grade = el('div', { class: 'escolhas' });
  for (const [id, tpl] of Object.entries(templates)) {
    const r = resumoDaArea(tpl);
    const escolhida = state.domain === id;
    grade.appendChild(el('button', {
      class: `escolha card${escolhida ? ' is-escolhida' : ''}`, type: 'button', 'data-area': id,
      'aria-pressed': escolhida ? 'true' : 'false', onclick: () => ctx.escolherArea(id),
    }, [
      el('h3', { class: 'escolha__titulo', text: tpl.label }),
      el('p', { class: 'escolha__texto', text: tpl.descricao || '' }),
      el('dl', { class: 'escolha__lista' }, [
        linha('Números principais', r.numeros),
        linha(r.abas.length === 1 ? 'Aba do painel' : 'Abas do painel', r.abas),
        linha('Blocos do painel', r.blocos),
      ]),
    ]));
  }
  corpo.appendChild(grade);

  // Quem volta a este passo (ou está editando) segue sem ter que escolher de novo.
  if (state.domain && templates[state.domain]) {
    corpo.appendChild(acoes({}, el('button', {
      class: 'btn', type: 'button', text: `Continuar com ${templates[state.domain].label}`, onclick: () => ctx.ir(2),
    })));
  }
}
