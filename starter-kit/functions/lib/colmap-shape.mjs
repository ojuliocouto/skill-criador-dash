// Validacao de FORMA do colMap de um dashboard (puro, testavel).
// Chamada pelo POST de functions/api/dashboards.js logo depois da validacao de
// fonte (functions/lib/source-shape.mjs), no mesmo espirito daquele modulo.
//
// Por que existe (teste na pele do aluno): sem esta checagem, uma config com o
// colMap VAZIO ou INCOMPLETO era aceita com 200 e gravada no KV. O dashboard
// subia inteiro e mostrava "INVESTIMENTO R$ 0,00" no KPI enquanto a tabela
// logo abaixo trazia a linha real com o valor certo: numero errado com cara de
// numero certo, que e pior do que erro nenhum. O wizard ja barrava isso no
// FRONT (validateRequired em public/assets/js/config-wizard.js), mas a premissa
// da skill e o AGENTE montar a config e mandar por POST, caminho que nao
// passava por gate nenhum. Validar aqui devolve 400 no momento do engano,
// listando exatamente os slots que faltam.
//
// FRONTEIRA (Cloudflare Pages): o servidor nao pode importar os templates do
// browser (public/ e a raiz do site; functions/ nao e servido), entao os slots
// obrigatorios de cada dominio moram aqui em copia, do mesmo jeito que DOMAINS
// tem copia em functions/lib/domains.mjs. O teste test/colmap-shape.test.js
// falha se esta copia divergir dos templates do browser.
//
// Contrato: ESTRITO nos dominios canonicos, PERMISSIVO fora deles (dominio
// invalido ja e rejeitado antes, por functions/lib/domains.mjs).

import { parseCSV, detectDelimiter } from './csv.mjs';

/**
 * Slots obrigatorios por dominio. Espelho dos slots com `required: true` nos
 * templates de public/assets/js/templates/*.js (paridade coberta por teste).
 * @type {Readonly<{ [domain: string]: ReadonlyArray<{ key: string, label: string }> }>}
 */
export const REQUIRED_SLOTS = Object.freeze({
  marketing: Object.freeze([
    Object.freeze({ key: 'data', label: 'Data' }),
    Object.freeze({ key: 'investimento', label: 'Investimento' }),
  ]),
  vendas: Object.freeze([
    Object.freeze({ key: 'data', label: 'Data' }),
    Object.freeze({ key: 'valor', label: 'Valor' }),
  ]),
  suporte: Object.freeze([
    Object.freeze({ key: 'data', label: 'Data' }),
    Object.freeze({ key: 'atendimentos', label: 'Atendimentos' }),
  ]),
  financeiro: Object.freeze([
    Object.freeze({ key: 'data', label: 'Data' }),
    Object.freeze({ key: 'entrada', label: 'Entrada' }),
  ]),
  estoque: Object.freeze([
    Object.freeze({ key: 'produto', label: 'Produto' }),
    Object.freeze({ key: 'quantidade', label: 'Qtd. vendida' }),
  ]),
});

/**
 * Slots obrigatorios de um dominio. Dominio fora da lista devolve [] (permissivo).
 * @param {unknown} domain
 * @returns {ReadonlyArray<{ key: string, label: string }>}
 */
export function slotsObrigatorios(domain) {
  if (typeof domain !== 'string') return [];
  return REQUIRED_SLOTS[domain] || [];
}

/** Um valor de colMap so conta como mapeado se for string nao vazia. */
function mapeado(valor) {
  return valor != null && String(valor).trim() !== '';
}

/**
 * Slots obrigatorios do dominio que NAO tem coluna escolhida no colMap.
 * Mesma regra do validateRequired do wizard (null, undefined, '' e so espaco
 * contam como nao mapeado), para que front e servidor concordem.
 * @param {unknown} domain
 * @param {object|null|undefined} colMap
 * @returns {Array<{ key: string, label: string }>}
 */
export function slotsFaltando(domain, colMap) {
  const map = colMap && typeof colMap === 'object' ? colMap : {};
  return slotsObrigatorios(domain).filter((s) => !mapeado(map[s.key]));
}

/**
 * Entradas do colMap que apontam para uma coluna que nao existe na fonte.
 * Coluna inexistente produz exatamente o mesmo zero silencioso do slot vazio,
 * entao entra na mesma trava. Sem lista de colunas, nao ha o que checar.
 * @param {object|null|undefined} colMap
 * @param {string[]|null|undefined} columns
 * @returns {Array<{ key: string, coluna: string }>}
 */
export function colunasInexistentes(colMap, columns) {
  if (!Array.isArray(columns) || columns.length === 0) return [];
  if (!colMap || typeof colMap !== 'object') return [];
  const conhecidas = new Set(columns.map((c) => String(c).trim()));
  const fora = [];
  for (const [key, valor] of Object.entries(colMap)) {
    if (!mapeado(valor)) continue;
    const coluna = String(valor).trim();
    if (!conhecidas.has(coluna)) fora.push({ key, coluna });
  }
  return fora;
}

/**
 * Extrai os nomes de coluna da fonte, quando da para saber sem ir na rede.
 * Hoje so a fonte `csv` carrega o conteudo dentro da propria config; sheets e
 * meta exigiriam uma chamada externa, entao devolvem null (a checagem de
 * existencia e pulada e sobra so a de presenca).
 * @param {object|null|undefined} source
 * @returns {string[]|null}
 */
export function colunasDaFonte(source) {
  if (!source || typeof source !== 'object') return null;
  if (source.type !== 'csv') return null;
  const texto = typeof source.data === 'string' ? source.data : '';
  if (!texto.trim()) return null;
  try {
    const { columns } = parseCSV(texto, { delimiter: detectDelimiter(texto) });
    return Array.isArray(columns) && columns.length ? columns : null;
  } catch {
    return null;
  }
}

/** Formata "Investimento (investimento)" para a mensagem de erro. */
function descreve(slot) {
  return `${slot.label} (${slot.key})`;
}

/** Junta uma lista em PT-BR: "A", "A e B", "A, B e C". */
function juntar(itens) {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/**
 * Valida o colMap contra os slots obrigatorios do dominio e, quando as colunas
 * da fonte sao conhecidas, contra a existencia real das colunas escolhidas.
 * @param {unknown} domain dominio canonico do dashboard
 * @param {object|null|undefined} colMap { slotKey: nomeDaColuna }
 * @param {string[]|null} [columns] colunas reais da fonte, ou null se desconhecidas
 * @returns {string|null} mensagem de erro em PT-BR, ou null se valido
 */
export function validarColMap(domain, colMap, columns = null) {
  const faltando = slotsFaltando(domain, colMap);
  if (faltando.length) {
    return (
      `Mapeamento incompleto para o domínio "${domain}": falta escolher a coluna de ` +
      `${juntar(faltando.map(descreve))}. ` +
      'Sem isso o dashboard publica com 0 no lugar do número real. ' +
      'Preencha colMap com { slot: "nome exato da coluna" }.'
    );
  }
  const fora = colunasInexistentes(colMap, columns);
  if (fora.length) {
    const lista = juntar(fora.map((f) => `${f.key} -> "${f.coluna}"`));
    return (
      `Mapeamento inválido para o domínio "${domain}": ${lista} aponta para coluna que não existe na fonte. ` +
      `Colunas disponíveis: ${columns.join(', ')}.`
    );
  }
  return null;
}
