import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  eligibleForGroup,
  buildGroupConfig,
  validateGroup,
} from '../public/assets/js/group-wizard.js';

// ---------- eligibleForGroup ----------
test('eligibleForGroup: exclui grupos (sem aninhar) e protegidos (nao embutem)', () => {
  const list = [
    { id: 'a', name: 'A', domain: 'marketing', protected: false },
    { id: 'g', name: 'G', kind: 'group', protected: false },
    { id: 'p', protected: true },
    { id: 'b', name: 'B', domain: 'vendas', protected: false },
  ];
  assert.deepEqual(eligibleForGroup(list).map((d) => d.id), ['a', 'b']);
});

test('eligibleForGroup: lista vazia/invalida devolve []', () => {
  assert.deepEqual(eligibleForGroup([]), []);
  assert.deepEqual(eligibleForGroup(undefined), []);
  assert.deepEqual(eligibleForGroup([null, { protected: false }]), []); // sem id sai
});

// ---------- buildGroupConfig ----------
test('buildGroupConfig: monta kind:group, apara nome/label, omite accent vazio', () => {
  const cfg = buildGroupConfig({
    name: '  Minha Empresa  ',
    accent: '',
    tabs: [{ id: 'a', label: '  Marketing ' }, { id: 'b', label: '' }],
  });
  assert.equal(cfg.kind, 'group');
  assert.equal(cfg.name, 'Minha Empresa');
  assert.equal(cfg.accent, undefined, 'accent vazio nao entra');
  assert.deepEqual(cfg.tabs, [{ id: 'a', label: 'Marketing' }, { id: 'b', label: 'b' }]);
});

test('buildGroupConfig: accent preenchido entra aparado; tabs sem id somem', () => {
  const cfg = buildGroupConfig({ name: 'X', accent: ' #FA243C ', tabs: [{ id: 'a', label: 'A' }, { label: 'sem id' }] });
  assert.equal(cfg.accent, '#FA243C');
  assert.deepEqual(cfg.tabs, [{ id: 'a', label: 'A' }]);
});

// ---------- validateGroup ----------
test('validateGroup: exige nome e pelo menos 2 abas', () => {
  assert.deepEqual(validateGroup({ name: '', tabs: [] }).length, 2);
  assert.match(validateGroup({ name: '', tabs: [{ id: 'a' }, { id: 'b' }] })[0], /nome/i);
  assert.match(validateGroup({ name: 'X', tabs: [{ id: 'a' }] })[0], /2 dashboards/i);
  assert.deepEqual(validateGroup({ name: 'X', tabs: [{ id: 'a' }, { id: 'b' }] }), []);
});
