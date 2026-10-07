// Efeito 6 (cartão que vira a tela): a conta do cartão que cresce até cobrir a tela e o aviso
// que atravessa de uma página pra outra (sessionStorage, sem view-transition do navegador).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  transformDoCartao, normalizarCor, corDoTextoSobre, montarAviso, avisoValido, CHAVE_DO_AVISO, VALIDADE_DO_AVISO_MS, TEMPOS_DA_CAPA,
} from '../public/assets/js/lib/cartao-vira-tela.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

test('transformDoCartao: leva uma camada de tela cheia a ocupar exatamente o retângulo do cartão', () => {
  const t = transformDoCartao({ left: 100, top: 200, width: 720, height: 90 }, 1440, 900);
  assert.equal(t, 'translate(100px, 200px) scale(0.5, 0.1)');
  assert.equal(transformDoCartao({ left: 0, top: 0, width: 1440, height: 900 }, 1440, 900), 'translate(0px, 0px) scale(1, 1)');
});

test('transformDoCartao: dado inválido ou tela sem tamanho devolve none (a camada já nasce cheia)', () => {
  assert.equal(transformDoCartao(null, 1440, 900), 'none');
  assert.equal(transformDoCartao({ left: 1, top: 1, width: 0, height: 10 }, 1440, 900), 'none');
  assert.equal(transformDoCartao({ left: 1, top: 1, width: 10, height: 10 }, 0, 900), 'none');
  assert.equal(transformDoCartao({ left: NaN, top: 1, width: 10, height: 10 }, 1440, 900), 'none');
});

test('normalizarCor: só hexadecimal de verdade passa (a cor vira CSS na outra página); senão cai na padrão', () => {
  assert.equal(normalizarCor('#1F8A70'), '#1f8a70');
  assert.equal(normalizarCor('#abc'), '#aabbcc');
  assert.equal(normalizarCor('red'), '#5b62d6');
  assert.equal(normalizarCor('#12345'), '#5b62d6');
  assert.equal(normalizarCor('#fff;background:url(x)'), '#5b62d6');
  assert.equal(normalizarCor(undefined), '#5b62d6');
});

test('corDoTextoSobre: texto claro sobre cor escura e escuro sobre cor clara', () => {
  assert.equal(corDoTextoSobre('#1f8a70'), '#ffffff');
  assert.equal(corDoTextoSobre('#3b5bdb'), '#ffffff');
  assert.equal(corDoTextoSobre('#ffe066'), '#14171d');
  assert.equal(corDoTextoSobre('#ffffff'), '#14171d');
});

test('aviso entre páginas: nasce com cor limpa, vale por poucos segundos e some se for velho ou estranho', () => {
  const agora = 1_000_000;
  const aviso = montarAviso({ cor: '#D9531E', nome: 'Loja Aurora' }, agora);
  assert.equal(aviso.cor, '#d9531e');
  assert.equal(aviso.nome, 'Loja Aurora');
  assert.equal(avisoValido(aviso, agora + 1500), true);
  assert.equal(avisoValido(aviso, agora + VALIDADE_DO_AVISO_MS + 1), false);
  assert.equal(avisoValido(null, agora), false);
  assert.equal(avisoValido({ cor: 'red', t: agora }, agora), false);
  assert.equal(avisoValido({ cor: '#fff', t: 'ontem' }, agora), false);
  assert.ok(CHAVE_DO_AVISO.length > 3);
  assert.equal(montarAviso({ cor: '#fff', nome: '<b>x</b>'.repeat(30) }, agora).nome.length <= 40, true);
});

test('tempos: o cartão cobre a tela em até 700 ms e a capa sai em até 700 ms', () => {
  assert.ok(TEMPOS_DA_CAPA.cresce >= 350 && TEMPOS_DA_CAPA.cresce <= 700);
  assert.ok(TEMPOS_DA_CAPA.levanta >= 350 && TEMPOS_DA_CAPA.levanta <= 700);
});

test('não usa view-transition do navegador (travou a gravação sem janela, medido em 05/10/2026)', () => {
  for (const arq of ['public/assets/css/efeitos.css', 'public/assets/js/lib/cartao-vira-tela.js', 'public/assets/js/index-page.js', 'public/assets/js/lib/cobertura-boot.js']) {
    const fonte = readFileSync(join(raiz, arq), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/view-transition|startViewTransition/.test(fonte), arq);
  }
});
