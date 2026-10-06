// config.labels: a pessoa troca o nome que aparece no painel ("Conversões" vira "Alunas novas").
// Mapa opcional chave de campo ou de número -> rótulo. Aplicado por lib/rotulos.js sobre uma
// CÓPIA do template, e o painel inteiro lê o rótulo dali: faixa de indicadores, tabela resumida,
// funil, tabela de dados e calculadora. Sem config.labels, nada muda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseCSV } from '../functions/lib/csv.mjs';
import {
  LIMITE_DO_ROTULO, rotuloValido, limparRotulos, aplicarRotulos, rotulosParaSalvar,
} from '../public/assets/js/lib/rotulos.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';
import { template as estoque } from '../public/assets/js/templates/estoque.js';
import { template as vendas } from '../public/assets/js/templates/vendas.js';
import { computeAllMapped } from '../public/assets/js/lib/metrics.js';
import { resumir } from '../public/assets/js/lib/resumo.js';
import { apresentacaoDasColunas } from '../public/assets/js/lib/colunas.js';
import { aplicarPersonalizacao } from '../public/assets/js/lib/personalizacao.js';
import { renderKpiBlock, templateDoPainel } from '../public/assets/js/dashboard.js';
import { registry } from '../public/assets/js/widgets/index.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const fixture = parseCSV(readFileSync(join(aqui, 'fixtures', 'marketing-30-dias.csv'), 'utf8'));
const COLMAP = {
  data: 'Data', canal: 'Canal', investimento: 'Investimento', impressoes: 'Impressoes',
  cliques: 'Cliques', leads: 'Leads', conversoes: 'Conversoes', receita: 'Receita',
};
const TROCA = { conversoes: 'Alunas novas' };

const aba = (tpl, id) => tpl.tabs.find((t) => t.id === id).layout;
const ctxDe = (tpl) => {
  const { computed, mapped } = computeAllMapped(tpl.metrics, fixture.rows, COLMAP);
  return {
    template: tpl, dataset: fixture, colMap: COLMAP, computed, mapped, estado: { meta: {} },
    findMetricDef: (t, k) => t.metrics.find((m) => m.key === k),
    card: (titulo, html) => `<h3>${titulo || ''}</h3>${html}`,
  };
};

// ---------- sem labels, nada muda ----------

test('aplicarRotulos: sem labels devolve o MESMO template (nada muda)', () => {
  assert.equal(aplicarRotulos(marketing, undefined), marketing);
  assert.equal(aplicarRotulos(marketing, null), marketing);
  assert.equal(aplicarRotulos(marketing, {}), marketing);
  assert.equal(aplicarRotulos(marketing, []), marketing);
  assert.equal(aplicarRotulos(marketing, 'texto'), marketing);
  assert.equal(aplicarRotulos(null, TROCA), null);
});

test('aplicarRotulos: rótulo inválido ou chave que não existe no modelo são ignorados', () => {
  assert.equal(aplicarRotulos(marketing, { conversoes: '<b>x</b>' }), marketing);
  assert.equal(aplicarRotulos(marketing, { conversoes: '   ' }), marketing);
  assert.equal(aplicarRotulos(marketing, { conversoes: 'a'.repeat(LIMITE_DO_ROTULO + 1) }), marketing);
  assert.equal(aplicarRotulos(marketing, { conversoes: 42 }), marketing);
  assert.equal(aplicarRotulos(marketing, { nao_existe: 'Qualquer' }), marketing);
});

test('aplicarRotulos: não muta o template do domínio', () => {
  const antes = JSON.stringify(marketing, (k, v) => (typeof v === 'function' ? 'fn' : v));
  aplicarRotulos(marketing, TROCA);
  assert.equal(JSON.stringify(marketing, (k, v) => (typeof v === 'function' ? 'fn' : v)), antes);
});

// ---------- onde o nome novo aparece ----------

test('nome novo no campo e no número de mesma chave', () => {
  const tpl = aplicarRotulos(marketing, TROCA);
  assert.equal(tpl.slots.find((s) => s.key === 'conversoes').label, 'Alunas novas');
  assert.equal(tpl.metrics.find((m) => m.key === 'conversoes').label, 'Alunas novas');
  assert.equal(tpl.metrics.find((m) => m.key === 'leads').label, 'Leads', 'o resto fica como estava');
  assert.deepEqual(tpl.rotulosTrocados, { conversoes: 'Alunas novas' });
});

