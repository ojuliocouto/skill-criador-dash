// D12 (teste de ponta a ponta, 02/10/2026): celular 360 e 390. A tabela "Dados linha a linha" rolava de lado
// (o dono já reprovou "tabela virada de lado"), "Personalizado" ficava fora da tela sem aviso, o alvo de toque
// tinha 32 px e a aba "Dados" quebrava de linha. A parte pura mora aqui; a medida em pixels, em
// scripts/test-celular-no-navegador.cjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bordasDeRolagem } from '../public/assets/js/lib/rolagem-borda.js';
import { opcoesDaOrdem, ordemDoValor, seletorDeOrdemHtml } from '../public/assets/js/lib/tabela-ordena.js';
import { render as renderTabela } from '../public/assets/js/widgets/table.js';
import { render as renderResumo } from '../public/assets/js/widgets/resumo.js';

test('bordasDeRolagem: no começo só há mais à direita; no meio, dos dois lados; no fim, só à esquerda; sem rolagem, nada', () => {
  assert.deepEqual(bordasDeRolagem({ scrollLeft: 0, clientWidth: 300, scrollWidth: 450 }), { esquerda: false, direita: true });
  assert.deepEqual(bordasDeRolagem({ scrollLeft: 60, clientWidth: 300, scrollWidth: 450 }), { esquerda: true, direita: true });
  assert.deepEqual(bordasDeRolagem({ scrollLeft: 150, clientWidth: 300, scrollWidth: 450 }), { esquerda: true, direita: false });
  assert.deepEqual(bordasDeRolagem({ scrollLeft: 0, clientWidth: 300, scrollWidth: 300 }), { esquerda: false, direita: false });
});

test('bordasDeRolagem: a folga de 2 px absorve arredondamento do navegador (nenhum falso aviso)', () => {
  assert.deepEqual(bordasDeRolagem({ scrollLeft: 149.4, clientWidth: 300, scrollWidth: 450 }).direita, false);
  assert.deepEqual(bordasDeRolagem({ scrollLeft: 0, clientWidth: 300, scrollWidth: 301 }), { esquerda: false, direita: false });
});

test('opcoesDaOrdem: "Ordem original" e, por coluna, crescente e decrescente em português', () => {
  const o = opcoesDaOrdem(['Data', 'Investimento']);
  assert.deepEqual(o[0], { valor: '', rotulo: 'Ordem original' });
  assert.deepEqual(o.map((x) => x.valor), ['', '0:asc', '0:desc', '1:asc', '1:desc']);
  assert.match(o[1].rotulo, /Data.*crescente/);
  assert.match(o[2].rotulo, /Data.*decrescente/);
});

test('ordemDoValor: devolve coluna e direção, e nulo para o que não é ordem', () => {
  assert.deepEqual(ordemDoValor('3:desc'), { coluna: 3, direcao: 'desc' });
  assert.deepEqual(ordemDoValor('0:asc'), { coluna: 0, direcao: 'asc' });
  for (const ruim of ['', null, undefined, 'x', '1:meio', '-1:asc', '1.5:asc']) assert.equal(ordemDoValor(ruim), null, String(ruim));
});

test('seletorDeOrdemHtml: um select com rótulo "Ordenar por", escapando o texto do cabeçalho', () => {
  const h = seletorDeOrdemHtml(['A <b>', 'B']);
  assert.match(h, /Ordenar por/);
  assert.match(h, /data-ordenar-por/);
  assert.ok(!h.includes('<b>'), 'o cabeçalho é escapado');
  assert.equal(seletorDeOrdemHtml([]), '');
});

const COLS = ['Data', 'Canal', 'Investimento'];
const LINHAS = [{ Data: '01/07/2026', Canal: 'Google', Investimento: '10' }, { Data: '02/07/2026', Canal: 'Meta', Investimento: '20' }];

test('tabela de dados: o seletor "Ordenar por" existe e o markup das células não muda (o nome da coluna entra por JS, medido no navegador)', () => {
  const h = renderTabela({ title: 'Dados' }, { columns: COLS, rows: LINHAS });
  assert.match(h, /class="ordenar-por"/);
  assert.match(h, /data-ordenar-por/);
  assert.match(h, /<td>01\/07\/2026<\/td>/);
});

test('resumo por canal e por semana: também têm o seletor "Ordenar por"', () => {
  const dados = { ok: true, colunas: [{ key: 'leads', label: 'Leads', format: 'integer' }], dimLabel: 'Canal', totalDeGrupos: 1,
    linhas: [{ label: 'Google', valores: { leads: 3 } }], total: { label: 'Total', valores: { leads: 3 } } };
  const h = renderResumo({}, dados);
  assert.match(h, /data-ordenar-por/);
  assert.match(h, /Canal/);
});
