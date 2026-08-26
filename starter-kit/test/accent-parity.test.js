// Paridade do accent padrão entre browser e servidor.
//
// Existe porque em 26/08/2026 o tom padrão foi ajustado em `public/assets/js/lib/color.js` e
// ficou ANTIGO em `functions/lib/og.mjs`: o painel abria com uma cor e o card de OpenGraph
// (o preview quando alguém compartilha o link) saía com outra. Nenhum teste pegou, porque
// cada lado testava a si mesmo. Mesmo padrão de bug que os testes de paridade de domains e
// do worker já cobrem: valor duplicado em dois arquivos, sem nada amarrando os dois.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ACCENT as ACCENT_BROWSER } from '../public/assets/js/lib/color.js';
import { readFileSync } from 'node:fs';

test('accent padrão: browser e servidor apontam para a MESMA cor', async () => {
  const og = await import('../functions/lib/og.mjs');
  // og.mjs não exporta a constante: leia do fonte, que é o que importa aqui.
  const fonte = readFileSync(new URL('../functions/lib/og.mjs', import.meta.url), 'utf8');
  const m = fonte.match(/DEFAULT_ACCENT\s*=\s*'(#[0-9a-fA-F]{6})'/);
  assert.ok(m, 'og.mjs precisa declarar DEFAULT_ACCENT literal');
  assert.equal(
    m[1].toLowerCase(),
    ACCENT_BROWSER.toLowerCase(),
    'trocar o accent padrão exige trocar nos DOIS arquivos: painel e card de OpenGraph',
  );
  assert.ok(og, 'og.mjs importa sem erro');
});

test('accent padrão dos favicons inline casa com o do código', () => {
  // Os 4 HTML trazem o favicon como SVG inline com a cor cravada. Trocar o default e esquecer
  // deles deixa o ícone da aba numa cor e o painel em outra.
  const esperado = ACCENT_BROWSER.replace('#', '').toLowerCase();
  for (const arq of ['dashboard.html', 'index.html', 'group.html', 'config.html']) {
    const html = readFileSync(new URL(`../public/${arq}`, import.meta.url), 'utf8');
    const m = html.match(/rect width='32' height='32' rx='7' fill='%23([0-9a-fA-F]{6})'/);
    assert.ok(m, `${arq}: favicon inline não encontrado`);
    assert.equal(m[1].toLowerCase(), esperado, `${arq}: favicon com cor diferente do accent padrão`);
  }
});
