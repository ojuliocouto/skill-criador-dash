// Cabeçalho de marca: faixa no topo do corpo com o nome do painel, o rótulo do domínio e o
// período dos dados, usando o logo da config quando ele existe e é seguro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { periodoDosDados, textoDoPeriodo, cabecalhoHtml, estadoDosDadosHtml } from '../public/assets/js/lib/cabecalho.js';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/assets/css/main.css'), 'utf8');

test('periodoDosDados: menor e maior data, em formato brasileiro, sem depender da ordem', () => {
  const rows = [{ D: '2026-09-20' }, { D: '2026-10-04' }, { D: '05/09/2026' }, { D: '' }, { D: 'lixo' }];
  assert.deepEqual(periodoDosDados(rows, { data: 'D' }, 'data'), { de: '05/09/2026', ate: '04/10/2026' });
});

test('periodoDosDados: sem coluna de data, sem linha ou sem data válida devolve null', () => {
  assert.equal(periodoDosDados([{ D: '2026-09-20' }], {}, 'data'), null);
  assert.equal(periodoDosDados([], { data: 'D' }, 'data'), null);
  assert.equal(periodoDosDados([{ D: 'x' }], { data: 'D' }, 'data'), null);
  assert.equal(periodoDosDados(null, { data: 'D' }, 'data'), null);
});

test('textoDoPeriodo: intervalo, dia único e vazio', () => {
  assert.equal(textoDoPeriodo({ de: '05/09/2026', ate: '04/10/2026' }), '05/09/2026 a 04/10/2026');
  assert.equal(textoDoPeriodo({ de: '05/09/2026', ate: '05/09/2026' }), '05/09/2026');
  assert.equal(textoDoPeriodo(null), '');
});

test('cabecalhoHtml: nome, domínio e período dos dados', () => {
  const html = cabecalhoHtml({ nome: 'Studio Equilíbrio - Anúncios', dominio: 'Marketing', periodo: { de: '05/09/2026', ate: '04/10/2026' } });
  assert.match(html, /class="faixa"/);
  assert.match(html, /<h1 class="faixa__nome">Studio Equilíbrio - Anúncios<\/h1>/);
  assert.match(html, />Marketing</);
  assert.match(html, /Período dos dados/);
  assert.match(html, /id="dashperiodo"[^>]*>05\/09\/2026 a 04\/10\/2026</);
  assert.ok(!html.includes('<img'), 'sem logo na config, sem imagem');
});

test('cabecalhoHtml: usa o logo da config quando é seguro; ignora src perigoso', () => {
  const com = cabecalhoHtml({ nome: 'Painel', dominio: 'Vendas', logo: 'https://exemplo.com/logo.png' });
  assert.match(com, /<img class="faixa__logo-img" alt="" src="https:\/\/exemplo\.com\/logo\.png"/);
  const perigoso = cabecalhoHtml({ nome: 'Painel', dominio: 'Vendas', logo: 'javascript:alert(1)' });
  assert.ok(!perigoso.includes('<img'));
  assert.ok(!perigoso.includes('javascript:'));
});

test('cabecalhoHtml: sem período (fonte sem data) a faixa não inventa intervalo', () => {
  const html = cabecalhoHtml({ nome: 'Painel', dominio: 'Estoque', periodo: null });
  assert.ok(!/Período dos dados/.test(html));
  assert.ok(!/undefined|null/.test(html));
});

test('cabecalhoHtml: escapa nome e domínio; nome vazio cai em "Dashboard"', () => {
  const html = cabecalhoHtml({ nome: '<script>x</script>', dominio: '"aspas"' });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.match(cabecalhoHtml({}), /<h1 class="faixa__nome">Dashboard<\/h1>/);
});

