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
  assert.match(html, /filtro de período/, 'diz como ver as outras');
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
