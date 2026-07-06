import { test } from 'node:test';
import assert from 'node:assert/strict';
import { template } from '../public/assets/js/templates/suporte.js';
import { computeAll } from '../public/assets/js/lib/metrics.js';

const colMap = {
  data: 'Data',
  canal: 'Canal',
  atendimentos: 'Atendimentos',
  resolvidos: 'Resolvidos',
  tempo_resposta: 'Tempo de resposta',
  csat: 'CSAT',
};

const rows = [
  { Data: '01/07/2026', Canal: 'WhatsApp', Atendimentos: '100', Resolvidos: '80', 'Tempo de resposta': '3,0', CSAT: '4,5' },
  { Data: '01/07/2026', Canal: 'Email', Atendimentos: '50', Resolvidos: '40', 'Tempo de resposta': '5,0', CSAT: '4,0' },
  { Data: '02/07/2026', Canal: 'Chat', Atendimentos: '50', Resolvidos: '30', 'Tempo de resposta': '1,0', CSAT: '5,0' },
];

test('suporte: atendimentos e a soma da coluna (volume)', () => {
  const c = computeAll(template.metrics, rows, colMap);
  assert.equal(c.atendimentos, 200); // 100 + 50 + 50
});

test('suporte: resolvidos e a soma da coluna', () => {
  const c = computeAll(template.metrics, rows, colMap);
  assert.equal(c.resolvidos, 150); // 80 + 40 + 30
});

test('suporte: taxa_resolucao = resolvidos / atendimentos', () => {
  const c = computeAll(template.metrics, rows, colMap);
  assert.equal(c.taxa_resolucao, 150 / 200); // 0.75
});

test('suporte: tempo_resposta e a media (avg)', () => {
  const c = computeAll(template.metrics, rows, colMap);
  assert.ok(Math.abs(c.tempo_resposta - (3 + 5 + 1) / 3) < 1e-9); // 3,0
});

test('suporte: csat e a media (avg)', () => {
  const c = computeAll(template.metrics, rows, colMap);
  assert.ok(Math.abs(c.csat - (4.5 + 4.0 + 5.0) / 3) < 1e-9); // 4,5
});
