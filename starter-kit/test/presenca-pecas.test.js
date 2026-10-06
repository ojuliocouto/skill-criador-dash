// Peças de presença com parte pura: a marca aplicada num elemento (cores + fundo vivo), as
// camadas do fundo, a contagem entre dois valores (mudança de filtro), a amostra de modo do
// assistente e o esqueleto da lista de painéis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { aplicarMarca } from '../public/assets/js/lib/marca.js';
import { caminhoSuave, fundoHtml } from '../public/assets/js/lib/fundo.js';
import { TEXTO_SOBRE_O_FUNDO, parametrosDoFundo, piorFundo } from '../public/assets/js/lib/fundo-cor.js';
import { valorEntre, textoDaContagemEntre, textoDaContagem } from '../public/assets/js/lib/movimento.js';
import { amostraDoPainelHtml } from '../public/assets/js/lib/amostra-de-modo.js';
import { esqueletoDaListaHtml } from '../public/assets/js/lib/esqueleto.js';
import { contrastRatio, accentText } from '../public/assets/js/lib/color.js';
import { modeloComAbas, modeloSemAbas } from './apoio/modelo-de-teste.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => readFileSync(join(raiz, rel), 'utf8');

function elementoDeTeste() {
  const vars = {};
  return { dataset: {}, style: { setProperty(n, v) { vars[n] = String(v); }, getPropertyValue(n) { return vars[n] || ''; } }, vars };
}

