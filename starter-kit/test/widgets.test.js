import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render as renderKpi } from '../public/assets/js/widgets/kpi.js';
import { render as renderTimeseries } from '../public/assets/js/widgets/timeseries.js';
import { render as renderFunnel } from '../public/assets/js/widgets/funnel.js';
import { render as renderTable } from '../public/assets/js/widgets/table.js';
import { render as renderRanking } from '../public/assets/js/widgets/ranking.js';

// ---------- kpi ----------
test('kpi: label, valor em moeda e hint', () => {
  const html = renderKpi({ label: 'Faturamento', format: 'currency', hint: 'Total do periodo' }, 1234.5);
  assert.ok(html.includes('class="kpi"'), 'tem class kpi');
  assert.ok(html.includes('Faturamento'), 'contem label');
  assert.ok(html.includes('R$ 1.234,50'), 'valor formatado em moeda');
  assert.ok(html.includes('Total do periodo'), 'contem hint');
});

test('kpi: formato number por padrao e sem hint', () => {
  const html = renderKpi({ label: 'Cliques' }, 1234.5);
  assert.ok(html.includes('Cliques'));
  assert.ok(html.includes('1.234,5'));
});

test('kpi: percent e integer', () => {
  assert.ok(renderKpi({ label: 'CTR', format: 'percent' }, 0.1234).includes('12,34%'));
  assert.ok(renderKpi({ label: 'Leads', format: 'integer' }, 1234).includes('1.234'));
});

test('kpi: escapa label malicioso', () => {
  const html = renderKpi({ label: '<script>x</script>' }, 1);
  assert.ok(!html.includes('<script>x</script>'), 'nao vaza script cru');
});

// ---------- timeseries ----------
test('timeseries: svg com polyline e pontos', () => {
  const pts = [
    { date: '2026-01-01', value: 10 },
    { date: '2026-01-02', value: 30 },
    { date: '2026-01-03', value: 20 },
  ];
  const html = renderTimeseries({ title: 'Evolucao' }, pts);
  assert.ok(html.includes('<svg'), 'tem svg');
  assert.ok(html.includes('viewBox="0 0 600 240"'), 'viewBox responsivo com margem pros eixos');
  assert.ok(!html.includes('preserveAspectRatio="none"'), 'nao distorce (sem preserveAspectRatio none)');
  assert.ok(!html.includes('non-scaling-size'), 'sem o vetor invalido non-scaling-size');
  assert.ok(html.includes('<polyline'), 'tem polyline');
  assert.ok(html.includes('Evolucao'), 'contem titulo');
  // polyline com 3 pares de pontos
  const m = html.match(/points="([^"]+)"/);
  assert.ok(m, 'polyline tem atributo points');
  assert.equal(m[1].trim().split(/\s+/).length, 3, 'tres pontos');
  // eixos enriquecidos: gridlines/ticks no Y e rotulos de data no X
  assert.ok(html.includes('chart__grid'), 'tem gridlines');
  assert.ok(html.includes('chart__ytick'), 'tem ticks do eixo Y');
  assert.ok(html.includes('chart__xtick'), 'tem rotulos de data no eixo X');
  assert.ok(html.includes('01/01') && html.includes('03/01'), 'datas curtas do primeiro e ultimo ponto');
});

test('timeseries: lista vazia mostra Sem dados', () => {
  const html = renderTimeseries({ title: 'Vazio' }, []);
  assert.ok(html.includes('Sem dados'), 'mensagem sem dados');
  assert.ok(!html.includes('<polyline'), 'nao desenha polyline');
});

test('timeseries: um ponto desenha o ponto', () => {
  const html = renderTimeseries({ title: 'Um' }, [{ date: '2026-01-01', value: 42 }]);
  assert.ok(html.includes('<svg'));
  assert.ok(html.includes('<circle'), 'desenha o ponto unico');
});

