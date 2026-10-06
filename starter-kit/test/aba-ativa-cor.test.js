// Cor da aba ativa. Regra de gosto do dono: texto escuro nunca sobre bloco de cor saturada.
// O par do botão (--accent + --accent-fg) põe texto ESCURO quando a cor de destaque é clara
// (amarelo, ciano). Pra aba ativa, a cor de destaque é escurecida até o texto branco passar
// no contraste AA (4,5:1): continua sendo o tom da marca, e o texto é sempre branco.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { accentSolid, aplicarAccent, contrastRatio, DEFAULT_ACCENT } from '../public/assets/js/lib/color.js';
import { abasVisiveis } from '../public/assets/js/lib/abas.js';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/assets/css/main.css'), 'utf8');
const fakeEl = () => {
  const vars = {};
  return { style: { setProperty: (k, v) => { vars[k] = v; }, getPropertyValue: (k) => vars[k] || '' }, dataset: {}, vars };
};

test('accentSolid: cor que já aguenta texto branco fica como está', () => {
  assert.equal(accentSolid(DEFAULT_ACCENT), DEFAULT_ACCENT);
  assert.equal(accentSolid('#0f766e'), '#0f766e');
  assert.equal(accentSolid('#111827'), '#111827');
});

test('accentSolid: cor clara é escurecida até o branco passar em 4,5:1', () => {
  for (const claro of ['#f5c518', '#22d3ee', '#a3e635', '#fde047', '#ffffff', '#f97316', '#34d399']) {
    const solido = accentSolid(claro);
    assert.ok(contrastRatio(solido, '#ffffff') >= 4.5, `${claro} -> ${solido}: ${contrastRatio(solido, '#ffffff').toFixed(2)}`);
    assert.match(solido, /^#[0-9a-f]{6}$/);
  }
});

test('accentSolid: escurece o mínimo necessário (não vira preto à toa)', () => {
  const solido = accentSolid('#f5c518');
  assert.ok(contrastRatio(solido, '#ffffff') < 6.5, `passou do ponto: ${contrastRatio(solido, '#ffffff').toFixed(2)}`);
  assert.notEqual(solido, '#000000');
});

test('accentSolid: hex inválido cai na cor padrão', () => {
  assert.equal(accentSolid('nao-e-hex'), accentSolid(DEFAULT_ACCENT));
});

test('aplicarAccent grava --accent-solido nos dois temas, sempre legível com branco', () => {
  for (const cor of ['#f5c518', '#5b62d6', '#22d3ee']) {
    for (const escuro of [true, false]) {
      const el = fakeEl();
      aplicarAccent(el, cor, escuro);
      assert.ok(contrastRatio(el.vars['--accent-solido'], '#ffffff') >= 4.5, `${cor} escuro=${escuro}`);
    }
  }
});

test('CSS: aba ativa usa a cor sólida com texto branco, nunca o par de texto escuro', () => {
  const regra = (css.match(/\n\.aba\[aria-selected="true"\]\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(regra, /background:\s*var\(--accent-solido, var\(--accent\)\)/);
  assert.match(regra, /color:\s*#fff/);
  assert.ok(!/--accent-fg/.test(regra), 'não usa --accent-fg (que vira texto escuro em cor clara)');
});

// ---------- aba que não tem o que mostrar ----------

test('abasVisiveis: tira a aba que não desenha nada, mantendo a ordem', () => {
  const abas = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(abasVisiveis(abas, (t) => t.id !== 'b').map((t) => t.id), ['a', 'c']);
  assert.deepEqual(abasVisiveis(abas, () => true), abas);
  assert.deepEqual(abasVisiveis(abas, () => ''), []);
  assert.deepEqual(abasVisiveis(null, () => true), []);
});

test('abasVisiveis: erro ao desenhar uma aba não derruba as outras (a aba fica)', () => {
  const abas = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(abasVisiveis(abas, (t) => { if (t.id === 'a') throw new Error('x'); return true; }).map((t) => t.id), ['a', 'b']);
});
