// Carregamento: esqueleto no formato do painel (faixa, abas, indicadores, cartões), o plano dele
// a partir do modelo, e o estado de erro com o que fazer e "Tentar de novo".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { esqueletoHtml } from '../public/assets/js/lib/esqueleto.js';
import { erroHtml, explicarFalha } from '../public/assets/js/lib/estado-de-erro.js';
import { planoDoEsqueleto } from '../public/assets/js/dashboard.js';
import { modeloComAbas, modeloSemAbas } from './apoio/modelo-de-teste.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const conta = (html, trecho) => html.split(trecho).length - 1;

test('esqueletoHtml: sem saber nada do painel, desenha o formato geral', () => {
  const html = esqueletoHtml();
  assert.match(html, /class="esqueleto"/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Carregando o painel/, 'quem usa leitor de tela ouve que está carregando');
  assert.ok(html.includes('esq-faixa'), 'faixa do cabeçalho');
  assert.ok(html.includes('esq-abas'), 'barra de abas');
  assert.ok(conta(html, 'class="kpi esq-kpi') >= 4, 'células dos indicadores');
  assert.ok(conta(html, 'esq-linha-tabela') >= 4, 'linhas de tabela');
});

test('dashboard.html já traz o esqueleto geral (aparece antes de qualquer script)', () => {
  const html = readFileSync(join(raiz, 'public/dashboard.html'), 'utf8');
  assert.ok(html.includes(esqueletoHtml()), 'a marcação da página é a que a função monta');
  assert.ok(!/Carregando\.\.\.<\/p>/.test(html), 'saiu o texto solto "Carregando..."');
  assert.match(html, /class="progresso"/, 'barra fina de progresso no topo');
});

test('planoDoEsqueleto: modelo com abas vira esqueleto com as abas e os indicadores da aba que vai abrir', () => {
  const plano = planoDoEsqueleto(modeloComAbas, null);
  assert.deepEqual(plano.abas, ['Visão geral', 'Dados']);
  assert.equal(plano.kpis, 3);
  assert.equal(plano.heroi, 1, 'o número em destaque é o segundo indicador (posição 1)');
  assert.deepEqual(plano.blocos, [{ col: 8, tipo: 'resumo' }, { col: 4, tipo: 'ranking' }]);
  const dados = planoDoEsqueleto(modeloComAbas, 'dados');
  assert.equal(dados.kpis, 0);
  assert.deepEqual(dados.blocos, [{ col: null, tipo: 'table' }]);
});

test('planoDoEsqueleto: modelo sem abas não desenha barra de abas', () => {
  const plano = planoDoEsqueleto(modeloSemAbas, null);
  assert.deepEqual(plano.abas, []);
  assert.equal(plano.kpis, 2);
  assert.equal(plano.heroi, -1, 'faixa com menos de 3 indicadores não tem destaque');
  assert.deepEqual(plano.blocos, [{ col: 6, tipo: 'timeseries' }, { col: null, tipo: 'table' }]);
});

test('esqueletoHtml com plano: mesmas classes de grade do painel de verdade (não empurra nada quando o conteúdo entra)', () => {
  const html = esqueletoHtml(planoDoEsqueleto(modeloComAbas, null));
  assert.equal(conta(html, 'class="kpi esq-kpi'), 3);
  assert.equal(conta(html, 'kpi--hero'), 1);
  assert.match(html, /class="grid kpis" style="--kpi-cols:4"/, '3 indicadores + destaque em largura dupla = 4 colunas');
  assert.match(html, /class="dash-cell span-8"/);
  assert.match(html, /class="dash-cell span-4"/);
  assert.equal(conta(html, 'class="aba esq-aba"'), 2);
  const semAbas = esqueletoHtml(planoDoEsqueleto(modeloSemAbas, null));
  assert.ok(!semAbas.includes('esq-abas'));
  const semFaixa = esqueletoHtml({ ...planoDoEsqueleto(modeloSemAbas, null), comFaixa: false });
  assert.ok(!semFaixa.includes('esq-faixa'), 'aba de um grupo não tem faixa');
});

test('esqueletoHtml: nome de aba não vira HTML e não aparece como texto (é só a largura)', () => {
  const html = esqueletoHtml({ abas: ['<script>x</script>'], kpis: 1, heroi: -1, blocos: [] });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('script'));
});

// ---------- estado de erro ----------

test('erroHtml: diz o que aconteceu, o que fazer e sempre tem "Tentar de novo"', () => {
  const html = erroHtml({ titulo: 'Não deu para carregar os números', mensagem: 'A planilha não respondeu.', oQueFazer: 'Confira se o link continua público.', acao: { href: '/config.html?id=a', label: 'Reconfigurar' } });
  assert.match(html, /role="alert"/);
  assert.match(html, /<h2[^>]*>Não deu para carregar os números<\/h2>/);
  assert.match(html, /A planilha não respondeu\./);
  assert.match(html, /Confira se o link continua público\./);
  assert.match(html, /<button[^>]*data-tentar[^>]*>Tentar de novo<\/button>/);
  assert.match(html, /href="\/config\.html\?id=a"[^>]*>Reconfigurar</);
});

test('erroHtml: escapa tudo e nunca devolve tela vazia', () => {
  const html = erroHtml({ titulo: '<b>', mensagem: '<img src=x>', oQueFazer: '"x"' });
  assert.ok(!html.includes('<b>') && !html.includes('<img'));
  assert.match(erroHtml(), /Tentar de novo/);
  assert.match(erroHtml({ tentar: false, acao: { href: '/', label: 'Ver meus painéis' } }), /Ver meus painéis/);
  assert.ok(!/data-tentar/.test(erroHtml({ tentar: false, acao: { href: '/', label: 'Ver meus painéis' } })));
});

test('explicarFalha: falha de rede e falha da fonte viram mensagem com o que fazer', () => {
  const rede = explicarFalha(new TypeError('Failed to fetch'), 'dados');
  assert.match(rede.mensagem, /internet|conex/i);
  assert.ok(rede.oQueFazer.length > 10);
  const fonte = explicarFalha(new Error('A planilha não está pública.'), 'dados');
  assert.match(fonte.mensagem, /A planilha não está pública\./);
  assert.match(fonte.titulo, /números/);
  const config = explicarFalha(new Error('Dashboard não encontrado.'), 'painel');
  assert.match(config.titulo, /painel/);
  const semNada = explicarFalha(null, 'dados');
  assert.ok(semNada.titulo && semNada.mensagem && semNada.oQueFazer);
});
