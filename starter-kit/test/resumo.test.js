// Widget `resumo`: tabela agregada por dimensão (canal) ou por período (dia, semana, mes) com
// linha de TOTAL. A regra que não pode errar: cada linha recalcula as métricas com o MESMO motor
// (computeAll de lib/metrics.js) em cima das linhas do grupo, e o total em cima de TODAS as
// linhas. Taxa (CPL, CPA, CTR, ROAS) de total nunca é soma nem média das linhas.
//
// Números de conferência: calculados lendo o CSV inteiro de test/fixtures/marketing-30-dias.csv
// (90 linhas, 30 dias de 05/09/2026 a 04/10/2026, 3 canais), que é a fonte do painel de teste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseCSV } from '../functions/lib/csv.mjs';
import { computeAll } from '../public/assets/js/lib/metrics.js';
import { parseNumberBR } from '../public/assets/js/lib/format.js';
import { resumir, ehMetricaDeTaxa } from '../public/assets/js/lib/resumo.js';
import { render as renderResumo } from '../public/assets/js/widgets/resumo.js';
import { registry } from '../public/assets/js/widgets/index.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const { rows, columns } = parseCSV(readFileSync(join(aqui, 'fixtures', 'marketing-30-dias.csv'), 'utf8'));
const COLMAP = {
  data: 'Data', canal: 'Canal', investimento: 'Investimento', impressoes: 'Impressoes',
  cliques: 'Cliques', leads: 'Leads', conversoes: 'Conversoes', receita: 'Receita',
};
const METRICAS = ['investimento', 'leads', 'CPL', 'conversoes', 'CPA', 'receita', 'ROAS'];
const arred = (n, casas = 2) => Math.round(n * 10 ** casas) / 10 ** casas;
const porCanal = () => resumir({ rows, colMap: COLMAP, template: marketing, groupBy: 'canal', metrics: METRICAS });
const linhaDe = (r, rotulo) => r.linhas.find((l) => l.label === rotulo);

test('fixture: o CSV de conferência tem 90 linhas, 30 dias e 3 canais', () => {
  assert.equal(rows.length, 90);
  assert.equal(new Set(rows.map((r) => r.Data)).size, 30);
  assert.deepEqual([...new Set(rows.map((r) => r.Canal))].sort(), ['Google', 'Instagram', 'TikTok']);
  assert.deepEqual(columns, ['Data', 'Canal', 'Investimento', 'Impressoes', 'Cliques', 'Leads', 'Conversoes', 'Receita']);
});

test('resumo por canal: TOTAL bate com os números de conferência', () => {
  const r = porCanal();
  assert.equal(r.ok, true);
  assert.equal(r.dimLabel, 'Canal');
  assert.equal(r.total.valores.investimento, 57069);
  assert.equal(r.total.valores.leads, 2647);
  assert.equal(r.total.valores.conversoes, 370);
  assert.equal(r.total.valores.receita, 140600);
  assert.equal(arred(r.total.valores.CPA), 154.24);
  assert.equal(arred(r.total.valores.CPL), 21.56);
  assert.equal(arred(r.total.valores.ROAS), 2.46);
});

test('resumo por canal: investimento e conversões de cada canal', () => {
  const r = porCanal();
  assert.equal(linhaDe(r, 'Instagram').valores.investimento, 27235);
  assert.equal(linhaDe(r, 'Instagram').valores.conversoes, 177);
  assert.equal(linhaDe(r, 'Google').valores.investimento, 20655);
  assert.equal(linhaDe(r, 'Google').valores.conversoes, 134);
  assert.equal(linhaDe(r, 'TikTok').valores.investimento, 9179);
  assert.equal(linhaDe(r, 'TikTok').valores.conversoes, 59);
  assert.deepEqual(r.linhas.map((l) => l.label), ['Instagram', 'Google', 'TikTok'], 'ordena pela primeira métrica, do maior pro menor');
});

