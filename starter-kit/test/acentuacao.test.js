// T14 do teste com aluno (02/10/2026): texto sem acento na tela e nos scripts ("voce nao se
// importa", "padrao", "Cor secundaria", "digita-la", "nao e"). Texto sem acento parece
// desleixado pra quem usa. Este teste varre as strings VISÍVEIS (literais com espaço, fora de
// comentário) do front, das mensagens da API e do worker, e reprova palavra sem acento.
// Comentário de código fica de fora: não aparece pra ninguém.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

// Palavra sem acento -> como fica certa. Só entra palavra que NUNCA é correta sem acento.
// A lista mora num JSON pra servir também ao teste dos scripts (scripts/test-acentuacao.py).
export const SEM_ACENTO = JSON.parse(readFileSync(join(raiz, 'test', 'fixtures', 'sem-acento.json'), 'utf8'));
const PALAVRAS = Object.keys(SEM_ACENTO).map((k) => k.replace('-', '[-]')).join('|');
const RE = new RegExp('(?<![\\p{L}\\p{N}_-])(' + PALAVRAS + ')(?![\\p{L}\\p{N}_-])', 'giu');

function arquivos(dir, exts) {
  const out = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) { if (!['node_modules', '.wrangler', 'fonts'].includes(nome)) out.push(...arquivos(p, exts)); }
    else if (exts.some((e) => nome.endsWith(e))) out.push(p);
  }
  return out;
}

// Literais de string fora de comentário. Aproximação de propósito simples: pula linha de
// comentário e o resto depois de " //" quando ele está fora de aspas.
export function literaisVisiveis(fonte) {
  const achados = [];
  let emBloco = false;
  fonte.split('\n').forEach((linha, i) => {
    let l = linha;
    const t = l.trim();
    if (emBloco) { if (t.includes('*/')) emBloco = false; return; }
    if (t.startsWith('/*')) { if (!t.includes('*/')) emBloco = true; return; }
    if (t.startsWith('//') || t.startsWith('*')) return;
    // aliases do auto-mapeamento comparam cabeçalho normalizado (sem acento): não é texto de tela.
    if (/\baliases:/.test(l)) return;
    const re = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|\/\/.*$/g;
    let m;
    while ((m = re.exec(l)) !== null) {
      if (m[0].startsWith('//')) break;
      const corpo = m[0].slice(1, -1);
      if (/\s/.test(corpo)) achados.push({ linha: i + 1, texto: corpo });
    }
  });
  return achados;
}

export function semAcento(texto) {
  // Tira tags e atributos HTML: classe e id não são texto visível.
  const visivel = texto.replace(/<[^>]*>/g, ' ').replace(/\$\{[^}]*\}/g, ' ');
  return [...visivel.matchAll(RE)].map((m) => m[1]);
}

test('strings visíveis do starter-kit (front, API, worker) têm acento', () => {
  const alvos = [
    ...arquivos(join(raiz, 'public'), ['.js', '.mjs', '.html']),
    ...arquivos(join(raiz, 'functions'), ['.js', '.mjs']),
    ...arquivos(join(raiz, 'workers'), ['.js']),
  ];
  const erros = [];
  for (const arq of alvos) {
    const fonte = readFileSync(arq, 'utf8');
    const lits = arq.endsWith('.html')
      ? fonte.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').split('\n').map((t, i) => ({ linha: i + 1, texto: t }))
      : literaisVisiveis(fonte);
    for (const { linha, texto } of lits) {
      for (const w of semAcento(texto)) erros.push(`${relative(raiz, arq)}:${linha} "${w}" -> "${SEM_ACENTO[w.toLowerCase()]}"`);
    }
  }
  assert.deepEqual(erros, [], `\n${erros.length} palavra(s) sem acento:\n${erros.join('\n')}`);
});

test('o detector pega o caso do aluno e ignora classe CSS', () => {
  assert.deepEqual(semAcento('Use dados que voce nao se importa'), ['voce', 'nao']);
  assert.deepEqual(semAcento('<div data-estado="nao-mapeada">Não mapeada</div>'), []);
});
