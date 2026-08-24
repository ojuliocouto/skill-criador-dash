// P6: gate de PLAUSIBILIDADE no conector de CSV (functions/api/connectors/csv.js).
//
// Defeito que motivou (teste na pele do aluno): um arquivo que NAO e CSV (um
// texto solto, um relatorio colado, um .md) entrava com HTTP 200 e virava um
// dashboard de zeros, sem nenhum aviso. O parse devolve UMA coluna so, cujo
// nome e o texto inteiro da primeira linha, e isso passava batido.
//
// A trava roda DEPOIS do parse e so dispara no caso implausivel. CSV legitimo
// de uma coluna so, com nome curto e linhas de dados, continua passando.
//
// RODADA 2 (auditoria independente reprovou o fix anterior): a regra original so
// disparava com 1 coluna E (nome > 40 chars OU nome com espaco E zero linhas). O
// fixture de teste tinha 47 chars, entao passava, mas isto AINDA entrava com 200
// e virava dashboard de zeros: um .md (`# Relatorio...`), uma anotacao solta
// (`Notas da reuniao` + linhas de texto) e um JSON colado (cabecalho `{`). A
// heuristica ganhou 3 sinais NOVOS de que o nome nao e rotulo de coluna:
//   - comeca com um caractere tipico de outro formato (# { [ < - * ou aspas);
//   - tem pontuacao de frase (. ! ? :) ou termina em virgula;
//   - tem espaco, tem linhas de dados, mas NENHUMA delas carrega um delimitador
//     comum (, ; tab |): nem o cabecalho nem o corpo jamais tiveram como virar
//     tabela. Isso pega a "Notas da reuniao" solta sem quebrar CSV legitimo de
//     uma coluna, porque dado real de uma coluna so costuma trazer o delimitador
//     dentro do proprio valor (nome "Sobrenome, Nome", moeda "1.500,00" citada).
import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequest as csv, csvImplausivel } from '../functions/api/connectors/csv.js';

// ---------------------------------------------------------------------------
// Logica pura
// ---------------------------------------------------------------------------

const LINHA_LONGA = 'Relatorio consolidado de investimento em midia paga do mes de janeiro';

test('1 coluna com cabecalho longo (texto inteiro) -> implausivel', () => {
  const msg = csvImplausivel([LINHA_LONGA], [{ [LINHA_LONGA]: '' }]);
  assert.match(msg, /1 coluna/);
});

test('1 coluna com cabecalho multi-palavra e SEM linhas de dados -> implausivel', () => {
  assert.match(csvImplausivel(['Relatorio mensal'], []), /1 coluna/);
});

test('CSV legitimo de UMA coluna so, nome curto e com dados -> plausivel', () => {
  assert.equal(csvImplausivel(['Valor'], [{ Valor: '10' }, { Valor: '20' }]), null);
  assert.equal(csvImplausivel(['Faturamento'], [{ Faturamento: '10' }]), null);
  // Nome curto com espaco, mas COM linhas de dados: e uma coluna de verdade.
  // FIXTURE AJUSTADA (rodada 2): o valor agora carrega o delimitador dentro do
  // proprio dado ("10,00" / "Silva, Ana"), igual dado real de uma coluna so
  // costuma trazer (moeda com decimal em virgula, nome em formato "Sobrenome,
  // Nome"). Sem isso, a linha nao tem NENHUM sinal de que aquilo e tabela: era
  // exatamente esse buraco (header com espaco + corpo sem nenhum delimitador,
  // igual uma anotacao solta) que o sinal novo do gate passou a cobrir.
  assert.equal(csvImplausivel(['Valor Gasto'], [{ 'Valor Gasto': '10,00' }]), null);
  assert.equal(csvImplausivel(['Nome do Cliente'], [{ 'Nome do Cliente': 'Silva, Ana' }]), null);
});

test('mais de uma coluna nunca e implausivel, mesmo com cabecalho longo', () => {
  const longo = `${LINHA_LONGA}`;
  assert.equal(csvImplausivel([longo, 'B'], [{ [longo]: '1', B: '2' }]), null);
});

test('sem colunas -> nao e trabalho deste gate (o handler ja barra CSV vazio)', () => {
  assert.equal(csvImplausivel([], []), null);
  assert.equal(csvImplausivel(null, null), null);
});