test('resumo: taxa de cada linha e do total sai do MESMO motor, nunca de soma ou média', () => {
  const r = porCanal();
  // Linha: igual a computeAll em cima só das linhas do canal.
  for (const canal of ['Instagram', 'Google', 'TikTok']) {
    const esperado = computeAll(marketing.metrics, rows.filter((x) => x.Canal === canal), COLMAP);
    for (const k of METRICAS) assert.equal(linhaDe(r, canal).valores[k], esperado[k], `${canal}/${k}`);
  }
  // Total: igual a computeAll em cima de todas as linhas.
  const total = computeAll(marketing.metrics, rows, COLMAP);
  for (const k of METRICAS) assert.equal(r.total.valores[k], total[k], `total/${k}`);
  // E prova de que não é soma nem média das linhas.
  const cpas = r.linhas.map((l) => l.valores.CPA);
  const soma = cpas.reduce((a, b) => a + b, 0);
  assert.notEqual(arred(r.total.valores.CPA), arred(soma), 'CPA total não é a soma dos CPAs');
  assert.notEqual(arred(r.total.valores.CPA, 4), arred(soma / cpas.length, 4), 'CPA total não é a média dos CPAs');
  assert.equal(arred(r.total.valores.CPA, 4), arred(57069 / 370, 4));
  // Volume, esse sim, fecha: a soma das linhas é o total.
  assert.equal(r.linhas.reduce((a, l) => a + l.valores.investimento, 0), r.total.valores.investimento);
});

test('resumo por semana: 5 semanas em ordem, somando o total', () => {
  const r = resumir({ rows, colMap: COLMAP, template: marketing, groupBy: 'semana', metrics: METRICAS });
  assert.equal(r.dimLabel, 'Semana');
  assert.deepEqual(r.linhas.map((l) => l.label), ['05/09 a 06/09', '07/09 a 13/09', '14/09 a 20/09', '21/09 a 27/09', '28/09 a 04/10']);
  assert.equal(r.linhas.reduce((a, l) => a + l.valores.conversoes, 0), 370);
  assert.equal(arred(r.linhas.reduce((a, l) => a + l.valores.investimento, 0)), 57069);
  assert.equal(arred(r.total.valores.CPA), 154.24);
  // Primeira semana tem só 2 dias (6 linhas): o CPA dela é o dela, não o do total.
  const prim = rows.filter((x) => x.Data === '2026-09-05' || x.Data === '2026-09-06');
  assert.equal(prim.length, 6);
  const inv = prim.reduce((a, x) => a + parseNumberBR(x.Investimento), 0);
  const conv = prim.reduce((a, x) => a + parseNumberBR(x.Conversoes), 0);
  assert.equal(r.linhas[0].valores.CPA, inv / conv);
});

test('resumo por dia e por mes: quantidade de linhas', () => {
  assert.equal(resumir({ rows, colMap: COLMAP, template: marketing, groupBy: 'dia', metrics: METRICAS, limit: 100 }).linhas.length, 30);
  const mes = resumir({ rows, colMap: COLMAP, template: marketing, groupBy: 'mes', metrics: METRICAS });
  assert.deepEqual(mes.linhas.map((l) => l.label), ['Setembro de 2026', 'Outubro de 2026']);
});

test('resumo: limite de linhas corta a lista mas o total considera tudo', () => {
  const r = resumir({ rows, colMap: COLMAP, template: marketing, groupBy: 'dia', metrics: METRICAS, limit: 10 });
  assert.equal(r.linhas.length, 10);
  assert.equal(r.totalDeGrupos, 30);
  assert.equal(r.total.valores.conversoes, 370);
});

test('resumo: colunas herdam rótulo e formato da métrica; rótulo pode ser trocado na prop', () => {
  const r = resumir({
    rows, colMap: COLMAP, template: marketing, groupBy: 'canal',
    metrics: ['investimento', { key: 'CTR', label: 'Impressões que viram clique' }],
  });
  assert.deepEqual(r.colunas.map((c) => [c.key, c.label, c.format]), [
    ['investimento', 'Investimento', 'currency'],
    ['CTR', 'Impressões que viram clique', 'percent'],
  ]);
});

