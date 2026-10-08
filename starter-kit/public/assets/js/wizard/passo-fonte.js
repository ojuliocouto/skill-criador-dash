// Passo 2: "Onde estão os seus números?". A pessoa escolhe UMA origem e só o formulário dela
// aparece (antes eram três formulários abertos e três botões primários). O que foi digitado
// numa origem fica guardado no estado ao trocar pra outra. Depois de conectar: quantas linhas,
// período detectado e as 3 primeiras linhas.

import { el, limpar, campo, erro, recado, ocupar, liberar, chamarAtencao, entrar, acoes } from './dom.js';
import { fetchSheet, uploadCsv, previewMeta } from '../lib/api-client.js';
import { getTemplate } from '../templates/index.js';
import { colunasEsperadas, listaEmFrase, caminhoDoModelo, nomeDoArquivoModelo } from '../lib/area-resumo.js';
import { gidDoLink, resumoDaConexao } from '../lib/fonte-resumo.js';
import { formularioMeta, ERRO_META_INCOMPLETO } from './fonte-meta.js';

const ORIGENS = [
  { id: 'sheets', nome: 'Planilha do Google', texto: 'Você cola o link. O painel lê a planilha de novo toda vez que alguém abre.' },
  { id: 'csv', nome: 'Arquivo CSV', texto: 'Você envia um arquivo do computador. Os números ficam como estão nele.' },
  { id: 'meta', nome: 'Meta Ads', texto: 'Direto da conta de anúncios. Pede uma chave de acesso gerada na Meta.', so: 'marketing' },
];

function blocoDoQuePrecisa(state, tpl) {
  const { obrigatorias, opcionais } = colunasEsperadas(tpl);
  const nomes = (l) => listaEmFrase(l.map((s) => s.label));
  const modelo = caminhoDoModelo(state.domain);
  return el('div', { class: 'card precisa' }, [
    el('h3', { text: `O que a planilha de ${tpl.label} precisa ter` }),
    el('dl', { class: 'precisa__lista' }, [
      el('div', {}, [el('dt', { text: obrigatorias.length === 1 ? 'Coluna obrigatória' : 'Colunas obrigatórias' }), el('dd', { text: nomes(obrigatorias) })]),
      opcionais.length ? el('div', {}, [el('dt', { text: 'Opcionais, deixam o painel mais completo' }), el('dd', { text: nomes(opcionais) })]) : null,
    ]),
    el('p', { class: 'precisa__nota', text: 'O nome da coluna não precisa ser igual: no próximo passo você confere uma por uma. Cada linha da planilha é um registro com a sua data.' }),
    modelo ? el('p', { class: 'precisa__modelo' }, [
      el('a', { href: modelo, download: nomeDoArquivoModelo(state.domain), text: 'Baixar planilha modelo' }),
      ` (um arquivo de exemplo de ${tpl.label}: serve de molde e também para testar agora).`,
    ]) : null,
  ]);
}

function tabelaDaPrevia(previa) {
  const classe = previa.columns.length <= 6 ? 'previa-linhas--p' : (previa.columns.length <= 10 ? 'previa-linhas--m' : 'previa-linhas--g');
  const titulo = previa.rows.length === 1 ? 'A primeira linha do arquivo' : `As ${previa.rows.length} primeiras linhas do arquivo`;
  return el('div', { class: `previa-linhas ${classe}` }, [
    el('p', { class: 'previa-linhas__titulo', text: titulo }),
    el('table', { class: 'previa-linhas__tabela', 'aria-label': titulo }, [
      el('thead', {}, [el('tr', {}, previa.columns.map((c) => el('th', { scope: 'col', text: c })))]),
      el('tbody', {}, previa.rows.map((linha, i) => entrar(
        el('tr', {}, linha.map((v, j) => el('td', { 'data-label': previa.columns[j], text: v === '' ? '(vazio)' : v }))),
        160 + i * 70,
      ))),
    ]),
  ]);
}

