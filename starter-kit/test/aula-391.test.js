// 3.9.1, achados do teste de aluno no clone limpo da 3.9.0 (25/10/2026), na véspera da aula.
// Travas puras e de CSS; a prova medida (prints a 1440 e 390) fica no relatório da rodada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { render as renderKpi } from '../public/assets/js/widgets/kpi.js';
import { renderKpiBlock } from '../public/assets/js/dashboard.js';
import { render as renderResumo } from '../public/assets/js/widgets/resumo.js';
import { render as renderTimeseries } from '../public/assets/js/widgets/timeseries.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => readFileSync(join(raiz, rel), 'utf8');
const semComentario = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const css = (arq) => semComentario(ler(`public/assets/css/${arq}`));
// Bloco de @media (max-width: N px) inteiro (com as chaves aninhadas).
function blocoMedia(texto, largura) {
  const partes = [];
  const re = new RegExp(`@media \\(max-width: ${largura}px\\)\\s*\\{`, 'g');
  let m;
  while ((m = re.exec(texto))) {
    let i = m.index + m[0].length; let prof = 1;
    while (prof && i < texto.length) { if (texto[i] === '{') prof++; else if (texto[i] === '}') prof--; i++; }
    partes.push(texto.slice(m.index, i));
  }
  return partes.join('\n');
}

// ---------------------------------------------------------------- 2. herói no celular

test('celular: o cartão em destaque abre a faixa em largura cheia; os outros ficam 2 por linha', () => {
  const cel = blocoMedia(css('main.css') + css('celular.css'), 560);
  assert.match(cel, /\.grid\.kpis > \.kpi--hero\s*\{[^}]*flex-basis:\s*100%/, 'herói em largura cheia');
  assert.match(cel, /\.grid\.kpis > \.kpi--hero\s*\{[^}]*order:\s*-1/, 'herói no topo da faixa');
  // O cartão ímpar do fim continua ocupando a linha (sem bloco cinza), mas o valor dele tem teto de 22 px e o do herói vai a 34.
});

// ---------------------------------------------------------------- 3. vão entre número e minigráfico

test('cartão vizinho: o minigráfico vem logo abaixo do número (o cartão não estica o vão)', () => {
  const regra = (css('main.css').match(/(^|\n)\.kpi--mini \.kpi__linha\s*\{([^}]*)\}/) || [])[2] || '';
  assert.match(regra, /flex:\s*0 0 auto/, 'a linha do minigráfico não cresce');
  assert.ok(!/align-items:\s*flex-end/.test(regra), 'nada empurra o traço pro pé');
});

// ---------------------------------------------------------------- 4. "Tudo" sem seta

const COLMAP = { data: 'Data', canal: 'Canal', investimento: 'Investimento', leads: 'Leads', conversoes: 'Conversoes', receita: 'Receita', impressoes: 'Impressoes', cliques: 'Cliques' };
const itens = ['CPA', 'investimento', 'leads', 'CPL'].map((k) => ({ widget: 'kpi', props: { metricKey: k } }));
const computed = { CPA: 300, investimento: 1000, leads: 50, CPL: 20, conversoes: 3 };

test('herói sem comparação (Tudo): uma dica discreta diz como ver a variação, só no herói', () => {
  const html = renderKpiBlock(itens, { ...marketing, primaryMetric: 'CPA' }, computed, {}, {}, null, {}, { semComparacao: 'Escolha um período para comparar' });
  const heroi = html.slice(html.indexOf('kpi--hero'), html.indexOf('</div></div>', html.indexOf('kpi--hero')) + 12);
  assert.match(heroi, /class="kpi__trend is-neutral kpi__trend--dica">Escolha um período para comparar</);
  assert.equal((html.match(/kpi__trend--dica/g) || []).length, 1, 'só no herói');
});