test('resumo: métrica sem coluna mapeada sai da tabela e é avisada, nunca vira zero', () => {
  const semReceita = { ...COLMAP };
  delete semReceita.receita;
  const linhas = rows.map(({ Receita, ...resto }) => resto);
  const r = resumir({ rows: linhas, colMap: semReceita, template: marketing, groupBy: 'canal', metrics: METRICAS });
  assert.deepEqual(r.colunas.map((c) => c.key), ['investimento', 'leads', 'CPL', 'conversoes', 'CPA']);
  assert.deepEqual(r.ocultas, ['Receita', 'ROAS']);
});

test('resumo: agrupamento sem coluna mapeada não monta tabela', () => {
  const semCanal = { ...COLMAP };
  delete semCanal.canal;
  const semColuna = rows.map(({ Canal, ...resto }) => resto);
  assert.equal(resumir({ rows: semColuna, colMap: semCanal, template: marketing, groupBy: 'canal', metrics: METRICAS }).ok, false);
  const semData = { ...COLMAP };
  delete semData.data;
  assert.equal(resumir({ rows: rows.map(({ Data, ...resto }) => resto), colMap: semData, template: marketing, groupBy: 'semana', metrics: METRICAS }).ok, false);
  assert.equal(resumir({ rows: [], colMap: COLMAP, template: marketing, groupBy: 'canal', metrics: METRICAS }).ok, false);
});

test('resumo: taxa com denominador zero é "sem dado" (null), nunca R$ 0,00', () => {
  const r = resumir({
    rows: [
      { Data: '2026-09-05', Canal: 'A', Investimento: '100,00', Leads: '10', Conversoes: '0', Receita: '0' },
      { Data: '2026-09-05', Canal: 'B', Investimento: '0', Leads: '0', Conversoes: '2', Receita: '500,00' },
    ],
    colMap: COLMAP, template: marketing, groupBy: 'canal', metrics: ['investimento', 'CPL', 'CPA', 'ROAS'],
  });
  assert.equal(linhaDe(r, 'A').valores.CPA, null, 'sem conversão não existe CPA');
  assert.equal(linhaDe(r, 'A').valores.CPL, 10);
  assert.equal(linhaDe(r, 'B').valores.CPL, null, 'sem lead não existe CPL');
  assert.equal(linhaDe(r, 'B').valores.ROAS, null, 'sem investimento não existe ROAS');
  assert.equal(linhaDe(r, 'B').valores.investimento, 0, 'volume zero é zero de verdade');
  assert.equal(r.total.valores.CPA, 50);
});

test('resumo: linha com dimensão vazia entra como "Não informado" pra tabela fechar com o total', () => {
  const r = resumir({
    rows: [
      { Data: '2026-09-05', Canal: 'A', Investimento: '100,00', Conversoes: '1' },
      { Data: '2026-09-05', Canal: '', Investimento: '50,00', Conversoes: '1' },
    ],
    colMap: COLMAP, template: marketing, groupBy: 'canal', metrics: ['investimento', 'conversoes'],
  });
  assert.deepEqual(r.linhas.map((l) => l.label), ['A', 'Não informado']);
  assert.equal(r.linhas.reduce((a, l) => a + l.valores.investimento, 0), r.total.valores.investimento);
});

test('ehMetricaDeTaxa: ratio, avg e derivada com denominador são taxa; soma não é', () => {
  const def = (k) => marketing.metrics.find((m) => m.key === k);
  assert.equal(ehMetricaDeTaxa(def('CPA')), true);
  assert.equal(ehMetricaDeTaxa(def('CTR')), true);
  assert.equal(ehMetricaDeTaxa(def('ROAS')), true);
  assert.equal(ehMetricaDeTaxa(def('investimento')), false);
  assert.equal(ehMetricaDeTaxa(def('receita')), false);
  assert.equal(ehMetricaDeTaxa({ agg: 'avg' }), true);
  assert.equal(ehMetricaDeTaxa({ agg: 'derived', compute: () => 1 }), false, 'derivada sem denominador pode ser volume');
});

