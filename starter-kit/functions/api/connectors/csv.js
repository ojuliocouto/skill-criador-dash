// Conector de upload de CSV (Contrato 2).
// Aceita POST com o CSV cru no corpo (text/csv) ou num campo de formulário
// e devolve um DataSet. O delimitador é detectado automaticamente.
import { parseCSV, detectDelimiter } from '../../lib/csv.mjs';

/**
 * Extrai o texto CSV do corpo da requisição.
 * Aceita corpo cru (text/csv, text/plain) ou multipart/form-data com um campo
 * "csv" ou "file".
 * @param {Request} request
 * @returns {Promise<string>}
 */
async function lerCorpoCsv(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
    const form = await request.formData();
    const campo = form.get('csv') ?? form.get('file') ?? form.get('data');
    if (campo == null) return '';
    // Arquivo (File) ou string.
    if (typeof campo === 'string') return campo;
    return await campo.text();
  }
  return await request.text();
}

// ---------------------------------------------------------------------------
// Gate de PLAUSIBILIDADE (puro, testavel).
//
// Defeito que motivou (teste na pele do aluno, rodada 1): um arquivo que NAO e
// CSV (um texto colado, um relatorio, um .md) entrava com HTTP 200 e virava
// dashboard de zeros, sem nenhum aviso. O parse devolve UMA coluna so, cujo
// nome e o texto inteiro da primeira linha, e isso passava batido ate o
// dashboard no ar.
//
// RODADA 3 (auditoria adversarial derrubou a rodada 2 e achou mais um buraco):
//
// 1) REGRESSAO (a mais grave: pior que o defeito original). A rodada 2 tinha
//    um sinal "cabecalho com espaco E nenhuma linha de dado carrega um
//    delimitador comum" pra pegar anotacao solta (`Notas da reuniao` + texto
//    corrido). Na pratica isso barrava CSV LEGITIMO de coluna unica sempre que
//    a celula nao trouxesse por acaso uma virgula: "Nome do Cliente" com "Ana
//    Souza" e "Valor Gasto" com "1500" (sem decimal em virgula) viravam 400.
//    Um aluno com planilha de uma coluna de nomes ou de valores seria
//    rejeitado na aula, o que e pior do que aceitar lixo. O sinal foi
//    REMOVIDO. O gate volta a olhar SO para o FORMATO do nome da coluna,
//    nunca para o conteudo das celulas: comeca com # { [ < * - ou aspas, tem
//    pontuacao de frase (. ! ? :) ou termina em virgula, ou passa de 40
//    caracteres. Custo aceito: a "anotacao solta" (rodada 2) deixa de ser
//    barrada e vira uma coluna de texto de N linhas, o que e inofensivo
//    (nao falsifica numero nenhum) comparado a rejeitar dado bom.
//
// 2) BURACO: o gate so rodava quando `columns.length === 1`. Um JSON colado
//    com virgulas numa linha so (`{"campanha":"Janeiro","investimento":1500}`)
//    vira 2+ "colunas" no parse e ZERO linhas de dado (nao ha segunda linha),
//    e escapava inteiro: 200, `rows: []`, `rowCount: 0`. O wizard mostrava
//    "Fonte conectada, 0 linha(s) detectada(s))" e liberava o Avancar, e o
//    dashboard saia todo zerado. Dois sinais novos, que NAO dependem do
//    numero de colunas:
//      a) cabecalho sem NENHUMA linha de dado abaixo (o handler ja barra
//         corpo vazio antes de chegar aqui, entao isto so acontece quando o
//         parse produziu cabecalho mas nada de tabela);
//      b) os sinais de FORMATO do cabecalho agora valem para QUALQUER coluna,
//         nao so quando ha uma unica.
// ---------------------------------------------------------------------------

/** Tamanho acima do qual um nome de coluna deixa de ser nome e vira frase. */
const NOME_COLUNA_MAX = 40;

