// P6: gate de PLAUSIBILIDADE no conector de CSV (functions/api/connectors/csv.js).
//
// Defeito que motivou (teste na pele do aluno, rodada 1): um arquivo que NAO e
// CSV (um texto solto, um relatorio colado, um .md) entrava com HTTP 200 e
// virava um dashboard de zeros, sem nenhum aviso. O parse devolve UMA coluna
// so, cujo nome e o texto inteiro da primeira linha, e isso passava batido.
//
// A trava roda DEPOIS do parse e so dispara no caso implausivel. CSV legitimo
// de uma coluna so, com nome curto e linhas de dados, continua passando.
//
// RODADA 3 (auditoria adversarial derrubou a rodada 2 e achou mais um buraco):
//
// 1) REGRESSAO (a mais grave): o sinal "espaco no cabecalho + corpo sem
//    delimitador" da rodada 2 barrava CSV LEGITIMO de coluna unica sempre que
//    a celula nao trouxesse por acaso uma virgula: "Nome do Cliente" com "Ana
//    Souza" e "Valor Gasto" com "1500" viravam 400. Pior do que o defeito
//    original. O sinal foi REMOVIDO: o gate volta a olhar SO para o FORMATO
//    do nome da coluna (comeca com # { [ < * - aspas, tem pontuacao de frase
//    ou termina em virgula, ou passa de 40 caracteres), nunca para o conteudo
//    das celulas.
// 2) BURACO: o gate so rodava com columns.length === 1. Um JSON minificado com
//    virgulas numa linha so vira 2+ "colunas" e ZERO linhas de dado, e
//    escapava com 200/rows:[]/rowCount:0. Dois sinais novos que NAO dependem
//    do numero de colunas: (a) cabecalho sem NENHUMA linha de dado abaixo, e
//    (b) os sinais de formato do cabecalho valem pra QUALQUER coluna.
import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequest as csv, csvImplausivel } from '../functions/api/connectors/csv.js';

// ---------------------------------------------------------------------------
// Logica pura: sinal de FORMATO do cabecalho (nao depende do conteudo)
// ---------------------------------------------------------------------------

const LINHA_LONGA = 'Relatorio consolidado de investimento em midia paga do mes de janeiro';

test('1 coluna com cabecalho longo (texto inteiro), COM linha de dado -> implausivel (formato)', () => {
  const msg = csvImplausivel([LINHA_LONGA], [{ [LINHA_LONGA]: 'x' }]);
  assert.match(msg, /1 coluna/);
});

test('1 coluna com cabecalho multi-palavra e SEM linhas de dados -> implausivel (zero linhas)', () => {
  const msg = csvImplausivel(['Relatorio mensal'], []);
  assert.match(msg, /1 coluna/);
  assert.match(msg, /nenhuma linha de dado/i);
});

test('CSV legitimo de UMA coluna so, nome curto e com dados -> plausivel', () => {
  assert.equal(csvImplausivel(['Valor'], [{ Valor: '10' }, { Valor: '20' }]), null);
  assert.equal(csvImplausivel(['Faturamento'], [{ Faturamento: '10' }]), null);
  // Nome curto com espaco: e uma coluna de verdade, MESMO que a celula nunca
  // carregue delimitador nenhum (o sinal de conteudo foi removido na rodada 3).
  assert.equal(csvImplausivel(['Valor Gasto'], [{ 'Valor Gasto': '10,00' }]), null);
  assert.equal(csvImplausivel(['Nome do Cliente'], [{ 'Nome do Cliente': 'Silva, Ana' }]), null);
});

test('mais de uma coluna com cabecalhos NORMAIS nunca e implausivel', () => {
  assert.equal(
    csvImplausivel(['Data', 'Gasto'], [{ Data: '01/01', Gasto: '100' }]),
    null,
  );
});

test('mais de uma coluna com UM cabecalho de FORMATO suspeito tambem e implausivel (rodada 3: o sinal de formato vale pra qualquer coluna, nao so quando ha uma unica)', () => {
  const msg = csvImplausivel([LINHA_LONGA, 'B'], [{ [LINHA_LONGA]: '1', B: '2' }]);
  assert.match(msg, /n[aã]o parece um CSV/i, 'cabecalho absurdo deveria ser barrado mesmo com 2 colunas');
});

