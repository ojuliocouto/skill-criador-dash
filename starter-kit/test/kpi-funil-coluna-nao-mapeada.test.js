// Achado 1 (auditoria pre-aula): KPI e funil publicavam ZERO para um slot SEM
// coluna mapeada, um numero com cara de certo. Reproduzido com um export da
// Meta sem a coluna de Leads: o CPL saia "R$ 0,00" (deveria ser INDEFINIDO, nao
// zero) e o funil marcava a etapa seguinte (Conversoes) como "0,00%" porque
// comparava contra a etapa "Leads" zerada por falta de coluna.
//
// REGRA DE OURO destes testes: chamam o CAMINHO REAL (renderKpiBlock exportado
// de dashboard.js, registry.funnel.toHtml do widgets/index.js), nunca uma
// reimplementacao da logica de "esta mapeado ou nao".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseCSV } from '../functions/lib/csv.mjs';
import { computeAllMapped } from '../public/assets/js/lib/metrics.js';
import { renderKpiBlock, planLayout } from '../public/assets/js/dashboard.js';
import { registry } from '../public/assets/js/widgets/index.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';
import { template as suporte } from '../public/assets/js/templates/suporte.js';
import { template as vendas } from '../public/assets/js/templates/vendas.js';

const EXAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples');
function loadExample(name) {
  return parseCSV(readFileSync(join(EXAMPLES_DIR, name), 'utf8')).rows;
}
function findMetricDef(template, key) {
  return (template.metrics || []).find((m) => m.key === key);
}
const card = (title, inner) => `<div class="card" data-title="${title}">${inner}</div>`;

function kpiBlockItems(template) {
  return planLayout(template.layout).find((b) => b.type === 'kpis').items;
}
function funnelItem(template) {
  return template.layout.find((i) => i.widget === 'funnel');
}

// ---------- KPI: Marketing sem a coluna de Leads mapeada ----------

const rowsMkt = loadExample('marketing-exemplo.csv');
const COL_MKT_SEM_LEADS = {
  data: 'Data', canal: 'Canal', investimento: 'Investimento', impressoes: 'Impressões',
  cliques: 'Cliques', conversoes: 'Conversões', receita: 'Receita',
  // leads: DE PROPOSITO ausente (simula export da Meta sem a coluna de leads)
};
const COL_MKT_COMPLETO = { ...COL_MKT_SEM_LEADS, leads: 'Leads' };

