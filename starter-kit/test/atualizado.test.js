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

// 3.9 (achado 5 da auditoria de 25/10/2026): "Atualizado agora" media a LEITURA, não o dado. Um painel com
// a planilha parada em 04/10 dizia "Atualizado agora" em 25/10. Quando o dado mais recente é de antes de
// hoje, o texto diz qual é o último dia com dado.
import { textoDoFrescor } from '../public/assets/js/lib/atualizado.js';

test('textoDoFrescor: dado de hoje mantém a idade da leitura', () => {
  const agora = Date.parse('2026-10-25T15:00:00Z');
  assert.equal(textoDoFrescor({ lidoEm: agora - 5000, ultimoDia: '2026-10-25', hoje: '2026-10-25', agora }), 'Atualizado agora');
  assert.equal(textoDoFrescor({ lidoEm: agora - 3 * 60000, ultimoDia: '2026-10-25', hoje: '2026-10-25', agora }), 'Atualizado há 3 min');
});

test('textoDoFrescor: dado mais antigo que hoje diz a data do último dado, e não "Atualizado agora"', () => {
  const agora = Date.parse('2026-10-25T15:00:00Z');
  assert.equal(textoDoFrescor({ lidoEm: agora, ultimoDia: '2026-10-04', hoje: '2026-10-25', agora }), 'Último dado: 04/10 (há 21 dias)');
  assert.equal(textoDoFrescor({ lidoEm: agora, ultimoDia: '2026-10-24', hoje: '2026-10-25', agora }), 'Último dado: 24/10 (ontem)');
  assert.equal(textoDoFrescor({ lidoEm: agora, ultimoDia: '2025-12-30', hoje: '2026-01-02', agora }), 'Último dado: 30/12/2025 (há 3 dias)');
});

test('textoDoFrescor: sem coluna de data (ou dado no futuro) fica a idade da leitura', () => {
  const agora = Date.parse('2026-10-25T15:00:00Z');
  assert.equal(textoDoFrescor({ lidoEm: agora, ultimoDia: null, hoje: '2026-10-25', agora }), 'Atualizado agora');
  assert.equal(textoDoFrescor({ lidoEm: agora, ultimoDia: '2026-10-31', hoje: '2026-10-25', agora }), 'Atualizado agora');
  assert.equal(textoDoFrescor({ lidoEm: null, ultimoDia: null, hoje: '2026-10-25', agora }), '');
});
