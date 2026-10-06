// Carregamento: o painel desenhado em blocos vazios, no formato do painel de verdade, enquanto
// a configuração e os números chegam. ESM, puro (monta string HTML).
//
// As grades são as MESMAS classes do painel (.faixa, .abas, .grid.kpis, .kpi, .dash-grid,
// .dash-cell, .card): cada bloco ocupa o lugar que o conteúdo vai ocupar, então nada pula
// quando o conteúdo entra. Os blocos internos (esq-*) são só barras com a altura da linha de
// texto que representam. Texto nenhum da pessoa entra aqui: o nome da aba vira só a largura.

// Altura aproximada do miolo de cada tipo de cartão (px), medida no painel de verdade.
const ALTURA_DO_BLOCO = { resumo: 265, table: 420, timeseries: 276, ranking: 196, funnel: 220, meta: 316 };
const PADRAO = Object.freeze({
  abas: ['Visão geral', 'Canais', 'Evolução', 'Funil', 'Dados'],
  kpis: 4, heroi: -1, colunas: 4, comFaixa: true, comFiltro: true, comAtualizar: true,
  filtros: { datas: true, campos: 1 },
  blocos: [{ col: 8, tipo: 'resumo' }, { col: 4, tipo: 'meta' }],
});
const SPANS = new Set([3, 4, 5, 6, 7, 8]);

const barra = (classe, estilo = '') => `<span class="esq-barra ${classe}"${estilo ? ` style="${estilo}"` : ''}></span>`;

function faixa(comAtualizar) {
  const periodo =
    `<div class="faixa__periodo">` +
      `<span class="faixa__periodo-rotulo">${barra('esq-barra--texto', 'width:112px')}</span>` +
      `<span class="faixa__periodo-valor">${barra('esq-barra--texto', 'width:186px')}</span>` +
    `</div>`;
  // Mesmo arranjo da faixa de verdade: período e, ao lado, a idade dos números com o botão.
  const lado = comAtualizar
    ? `<div class="faixa__lado">${periodo}<div class="dados-estado"><span class="dados-estado__texto">${barra('esq-barra--texto', 'width:104px')}</span>${barra('esq-barra--botao')}</div></div>`
    : periodo;
  return (
    `<div class="faixa esq-faixa">` +
      `<div class="faixa__marca"><div class="faixa__textos">` +
        `<div class="faixa__nome">${barra('esq-barra--titulo')}</div>` +
        `<p class="faixa__dominio">${barra('esq-barra--texto', 'width:92px')}</p>` +
      `</div></div>` +
      lado +
    `</div>`
  );
}

function abas(nomes) {
  if (!nomes.length) return '';
  // A largura acompanha o tamanho do nome (meio "em" por letra, a média da fonte), sem escrever o nome.
  const botoes = nomes.map((n) => {
    const letras = Math.max(4, Math.min(22, String(n == null ? '' : n).length));
    return `<span class="aba esq-aba">${barra('esq-barra--texto', `width:${letras * 0.5}em`)}</span>`;
  }).join('');
  return `<div class="abas esq-abas">${botoes}</div>`;
}

// Filtros: dois campos de data (36 px de altura), um seletor por campo de agrupar (38 px) e o
// botão de limpar. Quantos existem depende do modelo e das colunas ligadas (plano.filtros).
function filtro({ datas = true, campos = 1 } = {}) {
  const campo = (largura, altura) =>
    `<div class="fb-field"><span class="fb-label">${barra('esq-barra--texto', 'width:34px')}</span>${barra('esq-barra--campo', `width:${largura}px;height:${altura}px`)}</div>`;
  const pecas = [];
  if (datas) pecas.push(campo(132, 36), campo(132, 36));
  for (let i = 0; i < Math.max(0, Math.min(4, Number(campos) || 0)); i += 1) pecas.push(campo(150, 38));
  if (!pecas.length) return '';
  pecas.push(barra('esq-barra--campo fb-reset', 'height:38px'));
  return `<div class="filterbar esq-filtro">${pecas.join('')}</div>`;
}

