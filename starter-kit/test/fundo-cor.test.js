// Fundo vivo na cor da marca: os parâmetros (cores e intensidade) saem da cor do painel e são
// calibrados pra que o texto que fica direto sobre o fundo da página continue com contraste AA
// no pior momento do movimento (as duas manchas uma em cima da outra).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parametrosDoFundo, piorFundo, textoDeMarcaSobreFundo, corVizinha, INTENSIDADE, variaveisDoFundo,
} from '../public/assets/js/lib/fundo-cor.js';
import { contrastRatio, parseHex, BG_DARK, BG_LIGHT, DEFAULT_ACCENT } from '../public/assets/js/lib/color.js';

// Mesmos valores de --text-dim e --text-faint do main.css, nos dois temas.
const TEXTO = { dark: ['#99a1ae', '#8b93a4'], light: ['#586173', '#5b6270'] };
const MARCAS = ['#5b62d6', '#2563eb', '#0e9f6e', '#d9730d', '#dc2626', '#db2777', '#7c3aed', '#334155', '#facc15', '#22d3ee', '#111827', '#ffffff', '#000000'];

test('parametrosDoFundo: muda quando a cor da marca muda, e é diferente nos dois temas', () => {
  const azul = parametrosDoFundo('#2563eb', '', true);
  const verde = parametrosDoFundo('#0e9f6e', '', true);
  assert.equal(azul.a, '#2563eb');
  assert.equal(verde.a, '#0e9f6e');
  assert.notEqual(azul.a, verde.a);
  assert.notDeepEqual(parametrosDoFundo('#2563eb', '', true), parametrosDoFundo('#2563eb', '', false));
});

test('parametrosDoFundo: com segunda cor ela vira a segunda mancha; sem ela, uma vizinha da cor da marca', () => {
  assert.equal(parametrosDoFundo('#2563eb', '#0e9f6e', true).b, '#0e9f6e');
  const sem = parametrosDoFundo('#2563eb', '', true);
  assert.ok(parseHex(sem.b), 'vizinha é uma cor válida');
  assert.notEqual(sem.b, sem.a, 'a segunda mancha dá profundidade: não é a mesma cor');
  assert.equal(sem.b, corVizinha('#2563eb'));
  assert.equal(parametrosDoFundo('#2563eb', 'lixo', true).b, corVizinha('#2563eb'), 'segunda cor inválida é ignorada');
});

test('parametrosDoFundo: cor inválida cai na cor padrão', () => {
  assert.equal(parametrosDoFundo('nao-e-cor', '', true).a, DEFAULT_ACCENT);
  assert.equal(parametrosDoFundo(undefined, undefined, false).a, DEFAULT_ACCENT);
});

test('presença de verdade: no escuro mais profundo que no claro, e nunca abaixo do piso', () => {
  for (const marca of ['#5b62d6', '#2563eb', '#0e9f6e', '#dc2626', '#7c3aed', '#db2777']) {
    const escuro = parametrosDoFundo(marca, '', true);
    const claro = parametrosDoFundo(marca, '', false);
    assert.ok(escuro.alfaA >= INTENSIDADE.piso, `${marca} no escuro: ${escuro.alfaA}`);
    assert.ok(claro.alfaA >= INTENSIDADE.piso, `${marca} no claro: ${claro.alfaA}`);
    assert.ok(escuro.alfaA <= INTENSIDADE.dark && claro.alfaA <= INTENSIDADE.light);
    assert.ok(escuro.alfaLinha > 0 && claro.alfaLinha > 0, 'as linhas aparecem nos dois temas');
  }
});

test('contraste AA do texto sobre o PIOR momento do fundo, em qualquer cor de marca e nos dois temas', () => {
  for (const marca of MARCAS) for (const escuro of [true, false]) {
    for (const segunda of ['', '#3cd3a4', '#ffffff', '#000000']) {
      const p = parametrosDoFundo(marca, segunda, escuro);
      const pior = piorFundo(p, escuro);
      for (const texto of TEXTO[escuro ? 'dark' : 'light']) {
        const cr = contrastRatio(texto, pior);
        assert.ok(cr >= 4.5, `${marca}+${segunda || 'sem segunda'} ${escuro ? 'escuro' : 'claro'}: ${texto} sobre ${pior} = ${cr.toFixed(2)}`);
      }
      const marcaTexto = textoDeMarcaSobreFundo(marca, segunda, escuro);
      const crMarca = contrastRatio(marcaTexto, pior);
      assert.ok(crMarca >= 4.5, `${marca} ${escuro ? 'escuro' : 'claro'}: texto na cor da marca ${marcaTexto} sobre ${pior} = ${crMarca.toFixed(2)}`);
      assert.ok(contrastRatio(marcaTexto, escuro ? BG_DARK : BG_LIGHT) >= 4.5, 'continua passando no fundo liso');
    }
  }
});

test('piorFundo: as duas manchas sobrepostas sobre o fundo do tema', () => {
  const p = parametrosDoFundo('#2563eb', '', true);
  const pior = piorFundo(p, true);
  assert.ok(parseHex(pior));
  assert.notEqual(pior.toLowerCase(), BG_DARK, 'o fundo é tingido de verdade');
  assert.equal(piorFundo({ a: '#2563eb', b: '#2563eb', alfaA: 0, alfaB: 0 }, false).toLowerCase(), BG_LIGHT);
});

test('variaveisDoFundo: o que vai pro CSS é cor com transparência, pronta pra usar', () => {
  const v = variaveisDoFundo(parametrosDoFundo('#2563eb', '', true));
  for (const nome of ['--fundo-a', '--fundo-b', '--fundo-linha']) {
    assert.match(v[nome], /^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, 0?\.\d+\)$|^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, [01]\)$/, `${nome}: ${v[nome]}`);
  }
});