test('aplicarMarca: além das cores de sempre, grava o fundo vivo na cor da marca', () => {
  const el = elementoDeTeste();
  aplicarMarca(el, '#0e9f6e', true, '');
  assert.equal(el.vars['--accent'], '#0e9f6e');
  assert.match(el.vars['--fundo-a'], /^rgba\(14, 159, 110, /);
  assert.match(el.vars['--fundo-b'], /^rgba\(/);
  assert.match(el.vars['--fundo-linha'], /^rgba\(/);
  assert.equal(el.vars['--saud-ola'], accentText('#0e9f6e', true), '"Olá," calibrado pro fundo escuro da saudação');
});

test('aplicarMarca: o fundo muda quando a cor muda e quando o modo muda', () => {
  const verde = elementoDeTeste(); aplicarMarca(verde, '#0e9f6e', true, '');
  const azul = elementoDeTeste(); aplicarMarca(azul, '#2563eb', true, '');
  const azulClaro = elementoDeTeste(); aplicarMarca(azulClaro, '#2563eb', false, '');
  assert.notEqual(verde.vars['--fundo-a'], azul.vars['--fundo-a']);
  assert.notEqual(azul.vars['--fundo-a'], azulClaro.vars['--fundo-a']);
});

test('aplicarMarca: a segunda cor vira a segunda mancha e persiste na troca de modo', () => {
  const el = elementoDeTeste();
  aplicarMarca(el, '#2563eb', true, '#dc2626');
  assert.match(el.vars['--fundo-b'], /^rgba\(220, 38, 38, /);
  aplicarMarca(el, '#2563eb', false); // o botão de modo chama sem a segunda cor
  assert.match(el.vars['--fundo-b'], /^rgba\(220, 38, 38, /);
});

test('aplicarMarca: o texto na cor da marca passa em 4,5:1 também sobre o fundo tingido', () => {
  for (const cor of ['#5b62d6', '#2563eb', '#0e9f6e', '#facc15', '#334155']) for (const escuro of [true, false]) {
    const el = elementoDeTeste();
    aplicarMarca(el, cor, escuro, '');
    const pior = piorFundo(parametrosDoFundo(cor, '', escuro), escuro);
    assert.ok(contrastRatio(el.vars['--accent-text'], pior) >= 4.5, `${cor} ${escuro}`);
    assert.equal(el.vars['--focus-ring'], el.vars['--accent-text']);
  }
});

test('aplicarMarca: elemento que não existe não quebra', () => {
  assert.doesNotThrow(() => aplicarMarca(null, '#2563eb', true));
});

test('os tons de texto usados na conta do fundo são os do main.css', () => {
  const css = ler('public/assets/css/main.css');
  const escuro = css.slice(css.indexOf(':root, [data-theme="dark"] {'), css.indexOf('[data-theme="light"] {'));
  const claro = css.slice(css.indexOf('[data-theme="light"] {'));
  const token = (bloco, nome) => (bloco.match(new RegExp(`${nome}:\\s*(#[0-9a-fA-F]{6})`)) || [])[1];
  assert.deepEqual([token(escuro, '--text-dim'), token(escuro, '--text-faint')], TEXTO_SOBRE_O_FUNDO.dark);
  assert.deepEqual([token(claro, '--text-dim'), token(claro, '--text-faint')], TEXTO_SOBRE_O_FUNDO.light);
});

test('caminhoSuave: curva que passa por todos os pontos, do começo ao fim da largura', () => {
  const d = caminhoSuave([100, 50, 80], 200);
  assert.match(d, /^M0 100 C/);
  assert.match(d, / 100 50 C/);
  assert.match(d, / 200 80$/);
  assert.equal(caminhoSuave([10]), '');
  assert.equal(caminhoSuave(null), '');
  assert.ok(!/NaN|undefined/.test(caminhoSuave([1, 'x', 3, 4])));
});

test('fundoHtml: duas manchas e duas folhas de curvas, sem texto e sem script', () => {
  const html = fundoHtml();
  assert.equal(html.split('fundo__brilho ').length - 1, 2);
  assert.equal(html.split('<svg class="fundo__linhas').length - 1, 2);
  assert.ok(html.split('<path').length - 1 >= 3);
  assert.ok(!/<script|on\w+=/.test(html));
  assert.ok(!/<canvas/.test(html), 'nada de canvas em loop');
});

test('valorEntre: parte do valor que estava na tela e chega EXATAMENTE no novo', () => {
  assert.equal(valorEntre(100, 250, 0), 100);
  assert.equal(valorEntre(100, 250, 1), 250);
  assert.equal(valorEntre(100, 250, 3), 250);
  const meio = valorEntre(100, 250, 0.4);
  assert.ok(meio > 100 && meio < 250);
  assert.ok(valorEntre(250, 100, 0.4) < 250 && valorEntre(250, 100, 0.4) > 100, 'também conta pra baixo');
  assert.equal(valorEntre(NaN, 80, 0), 0, 'sem valor de partida, parte do zero');
  assert.ok(Number.isNaN(valorEntre(10, NaN, 0.5)));
});

test('textoDaContagemEntre: mesmo formato do indicador; partindo do zero é a contagem de sempre', () => {
  assert.equal(textoDaContagemEntre(0, 370, 'integer', 1), '370');
  assert.equal(textoDaContagemEntre(0, 1520.5, 'currency', 0.5), textoDaContagem(1520.5, 'currency', 0.5));
  assert.match(textoDaContagemEntre(2647, 1240, 'integer', 0.3), /^\d\.\d{3}$/);
  assert.match(textoDaContagemEntre(57069, 27235, 'currency', 0.5), /^R\$\s[\d.]+,\d{2}$/);
});

const dados = {
  rows: [
    { Data: '01/07/2026', Canal: 'Instagram', Investimento: '100', Leads: '10' },
    { Data: '02/07/2026', Canal: 'Google', Investimento: '50', Leads: '4' },
  ],
};
const config = {
  name: 'Estúdio <b>', domain: 'marketing', accent: '#0e9f6e', logo: 'https://exemplo.com/l.png', logoFundo: 'escuro',
  colMap: { data: 'Data', canal: 'Canal', investimento: 'Investimento', leads: 'Leads' },
};

test('amostraDoPainelHtml: faixa com o nome e o logotipo da pessoa, abas e os números dela', () => {
  const html = amostraDoPainelHtml(config, dados, modeloComAbas);
  assert.match(html, /class="faixa"/);
  assert.match(html, /Estúdio &lt;b&gt;/, 'nome escapado');
  assert.match(html, /faixa__logo--escuro/);
  assert.match(html, /class="aba" aria-selected="true">Visão geral</);
  assert.match(html, /R\$\s150,00/, 'o investimento somado dos dados dela');
  assert.match(html, />14</, 'os leads dela');
});

test('amostraDoPainelHtml: sem id (não briga com a prévia) e sem um segundo título de página', () => {
  const html = amostraDoPainelHtml(config, dados, modeloComAbas);
  assert.ok(!/ id="/.test(html));
  assert.ok(!/<h1/.test(html));
  assert.ok(!/role="tab"/.test(html), 'abas da amostra são só desenho');
});

test('amostraDoPainelHtml: modelo sem abas não desenha barra; sem dados devolve vazio', () => {
  const html = amostraDoPainelHtml({ ...config, domain: 'vendas', colMap: { data: 'Data', valor: 'Investimento' } }, dados, modeloSemAbas);
  assert.ok(!html.includes('class="abas"'));
  assert.match(html, /class="grid kpis"/);
  assert.equal(amostraDoPainelHtml(config, null, modeloComAbas), '');
  assert.equal(amostraDoPainelHtml({ ...config, domain: 'nao-existe' }, dados), '');
});

test('esqueletoDaListaHtml: linhas no formato da lista, e a página da lista já nasce com elas', () => {
  const html = esqueletoDaListaHtml();
  assert.equal(html.split('class="esq-item"').length - 1, 3);
  assert.match(html, /role="status"/);
  assert.match(html, /Carregando os seus painéis/);
  assert.ok(ler('public/index.html').includes(html));
  assert.equal(esqueletoDaListaHtml(99).split('class="esq-item"').length - 1, 8);
});
