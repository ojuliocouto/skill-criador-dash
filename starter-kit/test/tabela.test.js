// Print real (02/10/2026): a tabela "Dados" cortava a 11ª linha no meio, com rolagem interna
// sem aviso, e no celular mostrava 3 de 8 colunas sem dizer que dava pra arrastar de lado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render as renderTable } from '../public/assets/js/widgets/table.js';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/assets/css/main.css'), 'utf8');
const linhas = (n) => Array.from({ length: n }, (_, i) => ({ Data: `0${(i % 9) + 1}/07/2026`, Valor: String(i) }));
const regra = (sel) => (css.match(new RegExp(`(^|\\n)\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)) || [])[2] || '';

test('tabela: sem rolagem vertical escondida (a linha nunca sai cortada no meio)', () => {
  assert.ok(!/max-height/.test(regra('.table__scroll')), '.table__scroll sem max-height');
  assert.ok(!/overflow-y:\s*auto/.test(regra('.table__scroll')), '.table__scroll sem rolagem vertical própria');
});

test('tabela: diz quantas linhas mostra', () => {
  assert.match(renderTable({}, { columns: ['Data', 'Valor'], rows: linhas(13) }), /Mostrando as 13 linhas/);
  const html = renderTable({ pageSize: 25 }, { columns: ['Data', 'Valor'], rows: linhas(60) });
  assert.match(html, /Mostrando 25 de 60 linhas/);
  assert.match(html, /<button[^>]*data-mostrar-mais[^>]*>Mostrar mais 25<\/button>/, 'diz como ver as outras');
});

// 3.9 (achado 8 da auditoria de 25/10/2026): a aba Dados mostrava as 50 linhas MAIS ANTIGAS e ordenar
// por data só reordenava essas 50 (133 de 183 linhas inacessíveis). Agora a tabela abre com as mais
// recentes primeiro e todas as linhas estão na tabela: as que passam do corte ficam escondidas até
// "Mostrar mais", e ordenar mexe no conjunto inteiro (lib/tabela-ordena.js).
const META_DATA = { Data: { label: 'Data', format: 'date' } };
const datadas = (n) => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.UTC(2026, 7, 26) + i * 86400000);
  return { Data: `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`, Valor: String(i) };
});
const corpo = (html) => [...html.matchAll(/<tr([^>]*)>(.*?)<\/tr>/g)].slice(1).map((m) => ({ attrs: m[1], txt: m[2] }));

test('tabela: abre com as linhas mais recentes primeiro (coluna de data mapeada)', () => {
  const html = renderTable({ columnMeta: META_DATA }, { columns: ['Data', 'Valor'], rows: datadas(61) });
  const tr = corpo(html);
  assert.match(tr[0].txt, /25\/10\/2026/, 'a 1a linha é o último dia');
  assert.match(tr[1].txt, /24\/10\/2026/);
  assert.match(tr[tr.length - 1].txt, /26\/08\/2026/, 'a mais antiga vai para o fim');
  assert.match(html, /Mostrando 50 de 61 linhas, as mais recentes primeiro\./);
});

test('tabela: todas as linhas entram na tabela; as que passam do corte ficam escondidas, não somem', () => {
  const html = renderTable({ columnMeta: META_DATA }, { columns: ['Data', 'Valor'], rows: datadas(183) });
  const tr = corpo(html);
  assert.equal(tr.length, 183, 'as 183 linhas estão no corpo da tabela');
  assert.equal(tr.filter((t) => /data-corte/.test(t.attrs)).length, 133, '133 escondidas');
  assert.ok(tr.slice(0, 50).every((t) => !/data-corte/.test(t.attrs)), 'as 50 primeiras à vista');
  assert.match(html, /data-visiveis="50"/);
});

test('tabela: sem coluna de data, a ordem da fonte continua', () => {
  const html = renderTable({}, { columns: ['Data', 'Valor'], rows: datadas(3) });
  assert.match(corpo(html)[0].txt, /26\/08\/2026/);
});

test('tabela: fonte enorme não trava o navegador (até 5.000 linhas na tabela, e diz isso)', () => {
  const html = renderTable({ columnMeta: META_DATA }, { columns: ['Data', 'Valor'], rows: Array.from({ length: 6000 }, (_, i) => ({ Data: '01/09/2026', Valor: String(i) })) });
  assert.equal(corpo(html).length, 5000);
  assert.match(html, /Mostrando 50 de 6\.000 linhas, as mais recentes primeiro\. A tabela carrega as 5\.000 mais recentes; use o filtro de período para ver as outras\./);
});

test('tabela: avisa que dá pra arrastar de lado quando as colunas não cabem', () => {
  const html = renderTable({}, { columns: ['Data', 'Valor'], rows: linhas(3) });
  assert.match(html, /Arraste para o lado para ver todas as colunas/);
});

// Print real (02/10/2026, dash-v2): a tabela mostrava "45200" cru e alinhado à esquerda ao lado
// de "1.250,00". Número de célula sai no formato brasileiro e alinhado à direita; data e texto ficam.
test('tabela: número cru ganha milhar, decimal fica com 2 casas, data e texto não mudam', () => {
  const html = renderTable({}, {
    columns: ['Data', 'Canal', 'Impressões', 'Investimento'],
    rows: [{ Data: '01/07/2026', Canal: 'Instagram', 'Impressões': '45200', Investimento: '980,50' },
           { Data: '02/07/2026', Canal: 'Google', 'Impressões': '31000', Investimento: '1.250,00' }],
  });
  assert.match(html, />45\.200</);
  assert.match(html, />980,50</);
  assert.match(html, />1\.250,00</, 'decimal com zeros não perde as casas');
  assert.match(html, />01\/07\/2026</);
  assert.match(html, />Instagram</);
  assert.equal((html.match(/<td class="num">/g) || []).length, 4, 'só as células numéricas ganham class num');
  assert.match(html, /<th scope="col" class="num">Impressões<\/th>/, 'cabeçalho da coluna numérica alinha junto');
});

test('tabela: .num alinha à direita com algarismos tabulares', () => {
  const r = regra('.table__el .num');
  assert.match(r, /text-align:\s*right/);
  assert.match(r, /tabular-nums/);
});