function confirmacao(ds, tpl) {
  const r = resumoDaConexao(ds, tpl);
  const periodo = r.periodo
    ? (r.periodo.de === r.periodo.ate
      ? `Período: ${r.periodo.de} (coluna ${r.periodo.coluna}).`
      : `Período: de ${r.periodo.de} a ${r.periodo.ate}, com dado em ${r.periodo.dias} dias (coluna ${r.periodo.coluna}).`)
    : 'Período: não achamos uma coluna de data neste arquivo.';
  const filhos = [
    el('h3', { class: 'conectou__titulo', text: `Deu certo: lemos ${r.linhas} ${r.linhas === 1 ? 'linha' : 'linhas'}` }),
    el('ul', { class: 'conectou__fatos' }, [
      el('li', { text: periodo }),
      el('li', { text: `${r.colunas} ${r.colunas === 1 ? 'coluna' : 'colunas'}: ${listaEmFrase(ds.columns || [])}.` }),
    ]),
  ];
  if (r.obrigatoriasAusentes.length) {
    const nomes = listaEmFrase(r.obrigatoriasAusentes.map((s) => s.label));
    filhos.push(erro(`Não achamos sozinhos a coluna obrigatória de ${nomes}. No próximo passo você aponta qual coluna tem esse dado. Se o arquivo não tem, inclua a coluna e conecte de novo.`));
  }
  if (r.previa.rows.length) filhos.push(tabelaDaPrevia(r.previa));
  return entrar(el('div', { class: 'card conectou', role: 'status' }, filhos));
}

/**
 * @param {HTMLElement} corpo
 * @param {{state:object, ir:(n:number)=>void, portao:object}} ctx
 */
