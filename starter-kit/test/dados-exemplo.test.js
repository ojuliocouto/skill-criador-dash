// Testes dos DADOS DE EXEMPLO (examples/*.csv) e do contrato de layout que eles
// exercitam. Sao os arquivos que o aluno sobe no primeiro teste do dashboard:
// se o exemplo for pobre, a tela nasce quebrada mesmo com o codigo correto.
//
// Cobre dois defeitos encontrados no teste na pele do aluno:
//   P3: estoque-exemplo.csv tinha as 10 linhas na MESMA data, entao o widget
//       "Faturamento no tempo" virava um ponto solto e nenhum KPI ganhava o
//       badge "vs. inicio" (a comparacao precisa de pelo menos 2 datas).
//   P4: os dois rankings do financeiro listavam categoria com valor agregado
//       zero (categoria de despesa no ranking de entradas e vice-versa),
//       deixando 5 das 7 barras vazias na tela.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseCSV } from '../functions/lib/csv.mjs';
import { timeSeries, groupBy } from '../public/assets/js/lib/metrics.js';
import { splitByPeriod, buildTrends } from '../public/assets/js/dashboard.js';
import { template as estoque } from '../public/assets/js/templates/estoque.js';
import { template as financeiro } from '../public/assets/js/templates/financeiro.js';
import { registry } from '../public/assets/js/widgets/index.js';

const EXAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples');

function loadExample(name) {
  return parseCSV(readFileSync(join(EXAMPLES_DIR, name), 'utf8')).rows;
}

function distinctDates(rows, column = 'Data') {
  return [...new Set(rows.map((r) => String(r[column] || '').trim()).filter(Boolean))];
}

// colMap = slot semantico -> coluna real do CSV (o que o automap monta na tela).
const COL_ESTOQUE = {
  data: 'Data',
  produto: 'Produto',
  categoria: 'Categoria',
  quantidade: 'Quantidade Vendida',
  estoque: 'Estoque Atual',
  valor: 'Faturamento',
};
const COL_FINANCEIRO = { data: 'Data', categoria: 'Categoria', entrada: 'Entrada', saida: 'Saída' };

// ---------- P3: serie temporal dos exemplos ----------

test('todo exemplo espalha as linhas por pelo menos 5 datas distintas', () => {
  const arquivos = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.csv')).sort();
  assert.ok(arquivos.length >= 5, 'os 5 dominios tem exemplo');
  for (const arquivo of arquivos) {
    const datas = distinctDates(loadExample(arquivo));
    assert.ok(
      datas.length >= 5,
      `${arquivo}: ${datas.length} data(s) distinta(s), o grafico no tempo precisa de 5 ou mais`,
    );
  }
});

test('estoque-exemplo.csv: 5 ou 6 datas dentro da janela 06/07 a 11/07/2026', () => {
  const rows = loadExample('estoque-exemplo.csv');
  const datas = distinctDates(rows).sort();
  assert.ok(datas.length >= 5 && datas.length <= 6, `datas distintas: ${datas.length} (esperado 5 ou 6)`);
  const janela = ['06/07/2026', '07/07/2026', '08/07/2026', '09/07/2026', '10/07/2026', '11/07/2026'];
  for (const d of datas) assert.ok(janela.includes(d), `data fora da janela: ${d}`);
});

test('estoque-exemplo.csv: "Faturamento no tempo" rende varios pontos, nao um ponto solto', () => {
  const rows = loadExample('estoque-exemplo.csv');
  const pontos = timeSeries(rows, COL_ESTOQUE, 'data', 'valor', 'sum');
  assert.ok(pontos.length >= 5, `pontos na serie: ${pontos.length} (esperado 5 ou mais)`);
  // Valores diferentes entre si: com um valor unico o eixo Y abriria uma faixa
  // artificial (o caso do "meio centavo de intervalo").
  const valores = new Set(pontos.map((p) => p.value));
  assert.ok(valores.size >= 3, 'a curva varia ao longo dos dias');
});

