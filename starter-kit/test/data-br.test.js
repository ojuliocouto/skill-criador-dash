// Visual do print real (02/10/2026): o filtro de data saía em mm/dd/yyyy. O <input type="date">
// segue o idioma do NAVEGADOR, não o lang="pt-BR" da página, então em Chrome em inglês (e no
// Chromium da prova) a data aparece no formato americano. Agora o campo é próprio: dd/mm/aaaa.
import { test } from 'node:test';
import { fonteDoAssistente } from './apoio/fonte-do-assistente.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { brParaISO, isoParaBR, mascaraDataBR } from '../public/assets/js/lib/data-br.js';
import { buildFilterBar } from '../public/assets/js/dashboard.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';

const aqui = dirname(fileURLToPath(import.meta.url));

test('data-br: converte dd/mm/aaaa <-> ISO e recusa data que não existe', () => {
  assert.equal(brParaISO('05/07/2026'), '2026-07-05');
  assert.equal(isoParaBR('2026-07-05'), '05/07/2026');
  assert.equal(brParaISO('31/02/2026'), null, '31 de fevereiro não existe');
  assert.equal(brParaISO('07/05'), null, 'incompleta não vira filtro');
  assert.equal(brParaISO(''), null);
});

test('data-br: máscara põe as barras enquanto a pessoa digita', () => {
  assert.equal(mascaraDataBR('0507'), '05/07');
  assert.equal(mascaraDataBR('05072026'), '05/07/2026');
  assert.equal(mascaraDataBR('05/07/2026x9'), '05/07/2026');
});

test('filtro do painel: campo de data próprio em dd/mm/aaaa, nunca input type=date', () => {
  const rows = [{ Data: '01/07/2026', Canal: 'A', Investimento: '1' }, { Data: '05/07/2026', Canal: 'B', Investimento: '2' }];
  const html = buildFilterBar(marketing, { rows }, { data: 'Data', canal: 'Canal', investimento: 'Investimento' });
  assert.ok(!html.includes('type="date"'), 'sem input nativo de data');
  assert.ok(html.includes('placeholder="dd/mm/aaaa"'));
  assert.ok(html.includes('01/07/2026') && html.includes('05/07/2026'), 'mostra o período dos dados em formato brasileiro');
});

test('wizard: datas do Meta Ads também em dd/mm/aaaa', () => {
  const src = fonteDoAssistente(); // todos os módulos do assistente (o formulário do Meta saiu do arquivo único)
  assert.ok(!/type:\s*'date'/.test(src), 'sem input nativo de data no wizard');
});