function indicadores(quantos, heroi, colunas) {
  if (!quantos) return '';
  const celulas = [];
  for (let i = 0; i < quantos; i += 1) {
    const destaque = i === heroi;
    celulas.push(
      `<div class="kpi esq-kpi${destaque ? ' kpi--hero' : ''}">` +
        `<div class="kpi__label">${barra('esq-barra--texto', 'width:84px')}</div>` +
        `<div class="kpi__value">${barra('esq-barra--valor', destaque ? 'width:120px' : 'width:104px')}</div>` +
        (destaque ? `<span class="kpi__spark esq-barra esq-barra--traco"></span>` : '') +
        `<div class="kpi__trend">${barra('esq-barra--texto', 'width:96px')}</div>` +
      `</div>`,
    );
  }
  return `<section class="section"><div class="grid kpis" style="--kpi-cols:${colunas}">${celulas.join('')}</div></section>`;
}

function cartoes(blocos) {
  if (!blocos.length) return '';
  const celulas = blocos.map((b) => {
    const span = SPANS.has(b.col) ? ` span-${b.col}` : '';
    const altura = ALTURA_DO_BLOCO[b.tipo] || 240;
    const linhas = Math.max(3, Math.min(9, Math.round((altura - 40) / 41)));
    const corpo = Array.from({ length: linhas }, () => `<span class="esq-linha-tabela">${barra('esq-barra--texto', 'width:28%')}${barra('esq-barra--texto', 'width:16%')}</span>`).join('');
    return (
      `<div class="dash-cell${span}"><div class="card esq-cartao" style="min-height:${altura + 38}px">` +
        `<div class="widget-title">${barra('esq-barra--texto', 'width:148px')}</div>${corpo}` +
      `</div></div>`
    );
  }).join('');
  return `<div class="dash-grid">${celulas}</div>`;
}

/**
 * Lista de painéis carregando: linhas vazias no formato de um item da lista.
 * @param {number} [linhas]
 * @returns {string}
 */
export function esqueletoDaListaHtml(linhas = 3) {
  const n = Math.max(1, Math.min(8, Number(linhas) || 3));
  const item =
    `<div class="esq-item">` +
      `<div class="esq-item__textos">${barra('esq-barra--texto', 'width:min(260px, 60%);height:13px')}${barra('esq-barra--texto', 'width:150px')}</div>` +
      `${barra('esq-barra--campo', 'width:150px')}` +
    `</div>`;
  return (
    `<div class="card esqueleto" role="status" aria-busy="true">` +
      `<span class="so-leitor">Carregando os seus painéis</span>${item.repeat(n)}` +
    `</div>`
  );
}

/**
 * @param {{abas?:string[], kpis?:number, heroi?:number, colunas?:number, blocos?:{col:number|null,tipo:string}[], comFaixa?:boolean, comFiltro?:boolean, comAtualizar?:boolean, filtros?:{datas:boolean,campos:number}}} [plano]
 *   sem plano: o formato geral (é o que a página do painel traz pronta no HTML).
 * @returns {string}
 */
export function esqueletoHtml(plano) {
  const p = { ...PADRAO, ...(plano && typeof plano === 'object' ? plano : {}) };
  const quantos = Math.max(0, Math.min(12, Number(p.kpis) || 0));
  const heroi = Number.isInteger(p.heroi) ? p.heroi : -1;
  const colunas = Number(p.colunas) > 0 ? Number(p.colunas) : (quantos + (heroi >= 0 ? 1 : 0)) || 1;
  return (
    `<div class="esqueleto" role="status" aria-busy="true">` +
      `<span class="so-leitor">Carregando o painel</span>` +
      (p.comFaixa === false ? '' : faixa(p.comAtualizar !== false)) +
      abas(Array.isArray(p.abas) ? p.abas : []) +
      (p.comFiltro === false ? '' : filtro(p.filtros || PADRAO.filtros)) +
      indicadores(quantos, heroi, colunas) +
      cartoes(Array.isArray(p.blocos) ? p.blocos : []) +
    `</div>`
  );
}
