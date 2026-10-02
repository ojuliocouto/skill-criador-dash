// LAYOUT DE FÁBRICA dos templates (T9, teste com aluno de 02/10/2026).
//
// Este é o ÚNICO lugar da suíte que confere o layout padrão de cada domínio: a ordem dos KPIs,
// o herói (primaryMetric) e a sequência de widgets. Os testes da biblioteca (test/*.test.js)
// usam fixtures próprias e não quebram quando o layout muda.
//
// Personalizar o painel de UMA pessoa (herói, métricas que não entram) NÃO passa por aqui:
// isso mora na config do dashboard (heroMetric, hiddenMetrics) e não toca código nenhum.
// Só mude este arquivo quando a decisão for mudar o padrão da biblioteca pra todo mundo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templates } from '../../public/assets/js/templates/index.js';

const FABRICA = {
  marketing: { heroi: 'leads', kpis: ['investimento', 'leads', 'CTR', 'CPL', 'CPA', 'ROAS'], widgets: ['timeseries', 'funnel', 'ranking', 'table'] },
  vendas: { heroi: 'faturamento', kpis: ['faturamento', 'num_vendas', 'vendas_ganhas', 'taxa_conversao', 'ticket_medio'], widgets: ['timeseries', 'funnel', 'ranking', 'ranking', 'table'] },
  suporte: { heroi: 'atendimentos', kpis: ['atendimentos', 'resolvidos', 'taxa_resolucao', 'tempo_resposta', 'csat'], widgets: ['timeseries', 'funnel', 'ranking', 'table'] },
  financeiro: { heroi: 'saldo', kpis: ['entradas', 'saidas', 'saldo', 'margem'], widgets: ['timeseries', 'ranking', 'ranking', 'table'] },
  estoque: { heroi: 'receita', kpis: ['receita', 'itens_vendidos', 'estoque_atual', 'skus', 'giro'], widgets: ['timeseries', 'ranking', 'ranking', 'ranking', 'table'] },
};

for (const [id, esperado] of Object.entries(FABRICA)) {
  test(`layout de fábrica (${id}): herói, faixa de KPI e widgets`, () => {
    const t = templates[id];
    assert.equal(t.primaryMetric, esperado.heroi, 'herói padrão');
    assert.deepEqual(t.layout.filter((i) => i.widget === 'kpi').map((i) => i.props.metricKey), esperado.kpis, 'faixa de KPI padrão');
    assert.deepEqual(t.layout.filter((i) => i.widget !== 'kpi').map((i) => i.widget), esperado.widgets, 'widgets padrão');
  });
}

test('layout de fábrica (marketing): funil com as 4 etapas', () => {
  const funil = templates.marketing.layout.find((i) => i.widget === 'funnel');
  assert.deepEqual(funil.props.steps.map((s) => s.metricKey), ['impressoes', 'cliques', 'leads', 'conversoes']);
});
