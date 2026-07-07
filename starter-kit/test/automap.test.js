import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoMap, normalizeHeader, tokenize } from '../public/assets/js/lib/automap.js';

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

// GRAVE 1: tokenize precisa quebrar camelCase de verdade (antes nunca disparava
// porque recebia header ja em minusculo). Quebra entre [a-z0-9]->[A-Z] e entre
// letra->digito, entao normaliza (minuscula, sem acento).
test('tokenize: quebra camelCase e letra->digito', () => {
  assert.deepEqual(tokenize('ValorTotal'), ['valor', 'total']);
  assert.deepEqual(tokenize('DataVenda'), ['data', 'venda']);
  assert.deepEqual(tokenize('nomeCliente'), ['nome', 'cliente']);
  assert.deepEqual(tokenize('Receita2026'), ['receita', '2026']);
  assert.deepEqual(tokenize('CPFCliente'), ['cpf', 'cliente']); // acronimo + palavra
  assert.deepEqual(tokenize('Valor Gasto'), ['valor', 'gasto']); // espaco continua
  assert.deepEqual(tokenize('valor_total'), ['valor', 'total']); // snake continua
});

test('tokenize: remove acento ao normalizar (Conversões -> conversoes)', () => {
  assert.deepEqual(tokenize('Conversões'), ['conversoes']);
});

// GRAVE 1: colunas camelCase comuns nao eram tokenizadas, entao autoMap falhava.
test('autoMap: casa headers camelCase por token', () => {
  const r = autoMap(
    [
      { key: 'valor', aliases: ['valor', 'preco', 'total'] },
      { key: 'data', aliases: ['data', 'dia'] },
      { key: 'cliente', aliases: ['cliente', 'nome'] },
    ],
    ['ValorTotal', 'DataVenda', 'nomeCliente'],
  );
  assert.equal(r.valor, 'ValorTotal');   // token 'valor'
  assert.equal(r.data, 'DataVenda');     // token 'data'
  assert.equal(r.cliente, 'nomeCliente'); // token 'cliente'
});

// GRAVE 1: quebrar camelCase NAO pode reintroduzir o falso positivo de prefixo.
// 'data' NAO casa 'Database' mesmo apos tokenizar (Database e um token unico).
test('autoMap: camelCase nao reintroduz falso positivo (data x Database)', () => {
  assert.deepEqual(autoMap([{ key: 'data', aliases: ['data'] }], ['Database']), { data: null });
  // DataBase (camelCase de verdade) SIM casa por token 'data', e legitimo.
  assert.equal(autoMap([{ key: 'data', aliases: ['data'] }], ['DataBase']).data, 'DataBase');
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

// GRAVE 2: alias nao pode casar como PREFIXO de uma palavra maior (token unico).
// 'data' x 'Database', 'custo' x 'Customizado', 'lead' x 'Leadership', 'dia' x 'Diaria'
// eram falsos positivos porque o ultimo token do alias casava por startsWith.
test('autoMap: alias NAO casa como prefixo de palavra maior (falsos positivos)', () => {
  assert.deepEqual(autoMap([{ key: 'data', aliases: ['data'] }], ['Database']), { data: null });
  assert.deepEqual(autoMap([{ key: 'custo', aliases: ['custo'] }], ['Customizado']), { custo: null });
  assert.deepEqual(autoMap([{ key: 'lead', aliases: ['lead'] }], ['Leadership']), { lead: null });
  assert.deepEqual(autoMap([{ key: 'dia', aliases: ['dia'] }], ['Diaria']), { dia: null });
});

// Prefixo com sufixo curtissimo (<=2 chars) ainda casa: plural/flexao legitimo.
test('autoMap: alias casa prefixo com sufixo curto (plural/flexao)', () => {
  assert.equal(autoMap([{ key: 'venda', aliases: ['venda'] }], ['Vendas']).venda, 'Vendas');
  assert.equal(autoMap([{ key: 'custo', aliases: ['custo'] }], ['Custos']).custo, 'Custos');
});
