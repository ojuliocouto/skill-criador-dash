// T7 do teste com aluno (02/10/2026): as decisões do passo 2.5 (número herói e o que NÃO
// entra) não tinham onde entrar. O wizard só oferecia nome, cor, logo, meta e senha, e o aluno
// editou templates/marketing.js à mão, compartilhado por todo dashboard do domínio.
// Agora a config do dashboard carrega `heroMetric` e `hiddenMetrics` (opcionais), o wizard
// oferece os dois e o template usa a config quando ela existir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseCSV } from '../functions/lib/csv.mjs';
import { aplicarPersonalizacao, metricasDoPainel } from '../public/assets/js/lib/personalizacao.js';
import { renderKpiBlock, planLayout, sparkForHero, buildGoal } from '../public/assets/js/dashboard.js';
import { computeAllMapped } from '../public/assets/js/lib/metrics.js';
import { prefillStateFromConfig, montarPersonalizacao } from '../public/assets/js/config-wizard.js';
import { validarPersonalizacao } from '../functions/lib/personalizacao-shape.mjs';
import { onRequest as dashboards } from '../functions/api/dashboards.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';

const rows = parseCSV(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'marketing-exemplo.csv'), 'utf8')).rows;
const COLMAP = {
  data: 'Data', canal: 'Canal', investimento: 'Investimento', impressoes: 'Impressões',
  cliques: 'Cliques', leads: 'Leads', conversoes: 'Conversões', receita: 'Receita',
};
const kpis = (tpl) => planLayout(tpl.layout).filter((b) => b.type === 'kpis').flatMap((b) => b.items);
const kpiKeys = (tpl) => kpis(tpl).map((i) => i.props.metricKey);

// ---------- aplicarPersonalizacao: pura, não muta o template compartilhado ----------

test('personalização: herói CPA e CTR oculto mudam só ESTE dashboard', () => {
  const antes = JSON.stringify(marketing.layout);
  const tpl = aplicarPersonalizacao(marketing, { heroMetric: 'CPA', hiddenMetrics: ['CTR'] });
  assert.equal(tpl.primaryMetric, 'CPA');
  assert.ok(!kpiKeys(tpl).includes('CTR'), 'CTR não entra');
  assert.equal(kpiKeys(tpl)[0], 'CPA', 'o herói abre a faixa');
  assert.equal(JSON.stringify(marketing.layout), antes, 'o template do domínio continua intacto');
  assert.equal(marketing.primaryMetric, 'leads');
});

test('personalização: sem os campos, o template sai igual', () => {
  const tpl = aplicarPersonalizacao(marketing, { name: 'x' });
  assert.deepEqual(kpiKeys(tpl), kpiKeys(marketing));
  assert.equal(tpl.primaryMetric, marketing.primaryMetric);
});

test('personalização: herói desconhecido é ignorado e o herói nunca fica oculto', () => {
  assert.equal(aplicarPersonalizacao(marketing, { heroMetric: 'xyz' }).primaryMetric, 'leads');
  const tpl = aplicarPersonalizacao(marketing, { heroMetric: 'CPA', hiddenMetrics: ['CPA', 'CTR'] });
  assert.ok(kpiKeys(tpl).includes('CPA'), 'ocultar o herói não faz sentido: ele fica');
});

test('personalização: herói fora da faixa padrão entra na faixa', () => {
  const tpl = aplicarPersonalizacao(marketing, { heroMetric: 'receita' });
  assert.equal(kpiKeys(tpl)[0], 'receita');
});

test('personalização: métrica oculta sai também do funil', () => {
  const tpl = aplicarPersonalizacao(marketing, { hiddenMetrics: ['impressoes'] });
  const funil = tpl.layout.find((i) => i.widget === 'funnel');
  assert.ok(!funil.props.steps.some((s) => s.metricKey === 'impressoes'));
});

test('metricasDoPainel: lista as métricas do template com rótulo, pro wizard oferecer', () => {
  const lista = metricasDoPainel(marketing);
  assert.ok(lista.some((m) => m.key === 'CPA' && m.label === 'CPA'));
  assert.ok(lista.find((m) => m.key === 'CTR').naFaixa, 'CTR está na faixa padrão');
});

// ---------- herói derivado ganha sparkline (o card não fica com metade vazia) ----------

test('sparkForHero: herói CPA (ratio) vira série diária de CPA', () => {
  const tpl = aplicarPersonalizacao(marketing, { heroMetric: 'CPA' });
  const s = sparkForHero(tpl, rows, COLMAP);
  assert.ok(Array.isArray(s.CPA) && s.CPA.length >= 2, 'série com pelo menos 2 dias');
  assert.ok(s.CPA.every((v) => Number.isFinite(v) && v > 0), 'CPA por dia, sem zero falso');
});

