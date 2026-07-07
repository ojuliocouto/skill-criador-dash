import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render as renderKpi } from '../public/assets/js/widgets/kpi.js';
import { render as renderTimeseries } from '../public/assets/js/widgets/timeseries.js';
import { render as renderFunnel } from '../public/assets/js/widgets/funnel.js';
import { render as renderTable } from '../public/assets/js/widgets/table.js';
import { render as renderRanking } from '../public/assets/js/widgets/ranking.js';
import { registry, getWidget } from '../public/assets/js/widgets/index.js';

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

// ---------- getWidget: fronteira de despacho (fix 3) ----------
// O dashboard.js despacha widget por getWidget(tipo), nao por registry[tipo] direto.
test('getWidget: retorna a entrada do registry para widget valido', () => {
  for (const tipo of ['kpi', 'timeseries', 'ranking', 'funnel', 'table']) {
    const entry = getWidget(tipo);
    assert.equal(entry, registry[tipo], `getWidget('${tipo}') e a mesma entrada do registry`);
    assert.equal(typeof entry.toHtml, 'function', `${tipo} tem toHtml`);
  }
});

test('getWidget: retorna undefined para widget desconhecido', () => {
  assert.equal(getWidget('inexistente'), undefined);
  assert.equal(getWidget(undefined), undefined);
});

// ---------- registry: agregacao deriva da MetricDef (fix 2) ----------
// Helpers de ctx reutilizados pelos testes do registry.
function findMetricDef(template, key) {
  const list = Array.isArray(template.metrics) ? template.metrics : [];
  return list.find((m) => m.key === key);
}
const card = (_title, inner) => `<div class="card">${inner}</div>`;

// Dataset com 2 linhas no mesmo canal e mesma data, valor 10 e 30.
// sum = 40; avg = 20. Isso distingue observavelmente qual agregacao foi usada.
const rows = [
  { Canal: 'Meta', Nota: '10', Data: '01/01/2026' },
  { Canal: 'Meta', Nota: '30', Data: '01/01/2026' },
];
const colMap = { canal: 'Canal', nota: 'Nota', data: 'Data' };
const dataset = { rows, columns: ['Canal', 'Nota', 'Data'] };

test('ranking: deriva agg avg da MetricDef quando presente', () => {
  const template = {
    metrics: [{ key: 'nota', label: 'Nota', agg: 'avg', column: 'nota', format: 'number' }],
  };
  const item = { widget: 'ranking', props: { dimensionSlot: 'canal', valueSlot: 'nota' } };
  const html = registry.ranking.toHtml(item, { template, dataset, colMap, findMetricDef, card });
  // avg(10,30) = 20; sum daria 40. Confirma que usou avg.
  assert.ok(html.includes('20'), 'usa avg da MetricDef');
  assert.ok(!html.includes('40'), 'nao caiu no sum literal');
});

test('ranking: fallback sum quando MetricDef nao tem agg', () => {
  // Sem MetricDef casando com o valueSlot -> fallback seguro pra sum.
  const template = { metrics: [] };
  const item = { widget: 'ranking', props: { dimensionSlot: 'canal', valueSlot: 'nota' } };
  const html = registry.ranking.toHtml(item, { template, dataset, colMap, findMetricDef, card });
  assert.ok(html.includes('40'), 'fallback sum soma 10+30=40');
});

test('timeseries: deriva agg avg da MetricDef quando presente', () => {
  const template = {
    metrics: [{ key: 'nota', label: 'Nota', agg: 'avg', column: 'nota', format: 'number' }],
  };
  const item = { widget: 'timeseries', props: { dateSlot: 'data', valueSlot: 'nota' } };
  const html = registry.timeseries.toHtml(item, { template, dataset, colMap, findMetricDef, card });
  // Ponto unico com avg(10,30)=20 vira o tick central do eixo Y. Sum daria 40.
  // Checa o texto exato do ytick pra evitar falso-positivo com "240" do viewBox.
  assert.ok(/chart__ytick[^>]*>20</.test(html), 'timeseries usa avg da MetricDef (tick 20)');
  assert.ok(!/chart__ytick[^>]*>40</.test(html), 'nao usou sum (sem tick 40)');
});

test('timeseries: fallback sum quando MetricDef nao tem agg', () => {
  const template = { metrics: [] };
  const item = { widget: 'timeseries', props: { dateSlot: 'data', valueSlot: 'nota' } };
  const html = registry.timeseries.toHtml(item, { template, dataset, colMap, findMetricDef, card });
  // avg(10,30)=20 nao aparece; sum=40 vira o tick central.
  assert.ok(/chart__ytick[^>]*>40</.test(html), 'timeseries fallback sum soma 10+30=40');
});

