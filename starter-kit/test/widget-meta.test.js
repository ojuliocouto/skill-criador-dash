// Widget `meta`: calculadora de meta. A pessoa digita quantas conversões quer no período e o
// cartão responde, pelas médias do período filtrado, quanto investir, quantos leads precisa e
// quanto de receita esperar. A conta é uma função pura (calcularMeta), testada aqui sem DOM.
//
// Regra dura: sem dado suficiente (divisão por zero, coluna não mapeada) o cartão diz
// "Sem dado suficiente no período". Nunca NaN, Infinity nem R$ 0,00 com cara de número certo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseCSV } from '../functions/lib/csv.mjs';
import { computeAllMapped } from '../public/assets/js/lib/metrics.js';
import {
  calcularMeta, lerMeta, totaisDaMeta, saidaHtml, render as renderMeta, SEM_DADO,
} from '../public/assets/js/widgets/meta.js';
import { registry } from '../public/assets/js/widgets/index.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const { rows, columns } = parseCSV(readFileSync(join(aqui, 'fixtures', 'marketing-30-dias.csv'), 'utf8'));
const COLMAP = {
  data: 'Data', canal: 'Canal', investimento: 'Investimento', impressoes: 'Impressoes',
  cliques: 'Cliques', leads: 'Leads', conversoes: 'Conversoes', receita: 'Receita',
};
const PROPS = {
  title: 'Calculadora de meta', label: 'Meta de conversões no período', unit: 'conversão',
  targetKey: 'conversoes', costKey: 'investimento', leadKey: 'leads', revenueKey: 'receita',
};
const TOTAIS = { alvo: 370, custo: 57069, leads: 2647, receita: 140600 };
const arred = (n, casas = 2) => Math.round(n * 10 ** casas) / 10 ** casas;

test('calcularMeta: meta 500 com as médias do período de conferência', () => {
  const c = calcularMeta(500, TOTAIS);
  assert.equal(c.valida, true);
  // Médias usadas.
  assert.equal(arred(c.medias.custoPorAlvo), 154.24);
  assert.equal(arred(c.medias.taxaLeadAlvo, 4), 0.1398);
  assert.equal(arred(c.medias.receitaPorAlvo), 380);
  // Investimento necessário = meta x CPA.
  assert.equal(arred(c.investimento), arred(500 * 57069 / 370));
  assert.equal(arred(c.investimento), 77120.27);
  // Leads necessários = meta / taxa de lead pra conversão, arredondado pra cima.
  assert.equal(c.leads, Math.ceil(500 / (370 / 2647)));
  assert.equal(c.leads, 3578);
  // Receita esperada = meta x receita média por conversão.
  assert.equal(arred(c.receita), 190000);
});

test('calcularMeta: meta igual ao realizado devolve o próprio período', () => {
  const c = calcularMeta(370, TOTAIS);
  assert.equal(arred(c.investimento), 57069);
  assert.equal(c.leads, 2647);
  assert.equal(arred(c.receita), 140600);
});

test('calcularMeta: sem conversão no período, nenhuma média existe', () => {
  const c = calcularMeta(500, { alvo: 0, custo: 1000, leads: 50, receita: 0 });
  assert.equal(c.valida, true);
  assert.equal(c.investimento, null);
  assert.equal(c.leads, null);
  assert.equal(c.receita, null);
  assert.equal(c.temAlgum, false);
});

test('calcularMeta: coluna não mapeada (null) derruba só a conta que depende dela', () => {
  const c = calcularMeta(100, { alvo: 50, custo: 5000, leads: null, receita: null });
  assert.equal(c.investimento, 10000);
  assert.equal(c.leads, null);
  assert.equal(c.receita, null);
  assert.equal(c.temAlgum, true);
});

test('calcularMeta: zero no numerador também é "sem dado" (R$ 0,00 teria cara de número certo)', () => {
  const c = calcularMeta(100, { alvo: 50, custo: 0, leads: 0, receita: 0 });
  assert.equal(c.investimento, null);
  assert.equal(c.leads, null);
  assert.equal(c.receita, null);
});

