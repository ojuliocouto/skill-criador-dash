// Sugestão de modo (claro ou escuro) a partir do logotipo e da cor da marca. A pessoa decide;
// a sugestão só vem marcada, com o motivo em palavra comum.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sugerirModo } from '../public/assets/js/lib/modo-sugerido.js';

test('logotipo de traço claro pede fundo escuro, seja qual for a cor', () => {
  for (const accent of ['#2563eb', '#facc15', '#334155', '#dc2626']) {
    const s = sugerirModo({ accent, logoFundo: 'escuro' });
    assert.equal(s.modo, 'escuro');
    assert.match(s.motivo, /logotipo/i);
  }
});

test('marca de cor escura e sóbria sugere escuro', () => {
  for (const accent of ['#334155', '#1e293b', '#111827', '#1e3a8a', '#3f3f46', '#14532d']) {
    const s = sugerirModo({ accent });
    assert.equal(s.modo, 'escuro', accent);
    assert.match(s.motivo, /escura/i);
  }
});

test('cor viva sobre branco sugere claro', () => {
  for (const accent of ['#2563eb', '#dc2626', '#db2777', '#7c3aed', '#0e9f6e', '#d9730d', '#5b62d6']) {
    const s = sugerirModo({ accent });
    assert.equal(s.modo, 'claro', accent);
    assert.match(s.motivo, /viva/i);
  }
});

test('cor clara demais some no branco: sugere escuro', () => {
  for (const accent of ['#facc15', '#fde68a', '#a7f3d0', '#22d3ee']) {
    assert.equal(sugerirModo({ accent }).modo, 'escuro', accent);
  }
});

test('logotipo de traço escuro não muda a sugestão que vem da cor', () => {
  assert.equal(sugerirModo({ accent: '#2563eb', logoFundo: 'claro' }).modo, 'claro');
  assert.equal(sugerirModo({ accent: '#334155', logoFundo: 'claro' }).modo, 'escuro');
});

test('cor inválida ou ausente não quebra: cai no padrão (claro)', () => {
  for (const accent of [undefined, null, '', 'azul', '#12']) {
    const s = sugerirModo({ accent });
    assert.equal(s.modo, 'claro');
    assert.ok(s.motivo.length > 10);
  }
  assert.equal(sugerirModo().modo, 'claro');
});

test('o motivo é texto de tela: palavra comum, sem jargão e sem travessão', () => {
  const motivos = [
    sugerirModo({ accent: '#2563eb' }), sugerirModo({ accent: '#334155' }),
    sugerirModo({ accent: '#facc15' }), sugerirModo({ accent: '#2563eb', logoFundo: 'escuro' }),
  ].map((s) => s.motivo);
  for (const m of motivos) {
    assert.ok(!/\btema\b|accent|lumin|satura|contraste/i.test(m), m);
    assert.ok(!m.includes(String.fromCharCode(8212)));
  }
  assert.equal(new Set(motivos).size, 4, 'cada caso explica o seu motivo');
});