// ---------- funnel ----------
test('funnel: labels e conversao correta entre etapas', () => {
  const steps = [
    { label: 'Visitas', value: 1000 },
    { label: 'Leads', value: 250 },
    { label: 'Vendas', value: 50 },
  ];
  const html = renderFunnel({ title: 'Funil' }, steps);
  assert.ok(html.includes('Visitas'));
  assert.ok(html.includes('Leads'));
  assert.ok(html.includes('Vendas'));
  // 250/1000 = 25%
  assert.ok(html.includes('25'), 'conversao 25%');
  // 50/250 = 20%
  assert.ok(html.includes('20'), 'conversao 20%');
  assert.ok(!html.includes('NaN'), 'sem NaN');
  assert.ok(!html.includes('Infinity'), 'sem Infinity');
});

test('funnel: value 0 nao gera NaN nem Infinity', () => {
  const steps = [
    { label: 'A', value: 0 },
    { label: 'B', value: 0 },
  ];
  const html = renderFunnel({ title: 'Zero' }, steps);
  assert.ok(!html.includes('NaN'));
  assert.ok(!html.includes('Infinity'));
});

test('funnel: vazio mostra Sem dados', () => {
  assert.ok(renderFunnel({ title: 'V' }, []).includes('Sem dados'));
});

// ---------- table ----------
test('table: th das colunas e td das celulas', () => {
  const data = {
    columns: ['Nome', 'Valor'],
    rows: [
      { Nome: 'Ana', Valor: '10' },
      { Nome: 'Bruno', Valor: '20' },
    ],
  };
  const html = renderTable({ title: 'Tabela' }, data);
  assert.ok(html.includes('<th'), 'tem th');
  assert.ok(html.includes('Nome'));
  assert.ok(html.includes('Valor'));
  assert.ok(html.includes('<td'), 'tem td');
  assert.ok(html.includes('Ana'));
  assert.ok(html.includes('Bruno'));
});

test('table: escapa script na celula', () => {
  const data = {
    columns: ['Campo'],
    rows: [{ Campo: '<script>alert(1)</script>' }],
  };
  const html = renderTable({ title: 'X' }, data);
  assert.ok(!html.includes('<script>alert(1)</script>'), 'script escapado');
  assert.ok(html.includes('&lt;script&gt;'), 'entidades escapadas');
});

test('table: respeita pageSize', () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ N: String(i) }));
  const html = renderTable({ title: 'P', pageSize: 2 }, { columns: ['N'], rows });
  const tdCount = (html.match(/<td/g) || []).length;
  assert.equal(tdCount, 2, 'so 2 linhas renderizadas');
});

test('table: vazio mostra Sem dados', () => {
  assert.ok(renderTable({ title: 'V' }, { columns: [], rows: [] }).includes('Sem dados'));
});

// ---------- ranking ----------
test('ranking: ordena desc e formata valores', () => {
  const items = [
    { key: 'Ana', value: 100 },
    { key: 'Bruno', value: 300 },
    { key: 'Carla', value: 200 },
  ];
  const html = renderRanking({ title: 'Ranking', format: 'integer' }, items);
  assert.ok(html.includes('Ranking'));
  // maior (Bruno, 300) aparece antes de Carla e Ana
  const iBruno = html.indexOf('Bruno');
  const iCarla = html.indexOf('Carla');
  const iAna = html.indexOf('Ana');
  assert.ok(iBruno < iCarla && iCarla < iAna, 'ordem desc');
  assert.ok(html.includes('300'), 'valor formatado');
});

test('ranking: currency formata valores', () => {
  const html = renderRanking({ title: 'R', format: 'currency' }, [{ key: 'X', value: 1234.5 }]);
  assert.ok(html.includes('R$ 1.234,50'));
});

test('ranking: escapa key e trata vazio', () => {
  assert.ok(renderRanking({ title: 'V' }, []).includes('Sem dados'));
  const html = renderRanking({ title: 'X' }, [{ key: '<b>x</b>', value: 1 }]);
  assert.ok(!html.includes('<b>x</b>'), 'escapa key');
});
