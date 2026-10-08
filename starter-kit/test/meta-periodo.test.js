// D6 (teste de ponta a ponta, 02/10/2026): a meta valia para o período filtrado. Em "Tudo" (90 dias)
// uma meta de 400 contatos POR MÊS mostrava "288% da meta" e "Meta batida". A meta ganha período
// (goal.periodo): mensal (padrão do assistente), semanal, periodo ou total. Config antiga sem periodo
// segue como era. Estes testes são a conta, sem DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alvoDaMeta, PERIODOS_DA_META, PERIODO_PADRAO } from '../public/assets/js/lib/meta-periodo.js';
import { buildGoal } from '../public/assets/js/dashboard.js';
import { validarMeta, PERIODOS_ACEITOS } from '../functions/lib/meta-shape.mjs';

const j = (min, max) => ({ min, max });
const MES = { value: 400, periodo: 'mensal' };

test('mensal: 1 mês exato compara com a meta do mês inteira e pode bater', () => {
  const r = alvoDaMeta(MES, j('2026-08-01', '2026-08-31'));
  assert.equal(r.alvo, 400);
  assert.equal(r.justa, true);
  assert.match(r.rotulo, /da meta do mês/);
});

test('mensal: 3 meses exatos comparam com 3 vezes a meta', () => {
  const r = alvoDaMeta(MES, j('2026-07-01', '2026-09-30'));
  assert.equal(r.alvo, 1200);
  assert.equal(r.justa, true);
  assert.match(r.rotulo, /da meta de 3 meses/);
});

test('mensal: o caso do teste (90 dias, 01/07 a 28/09) não é mais 288% da meta de 400', () => {
  const r = alvoDaMeta(MES, j('2026-07-01', '2026-09-28'));
  assert.equal(r.alvo, 1200, 'três meses do calendário começados, cada um com a meta cheia');
  assert.match(r.rotulo, /3 meses/);
  const g = buildGoal({ goal: { metricKey: 'leads', ...MES } }, { leads: 1152 }, {}, null, j('2026-07-01', '2026-09-28'));
  assert.ok(Math.abs(g.pct - 0.96) < 1e-9, `esperado 96%, veio ${g.pct}`);
  assert.equal(g.justa, true);
  assert.match(g.text, /96,00.*da meta de 3 meses/);
});

test('mensal: mês incompleto (do dia 1 até o dia 28) compara com a meta do mês cheia', () => {
  const r = alvoDaMeta(MES, j('2026-09-01', '2026-09-28'));
  assert.equal(r.alvo, 400);
  assert.equal(r.justa, true);
  assert.match(r.rotulo, /da meta do mês/);
});

test('mensal: 7 dias no meio do mês é proporcional, escreve a conta e NÃO é comparação justa para o marco', () => {
  const r = alvoDaMeta(MES, j('2026-08-10', '2026-08-16'));
  assert.ok(Math.abs(r.alvo - 400 * 7 / 31) < 1e-9);
  assert.equal(r.justa, false);
  assert.match(r.rotulo, /proporcional/);
  assert.match(r.rotulo, /7 dias/);
});

test('mensal: período que cruza meses, sem começar no dia 1, é proporcional aos dias de cada mês', () => {
  const r = alvoDaMeta(MES, j('2026-07-20', '2026-08-10'));
  assert.ok(Math.abs(r.alvo - (400 * 12 / 31 + 400 * 10 / 31)) < 1e-9);
  assert.equal(r.justa, false);
  assert.match(r.rotulo, /22 dias/);
});

test('mensal: fevereiro de 28 dias conta pelos dias do próprio mês', () => {
  const r = alvoDaMeta(MES, j('2026-02-15', '2026-02-21'));
  assert.ok(Math.abs(r.alvo - 400 * 7 / 28) < 1e-9);
});

test('semanal: 7 dias é a meta da semana; 14 dias são 2 semanas; 10 dias é proporcional', () => {
  const S = { value: 100, periodo: 'semanal' };
  const a = alvoDaMeta(S, j('2026-08-10', '2026-08-16'));
  assert.deepEqual([a.alvo, a.justa], [100, true]);
  assert.match(a.rotulo, /da meta da semana/);
  const b = alvoDaMeta(S, j('2026-08-03', '2026-08-16'));
  assert.deepEqual([b.alvo, b.justa], [200, true]);
  assert.match(b.rotulo, /2 semanas/);
  const c = alvoDaMeta(S, j('2026-08-01', '2026-08-10'));
  assert.ok(Math.abs(c.alvo - 100 * 10 / 7) < 1e-9);
  assert.equal(c.justa, false);
  assert.match(c.rotulo, /proporcional/);
});

test('periodo e total comparam com a meta como ela é e dizem isso', () => {
  const p = alvoDaMeta({ value: 400, periodo: 'periodo' }, j('2026-07-01', '2026-09-28'));
  assert.deepEqual([p.alvo, p.justa], [400, true]);
  assert.match(p.rotulo, /da meta do período/);
  const t = alvoDaMeta({ value: 400, periodo: 'total' }, j('2026-07-01', '2026-09-28'));
  assert.deepEqual([t.alvo, t.justa], [400, true]);
  assert.match(t.rotulo, /da meta total/);
});

