// Frente visual da 3.9 (auditoria de 25/10/2026, média visual 5,8): abertura que respeita o tema
// e não atrasa o número, meta batida sem tingir o cartão, eixo do gráfico de área no zero,
// funil legível e celular com o primeiro número na primeira tela. Travas puras e de CSS; a prova
// medida (prints a 1440 e 390) fica no relatório da frente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { TEMPOS, duracaoDaAbertura, chaveDaContagem, deveContar } from '../public/assets/js/lib/saudacao.js';
import { TEMPOS_DO_MARCO, DURACAO_TOTAL_DO_MARCO } from '../public/assets/js/lib/meta-batida.js';
import { render as renderTimeseries, niceScale, rotuloDoEixo } from '../public/assets/js/widgets/timeseries.js';
import { render as renderFunnel, larguraDasEtapas } from '../public/assets/js/widgets/funnel.js';
import { cabecalhoHtml } from '../public/assets/js/lib/cabecalho.js';
import { alternarFiltros, rotuloDoBotao } from '../public/assets/js/lib/filtros-celular.js';
import { textoDoPeriodoCurto } from '../public/assets/js/lib/cabecalho.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => readFileSync(join(raiz, rel), 'utf8');
const semComentario = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

// ---------------------------------------------------------------- 1. abertura

test('abertura: a saudação é curta (cortina desce antes de 0,8 s e tudo assenta antes de 1,8 s)', () => {
  assert.ok(TEMPOS.revelar <= 800, `revelar em ${TEMPOS.revelar} ms`);
  assert.ok(duracaoDaAbertura() <= 1800, `abertura de ${duracaoDaAbertura()} ms`);
});

