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

// MINOR (armadilha 100x): parseNumberBR trata o sufixo '%' apenas removendo o
// simbolo e devolvendo o numero COMO ESTA ('50%' -> 50, NAO 0.5). Nao ha divisao
// por 100 escondida aqui: converter por-cento -> fracao e responsabilidade da
// metrica que consome o valor. Travado pra nao virar comportamento-surpresa.
test('parseNumberBR: sufixo % e removido e o numero volta como esta (nao divide por 100)', () => {
  assert.equal(parseNumberBR('50%'), 50);
  assert.equal(parseNumberBR('42%'), 42);
  assert.equal(parseNumberBR('100%'), 100);
  assert.equal(parseNumberBR('12,5%'), 12.5); // decimal BR com %
  assert.equal(parseNumberBR('0%'), 0);
});

test('parseNumberBR: somar coluna de percentuais nao encolhe 100x', () => {
  // Se o parser dividisse por 100, a soma seria 0.8 (bug 100x). Aqui e 80.
  const coluna = ['50%', '30%'];
  const soma = coluna.reduce((acc, v) => acc + parseNumberBR(v), 0);
  assert.equal(soma, 80);
});

// ROBUSTEZ (format.js parseNumberBR): o fast-path de number direto pulava o guard
// de finitude, entao parseNumberBR(Infinity) devolvia Infinity (vazava pro UI).
// Entrada number nao-finita deve virar NaN (fallback padrao da funcao, como os
// demais invalidos). Numeros finitos continuam intactos.
test('parseNumberBR: number nao-finito (Infinity/NaN) vira NaN, finito intacto', () => {
  assert.ok(Number.isNaN(parseNumberBR(Infinity)), 'Infinity number vira NaN');
  assert.ok(Number.isNaN(parseNumberBR(-Infinity)), '-Infinity number vira NaN');
  assert.ok(Number.isNaN(parseNumberBR(NaN)), 'NaN number continua NaN');
  assert.equal(parseNumberBR(42), 42);       // finito intacto
  assert.equal(parseNumberBR(0), 0);
  assert.equal(parseNumberBR(-5.5), -5.5);
  assert.equal(parseNumberBR(1234.56), 1234.56);
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

// GRAVE 1: coluna US so-com-virgula (milhar sem ponto decimal).
// '1,234' era tratado como decimal BR (1.234) e a soma da coluna encolhia ~1000x.
// Regra: se a virgula separa grupos de EXATAMENTE 3 digitos, e milhar (remove virgula).
test('parseNumberBR: US so-com-virgula de milhar (grupos de 3 digitos)', () => {
  assert.equal(parseNumberBR('1,234'), 1234);
  assert.equal(parseNumberBR('12,345'), 12345);
  assert.equal(parseNumberBR('1,000,000'), 1000000);
});

test('parseNumberBR: so-com-virgula decimal BR quando nao e grupo de 3', () => {
  assert.equal(parseNumberBR('1,23'), 1.23); // 2 casas = decimal
  assert.equal(parseNumberBR('1,5'), 1.5);   // 1 casa = decimal
});

test('parseNumberBR: soma de coluna US so-virgula bate o total inteiro', () => {
  const coluna = ['1,234', '5,678'];
  const soma = coluna.reduce((acc, v) => acc + parseNumberBR(v), 0);
  assert.equal(soma, 6912); // 1234 + 5678, sem encolher
});

// MINOR: fmtInteger(-0.4) arredonda pra -0; deve normalizar pra '0'.
test('fmtInteger: normaliza zero negativo para 0', () => {
  assert.equal(fmtInteger(-0.4), '0');
  assert.equal(fmtInteger(-0), '0');
  // Math.round arredonda o meio para +infinito: -0.5 -> -0 (normalizado para '0').
  assert.equal(fmtInteger(-0.5), '0');
  assert.equal(fmtInteger(-0.6), '-1'); // magnitude > 0.5 arredonda normal
  assert.equal(fmtInteger(-1234.5), '-1.234'); // negativo grande formata com sinal
});

// MINOR: parseDateBR deve aceitar ISO com mes/dia de 1 digito (hifen e barra),
// coerente com o ramo BR que ja aceita D/M/AAAA.
test('parseDateBR: aceita ISO com mes/dia de 1 digito', () => {
  assert.equal(parseDateBR('2026-2-1'), '2026-02-01');
  assert.equal(parseDateBR('2026/1/1'), '2026-01-01');
  assert.equal(parseDateBR('2026-12-31'), '2026-12-31'); // 2 digitos continua
});

// CORRETUDE 1: parseNumberBR usava Number() cru, que aceita hexadecimal
// ('0x1A'), notacao cientifica ('1e3') e formas degeneradas ('5.', '.5').
// Esses casos devem virar NaN (texto, nao numero decimal plausivel), sem
// mis-parsear 'FF'/'1e3'/'0x1A' como numero. Numeros validos BR/US continuam.
test('parseNumberBR: rejeita hexadecimal, notacao cientifica e degenerados', () => {
  assert.ok(Number.isNaN(parseNumberBR('FF')), "'FF' nao e numero decimal");
  assert.ok(Number.isNaN(parseNumberBR('0x1A')), "'0x1A' hex vira NaN");
  assert.ok(Number.isNaN(parseNumberBR('1e3')), "'1e3' cientifica NAO vira 1000");
  assert.ok(Number.isNaN(parseNumberBR('1E3')), "'1E3' cientifica maiuscula NaN");
  assert.ok(Number.isNaN(parseNumberBR('2.5e2')), "'2.5e2' cientifica NaN");
  assert.ok(Number.isNaN(parseNumberBR('Infinity')), "'Infinity' vira NaN");
  assert.ok(Number.isNaN(parseNumberBR('0b101')), "binario vira NaN");
  assert.ok(Number.isNaN(parseNumberBR('5.')), "'5.' degenerado vira NaN");
  assert.ok(Number.isNaN(parseNumberBR('.5')), "'.5' degenerado vira NaN");
});

test('parseNumberBR: numeros validos continuam funcionando apos o guard', () => {
  // Reforca que o guard nao regrediu os casos ja cobertos.
  assert.equal(parseNumberBR('1.234,56'), 1234.56);
  assert.equal(parseNumberBR('1,234.56'), 1234.56);
  assert.equal(parseNumberBR('1234'), 1234);
  assert.equal(parseNumberBR('1234.56'), 1234.56);
  assert.equal(parseNumberBR('0,5'), 0.5);
  assert.equal(parseNumberBR('-5,5'), -5.5);
  assert.equal(parseNumberBR('+42'), 42);
  assert.equal(parseNumberBR('R$ 1.234,50'), 1234.5);
  assert.equal(parseNumberBR('50%'), 50);
  assert.equal(parseNumberBR('100.000'), 100000);
  assert.equal(parseNumberBR('1.000.000'), 1000000);
});

// CORRETUDE 4 (format.js:52): a heuristica "3 digitos apos ponto = milhar"
// e AMBIGUA de verdade (nao da pra saber se '1.234' e mil-e-poucos ou 1.234
// reais so pela string). NAO resolvemos a ambiguidade aqui: apenas TRAVAMOS o
// comportamento escolhido (ponto unico + 3 digitos = milhar) pra nao regredir.
test('parseNumberBR: ponto unico 3 digitos = milhar e comportamento TRAVADO (ambiguidade documentada)', () => {
  // Escolha: milhar. Um preco decimal legitimo de 3 casas ('1.234' = 1.234 reais)
  // e lido como 1234. Isso e conhecido e documentado no comentario do codigo.
  assert.equal(parseNumberBR('1.234'), 1234);
  assert.equal(parseNumberBR('100.000'), 100000);
  // 2 casas apos o ponto NAO e milhar -> decimal ('1.23' = 1.23).
  assert.equal(parseNumberBR('1.23'), 1.23);
  // 4 casas apos o ponto NAO e milhar -> decimal ('1.2345' = 1.2345).
  assert.equal(parseNumberBR('1.2345'), 1.2345);
});