test('sparkForHero: herói ROAS (derivada com dependsOn) vira série diária', () => {
  const tpl = aplicarPersonalizacao(marketing, { heroMetric: 'ROAS' });
  const s = sparkForHero(tpl, rows, COLMAP);
  assert.ok(Array.isArray(s.ROAS) && s.ROAS.length >= 2);
});

test('bloco de kpi: herói derivado com série desenha sparkline e ocupa 2 colunas', () => {
  const tpl = aplicarPersonalizacao(marketing, { heroMetric: 'CPA', hiddenMetrics: ['CTR'] });
  const { computed, mapped } = computeAllMapped(tpl.metrics, rows, COLMAP);
  const html = renderKpiBlock(kpis(tpl), tpl, computed, mapped, {}, null, sparkForHero(tpl, rows, COLMAP));
  assert.ok(html.includes('kpi__spark'), 'sparkline no herói');
  assert.match(html, new RegExp(`--kpi-cols:${kpis(tpl).length + 1}`));
});

test('bloco de kpi: herói SEM série não ocupa 2 colunas (nada de metade vazia)', () => {
  const tpl = aplicarPersonalizacao(marketing, { heroMetric: 'CPA' });
  const { computed, mapped } = computeAllMapped(tpl.metrics, rows, COLMAP);
  const html = renderKpiBlock(kpis(tpl), tpl, computed, mapped, {}, null, {});
  assert.match(html, new RegExp(`--kpi-cols:${kpis(tpl).length}"`), 'sem série, o herói ocupa 1 unidade');
  assert.ok(html.includes('kpi--hero'), 'continua sendo o herói (valor maior)');
});

// ---------- meta de métrica "menor é melhor" (o herói CPA puxa a meta pra ele) ----------

test('buildGoal: meta de CPA (menor é melhor) conta como batida quando o CPA fica abaixo', () => {
  const tpl = aplicarPersonalizacao(marketing, { heroMetric: 'CPA' });
  const g = buildGoal({ goal: { metricKey: 'CPA', value: 100 } }, { CPA: 95.17 }, {}, tpl);
  assert.ok(g.pct >= 1, `CPA 95,17 contra meta 100 está dentro da meta (pct=${g.pct})`);
});

// ---------- wizard ----------

test('wizard: montarPersonalizacao grava herói e ocultas só quando há escolha', () => {
  assert.deepEqual(montarPersonalizacao(marketing, 'CPA', ['CTR']), { heroMetric: 'CPA', hiddenMetrics: ['CTR'] });
  assert.deepEqual(montarPersonalizacao(marketing, 'leads', []), {}, 'padrão do domínio não grava nada');
  assert.deepEqual(montarPersonalizacao(marketing, 'xyz', ['nao-existe']), {}, 'chave inventada não entra');
});

test('wizard: reconfigurar traz herói e ocultas de volta', () => {
  const st = prefillStateFromConfig({}, { id: 'a', domain: 'marketing', heroMetric: 'CPA', hiddenMetrics: ['CTR'] });
  assert.equal(st.heroMetric, 'CPA');
  assert.deepEqual(st.hiddenMetrics, ['CTR']);
});

// ---------- servidor: forma validada no POST ----------

test('validarPersonalizacao: aceita ausente e forma certa, recusa lixo', () => {
  assert.equal(validarPersonalizacao({}), null);
  assert.equal(validarPersonalizacao({ heroMetric: 'CPA', hiddenMetrics: ['CTR'] }), null);
  assert.ok(validarPersonalizacao({ heroMetric: '<script>' }));
  assert.ok(validarPersonalizacao({ hiddenMetrics: 'CTR' }));
  assert.ok(validarPersonalizacao({ hiddenMetrics: Array(40).fill('x') }));
});

test('POST /api/dashboards: grava heroMetric e hiddenMetrics; recusa forma inválida com 400', async () => {
  const map = new Map();
  const kv = { async get(k) { return map.get(k) ?? null; }, async put(k, v) { map.set(k, v); }, async delete(k) { map.delete(k); }, async list() { return { keys: [] }; } };
  const env = { DASHBOARDS_KV: kv, ADMIN_TOKEN: 't' };
  const base = {
    name: 'Pilates', domain: 'marketing',
    source: { type: 'csv', data: 'Data,Investimento,Conversões\n01/07/2026,"10,00",1' },
    colMap: { data: 'Data', investimento: 'Investimento', conversoes: 'Conversões' },
  };
  const post = (body) => dashboards({ request: new Request('https://x/api/dashboards', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': 't' }, body: JSON.stringify(body),
  }), env });
  const ok = await post({ ...base, heroMetric: 'CPA', hiddenMetrics: ['CTR'] });
  assert.equal(ok.status, 200);
  const salvo = JSON.parse([...map.values()][0]);
  assert.equal(salvo.heroMetric, 'CPA');
  assert.deepEqual(salvo.hiddenMetrics, ['CTR']);
  const ruim = await post({ ...base, name: 'Outro', hiddenMetrics: 'CTR' });
  assert.equal(ruim.status, 400);
});
