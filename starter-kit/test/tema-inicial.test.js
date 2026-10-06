// Modo claro ou escuro com que o painel ABRE: escolha do visitante naquele painel, depois o
// modo que o dono escolheu (config.tema), depois o que já valia (escolha geral do navegador e,
// por fim, o sistema). Função pura + paridade com o script inline das páginas, que precisa
// decidir a mesma coisa antes do primeiro quadro pintado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

import {
  resolverTemaInicial, temaDoModo, modoValido, temaValido, chaveDoTemaDoPainel, idDoPainelNaUrl,
  chaveParaGuardar, CHAVE_GERAL,
} from '../public/assets/js/lib/tema-inicial.js';
import { chaveDaSaudacao } from '../public/assets/js/lib/saudacao.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const pagina = (nome) => readFileSync(join(raiz, 'public', nome), 'utf8');
const PAGINAS = ['index.html', 'config.html', 'dashboard.html', 'group.html'];
const inlineDe = (html) => (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';

test('temaDoModo: claro e escuro viram o tema; auto, vazio e lixo não decidem nada', () => {
  assert.equal(temaDoModo('claro'), 'light');
  assert.equal(temaDoModo('escuro'), 'dark');
  for (const v of ['auto', '', null, undefined, 'dark', 'CLARO', 7]) assert.equal(temaDoModo(v), null);
  assert.ok(modoValido('auto') && modoValido('claro') && modoValido('escuro'));
  assert.ok(!modoValido('light') && !modoValido('') && !modoValido(null));
  assert.ok(temaValido('light') && temaValido('dark') && !temaValido('claro'));
});

test('resolverTemaInicial: a escolha do visitante NAQUELE painel ganha de tudo', () => {
  assert.equal(resolverTemaInicial({ escolhaNoPainel: 'light', modoDoPainel: 'escuro', escolhaGeral: 'dark', sistemaClaro: false }), 'light');
  assert.equal(resolverTemaInicial({ escolhaNoPainel: 'dark', modoDoPainel: 'claro', escolhaGeral: 'light', sistemaClaro: true }), 'dark');
});

test('resolverTemaInicial: sem escolha do visitante vale o modo que o dono escolheu, mesmo com o sistema no contrário', () => {
  assert.equal(resolverTemaInicial({ modoDoPainel: 'escuro', sistemaClaro: true }), 'dark');
  assert.equal(resolverTemaInicial({ modoDoPainel: 'claro', sistemaClaro: false }), 'light');
  // A escolha geral (feita na lista de painéis) não passa por cima da identidade do dono.
  assert.equal(resolverTemaInicial({ modoDoPainel: 'escuro', escolhaGeral: 'light', sistemaClaro: true }), 'dark');
});

test('resolverTemaInicial: auto ou ausente mantém o comportamento de antes (escolha geral, depois sistema)', () => {
  for (const modoDoPainel of ['auto', undefined, null, '', 'lixo']) {
    assert.equal(resolverTemaInicial({ modoDoPainel, escolhaGeral: 'light', sistemaClaro: false }), 'light');
    assert.equal(resolverTemaInicial({ modoDoPainel, escolhaGeral: 'dark', sistemaClaro: true }), 'dark');
    assert.equal(resolverTemaInicial({ modoDoPainel, sistemaClaro: true }), 'light');
    assert.equal(resolverTemaInicial({ modoDoPainel, sistemaClaro: false }), 'dark');
  }
  assert.equal(resolverTemaInicial(), 'dark', 'sem nada, o escuro de sempre');
  assert.equal(resolverTemaInicial({ escolhaNoPainel: 'roxo', escolhaGeral: 'verde', sistemaClaro: true }), 'light', 'valor guardado inválido é ignorado');
});

test('a escolha do visitante é guardada por painel e não vaza pra outro', () => {
  assert.equal(chaveDoTemaDoPainel('pilates'), 'cd-theme:pilates');
  assert.notEqual(chaveDoTemaDoPainel('pilates'), chaveDoTemaDoPainel('vendas'));
  assert.equal(chaveDoTemaDoPainel(''), null);
  assert.equal(chaveDoTemaDoPainel(null), null);
  assert.equal(chaveParaGuardar('pilates'), 'cd-theme:pilates');
  assert.equal(chaveParaGuardar(null), CHAVE_GERAL, 'fora de um painel (lista, assistente) vale a escolha geral');
  assert.equal(CHAVE_GERAL, 'cd-theme');
});

test('idDoPainelNaUrl: só a página do painel tem id de painel', () => {
  assert.equal(idDoPainelNaUrl('/dashboard', '?id=pilates'), 'pilates');
  assert.equal(idDoPainelNaUrl('/dashboard.html', '?id=a-b&tab=x'), 'a-b');
  assert.equal(idDoPainelNaUrl('/dashboard', ''), null);
  assert.equal(idDoPainelNaUrl('/config.html', '?id=pilates'), null, 'editar no assistente não é abrir o painel');
  assert.equal(idDoPainelNaUrl('/', '?id=pilates'), null);
});

// ---------- o script inline (anti-piscar) decide igual à função pura ----------

function rodarInline(codigo, { pathname = '/dashboard', search = '', local = {}, sessao = {}, attrs = {}, sistemaClaro = false, menosMovimento = false, armazenamentoQuebrado = false }) {
  const atributos = { ...attrs };
  const dataset = {};
  const documentElement = {
    dataset,
    getAttribute: (n) => (n in atributos ? atributos[n] : null),
    hasAttribute: (n) => n in atributos,
    setAttribute: (n, v) => { atributos[n] = String(v); },
  };
  const guarda = (obj) => ({ getItem: (k) => { if (armazenamentoQuebrado) throw new Error('bloqueado'); return k in obj ? obj[k] : null; } });
  const matchMedia = (q) => ({ matches: /prefers-color-scheme: light/.test(q) ? sistemaClaro : (/prefers-reduced-motion/.test(q) ? menosMovimento : false) });
  const window = { matchMedia };
  vm.runInNewContext(codigo, {
    document: { documentElement }, window, matchMedia, location: { pathname, search }, URLSearchParams,
    localStorage: guarda(local), sessionStorage: guarda(sessao),
  });
  return { tema: dataset.theme, saudar: 'data-saudar' in atributos };
}

test('script inline: byte a byte igual nas quatro páginas, e é o único inline de cada uma', () => {
  const base = inlineDe(pagina('dashboard.html'));
  assert.ok(base.length > 100, 'achei o script inline');
  for (const nome of PAGINAS) {
    const html = pagina(nome);
    assert.equal(inlineDe(html), base, `${nome}: script inline diferente`);
    const inlines = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)];
    assert.equal(inlines.length, 1, `${nome}: nenhum script inline novo`);
  }
});

