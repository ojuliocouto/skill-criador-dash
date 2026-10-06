// Widget meta: calculadora de meta. A pessoa digita quantas conversões quer no período e o
// cartão responde, pelas MÉDIAS do período filtrado:
//   investimento necessário = meta x custo médio por conversão (CPA)
//   leads necessários       = meta / taxa de lead pra conversão
//   receita esperada        = meta x receita média por conversão
// e mostra em uma linha quais médias usou.
//
// A conta mora em calcularMeta (pura, testada sem DOM). render e saidaHtml só montam HTML. Quem
// liga o campo ao recálculo é o dashboard.js, que chama saidaDoElemento a cada tecla e troca
// só a área de resultado (o campo não é recriado, então não perde o foco).
//
// Regra dura: sem dado suficiente (divisão por zero, coluna não mapeada) o cartão diz isso por
// extenso. Nunca NaN, Infinity nem "R$ 0,00" com cara de número certo.

import { esc } from './_util.js';
import { fmtCurrency, fmtInteger, fmtNumber, fmtPercent, parseNumberBR } from '../lib/format.js';

export const SEM_DADO = 'Sem dado suficiente no período';
const PEDE_META = 'Digite uma meta maior que zero para ver a conta.';

// Número utilizável na conta: finito e maior que zero. Qualquer outra coisa vira null.
const positivo = (n) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null);
const finito = positivo;

/**
 * Lê a meta digitada. Aceita número ou texto em formato brasileiro ("1.500", "12,5").
 * Vazio, zero, negativo e texto que não é número devolvem null.
 * @returns {number|null}
 */
export function lerMeta(valor) {
  if (valor == null) return null;
  const n = typeof valor === 'number' ? valor : parseNumberBR(String(valor));
  return positivo(n);
}

/**
 * Conta da calculadora. Pura.
 * @param {number|null} meta  meta já lida (lerMeta); null = campo vazio ou inválido
 * @param {{alvo:?number, custo:?number, leads:?number, receita:?number}} totais
 *   totais do período filtrado: alvo (conversões), custo (investimento), leads e receita.
 *   null = métrica sem coluna mapeada.
 * @returns {{valida:boolean, temAlgum:boolean, temMedia:boolean,
 *   medias:{custoPorAlvo:?number, taxaLeadAlvo:?number, receitaPorAlvo:?number},
 *   investimento:?number, leads:?number, receita:?number}}
 */
export function calcularMeta(meta, totais) {
  const t = totais && typeof totais === 'object' ? totais : {};
  const alvo = positivo(t.alvo);
  const custo = positivo(t.custo);
  const leads = positivo(t.leads);
  const receita = positivo(t.receita);
  const m = positivo(meta);

  // Média só existe com os dois lados maiores que zero. Custo zero daria "R$ 0,00 por
  // conversão": um número com cara de certo que na verdade é falta de dado.
  const medias = {
    custoPorAlvo: alvo && custo ? finito(custo / alvo) : null,
    taxaLeadAlvo: alvo && leads ? finito(alvo / leads) : null,
    receitaPorAlvo: alvo && receita ? finito(receita / alvo) : null,
  };
  const temMedia = Object.values(medias).some((v) => v != null);

  let investimento = null;
  let leadsNecessarios = null;
  let receitaEsperada = null;
  if (m) {
    if (medias.custoPorAlvo != null) investimento = finito((m * custo) / alvo);
    if (medias.taxaLeadAlvo != null) {
      // meta / (alvo / leads), escrito como (meta x leads) / alvo pra não acumular erro de
      // ponto flutuante: 370 de meta com 370 de realizado tem que dar os leads do período, não
      // um a mais. Arredonda pra cima porque meio lead não existe.
      const bruto = (m * leads) / alvo;
      leadsNecessarios = finito(Math.ceil(Math.round(bruto * 1e6) / 1e6));
    }
    if (medias.receitaPorAlvo != null) receitaEsperada = finito((m * receita) / alvo);
  }
  const temAlgum = investimento != null || leadsNecessarios != null || receitaEsperada != null;

  return {
    valida: !!m, temAlgum, temMedia, medias,
    investimento, leads: leadsNecessarios, receita: receitaEsperada,
  };
}

/**
 * Tira os totais do período das métricas já calculadas pelo motor (computeAllMapped).
 * Métrica não declarada nas props ou sem coluna mapeada vira null (nunca zero).
 */
