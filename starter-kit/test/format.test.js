import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNumberBR, parseDateBR, fmtCurrency, fmtNumber, fmtPercent, fmtInteger,
} from '../public/assets/js/lib/format.js';

test('parseNumberBR: formato brasileiro', () => {
  assert.equal(parseNumberBR('1.234,56'), 1234.56);
  assert.equal(parseNumberBR('1.500'), 1500);       // milhar de 3 digitos sem decimal
  assert.equal(parseNumberBR('1.234'), 1234);       // milhar BR sem decimal
  assert.equal(parseNumberBR('0,5'), 0.5);
  assert.equal(parseNumberBR('R$ 1.234,50'), 1234.5);
  assert.equal(parseNumberBR('R$1.234,50'), 1234.5);
});

test('parseNumberBR: formato americano e inteiros', () => {
  assert.equal(parseNumberBR('1234.56'), 1234.56);
  assert.equal(parseNumberBR('1234'), 1234);
  assert.equal(parseNumberBR(42), 42);
  assert.equal(parseNumberBR('42%'), 42);
});

test('parseNumberBR: invalidos viram NaN', () => {
  assert.ok(Number.isNaN(parseNumberBR('')));
  assert.ok(Number.isNaN(parseNumberBR('abc')));
  assert.ok(Number.isNaN(parseNumberBR(null)));
  assert.ok(Number.isNaN(parseNumberBR(undefined)));
});

test('parseDateBR: normaliza para ISO YYYY-MM-DD', () => {
  assert.equal(parseDateBR('31/12/2026'), '2026-12-31');
  assert.equal(parseDateBR('01/02/2026'), '2026-02-01');
  assert.equal(parseDateBR('2026-12-31'), '2026-12-31');
  assert.equal(parseDateBR('9/3/2026'), '2026-03-09'); // sem zero a esquerda
});

test('parseDateBR: invalidos viram null', () => {
  assert.equal(parseDateBR(''), null);
  assert.equal(parseDateBR('nao e data'), null);
  assert.equal(parseDateBR('32/13/2026'), null);
  assert.equal(parseDateBR(null), null);
});

test('formatadores BR', () => {
  assert.equal(fmtCurrency(1234.5), 'R$ 1.234,50');
  assert.equal(fmtCurrency(0), 'R$ 0,00');
  assert.equal(fmtInteger(1234), '1.234');
  assert.equal(fmtPercent(0.1234), '12,34%');
  assert.equal(fmtPercent(0.5), '50,00%');
});

test('formatadores lidam com NaN/invalido sem quebrar', () => {
  assert.equal(fmtCurrency(NaN), 'R$ 0,00');
  assert.equal(fmtInteger(NaN), '0');
  assert.equal(fmtPercent(NaN), '0,00%');
});

test('parseNumberBR: bordas de milhar e decimal', () => {
  assert.equal(parseNumberBR('12.345'), 12345);      // milhar sem decimal
  assert.equal(parseNumberBR('1.234.567'), 1234567); // dois grupos de milhar
  assert.equal(parseNumberBR('-5,5'), -5.5);         // negativo com decimal BR
  // formato ambiguo/invalido: grupo do meio com 2 digitos nao e milhar valido
  assert.ok(Number.isNaN(parseNumberBR('1.23.456')));
});

test('fmtNumber: saida no padrao BR', () => {
  assert.equal(fmtNumber(1234.5), '1.234,5'); // ponto = milhar, virgula = decimal
});

// GRAVE 1: parseNumberBR precisa distinguir US (virgula = milhar, ponto = decimal)
// de BR (ponto = milhar, virgula = decimal) pela ORDEM dos separadores.
// O separador decimal e sempre o que aparece por ULTIMO na string.
test('parseNumberBR: formato US com virgula de milhar e ponto decimal', () => {
  assert.equal(parseNumberBR('1,234.56'), 1234.56); // US: ultimo separador e ponto
  assert.equal(parseNumberBR('1.234,56'), 1234.56); // BR continua valendo
  assert.equal(parseNumberBR('1,000.00'), 1000);    // US redondo
  assert.equal(parseNumberBR('2.500,50'), 2500.5);  // BR
});

test('parseNumberBR: soma de coluna US nao encolhe ~1000x (achado do bug)', () => {
  const coluna = ['1,000.00', '2,500.50'];
  const soma = coluna.reduce((acc, v) => acc + parseNumberBR(v), 0);
  assert.equal(soma, 3500.5);
});

// MINOR: parseNumberBR('100.000') e ambiguo (poderia ser 100 mil ou 100.0).
// Regra adotada: um so separador '.' com exatamente 3 digitos apos = milhar -> 100000.
// Teste trava o comportamento pra nao regredir.
test('parseNumberBR: ponto unico com 3 digitos apos = milhar (regra travada)', () => {
  assert.equal(parseNumberBR('100.000'), 100000);
  assert.equal(parseNumberBR('1.000'), 1000);
});

// MINOR: parseDateBR deve aceitar ISO com barra (AAAA/MM/DD) alem de ISO com hifen e BR.
// NAO tenta adivinhar US (MM/DD/AAAA) por ser ambiguo com BR (DD/MM/AAAA).
test('parseDateBR: aceita ISO com barra AAAA/MM/DD', () => {
  assert.equal(parseDateBR('2026/12/31'), '2026-12-31');
  assert.equal(parseDateBR('2026/02/01'), '2026-02-01');
  assert.equal(parseDateBR('2026-12-31'), '2026-12-31'); // ISO com hifen continua
  assert.equal(parseDateBR('31/12/2026'), '2026-12-31'); // BR continua
});

test('parseDateBR: ISO com barra invalido vira null (mesmo retorno de hoje)', () => {
  assert.equal(parseDateBR('2026/13/40'), null);
});
