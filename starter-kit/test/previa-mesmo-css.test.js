// D5 (teste de ponta a ponta, 02/10/2026): a prévia do assistente com meta preenchida mostrava o cartão do
// número em destaque com ~500 px de vazio e um triângulo preto enorme. Causa: a prévia desenha o painel de
// verdade (renderDashboard), mas config.html não carregava efeitos.css, então o selo "Meta batida" (um svg
// de 10 px no painel) saía sem tamanho, e os atalhos de período saíam como botões crus.
// Regra: toda página que desenha o painel carrega a MESMA folha de estilos do painel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const folhas = (pagina) => [...readFileSync(join(pub, pagina), 'utf8').matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]);

test('o assistente (que tem a prévia do painel) carrega todas as folhas de estilo do painel', () => {
  const doAssistente = folhas('config.html');
  for (const f of folhas('dashboard.html')) {
    assert.ok(doAssistente.includes(f), `config.html não carrega ${f}, e a prévia desenha o painel com ela`);
  }
});

test('o selo Meta batida tem o tamanho do ícone definido na folha que o assistente carrega', () => {
  const css = readFileSync(join(pub, 'assets', 'css', 'efeitos.css'), 'utf8');
  assert.match(css, /\.kpi__selo svg\s*\{[^}]*width:\s*10px/);
  assert.ok(folhas('config.html').includes('/assets/css/efeitos.css'));
});