test('abertura: saudação só na primeira visita do aparelho (localStorage), decidida antes do primeiro quadro', () => {
  const boot = ler('public/assets/js/lib/cobertura-boot.js');
  assert.match(boot, /localStorage\.getItem\(['"]cd-saudou:['"]\s*\+/, 'o boot lê a marca do aparelho');
  assert.match(boot, /removeAttribute\(['"]data-saudar['"]\)/, 'e desliga a saudação de quem já foi saudado');
  const abertura = ler('public/assets/js/lib/abertura.js');
  assert.match(abertura, /localStorage\.setItem\(chaveDaSaudacao/, 'marca o aparelho ao saudar');
});

test('abertura: a folha da saudação segue o tema (clara no claro), sem preto fixo', () => {
  const css = semComentario(ler('public/assets/css/presenca.css'));
  const folha = (css.match(/(^|\n)\.saudacao__folha\s*\{[^}]*\}/) || [''])[0];
  assert.ok(folha, 'regra da folha');
  assert.ok(!/#0a0c10/i.test(folha), 'a folha não é mais preta fixa');
  assert.match(folha, /background:\s*var\(--bg\)/, 'a folha usa o fundo do tema');
  assert.match(css, /\[data-theme="light"\][^{]*\.saudacao__ola[^{]*\{[^}]*var\(--accent-text\)/, '"Olá," calibrado pro fundo claro');
});

test('contagem: só na primeira carga do aparelho e nunca com movimento reduzido', () => {
  assert.equal(chaveDaContagem('pilates'), 'cd-contou:pilates');
  assert.equal(deveContar({ jaContou: false, menosMovimento: false }), true);
  assert.equal(deveContar({ jaContou: true, menosMovimento: false }), false);
  assert.equal(deveContar({ jaContou: false, menosMovimento: true }), false);
  const boot = ler('public/assets/js/lib/cobertura-boot.js');
  assert.match(boot, /cd-contou:/, 'o boot já sabe, no primeiro quadro, se o aparelho viu a contagem');
  assert.match(boot, /setAttribute\(['"]data-sem-contagem['"]/);
  const css = semComentario(ler('public/assets/css/presenca.css'));
  assert.match(css, /html\[data-sem-contagem\] \.kpi__conta\s*\{[^}]*display:\s*none/, 'visor da contagem some');
  assert.match(css, /html\[data-sem-contagem\] \.kpi__value\.is-contando\s*\{[^}]*color:\s*var\(--text\)/, 'número final já visível');
});

// ---------------------------------------------------------------- 2. meta batida

test('meta batida: nada tinge o cartão; o sinal é a barra e o selo, curto', () => {
  const js = ler('public/assets/js/lib/meta-batida.js').replace(/\/\/.*$/gm, '');
  assert.ok(!/kpi__onda/.test(js), 'sem camada que cobre o cartão');
  assert.ok(!/scale\((1\.[2-9]|[2-9])/.test(js), 'nada cresce mais de 10%');
  const css = semComentario(ler('public/assets/css/efeitos.css'));
  assert.ok(!/\.kpi__onda/.test(css), 'sem CSS da luz do cartão');
  assert.ok(DURACAO_TOTAL_DO_MARCO <= 1300, `marco de ${DURACAO_TOTAL_DO_MARCO} ms`);
  assert.ok(Number.isFinite(TEMPOS_DO_MARCO.selo) && Number.isFinite(TEMPOS_DO_MARCO.clarao));
});

// ---------------------------------------------------------------- 3. gráfico de área

const serie = (n, base, amp) => Array.from({ length: n }, (_, i) => ({
  date: new Date(Date.UTC(2026, 7, 26 + i)).toISOString().slice(0, 10),
  value: base + Math.round(amp * Math.sin(i / 3)),
}));

test('área: eixo de valor começa em zero quando todos os valores são positivos', () => {
  const html = renderTimeseries({ title: 'Investimento' }, serie(10, 1700, 500));
  const ticks = [...html.matchAll(/class="chart__ytick"[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.equal(ticks[0], '0', `primeiro tick ${ticks[0]}`);
  const base = html.match(/<polygon class="chart__area" points="[^ ]+,([\d.]+) /);
  const zero = html.match(/<line class="chart__grid"[^>]*y1="([\d.]+)"/);
  assert.equal(base[1], zero[1], 'a área fecha na linha do zero');
});

test('área: o topo do eixo fica perto do maior valor (sem meio gráfico vazio)', () => {
  for (const [max, teto] of [[2300, 3000], [230, 300], [15, 15], [1591.37, 2000]]) {
    const { niceMax, ticks } = niceScale(0, max, 4);
    assert.ok(niceMax <= teto, `máximo ${max}: eixo até ${niceMax} (teto ${teto})`);
    assert.ok(ticks.length >= 3 && ticks.length <= 6, `${ticks.length} marcas`);
  }
});

test('área: série com negativo continua mostrando o negativo', () => {
  const html = renderTimeseries({}, [{ date: '2026-01-01', value: -50 }, { date: '2026-01-02', value: 80 }]);
  const ticks = [...html.matchAll(/class="chart__ytick"[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.ok(ticks.some((t) => /^[-−]/.test(t)), `ticks ${ticks.join(' ')}`);
});

test('área: série longa tem datas no meio do eixo e esconde os pontos (só o dia em foco aparece)', () => {
  const html = renderTimeseries({ col: 12 }, serie(61, 1700, 500));
  const datas = [...html.matchAll(/class="chart__xtick"[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.ok(datas.length >= 4 && datas.length <= 7, `${datas.length} datas no eixo`);
  assert.match(html, /class="chart chart--timeseries chart--denso"/);
  const css = semComentario(ler('public/assets/css/main.css') + ler('public/assets/css/efeitos.css'));
  assert.match(css, /\.chart--denso \.chart__point[^{]*\{[^}]*display:\s*none/);
});

// ---------------------------------------------------------------- 4. funil

const funil = [
  { label: 'Impressões', value: 3609735 },
  { label: 'Cliques', value: 51601 },
  { label: 'Leads', value: 9221 },
  { label: 'Conversões', value: 305 },
];

test('funil: etapas muito menores que a primeira ganham escala logarítmica dita na tela, com barra legível', () => {
  const { larguras, log } = larguraDasEtapas(funil.map((s) => s.value));
  assert.equal(log, true);
  assert.equal(larguras[0], 100);
  for (const w of larguras) assert.ok(w >= 8, `barra de ${w}%`);
  for (let i = 1; i < larguras.length; i++) assert.ok(larguras[i] < larguras[i - 1], 'a ordem das etapas continua visível');
  const html = renderFunnel({ title: 'Funil' }, funil);
  assert.match(html, /escala logarítmica/);
  for (const v of ['3.609.735', '51.601', '9.221', '305']) assert.ok(html.includes(v), `valor ${v} na tela`);
  assert.match(html, /1,43% das impressões|1,43%/);
  assert.equal((html.match(/class="funnel__conv"/g) || []).length, 3, 'taxa entre cada par de etapas');
});

test('funil: etapas comparáveis seguem lineares, sem aviso', () => {
  const { larguras, log } = larguraDasEtapas([1000, 250, 60]);
  assert.equal(log, false);
  assert.deepEqual(larguras, [100, 25, 6]);
  assert.ok(!/logarítmica/.test(renderFunnel({}, [{ label: 'A', value: 1000 }, { label: 'B', value: 250 }, { label: 'C', value: 60 }])));
});

test('funil: zero continua zero (sem barra fantasma) e sem NaN', () => {
  const { larguras } = larguraDasEtapas([500, 0]);
  assert.equal(larguras[1], 0);
  assert.ok(!/NaN|Infinity/.test(renderFunnel({}, [{ label: 'A', value: 0 }, { label: 'B', value: 0 }])));
});

// ---------------------------------------------------------------- 5. celular

test('celular: a faixa traz o botão Filtros, que controla a barra de filtros', () => {
  const html = cabecalhoHtml({ nome: 'Painel', dominio: 'Marketing', periodo: { de: '01/10/2026', ate: '25/10/2026' }, dados: { texto: 'Atualizado agora' } });
  assert.match(html, /<button class="filtros-abrir"[^>]*aria-controls="filterbar"[^>]*aria-expanded="false"/);
  assert.ok(!/filtros-abrir/.test(cabecalhoHtml({ nome: 'Painel' })), 'sem dados (prévia), sem botão');
});

test('celular: filtros recolhidos atrás do botão e cabeçalho compacto a 620 px ou menos', () => {
  const css = semComentario(ler('public/assets/css/celular.css'));
  const celular = css.slice(css.indexOf('@media (max-width: 620px)'));
  assert.match(celular, /:has\(\.filtros-abrir\[aria-expanded="false"\]\)[^{]*#filterbar[^{]*\{[^}]*display:\s*none/);
  assert.match(celular, /\.faixa__dominio[^{]*\{[^}]*display:\s*none/);
  assert.ok(!/\.faixa__(marca|textos|nome)[^{]*\{[^}]*display:\s*none/.test(celular), 'o h1 do painel nunca sai do leitor de tela (axe: page-has-heading-one)');
  assert.match(celular, /\.faixa__periodo-rotulo[^{]*\{[^}]*display:\s*none/);
  assert.match(css, /@media \(min-width: 621px\)[^{]*\{[^}]*\.filtros-abrir[^{]*\{[^}]*display:\s*none/);
});

test('celular: o botão alterna aberto e fechado e diz o estado pro leitor de tela', () => {
  assert.deepEqual(alternarFiltros(false), { aberto: true, expandido: 'true', rotulo: 'Fechar' });
  assert.deepEqual(alternarFiltros(true), { aberto: false, expandido: 'false', rotulo: 'Filtros' });
  assert.match(ler('public/dashboard.html'), /<script type="module" src="\/assets\/js\/lib\/filtros-celular\.js"><\/script>/);
});

test('celular: com filtro aplicado, o botão diz qual (o número na tela está filtrado); a faixa diz que o período é dos dados', () => {
  assert.equal(rotuloDoBotao({ aberto: false }), 'Filtros');
  assert.equal(rotuloDoBotao({ aberto: true, atalho: '7 dias' }), 'Fechar');
  assert.equal(rotuloDoBotao({ aberto: false, aplicado: true, atalho: '7 dias' }), '7 dias');
  assert.equal(rotuloDoBotao({ aberto: false, aplicado: true, atalho: 'Tudo', dims: ['', 'Meta Ads'] }), 'Meta Ads');
  assert.equal(rotuloDoBotao({ aberto: false, aplicado: true }), 'Filtrado');
  assert.equal(textoDoPeriodoCurto({ de: '26/08/2026', ate: '25/10/2026' }), 'Dados de 26/08 a 25/10');
  assert.equal(textoDoPeriodoCurto({ de: '20/12/2025', ate: '05/01/2026' }), 'Dados de 20/12/2025 a 05/01/2026');
});

// ---------------------------------------------------------------- 6. achados extras (teste de aluno de 25/10)

test('cabeçalho: sem bloco preto repetindo o topo; a faixa vira o título da página, no tema de cada um', () => {
  const css = semComentario(ler('public/assets/css/main.css'));
  const temas = [...css.matchAll(/--faixa-bg:\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.ok(temas.length >= 2, 'token nos dois temas');
  for (const v of temas) assert.equal(v, 'transparent', `faixa com fundo ${v}`);
  assert.match(css, /\.faixa__dominio\s*\{[^}]*display:\s*none/, 'a área já está no selo da barra do topo');
  const presenca = semComentario(ler('public/assets/css/presenca.css'));
  assert.ok(!/outline:\s*2px solid #fff/.test(presenca + ler('public/assets/css/celular.css')), 'foco branco sumiria no fundo claro');
});

test('fundo: as linhas onduladas ficam bem sutis atrás do conteúdo', () => {
  const css = semComentario(ler('public/assets/css/presenca.css'));
  const op = Number((css.match(/\.fundo__linhas\s*\{[^}]*opacity:\s*([\d.]+)/) || [])[1]);
  assert.ok(op > 0 && op <= 0.35, `opacidade das linhas ${op}`);
});

test('eixo de valor diz a unidade: R$ em dinheiro, % em taxa, mil quando passa de 10 mil', () => {
  assert.equal(rotuloDoEixo(2000, 'currency', 3000), 'R$ 2.000');
  assert.equal(rotuloDoEixo(20000, 'currency', 30000), 'R$ 20 mil');
  assert.equal(rotuloDoEixo(0.02, 'percent', 0.03), '2%');
  assert.equal(rotuloDoEixo(150, 'number', 300), '150');
  assert.equal(rotuloDoEixo(0, 'currency', 3000), 'R$ 0');
  const html = renderTimeseries({ format: 'currency' }, serie(10, 1700, 500));
  const ticks = [...html.matchAll(/class="chart__ytick"[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.ok(ticks.every((t) => t.startsWith('R$ ')), ticks.join(' | '));
});

test('celular: as cinco abas cabem em 390 px sem cortar "Dados" (menos respiro lateral, alvo de 44 px mantido)', () => {
  const css = semComentario(ler('public/assets/css/celular.css'));
  const ultima = [...css.matchAll(/(^|\n)\s*\.aba\s*\{([^}]*)\}/g)].pop();
  assert.ok(ultima, 'regra da aba no celular');
  const pad = Number((ultima[2].match(/padding:\s*0 (\d+)px/) || [])[1]);
  assert.ok(pad <= 9, `respiro lateral de ${pad}px`);
  assert.match(ultima[2], /min-height:\s*44px/);
});