/** Caractere inicial tipico de outro formato de arquivo (nao de nome de coluna). */
const COMECA_COM_OUTRO_FORMATO = /^[#{[<*'"-]/;

/** Pontuacao de frase: nome de coluna nao termina em ponto, exclamacao etc. */
const TEM_PONTUACAO_DE_FRASE = /[.!?:]/;

/** Corta o cabecalho suspeito para nao ecoar o arquivo inteiro na mensagem. */
function resumir(nome) {
  const v = String(nome == null ? '' : nome).trim();
  return v.length > 60 ? `${v.slice(0, 60)}...` : v;
}

/**
 * Diz se UM nome de coluna tem cara de frase (ou de outro formato de arquivo),
 * nao de rotulo de coluna. So olha o FORMATO do nome, nunca o conteudo das
 * celulas (esse sinal foi removido na rodada 3: ver comentario do modulo).
 * @param {string} nome
 * @returns {boolean}
 */
function formatoDeCabecalhoSuspeito(nome) {
  if (!nome) return false;
  if (nome.length > NOME_COLUNA_MAX) return true;
  if (COMECA_COM_OUTRO_FORMATO.test(nome)) return true;
  if (TEM_PONTUACAO_DE_FRASE.test(nome) || nome.endsWith(',')) return true;
  return false;
}

/**
 * Diz se o resultado do parse tem cara de arquivo que nao e CSV.
 * @param {string[]} columns colunas devolvidas pelo parseCSV
 * @param {object[]} rows linhas devolvidas pelo parseCSV
 * @returns {string|null} mensagem de erro em PT-BR, ou null se plausivel
 */
export function csvImplausivel(columns, rows) {
  if (!Array.isArray(columns) || columns.length === 0) return null;
  const nomes = columns.map((c) => String(c == null ? '' : c).trim());
  if (nomes.every((n) => !n)) return null;

  // Sinal 1: cabecalho sem NENHUMA linha de dado abaixo. Nao depende do
  // numero de colunas (pega o JSON minificado, que vira 2+ "colunas" e zero
  // linhas, do mesmo jeito que pega um CSV de coluna unica so com cabecalho).
  if (!Array.isArray(rows) || rows.length === 0) {
    const descricaoColuna = nomes.length === 1
      ? `1 coluna só, de nome "${resumir(nomes[0])}",`
      : `${nomes.length} colunas,`;
    return (
      `Esse arquivo não parece um CSV: detectei ${descricaoColuna} mas nenhuma linha de dado ` +
      'abaixo do cabeçalho. Confira se o arquivo tem uma linha de cabeçalho, pelo menos uma ' +
      'linha de dado abaixo dela e se as colunas estão separadas por vírgula, ponto e vírgula ' +
      'ou tabulação.'
    );
  }

  // Sinal 2: FORMATO do nome da coluna, agora pra QUALQUER coluna (nao so a
  // primeira/unica). Nunca olha o conteudo das celulas.
  for (const nome of nomes) {
    if (!formatoDeCabecalhoSuspeito(nome)) continue;
    const descricaoColuna = nomes.length === 1
      ? `1 coluna só, de nome "${resumir(nome)}"`
      : `a coluna "${resumir(nome)}" (entre ${nomes.length} colunas)`;
    return (
      `Esse arquivo não parece um CSV: detectei ${descricaoColuna}. ` +
      'Confira se o arquivo tem uma linha de cabeçalho e se as colunas estão separadas ' +
      'por vírgula, ponto e vírgula ou tabulação.'
    );
  }

  return null;
}

/**
 * Handler Cloudflare Pages Function.
 * Método: POST. Corpo: CSV cru ou campo de formulário.
 * Responde DataSet completo em JSON.
 * @param {{ request: Request }} context
 */
export async function onRequest(context) {
  const headers = { 'content-type': 'application/json' };
  const { request } = context;

  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Use POST enviando o conteúdo do CSV no corpo da requisição.' }),
      { status: 405, headers }
    );
  }

  try {
    const text = await lerCorpoCsv(request);
    if (!text || text.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'O CSV enviado está vazio.' }),
        { status: 400, headers }
      );
    }
    const delimiter = detectDelimiter(text);
    const { columns, rows } = parseCSV(text, { delimiter });
    // Gate de plausibilidade: melhor um 400 explicando do que um dashboard de
    // zeros com cara de dashboard certo.
    const implausivel = csvImplausivel(columns, rows);
    if (implausivel) {
      return new Response(JSON.stringify({ error: implausivel }), { status: 400, headers });
    }
    const dataset = {
      columns,
      rows,
      meta: {
        source: 'csv',
        fetchedAt: new Date().toISOString(),
        rowCount: rows.length,
      },
    };
    return new Response(JSON.stringify(dataset), { status: 200, headers });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Não foi possível interpretar o CSV enviado. Confira o arquivo e tente de novo.' }),
      { status: 502, headers }
    );
  }
}
