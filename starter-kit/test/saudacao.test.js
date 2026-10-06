// Saudação de abertura: quem o painel cumprimenta, quando ela aparece e o HTML da tela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  quemCumprimentar, textoDaSaudacao, deveSaudar, chaveDaSaudacao, limparSaudacao, saudacaoValida,
  saudacaoHtml, TEMPOS, duracaoDaAbertura, LIMITE_DA_SAUDACAO,
} from '../public/assets/js/lib/saudacao.js';
import { LIMITE_DA_SAUDACAO as LIMITE_NO_SERVIDOR, validarAparencia } from '../functions/lib/aparencia-shape.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

test('quemCumprimentar: o nome escolhido; sem ele, o nome do painel', () => {
  assert.equal(quemCumprimentar({ name: 'Studio Equilíbrio - Anúncios', saudacao: 'Carla' }), 'Carla');
  assert.equal(quemCumprimentar({ name: 'Studio Equilíbrio - Anúncios', saudacao: '  time do Studio Equilíbrio ' }), 'time do Studio Equilíbrio');
  assert.equal(quemCumprimentar({ name: 'Studio Equilíbrio - Anúncios' }), 'Studio Equilíbrio - Anúncios');
  assert.equal(quemCumprimentar({ name: 'Painel', saudacao: '' }), 'Painel');
  assert.equal(quemCumprimentar({ name: 'Painel', saudacao: '<b>x</b>' }), 'Painel', 'texto com sinal de tag não é usado');
  assert.equal(quemCumprimentar({}), '');
  assert.equal(quemCumprimentar(null), '');
});

test('textoDaSaudacao: "Olá," separado do nome (o "Olá," vai na cor da marca)', () => {
  assert.deepEqual(textoDaSaudacao({ name: 'Painel', saudacao: 'Carla' }), { ola: 'Olá,', nome: 'Carla' });
  assert.deepEqual(textoDaSaudacao({}), { ola: 'Olá', nome: '' }, 'sem ninguém pra cumprimentar, sem vírgula solta');
});

test('limparSaudacao e saudacaoValida: texto curto, sem tag e sem quebra de linha', () => {
  assert.equal(limparSaudacao('  Carla   Souza '), 'Carla Souza');
  assert.equal(limparSaudacao(null), '');
  assert.equal(limparSaudacao('x'.repeat(60)).length, LIMITE_DA_SAUDACAO);
  assert.ok(saudacaoValida('Carla'));
  assert.ok(saudacaoValida('time do Studio Equilíbrio'));
  assert.ok(!saudacaoValida(''));
  assert.ok(!saudacaoValida('<script>'));
  assert.ok(!saudacaoValida('a\nb'));
  assert.ok(!saudacaoValida('x'.repeat(LIMITE_DA_SAUDACAO + 1)));
  assert.ok(!saudacaoValida(12));
});

test('a regra do texto é a mesma no navegador e no servidor', () => {
  assert.equal(LIMITE_DA_SAUDACAO, LIMITE_NO_SERVIDOR);
  for (const texto of ['Carla', 'time do Studio Equilíbrio', '', '   ', '<b>', 'a>b', 'a\tb', 'x'.repeat(40), 'x'.repeat(41)]) {
    const noServidor = validarAparencia({ saudacao: texto }) === null;
    const noNavegador = texto.trim() === '' ? true : saudacaoValida(texto);
    assert.equal(noNavegador, noServidor, `divergiu em ${JSON.stringify(texto)}`);
  }
});

test('deveSaudar: uma vez por sessão por painel, dá pra desligar e nunca com movimento reduzido', () => {
  const base = { config: { name: 'Painel' }, id: 'pilates', jaSaudou: false, menosMovimento: false };
  assert.equal(deveSaudar(base), true, 'nasce ligada: painel antigo, sem o campo, saúda');
  assert.equal(deveSaudar({ ...base, config: { name: 'Painel', saudacaoLigada: true } }), true);
  assert.equal(deveSaudar({ ...base, config: { name: 'Painel', saudacaoLigada: false } }), false);
  assert.equal(deveSaudar({ ...base, jaSaudou: true }), false);
  assert.equal(deveSaudar({ ...base, menosMovimento: true }), false);
  assert.equal(deveSaudar({ ...base, id: '' }), false);
  assert.equal(deveSaudar({ ...base, config: null }), false);
  assert.equal(deveSaudar({ ...base, config: {} }), false, 'sem nome nenhum não há quem cumprimentar');
});

test('chaveDaSaudacao: uma por painel', () => {
  assert.equal(chaveDaSaudacao('pilates'), 'cd-saudou:pilates');
  assert.notEqual(chaveDaSaudacao('a'), chaveDaSaudacao('b'));
});

test('saudacaoHtml: logotipo (se houver), "Olá," e o nome, tudo escapado', () => {
  const html = saudacaoHtml({ nome: 'Carla <3', logo: 'https://exemplo.com/l.png', logoFundo: 'escuro' });
  assert.match(html, /class="saudacao__ola">Olá,</);
  assert.match(html, /class="saudacao__nome">Carla &lt;3</);
  assert.match(html, /<img class="saudacao__logo-img" alt="" src="https:\/\/exemplo\.com\/l\.png"/);
  assert.match(html, /saudacao__logo--escuro/);
  assert.match(html, /aria-hidden="true"/, 'enfeite de abertura: o leitor de tela vai direto pro painel');
  const semLogo = saudacaoHtml({ nome: 'Carla', logo: 'javascript:alert(1)' });
  assert.ok(!semLogo.includes('javascript:'));
  assert.match(semLogo, /class="saudacao__logo"[^>]*hidden/);
  assert.match(saudacaoHtml({}), /class="saudacao__ola">Olá</);
});

test('dashboard.html traz a tela de saudação pronta (o servidor só preenche o nome e o logotipo)', () => {
  const html = readFileSync(join(raiz, 'public/dashboard.html'), 'utf8');
  assert.ok(html.includes(saudacaoHtml({ nome: '', comVirgula: true })), 'a marcação da página é a mesma que a função monta');
});

test('a abertura inteira cabe em 3 segundos', () => {
  assert.ok(TEMPOS.revelar >= 900, 'dá tempo de ler o nome');
  assert.ok(duracaoDaAbertura() <= 3000, `abertura de ${duracaoDaAbertura()} ms`);
  assert.ok(TEMPOS.pular <= 260, 'no clique, some na hora');
});

test('os tempos do JS espelham os tokens do CSS', () => {
  const css = readFileSync(join(raiz, 'public/assets/css/presenca.css'), 'utf8');
  const token = (nome) => Number((css.match(new RegExp(`${nome}:\\s*(\\d+)ms`)) || [])[1]);
  assert.equal(token('--saud-texto'), TEMPOS.texto);
  assert.equal(token('--saud-linha-inicio'), TEMPOS.linhaInicio);
  assert.equal(token('--saud-linha'), TEMPOS.linha);
  assert.equal(token('--saud-revelar'), TEMPOS.revelar);
  assert.equal(token('--saud-cortina'), TEMPOS.cortina);
  assert.equal(token('--saud-folha-atraso'), TEMPOS.folhaAtraso);
  assert.equal(token('--saud-pular'), TEMPOS.pular);
});