test('faixa de indicadores mostra o nome novo', () => {
  const tpl = aplicarRotulos(marketing, TROCA);
  const { computed, mapped } = computeAllMapped(tpl.metrics, fixture.rows, COLMAP);
  const kpis = aba(tpl, 'visao-geral').filter((i) => i.widget === 'kpi');
  const html = renderKpiBlock(kpis, tpl, computed, mapped);
  assert.ok(html.includes('>Alunas novas<'));
  assert.ok(!html.includes('>Conversões<'));
});

test('tabela resumida mostra o nome novo no cabeçalho da coluna', () => {
  const tpl = aplicarRotulos(marketing, TROCA);
  const item = aba(tpl, 'visao-geral').find((i) => i.widget === 'resumo');
  const dados = resumir({ rows: fixture.rows, colMap: COLMAP, template: tpl, groupBy: item.props.groupBy, metrics: item.props.metrics });
  assert.ok(dados.ok);
  assert.ok(dados.colunas.some((c) => c.label === 'Alunas novas'));
  assert.ok(!dados.colunas.some((c) => c.label === 'Conversões'));
});

test('funil mostra o nome novo na etapa (nas abas e no layout sem abas)', () => {
  const tpl = aplicarRotulos(marketing, TROCA);
  const etapas = (layout) => layout.find((i) => i.widget === 'funnel').props.steps.map((s) => s.label);
  assert.deepEqual(etapas(aba(tpl, 'funil')), ['Impressões', 'Cliques', 'Leads', 'Alunas novas']);
  assert.deepEqual(etapas(tpl.layout), ['Impressões', 'Cliques', 'Leads', 'Alunas novas']);
  const html = registry.funnel.toHtml(aba(tpl, 'funil').find((i) => i.widget === 'funnel'), ctxDe(tpl));
  assert.ok(html.includes('Alunas novas'));
});

test('tabela de dados mostra o nome novo no cabeçalho da coluna mapeada', () => {
  const tpl = aplicarRotulos(marketing, TROCA);
  const meta = apresentacaoDasColunas(tpl, COLMAP, fixture.columns);
  assert.equal(meta.Conversoes.label, 'Alunas novas');
  const html = registry.table.toHtml({ widget: 'table', props: {} }, ctxDe(tpl));
  assert.match(html, /<th[^>]*>Alunas novas<\/th>/);
});

test('calculadora de meta usa o nome novo no campo e na frase das médias', () => {
  const tpl = aplicarRotulos(marketing, TROCA);
  const item = aba(tpl, 'visao-geral').find((i) => i.widget === 'meta');
  assert.equal(item.props.label, 'Meta de Alunas novas no período');
  const html = registry.meta.toHtml(item, ctxDe(tpl));
  assert.ok(html.includes('Meta de Alunas novas no período'));
  assert.ok(html.includes('para cada 1 de Alunas novas'), 'frase das médias em forma neutra');
  assert.ok(!/por conversão/.test(html), 'a unidade antiga não sobra na frase');
});

test('calculadora de meta sem troca de nome continua igual', () => {
  const item = aba(marketing, 'visao-geral').find((i) => i.widget === 'meta');
  const html = registry.meta.toHtml(item, ctxDe(marketing));
  assert.ok(html.includes('Meta de conversões no período'));
  assert.ok(html.includes('por conversão'));
});

test('título de bloco que cita o nome antigo acompanha a troca', () => {
  const tpl = aplicarRotulos(marketing, TROCA);
  const titulos = tpl.tabs.flatMap((t) => t.layout).map((i) => i.props && i.props.title).filter(Boolean);
  assert.ok(titulos.includes('Alunas novas por canal'));
  assert.ok(titulos.includes('Alunas novas por dia'));
  assert.ok(!titulos.some((t) => /Conversões/.test(t)));
  assert.ok(titulos.includes('Investimento por canal'), 'bloco que não usa o dado trocado não muda');
});

test('campo de agrupamento trocado aparece no filtro e na tabela resumida', () => {
  const tpl = aplicarRotulos(marketing, { canal: 'Origem' });
  assert.equal(tpl.slots.find((s) => s.key === 'canal').label, 'Origem');
  const item = aba(tpl, 'canais').find((i) => i.widget === 'resumo');
  const dados = resumir({ rows: fixture.rows, colMap: COLMAP, template: tpl, groupBy: item.props.groupBy, metrics: item.props.metrics });
  assert.equal(dados.dimLabel, 'Origem');
});

// ---------- número que soma a coluna herda o nome do campo ----------

