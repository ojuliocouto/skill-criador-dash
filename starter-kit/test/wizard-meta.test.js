// T11 do teste com aluno (02/10/2026): a tela do Meta Ads sem token não levava ao guia.
// "Access token" em inglês, "anuncios" e "Ate" sem acento, nenhum link pro passo a passo e
// "usuário do sistema" sem explicação na tela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/assets/js/config-wizard.js'), 'utf8');
const GUIA = 'https://github.com/ojuliocouto/skill-criador-dash/blob/main/references/token-meta-ads.md';

test('Meta Ads: rótulo "Token de acesso", nunca "Access token"', () => {
  assert.ok(src.includes("text: 'Token de acesso'"), 'rótulo em português');
  assert.ok(!/['"`]Access token/.test(src), 'nenhum texto visível com "Access token"');
});

test('Meta Ads: link "Como gerar o seu token" aponta pro guia', () => {
  assert.ok(src.includes(GUIA), 'URL do guia references/token-meta-ads.md');
  assert.ok(src.includes('Como gerar o seu token'), 'texto do link');
});

test('Meta Ads: mensagens com acento e "usuário do sistema" explicado', () => {
  assert.ok(src.includes('Informe o token de acesso e o ID da conta de anúncios.'));
  assert.ok(src.includes("'Até (opcional)'"));
  assert.match(src, /usuário do sistema \(/, 'explica entre parênteses o que é usuário do sistema');
});
