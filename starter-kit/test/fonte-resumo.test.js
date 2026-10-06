// Passo 2 do assistente ("Onde estão os seus números?"): o que aparece DEPOIS de conectar.
// Antes a única confirmação era "90 linha(s) detectada(s)". Agora: linhas, período detectado
// (primeira e última data), prévia das 3 primeiras linhas e aviso de coluna obrigatória ausente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseCSV } from '../functions/lib/csv.mjs';
import {
  gidDoLink, colunaDeData, periodoDetectado, primeirasLinhas, resumoDaConexao,
} from '../public/assets/js/lib/fonte-resumo.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';
import { template as estoque } from '../public/assets/js/templates/estoque.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const fixture = parseCSV(readFileSync(join(aqui, 'fixtures', 'marketing-30-dias.csv'), 'utf8'));

test('gidDoLink: tira o código da aba do link da planilha', () => {
  assert.equal(gidDoLink('https://docs.google.com/spreadsheets/d/abc/edit#gid=123'), '123');
  assert.equal(gidDoLink('https://docs.google.com/spreadsheets/d/abc/edit?gid=5#gid=5'), '5');
  assert.equal(gidDoLink('https://docs.google.com/spreadsheets/d/abc/edit?usp=sharing&gid=77'), '77');
});

test('gidDoLink: link sem aba, vazio ou lixo devolve null', () => {
  assert.equal(gidDoLink('https://docs.google.com/spreadsheets/d/abc/edit'), null);
  assert.equal(gidDoLink('https://docs.google.com/spreadsheets/d/abc/edit#gid=abc'), null);
  assert.equal(gidDoLink(''), null);
  assert.equal(gidDoLink(null), null);
});

test('periodoDetectado: primeira e última data do arquivo de 90 linhas, em formato brasileiro', () => {
  assert.equal(fixture.rows.length, 90, 'sanidade: o arquivo de teste tem 90 linhas');
  assert.deepEqual(periodoDetectado(fixture, marketing), {
    coluna: 'Data', de: '05/09/2026', ate: '04/10/2026', dias: 30,
  });
});

test('periodoDetectado: não depende da ordem das linhas', () => {
  const ds = { columns: ['Data', 'Investimento'], rows: [
    { Data: '20/09/2026', Investimento: '1' }, { Data: '05/09/2026', Investimento: '2' }, { Data: '04/10/2026', Investimento: '3' },
  ] };
  const p = periodoDetectado(ds, marketing);
  assert.equal(p.de, '05/09/2026');
  assert.equal(p.ate, '04/10/2026');
  assert.equal(p.dias, 3);
});

test('colunaDeData: acha a coluna pelo conteúdo quando o nome não ajuda', () => {
  const ds = { columns: ['Quando', 'Gasto'], rows: [
    { Quando: '01/07/2026', Gasto: '10' }, { Quando: '02/07/2026', Gasto: '12' }, { Quando: '03/07/2026', Gasto: '9' },
  ] };
  assert.equal(colunaDeData(ds, marketing), 'Quando');
  assert.equal(periodoDetectado(ds, marketing).de, '01/07/2026');
});

test('colunaDeData: coluna com nome de data mas sem data nenhuma não conta', () => {
  const ds = { columns: ['Data', 'Gasto'], rows: [{ Data: 'janeiro', Gasto: '10' }, { Data: 'fevereiro', Gasto: '12' }] };
  assert.equal(colunaDeData(ds, marketing), null);
  assert.equal(periodoDetectado(ds, marketing), null);
});

test('periodoDetectado: sem coluna de data, sem linha ou sem dado devolve null', () => {
  assert.equal(periodoDetectado({ columns: ['Produto', 'Qtd'], rows: [{ Produto: 'A', Qtd: '3' }] }, estoque), null);
  assert.equal(periodoDetectado({ columns: ['Data'], rows: [] }, marketing), null);
  assert.equal(periodoDetectado(null, marketing), null);
});

test('primeirasLinhas: as 3 primeiras, na ordem das colunas, sem inventar nada', () => {
  const p = primeirasLinhas(fixture, 3);
  assert.deepEqual(p.columns, fixture.columns);
  assert.equal(p.rows.length, 3);
  assert.deepEqual(p.rows[0], ['2026-09-05', 'Instagram', '850,00', '48200', '612', '38', '5', '1.900,00']);
  assert.equal(primeirasLinhas({ columns: ['A'], rows: [{ A: '1' }] }, 3).rows.length, 1);
  assert.deepEqual(primeirasLinhas(null, 3), { columns: [], rows: [] });
});

test('primeirasLinhas: célula vazia vira texto vazio, nunca "undefined"', () => {
  const p = primeirasLinhas({ columns: ['A', 'B'], rows: [{ A: '1' }] }, 3);
  assert.deepEqual(p.rows[0], ['1', '']);
});

test('resumoDaConexao: linhas, colunas, período, prévia e nenhuma obrigatória ausente', () => {
  const r = resumoDaConexao(fixture, marketing);
  assert.equal(r.linhas, 90);
  assert.equal(r.colunas, 8);
  assert.equal(r.periodo.de, '05/09/2026');
  assert.equal(r.previa.rows.length, 3);
  assert.deepEqual(r.obrigatoriasAusentes, []);
});

test('resumoDaConexao: arquivo sem a coluna obrigatória aponta qual falta', () => {
  const ds = { columns: ['Data', 'Canal', 'Leads'], rows: [{ Data: '01/07/2026', Canal: 'A', Leads: '3' }] };
  const r = resumoDaConexao(ds, marketing);
  assert.deepEqual(r.obrigatoriasAusentes, [{ key: 'investimento', label: 'Investimento' }]);
});

test('resumoDaConexao: usa meta.rowCount quando o conector informa', () => {
  const ds = { columns: ['Data'], rows: [{ Data: '01/07/2026' }], meta: { rowCount: 1 } };
  assert.equal(resumoDaConexao(ds, marketing).linhas, 1);
});
