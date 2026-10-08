// D8 (teste de ponta a ponta, 02/10/2026): "Números que não aparecem" não listava Impressões nem Cliques
// (só os que estão em cartão da faixa) e ficava escondido em "Mais opções". Regra: todo número que o painel
// mostra (cartão, funil ou tabela por canal, semana, dados) pode ser escondido, e a opção está à vista no passo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metricasDoPainel, aplicarPersonalizacao, numerosExibidos } from '../public/assets/js/lib/personalizacao.js';
import { getTemplate } from '../public/assets/js/templates/index.js';
import { fonteDoAssistente } from './apoio/fonte-do-assistente.js';

const DOMINIOS = ['marketing', 'vendas', 'suporte', 'financeiro', 'estoque'];

// Independente do código de produção: caminha pelo layout e anota toda chave de métrica que algum widget mostra.
function exibidosPeloLayout(template) {
  const out = new Set();
  const visitar = (item) => {
    if (!item || typeof item !== 'object') return;
    const p = item.props || {};
    if (item.widget === 'kpi' && p.metricKey) out.add(p.metricKey);
    if (item.widget === 'funnel') (p.steps || []).forEach((s) => s && s.metricKey && out.add(s.metricKey));
    if (item.widget === 'resumo') (p.metrics || []).forEach((m) => out.add(typeof m === 'string' ? m : m && m.key));
  };
  (template.layout || []).forEach(visitar);
  (template.tabs || []).forEach((t) => (t.layout || []).forEach(visitar));
  return out;
}

function aparece(template, chave) {
  const achados = [];
  const olhar = (item) => {
    const p = (item && item.props) || {};
    if (item.widget === 'kpi' && p.metricKey === chave) achados.push('kpi');
    if (item.widget === 'funnel' && (p.steps || []).some((s) => s && s.metricKey === chave)) achados.push('funil');
    if (item.widget === 'resumo' && (p.metrics || []).some((m) => (typeof m === 'string' ? m : m && m.key) === chave)) achados.push('tabela');
  };
  (template.layout || []).forEach(olhar);
  (template.tabs || []).forEach((t) => (t.layout || []).forEach(olhar));
  return achados;
}

for (const dominio of DOMINIOS) {
  test(`${dominio}: todo número exibido aparece na lista dos que podem ser escondidos`, () => {
    const tpl = getTemplate(dominio);
    const exibidos = exibidosPeloLayout(tpl);
    const escondiveis = new Set(metricasDoPainel(tpl).filter((m) => m.exibido).map((m) => m.key));
    for (const k of exibidos) assert.ok(escondiveis.has(k), `${dominio}: "${k}" aparece no painel e não pode ser escondido`);
    assert.deepEqual([...numerosExibidos(tpl)].sort(), [...exibidos].sort());
  });

  test(`${dominio}: esconder qualquer número exibido faz ele sumir de todo o painel (menos o herói)`, () => {
    const tpl = getTemplate(dominio);
    const heroi = tpl.primaryMetric;
    for (const k of exibidosPeloLayout(tpl)) {
      if (k === heroi) continue;
      const t = aplicarPersonalizacao(tpl, { hiddenMetrics: [k] });
      assert.deepEqual(aparece(t, k), [], `${dominio}: "${k}" continuou aparecendo depois de escondido`);
    }
  });
}

test('marketing: Impressões e Cliques estão entre os que se escondem (o caso do teste)', () => {
  const lista = metricasDoPainel(getTemplate('marketing')).filter((m) => m.exibido).map((m) => m.key);
  assert.ok(lista.includes('impressoes') && lista.includes('cliques'));
});

test('o passo de aparência mostra "Números que não aparecem" à vista, fora de "Mais opções", e lista todos os exibidos', () => {
  const src = fonteDoAssistente();
  const mais = src.slice(src.indexOf("const mais = el('details'"), src.indexOf('if (state.accent2 ||'));
  assert.ok(mais.length > 50, 'achou o bloco "Mais opções"');
  assert.ok(!mais.includes('ocultos__grupo'), 'a lista de números escondíveis saiu de "Mais opções"');
  assert.ok(src.includes('ocultos__grupo'), 'a lista continua existindo no passo');
  assert.ok(src.includes('x.exibido'), 'a lista usa todos os números exibidos, não só os da faixa');
});