test('cabecalhoHtml: com `dados`, a faixa ganha a idade dos números e o botão Atualizar; sem, fica como antes', () => {
  const sem = cabecalhoHtml({ nome: 'Painel', dominio: 'Vendas', periodo: { de: '05/09/2026', ate: '04/10/2026' } });
  assert.ok(!sem.includes('dashatualizar'));
  const com = cabecalhoHtml({ nome: 'Painel', dominio: 'Vendas', periodo: { de: '05/09/2026', ate: '04/10/2026' }, dados: { texto: 'Atualizado há 3 min' } });
  assert.match(com, /id="dashatualizado"[^>]*role="status"[^>]*>Atualizado há 3 min</);
  assert.match(com, /<button class="dados-estado__botao" id="dashatualizar" type="button"><svg[^>]*aria-hidden="true"[\s\S]*?<\/svg><span class="dados-estado__rotulo">Atualizar<\/span><\/button>/);
  assert.match(com, /id="dashperiodo"/, 'o período continua lá');
  assert.match(estadoDosDadosHtml({ texto: '<b>', solto: true }), /dados-estado--solto/);
  assert.ok(!estadoDosDadosHtml({ texto: '<b>' }).includes('<b>'));
});

// ---------- CSS: faixa e abas dentro das regras de gosto ----------

const regra = (sel) => (css.match(new RegExp(`(^|\\n)\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)) || [])[2] || '';

test('CSS: a faixa tem tokens próprios nos dois temas', () => {
  for (const token of ['--faixa-bg', '--faixa-texto', '--faixa-texto-dim']) {
    assert.ok(css.split(token + ':').length - 1 >= 2, `${token} definido no tema escuro e no claro`);
  }
  assert.match(regra('.faixa'), /background:\s*var\(--faixa-bg\)/);
  assert.match(regra('.faixa'), /color:\s*var\(--faixa-texto\)/);
});

test('CSS: aba em pílula, com a ativa na cor de destaque (detalhe da cor em aba-ativa-cor.test.js)', () => {
  assert.match(regra('.aba[aria-selected="true"]'), /background:\s*var\(--accent-solido, var\(--accent\)\)/);
  assert.match(regra('.aba'), /border-radius:\s*999px/);
});

test('CSS: nada de gradiente, brilho, vidro nem rótulo espaçado nas regras novas', () => {
  const novas = css.slice(css.indexOf('/* Faixa de marca'));
  assert.ok(novas.length > 200, 'o bloco novo existe');
  assert.ok(!/gradient\(/.test(novas), 'sem gradiente');
  assert.ok(!/backdrop-filter|text-shadow|filter:\s*blur/.test(novas), 'sem vidro nem brilho');
  assert.ok(!/text-transform:\s*uppercase/.test(css), 'sem caixa alta');
  for (const m of novas.matchAll(/letter-spacing:\s*([^;]+);/g)) {
    assert.ok(/^-|^0|^normal/.test(m[1].trim()), `letter-spacing positivo (${m[1]}) é cara de rótulo espaçado`);
  }
});

test('CSS: resumo empilha por largura do próprio cartão (container), nunca rola a página', () => {
  assert.match(regra('.resumo'), /container-type:\s*inline-size/);
  assert.match(css, /@container resumo \(max-width:/);
  assert.match(regra('.resumo__scroll'), /overflow-x:\s*auto/);
});

// Print real em 1024 px (05/10/2026): 7 indicadores em 5 colunas deixavam a segunda linha com
// 2 cards e um bloco cinza do lado (o fundo da faixa aparecendo). Em tela média a faixa passa a
// ser flex com quebra: os cards da última linha crescem e ocupam a linha toda.
test('CSS: em tela média a faixa de indicadores preenche a última linha (sem bloco cinza)', () => {
  const novas = css.slice(css.indexOf('/* Faixa de marca'));
  const bloco = (novas.match(/@media \(max-width: 1100px\) \{([\s\S]*?)\n\}/) || [])[1] || '';
  assert.match(bloco, /\.grid\.kpis\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/);
  assert.match(bloco, /\.grid\.kpis > \*\s*\{[^}]*flex:\s*1 1 190px/);
});

// Print real em 1024 px: o par "tabela 8 colunas + calculadora 4 colunas" virava 8 + 6 e a
// calculadora caía sozinha pra linha de baixo, com um vazio do lado da tabela.
test('CSS: no tablet, o cartão de 4 colunas ao lado de um de 8 continua ao lado', () => {
  const novas = css.slice(css.indexOf('/* Faixa de marca'));
  assert.match(novas, /@media \(max-width: 1040px\) and \(min-width: 901px\) \{\s*\.dash-cell\.span-8 \+ \.dash-cell\.span-4\s*\{\s*grid-column:\s*span 4;/);
});