test('com seta de verdade, a dica não aparece', () => {
  const trends = { CPA: { text: '▼ 3,00%', good: true, rotulo: 'vs. 7 dias anteriores' } };
  const html = renderKpiBlock(itens, { ...marketing, primaryMetric: 'CPA' }, computed, {}, trends, null, {}, { semComparacao: 'Escolha um período para comparar' });
  assert.ok(!/kpi__trend--dica/.test(html));
});

test('kpi: a dica entra no lugar da seta e nunca junto', () => {
  assert.match(renderKpi({ label: 'CPA', hero: true, dica: 'Escolha um período para comparar' }, 10), /kpi__trend--dica/);
  assert.ok(!/kpi__trend--dica/.test(renderKpi({ label: 'CPA', hero: true, dica: 'x', trend: { text: '▲ 1%', good: true } }, 10)));
});

// ---------------------------------------------------------------- 5. ondas do fundo

test('fundo: as ondas saem do miolo (máscara que só deixa as margens) e ficam bem fracas', () => {
  const p = css('presenca.css');
  const regra = (p.match(/(^|\n)\.fundo__linhas\s*\{([^}]*)\}/) || [])[2] || '';
  assert.match(regra, /mask-image:\s*linear-gradient\(to right, #000[^;]*transparent[^;]*transparent[^;]*#000\)/);
  const op = Number((regra.match(/opacity:\s*([\d.]+)/) || [])[1]);
  assert.ok(op > 0 && op <= 0.2, `opacidade ${op}`);
});

// ---------------------------------------------------------------- 6. atalhos na gaveta do celular

test('celular: os atalhos de período quebram em 2 linhas na gaveta (nada escondido nem cortado)', () => {
  const cel = blocoMedia(css('celular.css'), 620);
  const regra = (cel.match(/\.atalhos\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(regra, /flex-wrap:\s*wrap/);
  assert.match(regra, /overflow:\s*visible/);
  assert.match(cel, /\.atalho\s*\{[^}]*flex:\s*1 1 calc\(33\.3\d*% - \d+px\)/, '3 por linha');
});

// ---------------------------------------------------------------- 7. legenda de cor

const dadosResumo = (tons) => ({
  ok: true,
  colunas: [{ key: 'CPA', label: 'CPA', format: 'currency' }],
  linhas: tons.map((t, i) => ({ label: `L${i}`, valores: { CPA: 10 + i }, tons: t ? { CPA: t } : {} })),
  total: { label: 'Total', valores: { CPA: 11 } }, dimLabel: 'Canal',
});

test('legenda de cor: só fala da cor que aparece na tabela', () => {
  const soRuim = renderResumo({}, dadosResumo(['ruim', null]));
  assert.match(soRuim, /Vermelho: pior que o total\./);
  assert.ok(!/Verde/.test(soRuim));
  const soBom = renderResumo({}, dadosResumo(['bom', null]));
  assert.match(soBom, /Verde: melhor que o total\./);
  assert.ok(!/Vermelho/.test(soBom));
  assert.match(renderResumo({}, dadosResumo(['bom', 'ruim'])), /Verde: melhor que o total\. Vermelho: pior\./);
  assert.ok(!/Verde|Vermelho/.test(renderResumo({}, dadosResumo([null, null]))));
});

// ---------------------------------------------------------------- 8. fonte do eixo

test('eixo do gráfico: marcas com 14 unidades (12 px ou mais na tela, mesmo com o desenho reduzido)', () => {
  const regra = (css('main.css').match(/\.chart__ytick, \.chart__xtick\s*\{([^}]*)\}/) || [])[1] || '';
  const tam = Number((regra.match(/font-size:\s*([\d.]+)px/) || [])[1]);
  assert.ok(tam >= 14, `fonte do eixo ${tam}`);
  const html = renderTimeseries({ format: 'currency', col: 12 }, Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, value: 1000 + i * 40 })));
  const vb = html.match(/viewBox="0 0 (\d+) (\d+)"/);
  assert.ok(Number(vb[2]) >= 250, 'altura do desenho cabe a data maior embaixo');
});
