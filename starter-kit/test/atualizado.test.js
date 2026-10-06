// "Atualizado há X": o texto que diz a idade dos números e se mantém sozinho.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { textoAtualizado, proximaTroca, horaCurta } from '../public/assets/js/lib/atualizado.js';

const AGORA = Date.parse('2026-10-05T15:00:00.000Z');
const ha = (ms) => new Date(AGORA - ms).toISOString();
const SEG = 1000;
const MIN = 60 * SEG;
const HORA = 60 * MIN;

test('textoAtualizado: agora, minutos, horas e dias', () => {
  assert.equal(textoAtualizado(ha(0), AGORA), 'Atualizado agora');
  assert.equal(textoAtualizado(ha(59 * SEG), AGORA), 'Atualizado agora');
  assert.equal(textoAtualizado(ha(60 * SEG), AGORA), 'Atualizado há 1 min');
  assert.equal(textoAtualizado(ha(3 * MIN + 40 * SEG), AGORA), 'Atualizado há 3 min');
  assert.equal(textoAtualizado(ha(59 * MIN + 59 * SEG), AGORA), 'Atualizado há 59 min');
  assert.equal(textoAtualizado(ha(HORA), AGORA), 'Atualizado há 1 h');
  assert.equal(textoAtualizado(ha(5 * HORA + 30 * MIN), AGORA), 'Atualizado há 5 h');
  assert.equal(textoAtualizado(ha(24 * HORA), AGORA), 'Atualizado há 1 dia');
  assert.equal(textoAtualizado(ha(72 * HORA), AGORA), 'Atualizado há 3 dias');
});

test('textoAtualizado: relógio adiantado não vira tempo negativo; data inválida não inventa texto', () => {
  assert.equal(textoAtualizado(new Date(AGORA + 5 * MIN).toISOString(), AGORA), 'Atualizado agora');
  for (const ruim of [null, undefined, '', 'lixo', NaN]) assert.equal(textoAtualizado(ruim, AGORA), '');
  assert.equal(textoAtualizado(AGORA - 2 * MIN, AGORA), 'Atualizado há 2 min', 'aceita número também');
});

test('proximaTroca: quanto falta pro texto mudar (o relógio da tela acorda só nessa hora)', () => {
  assert.equal(proximaTroca(ha(0), AGORA), 60 * SEG);
  assert.equal(proximaTroca(ha(20 * SEG), AGORA), 40 * SEG);
  assert.equal(proximaTroca(ha(3 * MIN + 40 * SEG), AGORA), 20 * SEG);
  assert.equal(proximaTroca(ha(HORA + 10 * MIN), AGORA), 50 * MIN);
  assert.ok(proximaTroca(ha(59 * SEG + 999), AGORA) >= 1000, 'nunca acorda em rajada');
  assert.equal(proximaTroca('lixo', AGORA), null);
});

test('horaCurta: hora e minuto com dois dígitos', () => {
  assert.match(horaCurta(ha(0)), /^\d{2}:\d{2}$/);
  assert.equal(horaCurta('lixo'), '');
});