test('resumo: tom (bom ou ruim) só em taxa, comparada com o total, e com folga de 1%', () => {
  const r = resumir({
    rows: [
      { Data: '2026-09-05', Canal: 'Barato', Investimento: '100,00', Conversoes: '10' },
      { Data: '2026-09-05', Canal: 'Caro', Investimento: '300,00', Conversoes: '10' },
      { Data: '2026-09-05', Canal: 'Na média', Investimento: '200,00', Conversoes: '10' },
    ],
    colMap: COLMAP, template: marketing, groupBy: 'canal', metrics: ['investimento', 'conversoes', 'CPA'],
  });
  assert.equal(r.total.valores.CPA, 20);
  assert.equal(linhaDe(r, 'Barato').tons.CPA, 'bom', 'CPA menor que o do total é bom');
  assert.equal(linhaDe(r, 'Caro').tons.CPA, 'ruim');
  assert.equal(linhaDe(r, 'Na média').tons.CPA, undefined, 'igual ao total não ganha cor');
  for (const l of r.linhas) {
    assert.equal(l.tons.investimento, undefined, 'volume não ganha cor: gastar mais não é bom nem ruim');
    assert.equal(l.tons.conversoes, undefined, 'volume de uma linha é sempre menor que o total: comparar seria ruído');
  }
});

// ---------- render ----------

test('render: tabela com cabeçalho, linhas, TOTAL em destaque e valores formatados', () => {
  const html = renderResumo({}, porCanal());
  assert.match(html, /<table class="resumo__el">/);
  assert.match(html, /<th scope="col">Canal<\/th>/);
  assert.match(html, /<th scope="col" class="num">Investimento<\/th>/);
  assert.match(html, /<th scope="row">Instagram<\/th>/);
  assert.match(html, />R\$ 27\.235,00</);
  assert.match(html, /<tfoot><tr class="resumo__total"><th scope="row">Total<\/th>/);
  const total = html.slice(html.indexOf('<tfoot>'));
  assert.match(total, />R\$ 57\.069,00</);
  assert.match(total, />2\.647</);
  assert.match(total, />370</);
  assert.match(total, />R\$ 154,24</);
  assert.match(total, />R\$ 21,56</);
  assert.match(total, />2,46</);
  assert.ok(!/NaN|Infinity|undefined/.test(html));
});

test('render: cada célula leva o rótulo da coluna (a versão de tela estreita empilha por ele)', () => {
  const html = renderResumo({}, porCanal());
  assert.match(html, /<td class="num" data-label="Investimento">R\$ 27\.235,00<\/td>/);
  assert.equal((html.match(/data-label="CPA"/g) || []).length, 4, '3 canais + total');
});

test('render: classe de tamanho pela quantidade de colunas, pra saber quando empilhar', () => {
  const com = (n) => renderResumo({}, resumir({ rows, colMap: COLMAP, template: marketing, groupBy: 'canal', metrics: METRICAS.slice(0, n) }));
  assert.match(com(3), /class="resumo resumo--p"/);
  assert.match(com(7), /class="resumo resumo--m"/);
  const onze = resumir({
    rows, colMap: COLMAP, template: marketing, groupBy: 'canal',
    metrics: ['investimento', 'impressoes', 'cliques', 'CTR', 'CPC', 'leads', 'CPL', 'conversoes', 'CPA', 'receita', 'ROAS'],
  });
  assert.match(renderResumo({}, onze), /class="resumo resumo--g"/);
});

test('render: célula boa e ruim ganham classe e a legenda explica a cor', () => {
  const r = resumir({
    rows: [
      { Data: '2026-09-05', Canal: 'Barato', Investimento: '100,00', Conversoes: '10' },
      { Data: '2026-09-05', Canal: 'Caro', Investimento: '300,00', Conversoes: '10' },
    ],
    colMap: COLMAP, template: marketing, groupBy: 'canal', metrics: ['investimento', 'CPA'],
  });
  const html = renderResumo({}, r);
  assert.match(html, /<td class="num is-good" data-label="CPA"[^>]*>R\$ 10,00<\/td>/);
  assert.match(html, /<td class="num is-bad" data-label="CPA"[^>]*>R\$ 30,00<\/td>/);
  assert.match(html, /Verde: melhor que o total\. Vermelho: pior\./);
  // Sem nenhuma célula colorida, a legenda não aparece.
  assert.ok(!/Verde:/.test(renderResumo({}, resumir({ rows, colMap: COLMAP, template: marketing, groupBy: 'canal', metrics: ['investimento'] }))));
});