test('calcularMeta: nunca devolve NaN nem Infinity', () => {
  const casos = [
    [500, { alvo: NaN, custo: 1, leads: 1, receita: 1 }],
    [500, { alvo: 10, custo: Infinity, leads: -5, receita: NaN }],
    [1e308, { alvo: 1, custo: 1e308, leads: 1e-300, receita: 1e308 }],
    [500, {}],
    [500, null],
  ];
  for (const [meta, totais] of casos) {
    const c = calcularMeta(meta, totais);
    for (const k of ['investimento', 'leads', 'receita']) {
      assert.ok(c[k] === null || Number.isFinite(c[k]), `${k} = ${c[k]}`);
    }
  }
});

test('lerMeta: aceita número e texto digitado; vazio, zero, negativo e lixo não valem', () => {
  assert.equal(lerMeta('500'), 500);
  assert.equal(lerMeta(500), 500);
  assert.equal(lerMeta(' 1.500 '), 1500, 'milhar brasileiro');
  assert.equal(lerMeta('12,5'), 12.5);
  assert.equal(lerMeta(''), null);
  assert.equal(lerMeta('0'), null);
  assert.equal(lerMeta('-3'), null);
  assert.equal(lerMeta('abc'), null);
  assert.equal(lerMeta(null), null);
  assert.equal(lerMeta(Infinity), null);
});

test('calcularMeta: meta inválida não calcula nada', () => {
  const c = calcularMeta(null, TOTAIS);
  assert.equal(c.valida, false);
  assert.equal(c.investimento, null);
  // As médias continuam disponíveis: a linha "qual média usou" não depende da meta.
  assert.equal(arred(c.medias.custoPorAlvo), 154.24);
});

test('totaisDaMeta: tira os totais do período das métricas já calculadas pelo motor', () => {
  const { computed, mapped } = computeAllMapped(marketing.metrics, rows, COLMAP);
  assert.deepEqual(totaisDaMeta(PROPS, computed, mapped), TOTAIS);
});

test('totaisDaMeta: métrica sem coluna mapeada vira null, não zero', () => {
  const semReceita = { ...COLMAP };
  delete semReceita.receita;
  const { computed, mapped } = computeAllMapped(marketing.metrics, rows.map(({ Receita, ...r }) => r), semReceita);
  const t = totaisDaMeta(PROPS, computed, mapped);
  assert.equal(t.receita, null);
  assert.equal(t.custo, 57069);
  assert.equal(totaisDaMeta({ ...PROPS, leadKey: undefined }, computed, mapped).leads, null, 'chave não declarada');
});

test('saidaHtml: os três resultados formatados e a linha das médias usadas', () => {
  const html = saidaHtml(PROPS, calcularMeta(500, TOTAIS));
  assert.match(html, /Investimento necessário/);
  assert.match(html, />R\$ 77\.120,27</);
  assert.match(html, /Leads necessários/);
  assert.match(html, />3\.578</);
  assert.match(html, /Receita esperada/);
  assert.match(html, />R\$ 190\.000,00</);
  assert.match(html, /Médias do período: R\$ 154,24 por conversão, 13,98% dos leads viram conversão e R\$ 380,00 de receita por conversão\./);
});

test('saidaHtml: sem dado suficiente diz isso por extenso, sem número falso', () => {
  const tudoVazio = saidaHtml(PROPS, calcularMeta(500, { alvo: 0, custo: 1000, leads: 50, receita: 0 }));
  assert.ok(tudoVazio.includes(SEM_DADO));
  assert.equal(SEM_DADO, 'Sem dado suficiente no período');
  assert.ok(!/NaN|Infinity|R\$ 0,00|undefined|null/.test(tudoVazio), tudoVazio);
  assert.ok(!/Médias do período/.test(tudoVazio), 'sem média, não há linha de média');

  const parcial = saidaHtml(PROPS, calcularMeta(100, { alvo: 50, custo: 5000, leads: null, receita: null }));
  assert.match(parcial, />R\$ 10\.000,00</);
  assert.equal(parcial.split(SEM_DADO).length - 1, 2, 'as duas contas sem insumo dizem "sem dado"');
  assert.ok(!/NaN|Infinity|R\$ 0,00|undefined|null/.test(parcial), parcial);
  assert.match(parcial, /Médias do período: R\$ 100,00 por conversão\./);
});