// ---------------------------------------------------------------------------
// Logica pura: os 3 sinais NOVOS (rodada 2)
// ---------------------------------------------------------------------------

test('nome que comeca com caractere de outro formato (# { [ < - * aspas) -> implausivel mesmo com dados', () => {
  for (const nome of ['# Relatorio de janeiro', '{', '[dados]', '<tag>', '- item', '* nota', '"citacao', "'citacao"]) {
    const msg = csvImplausivel([nome], [{ [nome]: 'x' }, { [nome]: 'y' }]);
    assert.match(msg, /1 coluna/, `"${nome}" deveria ser implausivel`);
  }
});

test('nome com pontuacao de frase (. ! ? :) ou terminando em virgula -> implausivel mesmo com dados', () => {
  for (const nome of ['Relatorio de janeiro.', 'Cuidado!', 'Terminou?', 'Categoria: geral', 'Item,']) {
    const msg = csvImplausivel([nome], [{ [nome]: 'x' }, { [nome]: 'y' }]);
    assert.match(msg, /1 coluna/, `"${nome}" deveria ser implausivel`);
  }
});

test('nome com espaco e dados, mas NENHUMA linha com delimitador comum -> implausivel (anotacao solta)', () => {
  const nome = 'Notas da reunião';
  const msg = csvImplausivel(
    [nome],
    [
      { [nome]: 'Falamos do lançamento novo' },
      { [nome]: 'Combinamos os prazos da próxima entrega' },
    ],
  );
  assert.match(msg, /1 coluna/);
});

test('nome com espaco e UMA linha com delimitador comum -> plausivel (basta uma para descartar o sinal)', () => {
  const nome = 'Nome do Cliente';
  assert.equal(
    csvImplausivel(
      [nome],
      [{ [nome]: 'Ana Souza' }, { [nome]: 'Silva, Bruno' }, { [nome]: 'Carla Dias' }],
    ),
    null,
    'so uma linha com virgula ja e sinal suficiente de coluna de verdade',
  );
});

// ---------------------------------------------------------------------------
// Handler: os 3 casos reportados pela auditoria (md, anotacao solta, JSON)
// ---------------------------------------------------------------------------

function ctx(method, body, contentType = 'text/csv') {
  const init = { method, headers: { 'content-type': contentType } };
  if (body != null) init.body = body;
  return { request: new Request('https://x/api/connectors/csv', init) };
}

