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
 * TODOS os slots (obrigatorios e opcionais) por dominio. Espelho COMPLETO dos
 * slots dos templates de public/assets/js/templates/*.js (paridade coberta por
 * teste: compara key+label+required, na mesma ordem).
 *
 * P5 RODADA 2 (auditoria adversarial achou o buraco): so os OBRIGATORIOS eram
 * validados (REQUIRED_SLOTS, abaixo). Uma chave de colMap com o NOME ERRADO de
 * um slot (ex: "saidas" em vez de "saida" no financeiro) passava batido: nao e
 * obrigatoria (nao entra em slotsFaltando) e nao e "coluna inexistente"
 * (colunasInexistentes so olha o VALOR do colMap, nao a CHAVE). O dashboard
 * publicava com o slot real ("saida") vazio: SAIDAS R$ 0,00 no KPI, SALDO e
 * MARGEM calculados errados, com a tabela logo abaixo mostrando os valores
 * certos, exatamente o mesmo defeito que este arquivo existe pra fechar.
 * ALL_SLOTS existe pra validarColMap rejeitar qualquer chave que nao seja slot
 * nenhum do dominio (ver chavesDesconhecidas/validarColMap abaixo).
 * @type {Readonly<{ [domain: string]: ReadonlyArray<{ key: string, label: string, required: boolean }> }>}
 */
export const ALL_SLOTS = Object.freeze({
  marketing: Object.freeze([
    Object.freeze({ key: 'data', label: 'Data', required: true }),
    Object.freeze({ key: 'canal', label: 'Canal', required: false }),
    Object.freeze({ key: 'investimento', label: 'Investimento', required: true }),
    Object.freeze({ key: 'impressoes', label: 'Impressões', required: false }),
    Object.freeze({ key: 'cliques', label: 'Cliques', required: false }),
    Object.freeze({ key: 'leads', label: 'Leads', required: false }),
    Object.freeze({ key: 'conversoes', label: 'Conversões', required: false }),
    Object.freeze({ key: 'receita', label: 'Receita', required: false }),
  ]),
  vendas: Object.freeze([
    Object.freeze({ key: 'data', label: 'Data', required: true }),
    Object.freeze({ key: 'vendedor', label: 'Vendedor', required: false }),
    Object.freeze({ key: 'produto', label: 'Produto', required: false }),
    Object.freeze({ key: 'valor', label: 'Valor', required: true }),
    Object.freeze({ key: 'status', label: 'Status', required: false }),
  ]),
  suporte: Object.freeze([
    Object.freeze({ key: 'data', label: 'Data', required: true }),
    Object.freeze({ key: 'canal', label: 'Canal', required: false }),
    Object.freeze({ key: 'atendimentos', label: 'Atendimentos', required: true }),
    Object.freeze({ key: 'resolvidos', label: 'Resolvidos', required: false }),
    Object.freeze({ key: 'tempo_resposta', label: 'Tempo de resposta', required: false }),
    Object.freeze({ key: 'csat', label: 'CSAT', required: false }),
  ]),
  financeiro: Object.freeze([
    Object.freeze({ key: 'data', label: 'Data', required: true }),
    Object.freeze({ key: 'categoria', label: 'Categoria', required: false }),
    Object.freeze({ key: 'entrada', label: 'Entrada', required: true }),
    Object.freeze({ key: 'saida', label: 'Saída', required: false }),
  ]),
  estoque: Object.freeze([
    Object.freeze({ key: 'data', label: 'Data', required: false }),
    Object.freeze({ key: 'produto', label: 'Produto', required: true }),
    Object.freeze({ key: 'categoria', label: 'Categoria', required: false }),
    Object.freeze({ key: 'quantidade', label: 'Qtd. vendida', required: true }),
    Object.freeze({ key: 'estoque', label: 'Em estoque', required: false }),
    Object.freeze({ key: 'valor', label: 'Faturamento', required: false }),
  ]),
});

/**
 * Slots obrigatorios por dominio. DERIVADO de ALL_SLOTS (filtro required:true),
 * pra nunca divergir por esquecimento quando um dominio ganha slot novo.
 * @type {Readonly<{ [domain: string]: ReadonlyArray<{ key: string, label: string }> }>}
 */
export const REQUIRED_SLOTS = Object.freeze(
  Object.fromEntries(
    Object.entries(ALL_SLOTS).map(([domain, slots]) => [
      domain,
      Object.freeze(slots.filter((s) => s.required).map((s) => Object.freeze({ key: s.key, label: s.label }))),
    ])
  )
);

/**
 * Slots obrigatorios de um dominio. Dominio fora da lista devolve [] (permissivo).
 * @param {unknown} domain
 * @returns {ReadonlyArray<{ key: string, label: string }>}
 */
export function slotsObrigatorios(domain) {
  if (typeof domain !== 'string') return [];
  return REQUIRED_SLOTS[domain] || [];
}

/**
 * TODOS os slots (obrigatorios e opcionais) de um dominio. Dominio fora da
 * lista canonica devolve [] (permissivo: a validacao de dominio e outra).
 * @param {unknown} domain
 * @returns {ReadonlyArray<{ key: string, label: string, required: boolean }>}
 */
export function slotsValidos(domain) {
  if (typeof domain !== 'string') return [];
  return ALL_SLOTS[domain] || [];
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

/**
 * Chaves do colMap que NAO sao slot nenhum do dominio (erro de digitacao tipo
 * "saidas" no lugar de "saida"). Dominio fora da lista canonica e permissivo:
 * sem ALL_SLOTS[domain] nao ha contra o que checar, entao devolve [] (a
 * validacao de dominio, essa sim estrita, e feita antes, em outro lugar).
 * @param {unknown} domain
 * @param {object|null|undefined} colMap
 * @returns {string[]} chaves desconhecidas, na ordem em que aparecem no colMap
 */
export function chavesDesconhecidas(domain, colMap) {
  if (typeof domain !== 'string' || !ALL_SLOTS[domain]) return [];
  const map = colMap && typeof colMap === 'object' ? colMap : {};
  const conhecidas = new Set(ALL_SLOTS[domain].map((s) => s.key));
  return Object.keys(map).filter((k) => !conhecidas.has(k));
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
 * Valida o colMap contra os slots VALIDOS do dominio (nenhuma chave desconhecida),
 * contra os OBRIGATORIOS (nenhum faltando) e, quando as colunas da fonte sao
 * conhecidas, contra a existencia real das colunas escolhidas. Nessa ordem: uma
 * chave errada (typo) e um defeito estrutural mais basico do que "faltou
 * escolher", entao e checada primeiro.
 * @param {unknown} domain dominio canonico do dashboard
 * @param {object|null|undefined} colMap { slotKey: nomeDaColuna }
 * @param {string[]|null} [columns] colunas reais da fonte, ou null se desconhecidas
 * @returns {string|null} mensagem de erro em PT-BR, ou null se valido
 */
export function validarColMap(domain, colMap, columns = null) {
  const desconhecidas = chavesDesconhecidas(domain, colMap);
  if (desconhecidas.length) {
    const plural = desconhecidas.length > 1;
    const validos = slotsValidos(domain).map((s) => s.key).join(', ');
    return (
      `Slot${plural ? 's' : ''} desconhecido${plural ? 's' : ''} no domínio "${domain}": ` +
      `${juntar(desconhecidas.map((k) => `"${k}"`))}. ` +
      `Slots válidos: ${validos}.`
    );
  }
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