test('render: "sem dado" por extenso onde a taxa não existe, e aviso das colunas que ficaram de fora', () => {
  const r = resumir({
    rows: [{ Data: '2026-09-05', Canal: 'A', Investimento: '100,00', Leads: '10', Conversoes: '0' }],
    colMap: { data: 'Data', canal: 'Canal', investimento: 'Investimento', leads: 'Leads', conversoes: 'Conversoes' },
    template: marketing, groupBy: 'canal', metrics: ['investimento', 'CPA', 'receita', 'ROAS'],
  });
  const html = renderResumo({}, r);
  assert.match(html, /<td class="num is-vazio" data-label="CPA">sem dado<\/td>/);
  assert.ok(!html.includes('R$ 0,00'));
  assert.match(html, /Ficou de fora por falta de coluna: Receita, ROAS\./);
});

test('render: escapa rótulo vindo da planilha', () => {
  const r = resumir({
    rows: [{ Data: '2026-09-05', Canal: '<img src=x onerror=alert(1)>', Investimento: '1' }],
    colMap: COLMAP, template: marketing, groupBy: 'canal', metrics: ['investimento'],
  });
  const html = renderResumo({}, r);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});

test('render: dado inválido ou vazio vira estado vazio, sem quebrar', () => {
  assert.match(renderResumo({}, { ok: false }), /Sem dados/);
  assert.match(renderResumo({}, null), /Sem dados/);
});

// ---------- registry ----------

const findMetricDef = (tpl, key) => tpl.metrics.find((m) => m.key === key);
const card = (titulo, inner, extra = '') => `<div class="card ${extra}"><div class="widget-title">${titulo || ''}</div>${inner}</div>`;
const ctx = (extra = {}) => ({ template: marketing, dataset: { columns, rows }, colMap: COLMAP, findMetricDef, card, ...extra });

test('registry: resumo está registrado e monta o cartão com título', () => {
  const item = { widget: 'resumo', props: { title: 'Resultado por canal', groupBy: 'canal', metrics: METRICAS } };
  const html = registry.resumo.toHtml(item, ctx());
  assert.match(html, /Resultado por canal/);
  assert.match(html, />R\$ 57\.069,00</);
});

test('registry: resumo sem a coluna do agrupamento não vira cartão vazio', () => {
  const item = { widget: 'resumo', props: { groupBy: 'canal', metrics: METRICAS } };
  const semCanal = { ...COLMAP };
  delete semCanal.canal;
  assert.equal(registry.resumo.toHtml(item, ctx({ colMap: semCanal, dataset: { columns, rows: rows.map(({ Canal, ...r }) => r) } })), '');
});

// ---------- ordem das linhas ----------

test('resumo: orderBy ordena por uma métrica que nem precisa estar na tabela', () => {
  const taxas = ['CTR', 'taxa_lead', 'taxa_conversao'];
  const padrao = resumir({ rows, colMap: COLMAP, template: marketing, groupBy: 'canal', metrics: taxas });
  assert.deepEqual(padrao.linhas.map((l) => l.label), ['Google', 'TikTok', 'Instagram'], 'sem orderBy, vale a primeira coluna');
  const porInvestimento = resumir({ rows, colMap: COLMAP, template: marketing, groupBy: 'canal', metrics: taxas, orderBy: 'investimento' });
  assert.deepEqual(porInvestimento.linhas.map((l) => l.label), ['Instagram', 'Google', 'TikTok'], 'mesma ordem das outras abas');
  assert.deepEqual(porInvestimento.colunas.map((c) => c.key), taxas, 'a métrica da ordem não vira coluna');
});

test('resumo: orderBy desconhecido ou sem coluna mapeada cai na primeira coluna', () => {
  const r = resumir({ rows, colMap: COLMAP, template: marketing, groupBy: 'canal', metrics: ['CTR'], orderBy: 'nao-existe' });
  assert.deepEqual(r.linhas.map((l) => l.label), ['Google', 'TikTok', 'Instagram']);
});
