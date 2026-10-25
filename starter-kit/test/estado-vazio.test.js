// 3.9 (achado 7 da auditoria de 25/10/2026): período sem dado mostrava 7 cartões zerados (R$ 0,00, ROAS 0)
// sem explicar nada, e os widgets diziam "Sem dados" solto. Agora o corpo do painel dá UMA frase que diz
// por que está vazio, com um botão para o que fazer, e os widgets usam a mesma frase curta.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { estadoVazio, estadoVazioHtml, SEM_DADOS_NO_PERIODO } from '../public/assets/js/lib/estado-vazio.js';
import { vazioDoCorpo } from '../public/assets/js/dashboard.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';
import { render as ranking } from '../public/assets/js/widgets/ranking.js';
import { render as table } from '../public/assets/js/widgets/table.js';
import { render as resumo } from '../public/assets/js/widgets/resumo.js';

const LIMITES = { min: '2026-08-26', max: '2026-10-04' };

test('estadoVazio: período inteiro depois do último dado (fonte parada) diz a data do último dado', () => {
  const e = estadoVazio({ total: 183, filtro: { from: '2026-10-25', to: '2026-10-25' }, limites: LIMITES });
  assert.equal(e.frase, 'Nenhum dado em 25/10/2026: o último dado é de 04/10/2026.');
  assert.deepEqual(e.acao, { id: 'tudo', rotulo: 'Ver todo o período' });
  const s = estadoVazio({ total: 183, filtro: { from: '2026-10-19', to: '2026-10-25' }, limites: LIMITES });
  assert.equal(s.frase, 'Nenhum dado entre 19/10/2026 e 25/10/2026: o último dado é de 04/10/2026.');
});

test('estadoVazio: período antes do primeiro dado, ou num buraco, diz de quando a quando vão os dados', () => {
  assert.equal(estadoVazio({ total: 183, filtro: { from: '2026-01-01', to: '2026-01-31' }, limites: LIMITES }).frase,
    'Nenhum dado entre 01/01/2026 e 31/01/2026: os dados começam em 26/08/2026.');
  assert.equal(estadoVazio({ total: 183, filtro: { from: '2026-09-10', to: '2026-09-12' }, limites: LIMITES }).frase,
    'Nenhum dado entre 10/09/2026 e 12/09/2026: os dados vão de 26/08/2026 a 04/10/2026.');
});

test('estadoVazio: filtro de canal sem linha no período manda limpar os filtros', () => {
  const e = estadoVazio({ total: 183, filtro: { from: '2026-09-10', to: '2026-09-12', dims: { canal: 'YouTube Ads' } }, limites: LIMITES, rotulos: { canal: 'Canal' } });
  assert.equal(e.frase, 'Nenhum dado de Canal YouTube Ads entre 10/09/2026 e 12/09/2026.');
  assert.deepEqual(e.acao, { id: 'limpar', rotulo: 'Limpar filtros' });
});

test('estadoVazio: fonte sem nenhuma linha manda conferir a fonte e atualizar', () => {
  const e = estadoVazio({ total: 0, filtro: {}, limites: { min: null, max: null } });
  assert.equal(e.frase, 'A fonte ainda não tem nenhuma linha: confira a planilha ou a conta ligada e clique em Atualizar.');
  assert.equal(e.acao, null);
});

test('estadoVazioHtml: uma frase, um botão, escapado e marcado para a prova de tela', () => {
  const html = estadoVazioHtml({ frase: 'Nenhum dado <x>.', acao: { id: 'tudo', rotulo: 'Ver todo o período' } });
  assert.match(html, /class="empty-state"/);
  assert.match(html, /data-estado="vazio"/);
  assert.match(html, /Nenhum dado &lt;x&gt;\./);
  assert.match(html, /<button[^>]*data-vazio-acao="tudo"[^>]*>Ver todo o período<\/button>/);
  assert.equal([...html.matchAll(/<p/g)].length, 1);
  assert.doesNotMatch(estadoVazioHtml({ frase: 'x', acao: null }), /<button/);
});

test('vazioDoCorpo: período sem linha troca os 7 cartões zerados pela frase; com linha, não interfere', () => {
  const CM = { data: 'Data', investimento: 'Inv' };
  const todas = [{ Data: '26/08/2026', Inv: '10' }, { Data: '04/10/2026', Inv: '20' }];
  const html = vazioDoCorpo({ template: marketing, colMap: CM, todas, linhas: [], filtro: { from: '2026-10-25', to: '2026-10-25', dims: {} } });
  assert.match(html, /Nenhum dado em 25\/10\/2026: o último dado é de 04\/10\/2026\./);
  assert.doesNotMatch(html, /kpi|R\$/);
  assert.equal(vazioDoCorpo({ template: marketing, colMap: CM, todas, linhas: todas, filtro: {} }), '');
});

// Funil e gráfico de área são da frente visual da 3.9 (funnel.js e timeseries.js): a troca da frase deles
// fica para a junção. Com o estado vazio do corpo, os dois quase nunca chegam a ficar vazios sozinhos.
test('widgets vazios usam a mesma frase (nunca "Sem dados" solto)', () => {
  assert.equal(SEM_DADOS_NO_PERIODO, 'Nenhum dado neste período.');
  const saidas = [
    ranking({}, []), table({}, { columns: [], rows: [] }), resumo({}, { linhas: [] }),
  ];
  for (const h of saidas) {
    assert.ok(h.includes(SEM_DADOS_NO_PERIODO), h);
    assert.doesNotMatch(h, /Sem dados/);
  }
});