test('estoque-exemplo.csv: KPIs ganham o badge "vs. inicio"', () => {
  const rows = loadExample('estoque-exemplo.csv');
  const { current, previous } = splitByPeriod(rows, COL_ESTOQUE, 'data');
  assert.ok(previous && previous.length > 0, 'ha periodo anterior para comparar');
  const trends = buildTrends(estoque.metrics, current, previous, COL_ESTOQUE);
  assert.ok(Object.keys(trends).length > 0, 'pelo menos um KPI mostra tendencia');
});

test('estoque-exemplo.csv: continua coerente (produtos, categorias e valores)', () => {
  const rows = loadExample('estoque-exemplo.csv');
  assert.equal(rows.length, 10, 'segue com as 10 linhas');
  const produtos = new Set(rows.map((r) => r.Produto));
  assert.equal(produtos.size, 10, 'nenhum produto repetido');
  const categorias = new Set(rows.map((r) => r.Categoria));
  assert.deepEqual([...categorias].sort(), ['Bebidas', 'Limpeza', 'Mercearia']);
  const faturamento = groupBy(rows, COL_ESTOQUE, 'categoria', 'valor', 'sum');
  assert.equal(faturamento.reduce((a, b) => a + b.value, 0), 25870, 'faturamento total preservado');
  for (const r of rows) {
    assert.ok(Number(r['Quantidade Vendida']) > 0, `${r.Produto}: quantidade positiva`);
    assert.ok(Number(r['Estoque Atual']) > 0, `${r.Produto}: estoque positivo`);
  }
});

// ---------- P4: rankings do financeiro sem categoria zerada ----------

test('financeiro: os dois rankings por categoria pedem hideZeros no layout', () => {
  const rankings = financeiro.layout.filter((item) => item.widget === 'ranking');
  assert.equal(rankings.length, 2, 'o financeiro tem dois rankings');
  for (const item of rankings) {
    assert.equal(
      item.props.hideZeros,
      true,
      `"${item.props.title}" precisa de hideZeros para nao listar categoria zerada`,
    );
  }
});

// REGRA DE OURO: este teste tem que passar pelo CAMINHO REAL (registry.ranking.toHtml,
// o mesmo que o dashboard.js chama pra renderizar a tela), nunca reimplementar o
// filtro de hideZeros e testar a reimplementacao. A versao anterior deste teste
// aplicava o proprio filtro (`hideZeros ? bruto.filter(...) : bruto`) e validava
// contra ele mesmo, sem nunca chamar o widget: passava verde com hideZeros sendo
// um prop morto (ninguem lia) e a tela mostrando as barras zeradas de verdade.
function findMetricDef(template, key) {
  const list = Array.isArray(template.metrics) ? template.metrics : [];
  return list.find((m) => m.key === key);
}
const card = (_title, inner) => `<div class="card">${inner}</div>`;

test('financeiro: o HTML que o widget de ranking devolve nao lista a categoria zerada do outro lado do caixa', () => {
  const rows = loadExample('financeiro-exemplo.csv');
  const dataset = { rows, columns: ['Data', 'Categoria', 'Entrada', 'Saída'] };
  const esperado = {
    'Saídas por categoria': {
      visiveis: ['Aluguel', 'Energia e água', 'Folha de pagamento', 'Fornecedor', 'Impostos'],
      ausentes: ['Vendas atacado', 'Vendas balcão'],
    },
    'Entradas por categoria': {
      visiveis: ['Vendas atacado', 'Vendas balcão'],
      ausentes: ['Aluguel', 'Energia e água', 'Folha de pagamento', 'Fornecedor', 'Impostos'],
    },
  };
  const rankings = financeiro.layout.filter((item) => item.widget === 'ranking');
  assert.equal(rankings.length, 2, 'o financeiro tem dois rankings');
  for (const item of rankings) {
    const { title } = item.props;
    // Chama o widget de verdade, com o MESMO ctx que dashboard.js monta (renderSingle).
    const html = registry.ranking.toHtml(item, {
      template: financeiro,
      dataset,
      colMap: COL_FINANCEIRO,
      findMetricDef,
      card,
    });
    for (const nome of esperado[title].ausentes) {
      assert.ok(!html.includes(nome), `${title}: "${nome}" e categoria zerada, nao pode aparecer no HTML do widget`);
    }
    for (const nome of esperado[title].visiveis) {
      assert.ok(html.includes(nome), `${title}: "${nome}" precisa aparecer no HTML do widget`);
    }
  }
});
