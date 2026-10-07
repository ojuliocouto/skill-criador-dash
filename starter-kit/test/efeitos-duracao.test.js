// Faixa de duração dos 7 efeitos (3.7.0). Eles passam, de propósito, dos tetos de 120 a 700 ms do
// movimento.test.js e do presenca.test.js (que seguem valendo pra tudo o mais); aqui vale a faixa deles:
// nenhum passa de 2,4 s e a troca de período inteira (pílula, roleta, gráfico) termina em até 1,0 s.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { DURACAO } from '../public/assets/js/lib/movimento.js';
import { DURACAO_DA_ROLETA, atrasoDoDigito } from '../public/assets/js/lib/numero-roleta.js';
import { DURACAO_DOS_DADOS } from '../public/assets/js/lib/grafico-transforma.js';
import { DURACAO_DA_PILULA } from '../public/assets/js/lib/periodo-atalhos.js';
import { DURACAO_DA_REGUA } from '../public/assets/js/lib/grafico-responde.js';
import { DURACAO_DA_ORDEM } from '../public/assets/js/lib/tabela-ordena.js';
import { TEMPOS_DA_CAPA } from '../public/assets/js/lib/cartao-vira-tela.js';
import { DURACAO_TOTAL_DO_MARCO } from '../public/assets/js/lib/meta-batida.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
const TETO_DO_EFEITO = 2400;
const TETO_DA_TROCA_DE_PERIODO = 1000;
const MODULOS = ['cartao-vira-tela', 'grafico-responde', 'grafico-transforma', 'meta-batida', 'numero-roleta', 'periodo-atalhos', 'tabela-ordena'];

test('a troca de período inteira (pílula, roleta, gráfico) termina em até 1,0 s', () => {
  const pilula = DURACAO_DA_PILULA;
  const roleta = DURACAO_DA_ROLETA + atrasoDoDigito(99); // a casa que sai por último
  const grafico = DURACAO_DOS_DADOS;
  const troca = Math.max(pilula, roleta, grafico);
  assert.ok(pilula > 0 && roleta > 0 && grafico > 0, 'as três durações existem');
  assert.ok(troca <= TETO_DA_TROCA_DE_PERIODO, `a troca de período leva ${troca} ms`);
});

test('cada efeito dura no máximo 2,4 s, do começo ao fim', () => {
  const efeitos = {
    'gráfico que responde': DURACAO_DA_REGUA,
    'período em um clique': DURACAO_DA_PILULA,
    'números de roleta': DURACAO_DA_ROLETA + atrasoDoDigito(99),
    'gráfico que se transforma': DURACAO_DOS_DADOS,
    'meta batida': DURACAO_TOTAL_DO_MARCO,
    'tabela que reordena': DURACAO_DA_ORDEM + 12 * 8,
    'cartão que vira a tela': TEMPOS_DA_CAPA.cresce + TEMPOS_DA_CAPA.nome + TEMPOS_DA_CAPA.levanta + 140,
  };
  for (const [nome, ms] of Object.entries(efeitos)) assert.ok(ms > 0 && ms <= TETO_DO_EFEITO, `${nome}: ${ms} ms`);
});

test('nenhuma duração escrita à mão nos módulos ou no CSS dos efeitos passa de 2,4 s', () => {
  for (const nome of MODULOS) {
    const js = readFileSync(join(raiz, 'js/lib', `${nome}.js`), 'utf8');
    for (const m of js.matchAll(/(?:duration|delay)\s*:\s*(\d+)/g)) assert.ok(Number(m[1]) <= TETO_DO_EFEITO, `${nome}.js: ${m[0]}`);
  }
  const css = readFileSync(join(raiz, 'css/efeitos.css'), 'utf8');
  for (const m of css.matchAll(/(?:^|[\s:(,])(\d*\.?\d+)(ms|s)\b/g)) {
    const ms = m[2] === 's' ? Number(m[1]) * 1000 : Number(m[1]);
    assert.ok(ms <= TETO_DO_EFEITO, `efeitos.css: ${m[0].trim()}`);
  }
});

test('o marco da meta batida fica entre 1,6 e 2,4 s e os demais efeitos não são mais longos que ele', () => {
  assert.ok(DURACAO_TOTAL_DO_MARCO >= 1600 && DURACAO_TOTAL_DO_MARCO <= TETO_DO_EFEITO);
  assert.ok(DURACAO.troca + 60 <= DURACAO_TOTAL_DO_MARCO);
});

test('a faixa dos efeitos não afrouxou os tetos do resto: os tokens do main.css seguem no limite', () => {
  assert.ok(DURACAO.toque <= 220 && DURACAO.troca <= 220 && DURACAO.entrada <= 400 && DURACAO.contagem <= 700);
  assert.ok(readdirSync(raiz).includes('css'));
});
