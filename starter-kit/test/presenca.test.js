// Presença do painel (fundo vivo, saudação, carregamento, transições): travas de CSS e de texto.
// O fundo animado em loop era proibido neste projeto e passou a ser PEDIDO pelo dono; ele mora
// num arquivo próprio (presenca.css) com a trava dele aqui: só transform e opacity animam, nada
// de desfoque, loop só no fundo e no carregamento, e tudo parado com "reduzir movimento".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { DURACAO } from '../public/assets/js/lib/movimento.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => readFileSync(join(raiz, rel), 'utf8');
const css = ler('public/assets/css/presenca.css');
const mainCss = ler('public/assets/css/main.css');
const TRAVESSAO = String.fromCharCode(8212);
const PAGINAS = ['public/index.html', 'public/config.html', 'public/dashboard.html', 'public/group.html'];
const MODULOS_NOVOS = [
  'public/assets/js/lib/tema-inicial.js', 'public/assets/js/lib/saudacao.js', 'public/assets/js/lib/abertura.js',
  'public/assets/js/lib/atualizado.js', 'public/assets/js/lib/modo-sugerido.js', 'public/assets/js/lib/fundo-cor.js',
  'public/assets/js/lib/fundo.js', 'public/assets/js/lib/esqueleto.js', 'public/assets/js/lib/estado-de-erro.js',
  'public/assets/js/lib/transicao.js', 'public/assets/js/lib/carregamento.js', 'public/assets/js/lib/amostra-de-modo.js',
  'public/assets/js/lib/theme.js', 'public/assets/js/lib/marca.js', 'public/assets/js/wizard/passo-modo.js',
  'functions/lib/aparencia-shape.mjs', 'functions/lib/abertura-do-painel.mjs',
];
const TOCADOS = [
  ...MODULOS_NOVOS, ...PAGINAS, 'public/assets/css/presenca.css', 'public/assets/css/main.css', 'public/assets/css/assistente.css',
  'public/assets/js/dashboard.js', 'public/assets/js/index-page.js', 'public/assets/js/config-wizard.js',
  'public/assets/js/wizard/passo-aparencia.js', 'public/assets/js/wizard/previa.js', 'public/assets/js/wizard/passos.js',
  'public/assets/js/lib/config-do-painel.js', 'public/assets/js/lib/cabecalho.js', 'public/assets/js/lib/movimento.js',
  'functions/_middleware.js', 'functions/api/dashboards.js', 'ARCHITECTURE.md',
];

test('todas as páginas carregam o CSS de presença', () => {
  for (const p of PAGINAS) assert.ok(ler(p).includes('/assets/css/presenca.css'), p);
});

test('zero travessão em tudo que foi criado ou alterado', () => {
  for (const arq of TOCADOS) {
    assert.ok(existsSync(join(raiz, arq)), `falta o arquivo ${arq}`);
    assert.ok(!ler(arq).includes(TRAVESSAO), `travessão em ${arq}`);
  }
});

// Regras (seletor + corpo) fora de @keyframes; e os corpos de @keyframes à parte.
const semKeyframes = css.replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
const regras = [...semKeyframes.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), corpo: m[2] }));
const quadros = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)].map((m) => ({ nome: m[1], corpo: m[2] }));

test('só transform e opacity animam (stroke-dashoffset no traço; clip-path só na troca de modo)', () => {
  assert.ok(quadros.length >= 6, 'os @keyframes do arquivo foram lidos');
  for (const q of quadros) {
    const props = new Set([...q.corpo.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]));
    for (const p of props) {
      const permitida = p === 'transform' || p === 'opacity' || p === 'stroke-dashoffset' || p === 'visibility'
        || (p === 'clip-path' && /^modo-/.test(q.nome));
      assert.ok(permitida, `@keyframes ${q.nome} anima ${p}`);
    }
  }
  for (const r of regras) {
    const m = r.corpo.match(/transition(?:-property)?\s*:\s*([^;]+)/);
    if (!m) continue;
    for (const parte of m[1].split(',')) {
      const prop = parte.trim().split(/\s+/)[0];
      assert.ok(/^(transform|opacity|none|var\()/.test(prop), `${r.sel}: transição em ${prop}`);
    }
  }
});