test('sem colunas -> nao e trabalho deste gate (o handler ja barra CSV vazio)', () => {
  assert.equal(csvImplausivel([], []), null);
  assert.equal(csvImplausivel(null, null), null);
});

// ---------------------------------------------------------------------------
// Logica pura: os sinais de FORMATO (rodada 2, preservados na rodada 3)
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

// ---------------------------------------------------------------------------
// REGRESSAO (rodada 2 -> rodada 3): o sinal de CONTEUDO foi removido.
// ---------------------------------------------------------------------------

test('REGRESSAO: "Nome do Cliente" e "Valor Gasto" SEM delimitador na celula NAO PODEM mais ser barrados', () => {
  // Reproducao exata do defeito relatado pela auditoria: dado limpo, sem
  // nenhuma virgula/ponto-e-virgula/tab na celula, tem que passar.
  assert.equal(csvImplausivel(['Email'], [{ Email: 'ana@empresa.com.br' }]), null);
  assert.equal(
    csvImplausivel(['Nome do Cliente'], [{ 'Nome do Cliente': 'Ana Souza' }]),
    null,
    'aluno com CSV de uma coluna de nomes nao pode ser rejeitado',
  );
  assert.equal(
    csvImplausivel(['Valor Gasto'], [{ 'Valor Gasto': '1500' }]),
    null,
    'aluno com CSV de uma coluna de valores nao pode ser rejeitado',
  );
});

test('nome com espaco e dados, mas NENHUMA linha com delimitador comum -> PLAUSIVEL agora (sinal removido na rodada 3)', () => {
  // Rodada 2 barrava isso ("anotacao solta"), mas o MESMO sinal barrava CSV
  // legitimo de coluna unica sem virgula na celula, que e pior. Custo aceito:
  // uma anotacao solta vira uma coluna de texto de N linhas (inofensiva),
  // ganho: nunca mais rejeitar coluna legitima.
  const nome = 'Notas da reunião';
  const msg = csvImplausivel(
    [nome],
    [
      { [nome]: 'Falamos do lançamento novo' },
      { [nome]: 'Combinamos os prazos da próxima entrega' },
    ],
  );
  assert.equal(msg, null);
});

test('nome com espaco e UMA linha com delimitador comum -> plausivel (o sinal de conteudo nao existe mais, resultado e o mesmo)', () => {
  const nome = 'Nome do Cliente';
  assert.equal(
    csvImplausivel(
      [nome],
      [{ [nome]: 'Ana Souza' }, { [nome]: 'Silva, Bruno' }, { [nome]: 'Carla Dias' }],
    ),
    null,
  );
});

// ---------------------------------------------------------------------------
// BURACO (rodada 3): zero linhas de dado, independente do numero de colunas.
// ---------------------------------------------------------------------------

test('unidade: ZERO linhas de dado e implausivel mesmo com 2+ colunas (JSON minificado)', () => {
  const msg = csvImplausivel(['{"campanha":"Janeiro"', '"investimento":1500', '"leads":32}'], []);
  assert.match(msg, /nenhuma linha de dado/i);
  assert.match(msg, /3 colunas/);
});

// ---------------------------------------------------------------------------
// Handler: os casos reportados pela auditoria (md, JSON multi-linha, JSON minificado)
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

const JSON_MULTILINHA = [
  '{',
  '  "campanha": "Janeiro",',
  '  "investimento": 1500,',
  '  "leads": 32',
  '}',
].join('\n');

// JSON colado numa linha SO (sem quebra de linha): vira 3 "colunas" (separadas
// pela virgula) e ZERO linhas de dado. Reproducao exata do buraco relatado:
// antes escapava com 200, rows:[], rowCount:0.
const JSON_MINIFICADO = '{"campanha":"Janeiro","investimento":1500,"leads":32}';