export function totaisDaMeta(props, computed, mapped) {
  const p = props || {};
  const c = computed || {};
  const mp = mapped || {};
  const pegar = (key) => {
    if (!key || mp[key] === false) return null;
    const v = c[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  return {
    alvo: pegar(p.targetKey),
    custo: pegar(p.costKey),
    leads: pegar(p.leadKey),
    receita: pegar(p.revenueKey),
  };
}

function rotulos(props) {
  const l = (props && props.labels) || {};
  return {
    custo: l.cost || 'Investimento necessário',
    leads: l.leads || 'Leads necessários',
    receita: l.revenue || 'Receita esperada',
  };
}

// "A, B e C." a partir das médias que existem.
function fraseDasMedias(props, medias) {
  // Com nome trocado pela pessoa (props.nomes, vindo de lib/rotulos.js) a frase pronta deixaria
  // de concordar ("por conversão" num painel de "Alunas novas"). Forma neutra, com os nomes atuais.
  const nomes = props && props.nomes;
  if (nomes && nomes.alvo) {
    const itens = [];
    if (medias.custoPorAlvo != null) itens.push(`${fmtCurrency(medias.custoPorAlvo)} de ${nomes.custo || 'investimento'}`);
    if (medias.taxaLeadAlvo != null) itens.push(`${fmtNumber(1 / medias.taxaLeadAlvo)} de ${nomes.leads || 'leads'}`);
    if (medias.receitaPorAlvo != null) itens.push(`${fmtCurrency(medias.receitaPorAlvo)} de ${nomes.receita || 'receita'}`);
    if (!itens.length) return '';
    const juntos = itens.length === 1 ? itens[0] : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
    return `Médias do período, para cada 1 de ${nomes.alvo}: ${juntos}.`;
  }
  const unidade = (props && props.unit) || 'conversão';
  const partes = [];
  if (medias.custoPorAlvo != null) partes.push(`${fmtCurrency(medias.custoPorAlvo)} por ${unidade}`);
  if (medias.taxaLeadAlvo != null) partes.push(`${fmtPercent(medias.taxaLeadAlvo)} dos leads viram ${unidade}`);
  if (medias.receitaPorAlvo != null) partes.push(`${fmtCurrency(medias.receitaPorAlvo)} de receita por ${unidade}`);
  if (!partes.length) return '';
  const lista = partes.length === 1
    ? partes[0]
    : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
  return `Médias do período: ${lista}.`;
}

function item(rotulo, texto) {
  const dd = texto == null
    ? `<dd class="meta__sem-dado">${esc(SEM_DADO)}</dd>`
    : `<dd>${esc(texto)}</dd>`;
  return `<div class="meta__item"><dt>${esc(rotulo)}</dt>${dd}</div>`;
}

/**
 * HTML da área de resultado (o que muda a cada tecla).
 * @param {object} props  props do widget (unit, labels)
 * @param {object} calc   saída de calcularMeta
 * @returns {string}
 */
export function saidaHtml(props, calc) {
  const c = calc || calcularMeta(null, null);
  // Sem nenhuma média, não há conta possível com meta nenhuma: diz isso e para.
  if (!c.temMedia) return `<p class="meta__aviso">${esc(SEM_DADO)}</p>`;
  const frase = fraseDasMedias(props, c.medias);
  const mediasHtml = frase ? `<p class="meta__medias">${esc(frase)}</p>` : '';
  if (!c.valida) return `<p class="meta__aviso">${esc(PEDE_META)}</p>${mediasHtml}`;
  const r = rotulos(props);
  return (
    `<dl class="meta__lista">` +
      item(r.custo, c.investimento == null ? null : fmtCurrency(c.investimento)) +
      item(r.leads, c.leads == null ? null : fmtInteger(c.leads)) +
      item(r.receita, c.receita == null ? null : fmtCurrency(c.receita)) +
    `</dl>` +
    mediasHtml
  );
}

// Valor inicial do campo: o que a pessoa digitou (mesmo vazio), senão o que o período já fez.
function valorInicial(valor, totais) {
  if (typeof valor === 'string') return valor;
  const alvo = positivo(totais && totais.alvo);
  return alvo ? String(Math.round(alvo)) : '';
}

/**
 * Recalcula a área de resultado a partir do que o render guardou no elemento (data-meta-dados)
 * e do valor que está no campo. Usada pelo dashboard.js a cada tecla.
 * @param {string} dadosJson  conteúdo de data-meta-dados
 * @param {string} valor      texto do campo
 * @returns {string} HTML da área de resultado
 */
export function saidaDoElemento(dadosJson, valor) {
  let dados = null;
  try { dados = JSON.parse(dadosJson); } catch { dados = null; }
  const d = dados && typeof dados === 'object' ? dados : {};
  return saidaHtml(d.props || {}, calcularMeta(lerMeta(valor), d.totais || {}));
}

/**
 * @param {{title?:string, label?:string, unit?:string, labels?:object}} props
 * @param {{id:string, valor?:string, totais:object}} dados
 * @returns {string} HTML
 */
export function render(props = {}, dados = {}) {
  const p = props || {};
  const d = dados || {};
  const totais = d.totais || {};
  const id = d.id || 'meta';
  const valor = valorInicial(d.valor, totais);
  const titleHtml = p.title ? `<div class="meta__title">${esc(p.title)}</div>` : '';
  const rotuloDoCampo = p.label || 'Meta no período';
  const campoId = `campo-${id}`;
  // O que a recontagem ao digitar precisa, sem depender de estado fora do elemento.
  const guardado = JSON.stringify({ totais, props: { unit: p.unit, labels: p.labels, nomes: p.nomes } });
  return (
    `<div class="meta" data-widget="meta" data-meta-id="${esc(id)}" data-meta-dados="${esc(guardado)}">` +
      titleHtml +
      `<div class="meta__campo">` +
        `<label class="meta__rotulo" for="${esc(campoId)}">${esc(rotuloDoCampo)}</label>` +
        `<input id="${esc(campoId)}" class="input meta__input" type="number" inputmode="numeric" ` +
          `min="1" step="1" autocomplete="off" value="${esc(valor)}" data-meta-campo />` +
      `</div>` +
      `<div class="meta__saida" data-meta-saida aria-live="polite">` +
        saidaHtml(p, calcularMeta(lerMeta(valor), totais)) +
      `</div>` +
    `</div>`
  );
}
