// Agrupamento de linhas por período (dia, semana, mês) em cima do slot de data. ESM, puro.
//
// Usado pelo widget `resumo` quando o groupBy é um período em vez de um slot de dimensão.
// Decisões:
//   - A semana começa na segunda-feira e termina no domingo.
//   - O rótulo do grupo mostra só os dias que TÊM dado ("05/09 a 06/09"), não a semana cheia
//     do calendário: uma semana com 2 dias não pode se apresentar como semana inteira.
//   - Linha sem data válida não some: volta em `semData` pra quem chama decidir o que fazer.

import { parseDateBR } from './format.js';

const PERIODOS = ['dia', 'semana', 'mes'];
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const ROTULO_DA_DIMENSAO = { dia: 'Dia', semana: 'Semana', mes: 'Mês' };

/** true quando o groupBy é um período (dia, semana, mes) e não um slot de dimensão. */
export function ehPeriodo(groupBy) {
  return PERIODOS.includes(groupBy);
}

/** Nome da primeira coluna da tabela quando o agrupamento é por período. */
export function rotuloDaDimensaoDePeriodo(periodo) {
  return ROTULO_DA_DIMENSAO[periodo] || '';
}

const dois = (n) => String(n).padStart(2, '0');

/** 'AAAA-MM-DD' da segunda-feira da semana da data; null se a data não for ISO válida. */
export function inicioDaSemana(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(dt.getTime())) return null;
  // getUTCDay: 0 = domingo ... 6 = sábado. Distância até a segunda anterior (ou a própria).
  const recuo = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - recuo);
  return `${dt.getUTCFullYear()}-${dois(dt.getUTCMonth() + 1)}-${dois(dt.getUTCDate())}`;
}

/** Chave ordenável do período de uma data ISO: o dia, a segunda da semana ou 'AAAA-MM'. */
export function chavePeriodo(iso, periodo) {
  if (!iso) return null;
  if (periodo === 'semana') return inicioDaSemana(iso);
  if (periodo === 'mes') return String(iso).slice(0, 7);
  return String(iso);
}

const diaMes = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const diaMesAno = (iso) => `${diaMes(iso)}/${iso.slice(0, 4)}`;

function rotulo(periodo, chave, de, ate, comAno) {
  if (periodo === 'dia') return diaMesAno(de);
  if (periodo === 'mes') return `${MESES[Number(chave.slice(5, 7)) - 1]} de ${chave.slice(0, 4)}`;
  const fmt = comAno ? diaMesAno : diaMes;
  return de === ate ? fmt(de) : `${fmt(de)} a ${fmt(ate)}`;
}

/**
 * Agrupa as linhas pelo período da data. Grupos em ordem cronológica.
 * @param {Object[]} rows
 * @param {Object} colMap   slot -> coluna real
 * @param {string} dateSlot slot de data do template
 * @param {'dia'|'semana'|'mes'} periodo
 * @returns {{grupos:{key:string,label:string,de:string,ate:string,rows:Object[]}[], semData:Object[]}}
 */
export function agruparPorPeriodo(rows, colMap, dateSlot, periodo) {
  const lista = Array.isArray(rows) ? rows : [];
  const col = colMap && colMap[dateSlot];
  if (!col) return { grupos: [], semData: lista.slice() };

  const mapa = new Map();
  const semData = [];
  const anos = new Set();
  for (const row of lista) {
    const iso = parseDateBR(row && row[col]);
    const chave = chavePeriodo(iso, periodo);
    if (!chave) { semData.push(row); continue; }
    anos.add(iso.slice(0, 4));
    let g = mapa.get(chave);
    if (!g) { g = { key: chave, de: iso, ate: iso, rows: [] }; mapa.set(chave, g); }
    if (iso < g.de) g.de = iso;
    if (iso > g.ate) g.ate = iso;
    g.rows.push(row);
  }
  // Dados que atravessam o ano: "05/01" sozinho seria ambíguo, então o rótulo leva o ano.
  const comAno = anos.size > 1;
  const grupos = [...mapa.values()]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((g) => ({ ...g, label: rotulo(periodo, g.key, g.de, g.ate, comAno) }));
  return { grupos, semData };
}