test('script inline: o hash liberado na CSP é o do script que está nas páginas', () => {
  const hash = createHash('sha256').update(inlineDe(pagina('dashboard.html')), 'utf8').digest('base64');
  const middleware = readFileSync(join(raiz, 'functions/_middleware.js'), 'utf8');
  assert.ok(middleware.includes(`'sha256-${hash}'`), `a CSP precisa liberar sha256-${hash}`);
});

test('script inline: resolve o tema igual à função pura em todas as combinações', () => {
  const codigo = inlineDe(pagina('dashboard.html'));
  const opcoes = [undefined, 'light', 'dark', 'lixo'];
  for (const escolhaNoPainel of opcoes) for (const modoDoPainel of [undefined, 'claro', 'escuro', 'auto']) {
    for (const escolhaGeral of opcoes) for (const sistemaClaro of [true, false]) {
      const local = {};
      if (escolhaNoPainel) local['cd-theme:pilates'] = escolhaNoPainel;
      if (escolhaGeral) local['cd-theme'] = escolhaGeral;
      const attrs = modoDoPainel ? { 'data-modo': modoDoPainel } : {};
      const r = rodarInline(codigo, { search: '?id=pilates', local, attrs, sistemaClaro });
      const esperado = resolverTemaInicial({ escolhaNoPainel, modoDoPainel, escolhaGeral, sistemaClaro });
      assert.equal(r.tema, esperado, JSON.stringify({ escolhaNoPainel, modoDoPainel, escolhaGeral, sistemaClaro }));
    }
  }
});

test('script inline: a escolha feita num painel não vale em outro nem na lista', () => {
  const codigo = inlineDe(pagina('dashboard.html'));
  const local = { 'cd-theme:pilates': 'light' };
  assert.equal(rodarInline(codigo, { search: '?id=pilates', local }).tema, 'light');
  assert.equal(rodarInline(codigo, { search: '?id=vendas', local }).tema, 'dark');
  assert.equal(rodarInline(codigo, { pathname: '/', search: '', local }).tema, 'dark');
  assert.equal(rodarInline(codigo, { pathname: '/config.html', search: '?id=pilates', local }).tema, 'dark');
});

test('script inline: liga a saudação só no painel, uma vez por sessão, e nunca com movimento reduzido', () => {
  const codigo = inlineDe(pagina('dashboard.html'));
  const attrs = { 'data-saudacao': 'Carla' };
  assert.equal(rodarInline(codigo, { search: '?id=pilates', attrs }).saudar, true);
  assert.equal(rodarInline(codigo, { search: '?id=pilates', attrs, menosMovimento: true }).saudar, false);
  assert.equal(rodarInline(codigo, { search: '?id=pilates', attrs, sessao: { [chaveDaSaudacao('pilates')]: '1' } }).saudar, false);
  assert.equal(rodarInline(codigo, { search: '?id=vendas', attrs, sessao: { [chaveDaSaudacao('pilates')]: '1' } }).saudar, true, 'cada painel saúda uma vez');
  assert.equal(rodarInline(codigo, { search: '?id=pilates', attrs: {} }).saudar, false, 'sem a marca do servidor, quem decide é o painel depois de carregar');
  assert.equal(rodarInline(codigo, { pathname: '/', attrs }).saudar, false);
});

test('script inline: armazenamento bloqueado não derruba a página (fica o tema marcado pelo servidor)', () => {
  const codigo = inlineDe(pagina('dashboard.html'));
  assert.doesNotThrow(() => rodarInline(codigo, { search: '?id=pilates', armazenamentoQuebrado: true }));
});
