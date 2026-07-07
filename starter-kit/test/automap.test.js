import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoMap, normalizeHeader } from '../public/assets/js/lib/automap.js';

const slots = [
  { key: 'data', aliases: ['data', 'dia', 'date'] },
  { key: 'valor', aliases: ['valor', 'preco', 'total'] },
  { key: 'canal', aliases: ['canal', 'origem'] },
];

test('autoMap: coluna vazia no fim (Google Sheets) NAO casa nenhum slot', () => {
  // O bug antigo fazia a coluna '' casar o primeiro slot (alias.includes('') = true).
  const r = autoMap(slots, ['Data', 'Valor', 'Canal', '']);
  assert.equal(r.data, 'Data');
  assert.equal(r.valor, 'Valor');
  assert.equal(r.canal, 'Canal');
  // nenhuma chave aponta para a coluna vazia
  assert.ok(!Object.values(r).includes(''));
});

test('autoMap: coluna curta nao rouba alias longo por substring', () => {
  // "da" nao pode casar o alias "data" (substring curto).
  const r = autoMap([{ key: 'data', aliases: ['data'] }], ['da', 'Data']);
  assert.equal(r.data, 'Data');
});

test('autoMap: match exato tem prioridade sobre substring (nao consome a coluna errada)', () => {
  // "Valor total" contem "valor"; mas ha uma coluna "Valor" exata que deve ir pro slot valor.
  const r = autoMap(
    [{ key: 'valor', aliases: ['valor'] }, { key: 'total', aliases: ['total'] }],
    ['Valor total', 'Valor'],
  );
  assert.equal(r.valor, 'Valor');       // exato vence
  assert.equal(r.total, 'Valor total'); // substring pega o que sobrou
});

test('autoMap: mapeamento normal continua funcionando (marketing-like)', () => {
  const r = autoMap(
    [
      { key: 'data', aliases: ['data', 'dia'] },
      { key: 'canal', aliases: ['canal', 'origem'] },
      { key: 'investimento', aliases: ['investimento', 'valor gasto', 'gasto'] },
    ],
    ['Data', 'Origem', 'Valor Gasto'],
  );
  assert.equal(r.data, 'Data');
  assert.equal(r.canal, 'Origem');
  assert.equal(r.investimento, 'Valor Gasto');
});

test('autoMap: slot sem coluna correspondente vira null', () => {
  const r = autoMap(slots, ['Data', 'Valor']);
  assert.equal(r.canal, null);
});

test('normalizeHeader: remove acento, minuscula, colapsa espacos', () => {
  assert.equal(normalizeHeader('  Conversões  '), 'conversoes');
  assert.equal(normalizeHeader('Valor   Gasto'), 'valor gasto');
});

// GRAVE 2: match por substring embutida gera falso positivo.
// 'data' NAO pode casar 'Metadata'; 'total' NAO pode casar 'Subtotal'.
// O match deve ser por TOKEN completo (ou prefixo de token), nao pedaco no meio da palavra.
test('autoMap: alias NAO casa quando e substring no meio de outra palavra', () => {
  // Sem match, o slot fica null (autoMap sempre inicializa a chave do slot).
  assert.deepEqual(autoMap([{ key: 'data', aliases: ['data'] }], ['Metadata']), { data: null });
  assert.deepEqual(autoMap([{ key: 'valor', aliases: ['total'] }], ['Subtotal']), { valor: null });
});

test('autoMap: alias casa como token completo dentro do header (casos legitimos)', () => {
  assert.equal(autoMap([{ key: 'data', aliases: ['data'] }], ['Data da venda']).data, 'Data da venda');
  assert.equal(autoMap([{ key: 'valor', aliases: ['total'] }], ['Valor total']).valor, 'Valor total');
});