test('nenhum desfoque: sem filter e sem backdrop-filter (nada de blur recalculado a cada quadro)', () => {
  assert.ok(!/(^|[\s;{])(backdrop-)?filter\s*:/.test(css), 'presenca.css não usa filter');
  assert.ok(!/blur\(/.test(css));
  const topbar = (mainCss.match(/\.topbar\s*\{[^}]*\}/) || [''])[0];
  assert.ok(!/backdrop-filter/.test(topbar), 'a barra do topo fica sobre o fundo em movimento: sem desfoque');
});

test('loop sem fim só no fundo vivo e no carregamento', () => {
  const loops = regras.filter((r) => /infinite/.test(r.corpo)).map((r) => r.sel);
  assert.ok(loops.length >= 2, 'o fundo e o esqueleto têm loop');
  for (const sel of loops) assert.ok(/fundo__|esq-|progresso|is-loading/.test(sel), `loop fora do fundo e do carregamento: ${sel}`);
});

test('gradiente só nas manchas do fundo, no brilho do esqueleto e na cortina da saudação', () => {
  for (const r of regras.filter((x) => /gradient\(/.test(x.corpo))) {
    assert.ok(/fundo__brilho|esq-|saudacao__/.test(r.sel), `gradiente em ${r.sel}`);
  }
  assert.ok(regras.some((r) => /fundo__brilho/.test(r.sel) && /radial-gradient\(/.test(r.corpo)), 'as manchas existem');
});

test('gosto do dono: sem caixa alta, sem letra espaçada, sem sombra de texto', () => {
  assert.ok(!/text-transform:\s*uppercase/i.test(css));
  for (const m of css.matchAll(/letter-spacing:\s*([^;]+);/g)) assert.ok(/^-|^0|^normal/.test(m[1].trim()), `letter-spacing ${m[1]}`);
  assert.ok(!/text-shadow/.test(css));
});

test('fundo: camada fixa atrás do conteúdo, sem capturar clique, e pausa fora da aba visível', () => {
  const fundo = (css.match(/(^|\n)\.fundo\s*\{([^}]*)\}/) || [])[2] || '';
  assert.match(fundo, /position:\s*fixed/);
  assert.match(fundo, /pointer-events:\s*none/);
  assert.match(fundo, /z-index:\s*-1/);
  assert.match(fundo, /overflow:\s*(hidden|clip)/, 'camada que anda não pode alargar a página');
  assert.match(css, /\.fundo--pausado[^{]*\{[^}]*animation-play-state:\s*paused/);
  assert.match(css, /\.fundo--parado[^{]*\{[^}]*animation:\s*none/);
  assert.match(ler('public/assets/js/lib/fundo.js'), /visibilitychange/);
});

test('movimento reduzido: sem saudação, fundo parado, esqueleto sem brilho', () => {
  const bloco = (css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/) || [])[1] || '';
  assert.match(bloco, /\.saudacao[^{]*\{[^}]*display:\s*none\s*!important/);
  assert.match(bloco, /animation:\s*none\s*!important/);
  assert.match(bloco, /::before|::after/, 'pseudo-elemento não é pego pela regra global do main.css');
  assert.match(bloco, /::view-transition/, 'a troca de modo também é imediata');
});

test('a saudação nunca prende a tela: sai sozinha pelo CSS, mesmo se o script falhar', () => {
  const folha = regras.find((r) => /\.saudacao__folha$/.test(r.sel) || /\.saudacao__folha,/.test(r.sel));
  assert.ok(folha, 'regra da folha da saudação');
  assert.match(css, /@keyframes saud-desce\s*\{[^}]*\{[^}]*\}[^}]*\{[^}]*visibility:\s*hidden/, 'no fim a folha fica invisível e fora da tela');
  assert.match(css, /html\[data-saudar\] \.saudacao\s*\{[^}]*display:/, 'só aparece quando a página marcou a saudação');
  assert.match(css, /\.saudacao--pular/);
});

test('tokens de movimento novos no main.css e espelhados no JS', () => {
  const token = (nome) => Number((mainCss.match(new RegExp(`${nome}:\\s*(\\d+)ms`)) || [])[1]);
  assert.equal(token('--dur-revelar'), DURACAO.revelar);
  assert.equal(token('--dur-modo'), DURACAO.modo);
  assert.ok(DURACAO.revelar <= 700 && DURACAO.modo <= 700);
  assert.match(mainCss, /--entrada-base/, 'a entrada do painel aceita começar junto com a revelação');
});

// Literais de texto fora de comentário, com espaço (frase de tela, não chave nem classe).
function frases(fonte) {
  const out = [];
  let emBloco = false;
  for (const linha of fonte.split('\n')) {
    const t = linha.trim();
    if (emBloco) { if (t.includes('*/')) emBloco = false; continue; }
    if (t.startsWith('/*')) { if (!t.includes('*/')) emBloco = true; continue; }
    if (t.startsWith('//') || t.startsWith('*')) continue;
    const re = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|\/\/.*$/g;
    let m;
    while ((m = re.exec(linha)) !== null) {
      if (m[0].startsWith('//')) break;
      const corpo = m[0].slice(1, -1).replace(/\$\{[^}]*\}/g, ' ');
      if (/\s/.test(corpo) && !/[<>={}]|^\s*\.|var\(|rgba?\(|translate|scale\(|cubic-bezier|\bpx\b/.test(corpo)) out.push(corpo);
    }
  }
  return out;
}

test('texto de tela em palavra comum: nada de "tema", "accent", "skeleton" ou "token"', () => {
  const erros = [];
  // Só o que vai pra TELA. As mensagens de validação do servidor (functions/lib) ficam de fora:
  // elas respondem a quem chama a API e precisam dizer o nome do campo ("tema"), como as outras
  // validações já fazem com "accent". O assistente nunca manda valor inválido nesses campos.
  const alvos = [
    ...MODULOS_NOVOS.filter((arq) => !arq.startsWith('functions/')),
    'public/assets/js/wizard/passo-aparencia.js', 'public/assets/js/wizard/previa.js', 'public/assets/js/index-page.js',
    'public/assets/js/lib/marca.js',
  ];
  for (const arq of alvos) {
    for (const frase of frases(ler(arq))) {
      if (/\btemas?\b|\baccent\b|skeleton|\btokens?\b|esqueleto/i.test(frase)) erros.push(`${arq}: "${frase.slice(0, 90)}"`);
    }
  }
  assert.deepEqual(erros, []);
});

test('o botão de alternar fala em modo claro e modo escuro', () => {
  const fonte = ler('public/assets/js/lib/theme.js');
  assert.match(fonte, /Mudar para o modo escuro/);
  assert.match(fonte, /Mudar para o modo claro/);
});

test('páginas: estrutura do carregamento e da saudação só na página do painel; nenhum estilo inline novo', () => {
  const painel = ler('public/dashboard.html');
  assert.match(painel, /id="saudacao"/);
  assert.match(painel, /class="esqueleto"/);
  for (const p of PAGINAS.filter((x) => !x.includes('dashboard'))) assert.ok(!/id="saudacao"/.test(ler(p)), p);
  assert.ok(!/on(click|change|input)=/.test(painel), 'sem handler inline');
});