// ---------- HARDENING fix 1: contrato explicito do bucketAggFor ----------
// Slot e metric-key sao namespaces diferentes. So herdamos o agg quando a
// MetricDef e, sem ambiguidade, a metrica-BASE do proprio slot (key == slot E
// column == slot). Uma metrica que apenas COLIDE de nome com o slot (mas agrega
// outra coluna) NAO pode emprestar seu agg: cairia no bug silencioso avg<->sum.

test('ranking: NAO herda agg de metrica que so colide de nome (column != slot)', () => {
  // Metrica 'nota' existe, agg avg, mas descreve OUTRA coluna ('outra'), nao o
  // slot 'nota'. O contrato manda ignorar esse agg e cair no fallback sum.
  const template = {
    metrics: [{ key: 'nota', label: 'Nota', agg: 'avg', column: 'outra', format: 'number' }],
  };
  const item = { widget: 'ranking', props: { dimensionSlot: 'canal', valueSlot: 'nota' } };
  const html = registry.ranking.toHtml(item, { template, dataset, colMap, findMetricDef, card });
  assert.ok(html.includes('40'), 'colisao de namespace cai no fallback sum (10+30=40)');
  assert.ok(!html.includes('>20<'), 'nao pegou avg da metrica que so colide de nome');
});

test('ranking: herda agg quando a MetricDef e a base do slot (key==slot E column==slot)', () => {
  // Casamento estrito: key 'nota' e column 'nota' == o slot. Ai sim herda o avg.
  const template = {
    metrics: [{ key: 'nota', label: 'Nota', agg: 'avg', column: 'nota', format: 'number' }],
  };
  const item = { widget: 'ranking', props: { dimensionSlot: 'canal', valueSlot: 'nota' } };
  const html = registry.ranking.toHtml(item, { template, dataset, colMap, findMetricDef, card });
  assert.ok(html.includes('20'), 'metrica-base do slot empresta o avg (20)');
  assert.ok(!html.includes('40'), 'nao caiu no sum');
});

test('timeseries: colisao de namespace tambem cai no fallback sum', () => {
  const template = {
    metrics: [{ key: 'nota', label: 'Nota', agg: 'avg', column: 'outra', format: 'number' }],
  };
  const item = { widget: 'timeseries', props: { dateSlot: 'data', valueSlot: 'nota' } };
  const html = registry.timeseries.toHtml(item, { template, dataset, colMap, findMetricDef, card });
  assert.ok(/chart__ytick[^>]*>40</.test(html), 'fallback sum (tick 40), nao o avg da metrica homonima');
});

// Trava o comportamento dos 3 dominios reais: o valueSlot dos widgets
// ranking/timeseries agrega por 'sum' em todos (investimento/valor/atendimentos
// sao colunas de VOLUME). Garante que o fix 1 nao mudou nada observavel neles.
test('dominios reais: ranking/timeseries seguem agregando por sum', async () => {
  const mods = await Promise.all([
    import('../public/assets/js/templates/marketing.js'),
    import('../public/assets/js/templates/vendas.js'),
    import('../public/assets/js/templates/suporte.js'),
  ]);
  // Dataset: 2 linhas mesmo canal/data, valores 10 e 30 -> sum 40, avg 20.
  const rowsVol = [
    { C: '10', D: '01/01/2026', G: 'X' },
    { C: '30', D: '01/01/2026', G: 'X' },
  ];
  const ds = { rows: rowsVol, columns: ['C', 'D', 'G'] };
  for (const { template } of mods) {
    for (const item of template.layout) {
      if (item.widget !== 'ranking' && item.widget !== 'timeseries') continue;
      const cm = {};
      cm[item.props.valueSlot] = 'C';
      if (item.props.dateSlot) cm[item.props.dateSlot] = 'D';
      if (item.props.dimensionSlot) cm[item.props.dimensionSlot] = 'G';
      const html = registry[item.widget].toHtml(item, { template, dataset: ds, colMap: cm, findMetricDef, card });
      if (item.widget === 'ranking') {
        assert.ok(html.includes('40'), `${template.id}/${item.props.valueSlot}: ranking soma (sum=40)`);
      } else {
        assert.ok(/chart__ytick[^>]*>40</.test(html), `${template.id}/${item.props.valueSlot}: timeseries soma (sum=40)`);
      }
    }
  }
});