async function readJSON(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const ARQUIVO_MD = [
  '# Relatorio de janeiro',
  'Vendas cresceram bastante esse mes.',
  'Investimento em trafego pago tambem subiu.',
  'Fechamos o mes com resultado positivo.',
].join('\n');

const ANOTACAO_SOLTA = [
  'Notas da reunião',
  'Falamos do lançamento novo',
  'Combinamos os prazos da próxima entrega',
  'Ficou pendente o valor final do orçamento',
].join('\n');

const JSON_COLADO = [
  '{',
  '  "campanha": "Janeiro",',
  '  "investimento": 1500,',
  '  "leads": 32',
  '}',
].join('\n');

test('POST de arquivo .md colado (comeca com #) -> 400 com mensagem que ensina o que fazer', async () => {
  const res = await csv(ctx('POST', ARQUIVO_MD));
  assert.equal(res.status, 400);
  const j = await readJSON(res);
  assert.match(j.error, /n[aã]o parece um CSV/i);
  assert.match(j.error, /1 coluna/);
  assert.match(j.error, /v[íi]rgula|ponto e v[íi]rgula|tabula[çc][aã]o/i, 'mensagem ensina a separar por delimitador');
});

test('POST de anotacao solta (sem nenhum delimitador em nenhuma linha) -> 400', async () => {
  const res = await csv(ctx('POST', ANOTACAO_SOLTA));
  assert.equal(res.status, 400);
  const j = await readJSON(res);
  assert.match(j.error, /n[aã]o parece um CSV/i);
});

test('POST de JSON colado no lugar do CSV (cabecalho vira "{") -> 400', async () => {
  const res = await csv(ctx('POST', JSON_COLADO));
  assert.equal(res.status, 400);
  const j = await readJSON(res);
  assert.match(j.error, /n[aã]o parece um CSV/i);
});

// ---------------------------------------------------------------------------
// Handler: CONTROLES (tem que continuar dando 200). A heuristica nao pode ficar
// agressiva a ponto de barrar CSV legitimo de uma coluna so.
// ---------------------------------------------------------------------------

const CSV_EMAIL = [
  'Email',
  'ana@empresa.com.br',
  'bruno@empresa.com.br',
  'carla@empresa.com.br',
  'diego@empresa.com.br',
  'elisa@empresa.com.br',
].join('\n');

// Formato "Sobrenome, Nome" (comum em export de CRM/lista ordenada por
// sobrenome): o proprio dado carrega uma virgula, sinal de coluna de verdade.
const CSV_NOME_CLIENTE = [
  'Nome do Cliente',
  '"Silva, João"',
  '"Souza, Ana"',
  '"Lima, Bruno"',
  '"Costa, Carla"',
  '"Pereira, Diego"',
].join('\n');

// Moeda em formato PT-BR (decimal em virgula), entre aspas porque o delimitador
// escolhido e a virgula: o dado real de uma coluna de valores costuma vir assim.
const CSV_VALOR_GASTO = [
  'Valor Gasto',
  '"1.500,00"',
  '"320,50"',
  '"75,00"',
  '"48,90"',
  '"210,00"',
].join('\n');

test('POST de CSV legitimo "Email" (5 linhas, sem espaco no cabecalho) -> 200', async () => {
  const res = await csv(ctx('POST', CSV_EMAIL));
  assert.equal(res.status, 200);
  const ds = await readJSON(res);
  assert.deepEqual(ds.columns, ['Email']);
  assert.equal(ds.rows.length, 5);
});

test('POST de CSV legitimo "Nome do Cliente" (5 linhas, formato Sobrenome, Nome) -> 200', async () => {
  const res = await csv(ctx('POST', CSV_NOME_CLIENTE));
  assert.equal(res.status, 200);
  const ds = await readJSON(res);
  assert.deepEqual(ds.columns, ['Nome do Cliente']);
  assert.equal(ds.rows.length, 5);
  assert.equal(ds.rows[0]['Nome do Cliente'], 'Silva, João');
});

test('POST de CSV legitimo "Valor Gasto" (5 linhas, moeda com decimal em virgula) -> 200', async () => {
  const res = await csv(ctx('POST', CSV_VALOR_GASTO));
  assert.equal(res.status, 200);
  const ds = await readJSON(res);
  assert.deepEqual(ds.columns, ['Valor Gasto']);
  assert.equal(ds.rows.length, 5);
  assert.equal(ds.rows[0]['Valor Gasto'], '1.500,00');
});

// ---------------------------------------------------------------------------
// Handler: casos originais (rodada 1), continuam valendo
// ---------------------------------------------------------------------------

const TEXTO_QUE_NAO_E_CSV = [
  'Relatorio de campanhas do mes de janeiro de 2026',
  'O investimento total foi de mil e quinhentos reais',
  'Foram gerados trinta leads no periodo',
].join('\n');

test('POST de arquivo que NAO e CSV -> 400 com a mensagem de 1 coluna so', async () => {
  const res = await csv(ctx('POST', TEXTO_QUE_NAO_E_CSV));
  assert.equal(res.status, 400);
  const j = await readJSON(res);
  assert.match(j.error, /n[aã]o parece um CSV/i);
  assert.match(j.error, /1 coluna/);
});

test('POST de CSV legitimo de uma coluna so -> 200 (nao pode quebrar)', async () => {
  const res = await csv(ctx('POST', 'Valor\n10\n20\n30\n'));
  assert.equal(res.status, 200);
  const ds = await readJSON(res);
  assert.deepEqual(ds.columns, ['Valor']);
  assert.equal(ds.rows.length, 3);
});

test('POST de CSV normal com varias colunas -> 200 (nao pode quebrar)', async () => {
  const res = await csv(ctx('POST', 'Data;Gasto;Leads\n01/01;100;5\n02/01;200;9\n'));
  assert.equal(res.status, 200);
  const ds = await readJSON(res);
  assert.deepEqual(ds.columns, ['Data', 'Gasto', 'Leads']);
  assert.equal(ds.rows.length, 2);
});

test('POST vazio segue 400 com a mensagem antiga (nao virou mensagem de plausibilidade)', async () => {
  const res = await csv(ctx('POST', ''));
  assert.equal(res.status, 400);
  const j = await readJSON(res);
  assert.match(j.error, /vazio/i);
});