test('KPI: sem coluna de Leads mapeada, o card de Leads e o de CPL mostram traco, NUNCA "R$ 0,00"', () => {
  const { computed, mapped } = computeAllMapped(marketing.metrics, rowsMkt, COL_MKT_SEM_LEADS);
  const html = renderKpiBlock(kpiBlockItems(marketing), marketing, computed, mapped, {}, null);

  assert.ok(!html.includes('R$ 0,00'), 'CPL nao pode aparecer como R$ 0,00 (zero com cara de certo)');
  assert.equal((html.match(/class="kpi is-unmapped"/g) || []).length, 2, 'exatamente 2 cards ficam sem-dado: Leads e CPL');

  // Card de Leads: traco + hint explicando o motivo. slice com Math.max(0, ...)
  // porque indexOf pode devolver algo menor que 200 no inicio do HTML (um
  // start negativo em String.slice conta a partir do FIM da string, nao zero).
  const idxLeads = html.indexOf('>Leads<');
  const leadsCard = html.slice(Math.max(0, idxLeads - 200), idxLeads + 300);
  assert.match(leadsCard, /kpi__value">-</, 'Leads mostra traco, nao 0');
  assert.match(leadsCard, /Coluna não mapeada/, 'Leads explica que a coluna nao esta mapeada');

  // Card de CPL: idem.
  const idxCpl = html.indexOf('>CPL<');
  const cplCard = html.slice(Math.max(0, idxCpl - 200), idxCpl + 300);
  assert.match(cplCard, /kpi__value">-</, 'CPL mostra traco, nao 0');
  assert.match(cplCard, /Coluna não mapeada/, 'CPL explica que a coluna nao esta mapeada');
});

test('KPI: metricas que NAO dependem de Leads continuam mostrando o valor real (nao viram traco a toa)', () => {
  const { computed, mapped } = computeAllMapped(marketing.metrics, rowsMkt, COL_MKT_SEM_LEADS);
  const html = renderKpiBlock(kpiBlockItems(marketing), marketing, computed, mapped, {}, null);
  assert.match(html, /Investimento[\s\S]*?R\$ 13\.990,50/, 'Investimento (nao depende de leads) mostra valor real');
  assert.match(html, /CTR[\s\S]*?2,75%/, 'CTR (cliques\/impressoes) mostra valor real');
});

test('KPI: controle (Leads mapeado) nao regride, CPL mostra o numero de verdade', () => {
  const { computed, mapped } = computeAllMapped(marketing.metrics, rowsMkt, COL_MKT_COMPLETO);
  const html = renderKpiBlock(kpiBlockItems(marketing), marketing, computed, mapped, {}, null);
  assert.ok(!html.includes('is-unmapped'), 'com tudo mapeado, nenhum card fica sem-dado');
  assert.ok(!html.includes('kpi__value">-<'), 'nenhum card mostra traco');
  // leads = soma real (ver dados-exemplo), CPL = investimento/leads real.
  const leadsTotal = rowsMkt.reduce((a, r) => a + Number(String(r.Leads).replace(/\./g, '').replace(',', '.')), 0);
  assert.ok(leadsTotal > 0);
  assert.ok(!html.includes('R$ 0,00'), 'CPL mapeado nao e zero (investimento e leads sao > 0 no exemplo)');
});

// ---------- Funil: Marketing sem a coluna de Leads mapeada ----------

test('funil: etapa "Leads" sem coluna mapeada e DESCARTADA, nao vira barra 0%', () => {
  const { computed } = computeAllMapped(marketing.metrics, rowsMkt, COL_MKT_SEM_LEADS);
  const html = registry.funnel.toHtml(funnelItem(marketing), {
    template: marketing, dataset: { rows: rowsMkt, columns: [] }, colMap: COL_MKT_SEM_LEADS, computed, findMetricDef, card,
  });
  assert.ok(!html.includes('>Leads<'), 'a etapa Leads (sem coluna) nao aparece mais no funil');
  assert.ok(html.includes('>Conversões<'), 'a etapa Conversoes continua aparecendo');
});

test('funil: a etapa seguinte a uma coluna nao mapeada compara com a etapa anterior de VERDADE, nao com o zero falso', () => {
  const { computed } = computeAllMapped(marketing.metrics, rowsMkt, COL_MKT_SEM_LEADS);
  const html = registry.funnel.toHtml(funnelItem(marketing), {
    template: marketing, dataset: { rows: rowsMkt, columns: [] }, colMap: COL_MKT_SEM_LEADS, computed, findMetricDef, card,
  });
  // cliques=13675, conversoes=147 no CSV de exemplo -> conversao real = 1,07%
  // (147/13675), nunca 0,00% (que e o que dava quando comparava contra Leads=0).
  assert.ok(!html.includes('0,00%'), 'sem o bug, nao sobra nenhuma conversao fantasma de 0,00%');
  assert.match(html, /funnel__conv">1,07%/, 'Conversoes mostra a conversao real contra Cliques (1,07%), nao 0,00%');
});

// ---------- Controle obrigatorio: Suporte com TUDO mapeado nao pode regredir ----------

const rowsSup = loadExample('suporte-exemplo.csv');
const COL_SUPORTE = {
  data: 'Data', canal: 'Canal', atendimentos: 'Atendimentos', resolvidos: 'Resolvidos',
  tempo_resposta: 'Tempo de resposta', csat: 'CSAT',
};

test('CONTROLE: Suporte com tudo mapeado mantem as 2 etapas do funil e a mesma conversao de antes do fix', () => {
  const { computed } = computeAllMapped(suporte.metrics, rowsSup, COL_SUPORTE);
  const html = registry.funnel.toHtml(funnelItem(suporte), {
    template: suporte, dataset: { rows: rowsSup, columns: [] }, colMap: COL_SUPORTE, computed, findMetricDef, card,
  });
  assert.ok(html.includes('>Atendimentos<') && html.includes('>Resolvidos<'), 'as 2 etapas mapeadas continuam aparecendo');
  // 1343 resolvidos / 1480 atendimentos = 90,74% (numero de verdade do exemplo
  // atual: NAO e o "89,36%" citado de memoria no briefing da tarefa; recalculado
  // aqui direto do examples/suporte-exemplo.csv, ver relato do agente).
  assert.match(html, /funnel__conv">90,74%/, 'a conversao real do exemplo de Suporte e 90,74%, sem mudanca com o fix');
});

test('CONTROLE: coluna mapeada cuja soma da ZERO DE VERDADE continua aparecendo (nao e confundida com "nao mapeada")', () => {
  // Suporte com Resolvidos MAPEADO mas linhas todas com resolvidos vazio: soma
  // real e 0, e a etapa deve continuar existindo (e ser aparada do TOPO se for
  // a primeira, ou aparecer com barra 0% se vier depois de uma etapa com dado).
  const rowsZerado = rowsSup.map((r) => ({ ...r, Resolvidos: '' }));
  const { computed } = computeAllMapped(suporte.metrics, rowsZerado, COL_SUPORTE);
  assert.equal(computed.resolvidos, 0, 'soma de verdade e 0 (coluna mapeada, celulas vazias)');
  const html = registry.funnel.toHtml(funnelItem(suporte), {
    template: suporte, dataset: { rows: rowsZerado, columns: [] }, colMap: COL_SUPORTE, computed, findMetricDef, card,
  });
  assert.ok(html.includes('>Resolvidos<'), 'Resolvidos MAPEADA continua no funil mesmo com soma zero de verdade');
  assert.match(html, /funnel__conv">0,00%/, 'zero de verdade mostra 0,00%, que aqui e a leitura correta (nao ha bug em esconder isso)');
});

// ---------- Suporte SEM a coluna de Resolvidos mapeada (novo cenario, mesma familia de bug) ----------

test('KPI e funil: Suporte sem "Resolvidos" mapeada tambem usa traco/descarte, nao 0', () => {
  const colSemResolvidos = { data: 'Data', canal: 'Canal', atendimentos: 'Atendimentos', tempo_resposta: 'Tempo de resposta', csat: 'CSAT' };
  const { computed, mapped } = computeAllMapped(suporte.metrics, rowsSup, colSemResolvidos);
  const kpiHtml = renderKpiBlock(kpiBlockItems(suporte), suporte, computed, mapped, {}, null);
  assert.equal((kpiHtml.match(/class="kpi is-unmapped"/g) || []).length, 2, 'Resolvidos e taxa_resolucao (dependem de resolvidos) ficam sem-dado');

  const html = registry.funnel.toHtml(funnelItem(suporte), {
    template: suporte, dataset: { rows: rowsSup, columns: [] }, colMap: colSemResolvidos, computed, findMetricDef, card,
  });
  assert.ok(!html.includes('>Resolvidos<'), 'etapa Resolvidos (sem coluna) descartada do funil');
  assert.ok(!html.includes('funnel__conv'), 'com uma etapa so restando, nao ha conversao pra calcular');
});

// ---------- Vendas: fallback deliberado de metrica 'derived' PRESERVADO ----------
// vendas_ganhas e 'derived' com fallback proprio (sem status mapeado, assume que
// TODAS as linhas sao ganhas). Isso e uma decisao de produto documentada em
// vendas.js, nao o bug desta auditoria: o fix NAO pode comecar a descartar essa
// etapa so porque 'status' nao esta mapeado.
test('funil de Vendas: etapa derived (vendas_ganhas) NAO e descartada quando falta a coluna de status (fallback preservado)', () => {
  const rowsVendas = loadExample('vendas-exemplo.csv');
  const colSemStatus = { data: 'Data', vendedor: 'Vendedor', produto: 'Produto', valor: 'Valor' };
  const { computed } = computeAllMapped(vendas.metrics, rowsVendas, colSemStatus);
  const html = registry.funnel.toHtml(funnelItem(vendas), {
    template: vendas, dataset: { rows: rowsVendas, columns: [] }, colMap: colSemStatus, computed, findMetricDef, card,
  });
  assert.ok(html.includes('>Ganhas<'), 'etapa Ganhas (derived) continua aparecendo mesmo sem status mapeado');
});
