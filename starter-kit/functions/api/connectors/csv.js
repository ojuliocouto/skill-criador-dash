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
// Defeito que motivou (teste na pele do aluno): um arquivo que NAO e CSV (um
// texto colado, um relatorio, um .md) entrava com HTTP 200 e virava dashboard
// de zeros, sem nenhum aviso. O parse devolve UMA coluna so, cujo nome e o
// texto inteiro da primeira linha, e isso passava batido ate o dashboard no ar.
//
// A trava e deliberadamente ESTREITA para nao derrubar CSV legitimo de uma
// coluna so (o pedido explicito: nome curto tem de continuar passando). So
// dispara com uma coluna E pelo menos um destes sinais de que o nome NAO e um
// rotulo de coluna:
//   A) o nome da coluna passa de 40 caracteres: nome de coluna nao tem esse
//      tamanho, isso e uma frase inteira que virou cabecalho;
//   B) o nome comeca com um caractere tipico de outro formato de arquivo
//      (# { [ < - * ou aspas): markdown, JSON, lista com marcador, citacao;
//   C) o nome tem pontuacao de frase (. ! ? :) ou termina em virgula: nome de
//      coluna nao tem esse formato, isso e uma frase;
//   D) o nome tem espaco E o arquivo nao tem NENHUMA linha de dado: uma linha
//      de texto solta, sem tabela embaixo, nao e um CSV (e mesmo que fosse,
//      nao ha o que plotar);
//   E) o nome tem espaco, o arquivo TEM linhas de dado, mas NENHUMA delas
//      carrega um delimitador comum (, ; tab |): nem o cabecalho nem o corpo
//      jamais tiveram como virar tabela, e o caso da anotacao solta (`Notas da
//      reuniao` + linhas de texto corrido). Uma UNICA linha com delimitador ja
//      descarta o sinal: dado real de uma coluna so costuma carregar o
//      delimitador dentro do proprio valor (nome "Sobrenome, Nome", moeda
//      "1.500,00" citada), entao basta.
// A ideia original de barrar "espaco sem delimitador" sozinha foi descartada:
// "Valor Gasto" e "Nome do Cliente" sao cabecalhos legitimos de coluna unica,
// e barrar isso quebraria arquivo bom. Os sinais D/E exigem tambem que o corpo
// do arquivo nunca desse nenhum sinal de tabela, o que e o que separa texto
// solto de coluna de verdade.
// ---------------------------------------------------------------------------

/** Tamanho acima do qual um nome de coluna deixa de ser nome e vira frase. */
const NOME_COLUNA_MAX = 40;

/** Delimitadores comuns de CSV/planilha que uma linha de dado poderia carregar. */
const DELIMITADORES_COMUNS = [',', ';', '\t', '|'];

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
 * Diz se o resultado do parse tem cara de arquivo que nao e CSV.
 * @param {string[]} columns colunas devolvidas pelo parseCSV
 * @param {object[]} rows linhas devolvidas pelo parseCSV
 * @returns {string|null} mensagem de erro em PT-BR, ou null se plausivel
 */
export function csvImplausivel(columns, rows) {
  if (!Array.isArray(columns) || columns.length !== 1) return null;
  const nome = String(columns[0] == null ? '' : columns[0]).trim();
  if (!nome) return null;

  const nomeMuitoLongo = nome.length > NOME_COLUNA_MAX;
  const comecaComOutroFormato = COMECA_COM_OUTRO_FORMATO.test(nome);
  const temPontuacaoDeFrase = TEM_PONTUACAO_DE_FRASE.test(nome) || nome.endsWith(',');

  const temEspaco = /\s/.test(nome);
  const semDados = !Array.isArray(rows) || rows.length === 0;
  // So avalia o sinal E quando ha dados pra examinar (semDados ja e o sinal D).
  const nenhumaLinhaTemDelimitador =
    temEspaco &&
    !semDados &&
    rows.every((r) => {
      const valor = r && typeof r === 'object' ? r[nome] : undefined;
      const texto = valor == null ? '' : String(valor);
      return !DELIMITADORES_COMUNS.some((d) => texto.includes(d));
    });

  const suspeito =
    nomeMuitoLongo ||
    comecaComOutroFormato ||
    temPontuacaoDeFrase ||
    (temEspaco && semDados) ||
    nenhumaLinhaTemDelimitador;
  if (!suspeito) return null;
  return (
    'Esse arquivo não parece um CSV: detectei 1 coluna só, ' +
    `de nome "${resumir(nome)}". ` +
    'Confira se o arquivo tem uma linha de cabeçalho e se as colunas estão separadas ' +
    'por vírgula, ponto e vírgula ou tabulação.'
  );
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