test('saidaHtml: campo vazio ou inválido pede a meta em vez de mostrar conta', () => {
  const html = saidaHtml(PROPS, calcularMeta(lerMeta(''), TOTAIS));
  assert.match(html, /Digite uma meta maior que zero/);
  assert.ok(!/R\$ 0,00|NaN/.test(html));
});

test('render: campo numérico com o rótulo das props e o valor que veio do estado', () => {
  const html = renderMeta(PROPS, { id: 'meta-conversoes', valor: '500', totais: TOTAIS });
  assert.match(html, /data-widget="meta"/);
  assert.match(html, /data-meta-id="meta-conversoes"/);
  assert.match(html, /Meta de conversões no período/);
  assert.match(html, /<input[^>]*type="number"[^>]*value="500"/);
  assert.match(html, /<input[^>]*data-meta-campo/);
  assert.match(html, /data-meta-saida/);
  assert.match(html, />R\$ 77\.120,27</);
});

test('render: sem valor digitado, começa no que o período já fez', () => {
  const html = renderMeta(PROPS, { id: 'm', valor: undefined, totais: TOTAIS });
  assert.match(html, /<input[^>]*value="370"/);
  assert.match(html, />R\$ 57\.069,00</);
});

test('render: campo que a pessoa apagou continua vazio (não volta pro padrão)', () => {
  const html = renderMeta(PROPS, { id: 'm', valor: '', totais: TOTAIS });
  assert.match(html, /<input[^>]*value=""/);
  assert.match(html, /Digite uma meta maior que zero/);
});

test('render: guarda no elemento o que a recontagem ao digitar precisa, escapado', () => {
  const html = renderMeta({ ...PROPS, unit: 'venda "top"' }, { id: 'm', valor: '10', totais: TOTAIS });
  const m = html.match(/data-meta-dados="([^"]*)"/);
  assert.ok(m, 'tem o atributo de dados');
  const dados = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  assert.deepEqual(dados.totais, TOTAIS);
  assert.equal(dados.props.unit, 'venda "top"');
});

// ---------- registry ----------

const findMetricDef = (tpl, key) => tpl.metrics.find((m) => m.key === key);
const card = (titulo, inner) => `<div class="card"><div class="widget-title">${titulo || ''}</div>${inner}</div>`;

test('registry: meta está registrado, usa os totais filtrados e respeita o valor digitado', () => {
  const { computed, mapped } = computeAllMapped(marketing.metrics, rows, COLMAP);
  const base = { template: marketing, dataset: { columns, rows }, colMap: COLMAP, computed, mapped, findMetricDef, card };
  const item = { widget: 'meta', props: PROPS };
  const padrao = registry.meta.toHtml(item, base);
  assert.match(padrao, /Calculadora de meta/);
  assert.match(padrao, /value="370"/);
  const digitado = registry.meta.toHtml(item, { ...base, estado: { meta: { 'meta-conversoes': '500' } } });
  assert.match(digitado, /value="500"/);
  assert.match(digitado, />R\$ 77\.120,27</);
});

test('registry: meta com a métrica-alvo sem coluna diz "sem dado" em vez de calcular', () => {
  const cm = { data: 'Data', investimento: 'Investimento' };
  const linhas = rows.map((r) => ({ Data: r.Data, Investimento: r.Investimento }));
  const { computed, mapped } = computeAllMapped(marketing.metrics, linhas, cm);
  const html = registry.meta.toHtml({ widget: 'meta', props: PROPS }, {
    template: marketing, dataset: { columns: ['Data', 'Investimento'], rows: linhas }, colMap: cm, computed, mapped, findMetricDef, card,
  });
  assert.ok(html.includes(SEM_DADO));
  assert.ok(!/NaN|Infinity|R\$ 0,00/.test(html));
});