test('POST de arquivo .md colado (comeca com #) -> 400 com mensagem que ensina o que fazer', async () => {
  const res = await csv(ctx('POST', ARQUIVO_MD));
  assert.equal(res.status, 400);
  const j = await readJSON(res);
  assert.match(j.error, /n[aã]o parece um CSV/i);
  assert.match(j.error, /1 coluna/);
  assert.match(j.error, /v[íi]rgula|ponto e v[íi]rgula|tabula[çc][aã]o/i, 'mensagem ensina a separar por delimitador');
});

test('POST de anotacao solta (sem nenhum delimitador em nenhuma linha) -> 200 agora (sinal removido na rodada 3)', async () => {
  const res = await csv(ctx('POST', ANOTACAO_SOLTA));
  assert.equal(res.status, 200);
  const ds = await readJSON(res);
  assert.deepEqual(ds.columns, ['Notas da reunião']);
  assert.equal(ds.rows.length, 3);
});

test('POST de JSON colado em VARIAS linhas (cabecalho vira "{") -> 400 (pego pelo sinal de formato)', async () => {
  const res = await csv(ctx('POST', JSON_MULTILINHA));
  assert.equal(res.status, 400);
  const j = await readJSON(res);
  assert.match(j.error, /n[aã]o parece um CSV/i);
});

test('POST de JSON MINIFICADO numa linha so (2+ colunas, ZERO linhas) -> 400 (antes escapava com 200 e rows:[])', async () => {
  const res = await csv(ctx('POST', JSON_MINIFICADO));
  assert.equal(res.status, 400);
  const j = await readJSON(res);
  assert.match(j.error, /n[aã]o parece um CSV/i);
  assert.match(j.error, /nenhuma linha de dado/i);
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

// Valores PLANOS, de proposito: sem nenhuma virgula/ponto-e-virgula na celula,
// exatamente a reproducao do CSV real de um aluno (e o caso que a rodada 2
// barrava por engano).
const CSV_NOME_CLIENTE = [
  'Nome do Cliente',
  'Ana Souza',
  'Bruno Lima',
  'Carla Dias',
  'Diego Alves',
  'Elisa Rocha',
].join('\n');

const CSV_VALOR_GASTO = [
  'Valor Gasto',
  '1500',
  '320',
  '75',
  '48',
  '210',
].join('\n');

// Padrao Excel BR: separador ponto e virgula, decimal em virgula.
const CSV_EXCEL_BR = [
  'Data;Valor',
  '01/01/2026;1.500,50',
  '02/01/2026;320,00',
  '03/01/2026;75,00',
].join('\n');

test('POST de CSV legitimo "Email" (5 linhas, sem espaco no cabecalho) -> 200', async () => {
  const res = await csv(ctx('POST', CSV_EMAIL));
  assert.equal(res.status, 200);
  const ds = await readJSON(res);
  assert.deepEqual(ds.columns, ['Email']);
  assert.equal(ds.rows.length, 5);
});

test('POST de CSV legitimo "Nome do Cliente" (5 linhas, valores planos sem delimitador) -> 200', async () => {
  const res = await csv(ctx('POST', CSV_NOME_CLIENTE));
  assert.equal(res.status, 200);
  const ds = await readJSON(res);
  assert.deepEqual(ds.columns, ['Nome do Cliente']);
  assert.equal(ds.rows.length, 5);
  assert.equal(ds.rows[0]['Nome do Cliente'], 'Ana Souza');
});

test('POST de CSV legitimo "Valor Gasto" (5 linhas, valores planos sem delimitador) -> 200', async () => {
  const res = await csv(ctx('POST', CSV_VALOR_GASTO));
  assert.equal(res.status, 200);
  const ds = await readJSON(res);
  assert.deepEqual(ds.columns, ['Valor Gasto']);
  assert.equal(ds.rows.length, 5);
  assert.equal(ds.rows[0]['Valor Gasto'], '1500');
});

test('POST de CSV com decimal em virgula e separador ponto e virgula (padrao Excel BR) -> 200', async () => {
  const res = await csv(ctx('POST', CSV_EXCEL_BR));
  assert.equal(res.status, 200);
  const ds = await readJSON(res);
  assert.deepEqual(ds.columns, ['Data', 'Valor']);
  assert.equal(ds.rows.length, 3);
  assert.equal(ds.rows[0].Valor, '1.500,50');
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