test('compatibilidade: config antiga sem periodo continua como era (período filtrado, "da meta")', () => {
  const r = alvoDaMeta({ value: 400 }, j('2026-07-01', '2026-09-28'));
  assert.deepEqual([r.alvo, r.justa, r.rotulo], [400, true, 'da meta']);
  const g = buildGoal({ goal: { metricKey: 'leads', value: 400 } }, { leads: 1152 });
  assert.equal(g.text, '288,00% da meta');
  assert.ok(Math.abs(g.pct - 2.88) < 1e-9);
  assert.equal(g.justa, true);
});

test('mensal sem datas no período não inventa conta: avisa e não libera o marco', () => {
  const r = alvoDaMeta(MES, null);
  assert.equal(r.alvo, 400);
  assert.equal(r.justa, false);
  assert.match(r.rotulo, /sem datas/);
});

test('meta de custo (menor é melhor) também respeita o período', () => {
  const tpl = { metrics: [{ key: 'CPA', betterWhen: 'lower' }] };
  const g = buildGoal({ goal: { metricKey: 'CPA', value: 100, periodo: 'mensal' } }, { CPA: 80 }, {}, tpl, j('2026-08-01', '2026-08-31'));
  assert.ok(g, 'meta de custo com período não some');
});

test('a lista de períodos é a mesma no navegador e no servidor', () => {
  assert.deepEqual([...PERIODOS_ACEITOS].sort(), [...PERIODOS_DA_META.map((p) => p.valor)].sort());
  assert.equal(PERIODO_PADRAO, 'mensal');
});

test('servidor: goal.periodo desconhecido é recusado com mensagem; ausente e válidos passam', () => {
  assert.equal(validarMeta({}), null);
  assert.equal(validarMeta({ goal: { metricKey: 'leads', value: 400 } }), null);
  for (const p of PERIODOS_ACEITOS) assert.equal(validarMeta({ goal: { metricKey: 'leads', value: 400, periodo: p } }), null);
  assert.match(validarMeta({ goal: { metricKey: "leads", value: 400, periodo: "anual" } }), /período.*mensal/);
  assert.match(validarMeta({ goal: { metricKey: "leads", value: 400, periodo: 7 } }), /período/);
  assert.match(validarMeta({ goal: 'oi' }), /meta/i);
  assert.match(validarMeta({ goal: { metricKey: 'leads', value: -3 } }), /meta/i);
});

// ---- selo e marco só para meta de verdade batida; acima do ritmo diz isso (3.7.1, achado do coordenador) ----
import { render as renderKpi } from '../public/assets/js/widgets/kpi.js';
import { cruzouMeta } from '../public/assets/js/lib/meta-batida.js';

const cartao = (valor, janela, goal = { metricKey: 'leads', value: 400, periodo: 'mensal' }) => {
  const g = buildGoal({ goal }, { leads: valor }, {}, null, janela);
  return { g, html: renderKpi({ label: 'Leads', format: 'integer', goal: g }, valor) };
};

test('"Este mês" com 84% da meta inteira: sem selo, sem marco', () => {
  const { g, html } = cartao(337, j('2026-09-01', '2026-09-28'));
  assert.match(g.text, /84,25% da meta do mês/);
  assert.doesNotMatch(html, /Meta batida/);
  assert.equal(cruzouMeta(0.5, g.justa === false ? 0 : g.pct), false);
});

test('"Este mês" com 110% da meta inteira: selo e marco', () => {
  const { g, html } = cartao(440, j('2026-09-01', '2026-09-28'));
  assert.equal(g.justa, true);
  assert.match(html, /Meta batida/);
  assert.equal(cruzouMeta(0.84, g.justa === false ? 0 : g.pct), true);
});

test('30 dias corridos acima do proporcional: sem selo, sem marco, e o texto diz "acima do ritmo"', () => {
  const { g, html } = cartao(1494, j('2026-08-30', '2026-09-28'), { metricKey: 'leads', value: 500, periodo: 'mensal' });
  assert.ok(g.pct > 1);
  assert.equal(g.justa, false);
  assert.match(g.text, /da meta proporcional/);
  assert.match(g.text, /acima do ritmo/);
  assert.doesNotMatch(html, /Meta batida/);
  assert.equal(cruzouMeta(0.5, g.justa === false ? 0 : g.pct), false);
});

test('proporcional abaixo de 100% não fala em ritmo (só o número e o contra-quê)', () => {
  const { g } = cartao(40, j('2026-08-10', '2026-08-16'));
  assert.doesNotMatch(g.text, /ritmo/);
});

test('mês cheio do calendário acima da meta: selo', () => {
  const { g, html } = cartao(477, j('2026-08-01', '2026-08-31'));
  assert.match(g.text, /da meta do mês/);
  assert.match(html, /Meta batida/);
});

test('meta de período e total acima de 100%: selo, sem texto de ritmo', () => {
  for (const periodo of ['periodo', 'total']) {
    const { g, html } = cartao(500, j('2026-07-20', '2026-08-10'), { metricKey: 'leads', value: 400, periodo });
    assert.doesNotMatch(g.text, /ritmo/);
    assert.match(html, /Meta batida/);
  }
});
