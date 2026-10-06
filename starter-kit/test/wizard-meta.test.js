// T11 do teste com aluno (02/10/2026): a tela do Meta Ads sem token não levava ao guia.
// "Access token" em inglês, "anuncios" e "Ate" sem acento, nenhum link pro passo a passo e
// "usuário do sistema" sem explicação na tela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fonteDoAssistente } from './apoio/fonte-do-assistente.js';

// O formulário do Meta Ads mora em wizard/fonte-meta.js desde que o assistente foi quebrado em módulos.
const src = fonteDoAssistente();
const GUIA = 'https://github.com/ojuliocouto/skill-criador-dash/blob/main/references/token-meta-ads.md';

test('Meta Ads: rótulo "Token de acesso", nunca "Access token"', () => {
  assert.ok(src.includes("rotulo: 'Token de acesso'"), 'rótulo em português (agora um <label for> de verdade, via campo())');
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