test('número que soma a coluna herda o nome trocado do campo', () => {
  const tpl = aplicarRotulos(estoque, { quantidade: 'Peças' });
  assert.equal(tpl.slots.find((s) => s.key === 'quantidade').label, 'Peças');
  assert.equal(tpl.metrics.find((m) => m.key === 'itens_vendidos').label, 'Peças');
});

test('chave do próprio número vence o nome herdado do campo', () => {
  const tpl = aplicarRotulos(estoque, { quantidade: 'Peças', itens_vendidos: 'Peças vendidas' });
  assert.equal(tpl.slots.find((s) => s.key === 'quantidade').label, 'Peças');
  assert.equal(tpl.metrics.find((m) => m.key === 'itens_vendidos').label, 'Peças vendidas');
});

test('número que só CONTA linhas da coluna não herda o nome do campo', () => {
  const tpl = aplicarRotulos(vendas, { valor: 'Preço' });
  assert.equal(tpl.slots.find((s) => s.key === 'valor').label, 'Preço');
  assert.equal(tpl.metrics.find((m) => m.key === 'num_vendas').label, 'Negócios');
});

// ---------- convive com a personalização e escapa sempre ----------

test('templateDoPainel: aplica personalização e nomes trocados juntos', () => {
  const tpl = templateDoPainel({ domain: 'marketing', heroMetric: 'conversoes', labels: TROCA });
  assert.equal(tpl.primaryMetric, 'conversoes');
  assert.equal(tpl.metrics.find((m) => m.key === 'conversoes').label, 'Alunas novas');
  assert.equal(templateDoPainel({ domain: 'marketing' }), marketing, 'config simples devolve o template intacto');
  assert.equal(templateDoPainel({ domain: 'nao-existe' }), undefined);
});

test('ordem não importa: personalizar e depois nomear dá o mesmo que nomear e depois personalizar', () => {
  const config = { heroMetric: 'CPA', hiddenMetrics: ['CTR'] };
  const a = aplicarRotulos(aplicarPersonalizacao(marketing, config), TROCA);
  const b = aplicarPersonalizacao(aplicarRotulos(marketing, TROCA), config);
  const nomes = (t) => t.metrics.map((m) => m.label);
  assert.deepEqual(nomes(a), nomes(b));
  assert.equal(a.primaryMetric, 'CPA');
});

test('nome com aspas e e-comercial sai escapado no HTML', () => {
  const tpl = aplicarRotulos(marketing, { conversoes: 'Alunas "novas" & antigas' });
  const { computed, mapped } = computeAllMapped(tpl.metrics, fixture.rows, COLMAP);
  const html = renderKpiBlock(aba(tpl, 'visao-geral').filter((i) => i.widget === 'kpi'), tpl, computed, mapped);
  assert.ok(html.includes('Alunas &quot;novas&quot; &amp; antigas'));
  assert.ok(!html.includes('Alunas "novas" & antigas'));
});

// ---------- validação no cliente ----------

test('rotuloValido: texto curto, sem sinal de tag e sem caractere de controle', () => {
  assert.equal(rotuloValido('Alunas novas'), true);
  assert.equal(rotuloValido('a'.repeat(LIMITE_DO_ROTULO)), true);
  assert.equal(rotuloValido('a'.repeat(LIMITE_DO_ROTULO + 1)), false);
  assert.equal(rotuloValido(''), false);
  assert.equal(rotuloValido('   '), false);
  assert.equal(rotuloValido('<i>x'), false);
  assert.equal(rotuloValido('x > y'), false);
  assert.equal(rotuloValido('linha\nquebrada'), false);
  assert.equal(rotuloValido(12), false);
  assert.equal(rotuloValido(null), false);
});

test('limparRotulos: fica só o que é válido, com o texto aparado', () => {
  assert.deepEqual(
    limparRotulos({ conversoes: '  Alunas novas ', leads: '', receita: '<x>', 'chave ruim': 'Ok', cliques: 7 }),
    { conversoes: 'Alunas novas' },
  );
  assert.deepEqual(limparRotulos(null), {});
  assert.deepEqual(limparRotulos(['a']), {});
});

test('rotulosParaSalvar: só entra nome que difere do padrão do modelo', () => {
  assert.deepEqual(
    rotulosParaSalvar(marketing, { conversoes: 'Conversões', leads: ' Cadastros ', receita: '', canal: '<b>' }),
    { leads: 'Cadastros' },
  );
  assert.deepEqual(rotulosParaSalvar(marketing, {}), {});
  assert.deepEqual(rotulosParaSalvar(marketing, null), {});
});
