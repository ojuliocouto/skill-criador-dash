// Rótulo padrão das abas do assistente de grupo (group.html).
//
// Achado da prova no ar de 08/10/2026: com dois painéis do mesmo domínio (o caso comum: Marketing da loja e
// Marketing da clínica), as duas abas saíam com o mesmo nome, "Marketing", e a pessoa não sabia qual era qual
// até clicar. O domínio só serve de rótulo quando é único; empatou, vale o nome do painel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotulosPadrao } from '../public/assets/js/group-wizard.js';

test('rotulosPadrao: domínios diferentes usam o domínio com inicial maiúscula', () => {
  const r = rotulosPadrao([
    { id: 'a', name: 'Loja Aurora', domain: 'marketing' },
    { id: 'b', name: 'Loja Aurora vendas', domain: 'vendas' },
    { id: 'c', name: 'Loja Aurora suporte', domain: 'suporte' },
  ]);
  assert.deepEqual(r, { a: 'Marketing', b: 'Vendas', c: 'Suporte' });
});

test('rotulosPadrao: dois painéis do mesmo domínio usam o NOME de cada um (nunca duas abas iguais)', () => {
  const r = rotulosPadrao([
    { id: 'loja', name: 'Loja Aurora', domain: 'marketing' },
    { id: 'clinica', name: 'Clínica Lume', domain: 'marketing' },
  ]);
  assert.deepEqual(r, { loja: 'Loja Aurora', clinica: 'Clínica Lume' });
  assert.notEqual(r.loja, r.clinica);
});

test('rotulosPadrao: o domínio repetido só afeta quem repete; o único segue com o domínio', () => {
  const r = rotulosPadrao([
    { id: 'm1', name: 'Marketing da loja', domain: 'marketing' },
    { id: 'm2', name: 'Marketing da clínica', domain: 'marketing' },
    { id: 'v', name: 'Vendas da loja', domain: 'vendas' },
  ]);
  assert.deepEqual(r, { m1: 'Marketing da loja', m2: 'Marketing da clínica', v: 'Vendas' });
});

test('rotulosPadrao: sem domínio cai no nome, e sem nome cai no id', () => {
  const r = rotulosPadrao([{ id: 'x', name: 'Painel X' }, { id: 'y' }]);
  assert.deepEqual(r, { x: 'Painel X', y: 'y' });
});

test('rotulosPadrao: lista vazia ou inválida devolve objeto vazio', () => {
  assert.deepEqual(rotulosPadrao([]), {});
  assert.deepEqual(rotulosPadrao(undefined), {});
});