export function renderFonte(corpo, ctx) {
  const { state, portao } = ctx;
  const tpl = getTemplate(state.domain);
  if (!tpl) { corpo.appendChild(erro('Escolha primeiro o que você quer acompanhar.')); corpo.appendChild(acoes({ aoVoltar: () => ctx.ir(1) })); return; }
  const f = state.fonte;
  const origens = ORIGENS.filter((o) => !o.so || o.so === state.domain);
  if (!origens.some((o) => o.id === f.origem)) f.origem = null;

  corpo.appendChild(el('h2', { text: 'Onde estão os seus números?' }));
  corpo.appendChild(el('p', { class: 'passo-lead', text: 'Escolha de onde o painel vai ler. Dá para trocar depois, em Reconfigurar.' }));
  corpo.appendChild(blocoDoQuePrecisa(state, tpl));

  const seletor = el('div', { class: 'origens', role: 'group', 'aria-label': 'Origem dos números' });
  const area = el('div', { class: 'origem-area' });
  const retorno = el('div', { id: 'sourceFeedback', class: 'origem-retorno', 'aria-live': 'polite' });
  const continuar = el('button', { class: 'btn', type: 'button', text: 'Continuar', 'aria-describedby': 'continuarDica' });
  const dica = el('p', { class: 'hint continuar__dica', id: 'continuarDica' });
  let botaoDeConectar = null;

  // Uma ação principal por tela: enquanto não há números, a principal é conectar; depois, continuar.
  function pesos() {
    continuar.classList.toggle('ghost', !state.dataset);
    // Desabilitado de verdade (não só apagado) enquanto faltam os números, e a dica diz o que falta.
    continuar.disabled = !state.dataset;
    dica.hidden = !!state.dataset;
    dica.textContent = state.fonte && state.fonte.origem ? 'Falta conectar os seus números: preencha a origem escolhida e toque em Conectar.' : 'Falta escolher de onde vêm os seus números.';
    if (botaoDeConectar) botaoDeConectar.classList.toggle('ghost', !!state.dataset);
  }
  function conectado(ds, source, rotuloDepois) {
    state.dataset = ds;
    state.source = source;
    state.colMap = {}; // arquivo novo: as colunas são conferidas de novo no passo seguinte
    limpar(retorno).appendChild(confirmacao(ds, tpl));
    if (botaoDeConectar && rotuloDepois) {
      // O botão ainda está "carregando": o rótulo novo entra quando ele for liberado.
      if (botaoDeConectar.classList.contains('is-loading')) botaoDeConectar.dataset.rotulo = rotuloDepois;
      else botaoDeConectar.textContent = rotuloDepois;
    }
    pesos();
  }
  function falhou(e, alvo) {
    limpar(retorno).appendChild(erro(e && e.message ? e.message : 'Não conseguimos ler essa origem. Confira o endereço ou o arquivo e tente de novo.'));
    if (alvo) chamarAtencao(alvo);
  }
  async function conectar(botao, textoOcupado, tarefa, alvo) {
    if (state.connecting) return;
    state.connecting = true;
    limpar(retorno).appendChild(recado(textoOcupado));
    ocupar(botao, textoOcupado);
    try { await tarefa(); } catch (e) {
      if (e && e.adminNotConfigured) { limpar(retorno); portao.semConfig(); }
      else if (e && e.needsAdmin) {
        limpar(retorno);
        portao.exigir('Para ler do Meta Ads este site pede a chave de administrador. Informe aqui e clique em Conferir chave.', () => botao.click());
      } else falhou(e, alvo);
    } finally { state.connecting = false; liberar(botao); pesos(); }
  }

  function formSheets() {
    const link = el('input', { class: 'input', type: 'url', placeholder: 'https://docs.google.com/spreadsheets/d/...', value: f.sheetUrl || '', oninput: (ev) => { f.sheetUrl = ev.target.value; } });
    const aba = el('input', { class: 'input', type: 'text', inputmode: 'numeric', placeholder: 'Em branco: a aba do link', value: f.sheetGid || '', oninput: (ev) => { f.sheetGid = ev.target.value; } });
    const botao = el('button', { class: 'btn', id: 'connectSheet', type: 'button', text: state.dataset && state.source && state.source.type === 'sheets' ? 'Conectar de novo' : 'Conectar planilha' });
    botao.addEventListener('click', () => {
      const url = link.value.trim();
      if (!url) { falhou(new Error('Cole o link da planilha antes de conectar. É o endereço que aparece no navegador com a planilha aberta.'), link); link.focus(); return; }
      const gid = aba.value.trim() || gidDoLink(url) || '0';
      conectar(botao, 'Lendo a planilha...', async () => {
        conectado(await fetchSheet(url, gid), { type: 'sheets', url, gid }, 'Conectar de novo');
      }, link);
    });
    botaoDeConectar = botao;
    return el('div', { class: 'origem-form' }, [
      campo({ id: 'sheetUrl', rotulo: 'Link da planilha', controle: link }),
      el('p', { class: 'privacidade' }, [
        el('strong', { text: 'Atenção à privacidade. ' }),
        'Para o painel conseguir ler, a planilha precisa estar compartilhada como "qualquer pessoa com o link". Quem tiver esse link vê a planilha, e quem tiver o link do painel vê os números. Use dados que podem ser vistos por quem receber o link.',
      ]),
      el('details', { class: 'avancado' }, [
        el('summary', { text: 'Opções avançadas' }),
        campo({
          id: 'sheetGid', rotulo: 'Qual aba da planilha', controle: aba,
          dica: 'Só importa se a planilha tem mais de uma aba. O jeito fácil: abra a aba certa no Google Planilhas e copie o link com ela aberta, que a gente lê a aba pelo link. Se preferir, escreva aqui o número que aparece depois de gid= no fim do endereço.',
        }),
      ]),
      botao,
    ]);
  }

  function formCsv() {
    const arquivo = el('input', { id: 'csvFile', class: 'so-arquivo', type: 'file', accept: '.csv,text/csv', hidden: true, 'aria-label': 'Arquivo CSV' });
    const nome = el('span', { class: 'arquivo__nome', text: f.arquivoNome || 'Nenhum arquivo escolhido' });
    const botao = el('button', { class: 'btn', id: 'connectCsv', type: 'button', text: f.arquivoNome ? 'Trocar arquivo' : 'Escolher arquivo' });
    botao.addEventListener('click', () => arquivo.click());
    arquivo.addEventListener('change', () => {
      const file = arquivo.files && arquivo.files[0];
      if (!file) return;
      f.arquivoNome = file.name;
      nome.textContent = file.name;
      conectar(botao, 'Lendo o arquivo...', async () => {
        const text = await file.text();
        conectado(await uploadCsv(text), { type: 'csv', data: text }, 'Trocar arquivo');
      }, botao);
      arquivo.value = ''; // escolher o mesmo arquivo de novo (depois de corrigir) dispara outra leitura
    });
    botaoDeConectar = botao;
    return el('div', { class: 'origem-form' }, [
      el('p', { class: 'origem-form__texto', text: 'Arquivo .csv salvo do Excel, do Google Planilhas ou do seu sistema. Assim que você escolher, a gente lê.' }),
      el('div', { class: 'arquivo' }, [botao, nome, arquivo]),
    ]);
  }

  function formMeta() {
    const form = formularioMeta(f.meta);
    form.botao.addEventListener('click', () => {
      const params = form.ler();
      if (!params.token || !params.account) { falhou(new Error(ERRO_META_INCOMPLETO), form.no); return; }
      conectar(form.botao, 'Conectando ao Meta Ads...', async () => {
        conectado(await previewMeta(params), { type: 'meta', meta: params }, 'Conectar de novo');
      }, form.no);
    });
    botaoDeConectar = form.botao;
    return form.no;
  }

  const FORMS = { sheets: formSheets, csv: formCsv, meta: formMeta };
  function mostrarOrigem(id, comMovimento) {
    f.origem = id;
    for (const b of seletor.querySelectorAll('.escolha')) {
      const sim = b.dataset.origem === id;
      b.classList.toggle('is-escolhida', sim);
      b.setAttribute('aria-pressed', sim ? 'true' : 'false');
    }
    limpar(area);
    botaoDeConectar = null;
    if (!id) { area.appendChild(el('p', { class: 'hint origem-area__vazio', text: 'Escolha uma das opções acima para continuar.' })); pesos(); return; }
    const form = FORMS[id]();
    area.appendChild(comMovimento ? entrar(form) : form);
    pesos();
  }
  for (const o of origens) {
    seletor.appendChild(el('button', { class: 'escolha escolha--origem card', type: 'button', 'data-origem': o.id, 'aria-pressed': 'false', onclick: () => mostrarOrigem(o.id, true) }, [
      el('span', { class: 'escolha__titulo', text: o.nome }),
      el('span', { class: 'escolha__texto', text: o.texto }),
    ]));
  }
  corpo.appendChild(seletor);
  corpo.appendChild(area);
  corpo.appendChild(retorno);

  if (state.dataset) retorno.appendChild(confirmacao(state.dataset, tpl));
  else if (state.id && state.source) retorno.appendChild(erro('Não conseguimos ler de novo a origem deste painel. Conecte outra vez aqui em cima.'));
  mostrarOrigem(f.origem, false);

  continuar.addEventListener('click', () => {
    if (state.dataset) { ctx.ir(3); return; }
    limpar(retorno).appendChild(erro(f.origem
      ? 'Antes de continuar, traga os seus números: preencha a origem escolhida aqui em cima e conecte.'
      : 'Antes de continuar, traga os seus números: escolha uma origem aqui em cima (planilha, arquivo ou Meta Ads) e conecte.'));
    chamarAtencao(f.origem ? area : seletor);
  });
  corpo.appendChild(acoes({ aoVoltar: () => ctx.ir(1), extra: dica }, continuar));
}
