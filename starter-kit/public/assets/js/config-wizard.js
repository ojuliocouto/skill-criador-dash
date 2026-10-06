// Assistente de criação de painel: o orquestrador. Guarda o estado, troca de passo, salva e
// cuida de abrir um painel existente (?id=) pra editar. Cada passo mora no seu módulo em
// ./wizard/ e as regras puras em ./lib/ (com teste):
//   wizard/passo-area.js       1. O que você quer acompanhar?
//   wizard/passo-fonte.js      2. Onde estão os seus números?   (+ wizard/fonte-meta.js)
//   wizard/passo-colunas.js    3. Confira as colunas
//   wizard/passo-aparencia.js  4. Deixe com a sua cara          (+ previa.js, logo-arquivo.js)
//   wizard/chave-admin.js      chave de administrador, pedida ANTES de preencher tudo
//   wizard/sucesso.js          tela de sucesso (link, copiar, abrir, criar outro)
//   wizard/passos.js           barra de passos e a transição entre eles

import { saveDashboard, getDashboard, fetchDataForSource, setDashboardAuth } from './lib/api-client.js';
import { sha256Hex } from './lib/auth.js';
import { limparRotulos } from './lib/rotulos.js';
import { fundoValido } from './lib/logo.js';
import { DEFAULT_ACCENT } from './lib/color.js';
import { temaDoModo } from './lib/tema-inicial.js';
import { limparSaudacao, saudacaoValida } from './lib/saudacao.js';
import { el, limpar, campo, erro, ocupar, liberar } from './wizard/dom.js';
import { desenharPassos, esconderPassos, trocarPasso } from './wizard/passos.js';
import { criarPortao } from './wizard/chave-admin.js';
import { renderArea } from './wizard/passo-area.js';
import { renderFonte } from './wizard/passo-fonte.js';
import { renderColunas } from './wizard/passo-colunas.js';
import { renderAparencia } from './wizard/passo-aparencia.js';
import { renderSucesso } from './wizard/sucesso.js';

// Funções puras que já tinham teste por este arquivo continuam saindo daqui.
export { validateRequired } from './lib/mapa-colunas.js';
export { montarPersonalizacao } from './lib/config-do-painel.js';

// ---------------------------------------------------------------------------
// REGRESSAO (aula 24/08): trocar de área no passo 1 depois de já ter ligado as colunas virava
// 400 ao salvar. O colMap da área anterior sobrevivia e o da área nova ia sendo acrescentado
// por cima; o servidor (functions/lib/colmap-shape.mjs) recusa, corretamente, chave que não é
// campo da área nova. Pura e exportada pra ter teste.
// @param {string|null|undefined} domainAtual  área antes da troca (state.domain)
// @param {string} domainNovo  área escolhida agora
// @param {object|null|undefined} colMapAtual  colMap antes da troca
// @returns {object} intacto se a área não mudou; vazio se mudou (o passo 3 liga de novo)
// ---------------------------------------------------------------------------
export function colMapAoTrocarDominio(domainAtual, domainNovo, colMapAtual) {
  if (domainAtual === domainNovo) return colMapAtual || {};
  return {};
}

/**
 * Lê o id do painel a editar a partir da query string de config.html. Pura.
 * @param {string} search  ex: '?id=abc-123'
 * @returns {string|null}
 */
export function idDaQueryString(search) {
  const params = new URLSearchParams(search || '');
  const raw = params.get('id');
  const v = raw == null ? '' : String(raw).trim();
  return v || null;
}

/**
 * Monta o estado do assistente a partir de uma config carregada do servidor (GET
 * /api/dashboards?id=...). Pura: não muta `state`, não toca DOM nem rede. NÃO preenche
 * `dataset` (isso exige religar a origem, que é rede).
 * @param {object} state estado atual
 * @param {object} cfg config devolvida pelo GET (já sem segredos)
 * @returns {object} novo estado
 */
export function prefillStateFromConfig(state, cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const fonte = (c.source && typeof c.source === 'object') ? c.source : null;
  const meta = c.goal && Number(c.goal.value) > 0 ? String(c.goal.value) : '';
  return {
    ...state,
    id: c.id || state.id || null,
    domain: c.domain || state.domain || null,
    name: typeof c.name === 'string' ? c.name : state.name,
    accent: c.accent || state.accent,
    accent2: typeof c.accent2 === 'string' ? c.accent2 : '',
    logo: typeof c.logo === 'string' ? c.logo : '',
    logoFundo: fundoValido(c.logoFundo) ? c.logoFundo : '',
    // Presença: painel antigo (sem os campos) volta com os padrões: modo automático, saudação e
    // fundo ligados.
    tema: temaDoModo(c.tema) ? c.tema : 'auto',
    saudacao: saudacaoValida(c.saudacao) ? limparSaudacao(c.saudacao) : '',
    saudacaoLigada: c.saudacaoLigada !== false,
    fundoAnimado: c.fundoAnimado !== false,
    colMap: (c.colMap && typeof c.colMap === 'object') ? { ...c.colMap } : {},
    source: fonte || state.source,
    heroMetric: typeof c.heroMetric === 'string' ? c.heroMetric : '',
    hiddenMetrics: Array.isArray(c.hiddenMetrics) ? c.hiddenMetrics.filter((k) => typeof k === 'string') : [],
    labels: limparRotulos(c.labels),
    goal: meta,
    storage: c.storage === 'd1' ? 'd1' : '',
    protegido: c.protected === true,
    // O que já estava digitado no passo 2 volta junto (o link da planilha, por exemplo).
    fonte: {
      ...novaFonte(),
      ...(state && state.fonte),
      ...(fonte ? { origem: fonte.type || null } : {}),
      ...(fonte && fonte.type === 'sheets' ? { sheetUrl: fonte.url || '', sheetGid: fonte.gid && fonte.gid !== '0' ? String(fonte.gid) : '' } : {}),
      ...(fonte && fonte.type === 'csv' ? { arquivoNome: 'Arquivo já enviado' } : {}),
    },
  };
}

function novaFonte() {
  return { origem: null, sheetUrl: '', sheetGid: '', arquivoNome: '', meta: { token: '', account: '', since: '', until: '' } };
}

// ---------------------------------------------------------------------------
// Estado em memória. A senha e o token do Meta ficam só aqui, nunca em armazenamento.
// ---------------------------------------------------------------------------
const state = {
  step: 1,
  id: null, // id do painel sendo EDITADO (?id= na URL). null = painel novo.
  domain: null,
  source: null, // { type:'sheets', url, gid } | { type:'csv', data } | { type:'meta', meta }
  dataset: null, // DataSet { columns, rows, meta }
  colMap: {},
  labels: {}, // nomes trocados no passo 3 (config.labels)
  name: '',
  accent: DEFAULT_ACCENT,
  accent2: '',
  logo: '',
  logoFundo: '',
  tema: 'auto', // 'claro' | 'escuro' | 'auto' (acompanha o aparelho de quem abre)
  saudacao: '', // quem o painel cumprimenta; vazio = o nome do painel
  saudacaoLigada: true,
  fundoAnimado: true,
  heroMetric: '',
  hiddenMetrics: [],
  goal: '',
  storage: '',
  senha: '',
  protegido: false,
  connecting: false,
  fonte: novaFonte(),
};

const noDom = typeof document !== 'undefined';
const barra = noDom ? document.getElementById('steps') : null;
const corpo = noDom ? document.getElementById('stepBody') : null;
const portao = noDom && document.getElementById('adminGate') ? criarPortao(document.getElementById('adminGate')) : null;

function escolherArea(id) {
  const mudou = state.domain !== id;
  state.colMap = colMapAoTrocarDominio(state.domain, id, state.colMap);
  if (mudou) {
    // Área nova: nomes trocados, número em destaque e meta eram da área anterior.
    state.labels = {};
    state.heroMetric = '';
    state.hiddenMetrics = [];
    state.goal = '';
  }
  state.domain = id;
  goTo(2);
}

const ctx = { state, portao, ir: (n) => goTo(n), escolherArea, salvar };
const DESENHAR = { 1: renderArea, 2: renderFonte, 3: renderColunas, 4: renderAparencia };

function desenharPasso() {
  limpar(corpo);
  DESENHAR[state.step](corpo, ctx);
}

function render() {
  desenharPassos(barra, state.step, (n) => goTo(n));
  desenharPasso();
}

function goTo(step) {
  const de = state.step;
  state.step = step;
  desenharPassos(barra, state.step, (n) => goTo(n));
  trocarPasso(corpo, de, step, () => {
    desenharPasso();
    if (window.scrollY > 120) window.scrollTo(0, 0);
  });
}

// ---------------------------------------------------------------------------
// Salvar. A senha (se houver) vira SHA-256 antes de sair do navegador; o servidor guarda só um
// derivado com sal. A chave de administrador é resolvida no lugar fixo dela (wizard/chave-admin.js).
// ---------------------------------------------------------------------------
async function salvar(config, senha, botao, retorno) {
  const deNovo = () => salvar(config, senha, botao, retorno);
  if (portao && portao.estado() === 'sem-config') { portao.semConfig(); return; }
  if (portao && portao.estado() === 'precisa') {
    portao.exigir('Falta a chave de administrador. Informe aqui e clique em Conferir chave: o painel é salvo em seguida.', deNovo);
    return;
  }
  const envio = { ...config };
  if (senha) envio.auth = { hash: await sha256Hex(senha) };
  limpar(retorno);
  ocupar(botao, state.id ? 'Salvando...' : 'Criando...');
  try {
    const salvo = await saveDashboard(envio);
    if (!salvo || !salvo.id) throw new Error('O servidor não devolveu o endereço do painel.');
    // Quem acabou de definir a senha não precisa digitá-la de novo pra abrir o próprio painel.
    if (senha) setDashboardAuth(salvo.id, envio.auth.hash);
    esconderPassos(barra);
    limpar(document.getElementById('adminGate')); // o recado da chave já cumpriu o papel
    renderSucesso(corpo, { id: salvo.id, nome: salvo.name || config.name, editando: !!state.id, comSenha: !!senha || salvo.protected === true });
  } catch (e) {
    liberar(botao);
    if (e && e.adminNotConfigured && portao) { portao.semConfig(); return; }
    if (e && e.needsAdmin && portao) {
      portao.exigir('A chave de administrador guardada neste navegador não confere. Informe a chave certa e clique em Conferir chave: o painel é salvo em seguida.', deNovo);
      return;
    }
    if (e && e.needsPassword) { pedirSenhaDoPainel(retorno, state.id, deNovo); return; }
    const motivo = e && e.message ? e.message : 'o servidor não respondeu.';
    retorno.appendChild(erro(`Não deu para salvar o painel: ${motivo} Confira e clique de novo. Nada do que você preencheu foi perdido.`));
  }
}

/**
 * Caso defensivo: o servidor recusou com "senha necessária" depois de a edição já ter pedido
 * a senha pra entrar (a sessão perdeu a senha guardada). Pede de novo e repete o MESMO salvar.
 */
function pedirSenhaDoPainel(retorno, id, deNovo) {
  const entrada = el('input', { class: 'input', type: 'password', autocomplete: 'off', placeholder: 'Senha do painel' });
  const botao = el('button', { class: 'btn ghost', type: 'button', text: 'Continuar com a senha' });
  const tentar = async () => {
    if (!entrada.value) { entrada.focus(); return; }
    setDashboardAuth(id, await sha256Hex(entrada.value));
    deNovo();
  };
  botao.addEventListener('click', tentar);
  entrada.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') tentar(); });
  limpar(retorno).appendChild(el('div', { class: 'card portao' }, [
    el('h3', { text: 'Este painel é protegido por senha' }),
    el('p', { class: 'portao__texto', text: 'A sessão perdeu a senha guardada. Digite a senha atual do painel para confirmar a alteração.' }),
    el('div', { class: 'portao__linha' }, [campo({ id: 'dashAuthRetry', rotulo: 'Senha do painel', controle: entrada }), botao]),
  ]));
  entrada.focus();
}

// ---------------------------------------------------------------------------
// Editar um painel existente (?id=): carrega a config, preenche o estado e religa a origem
// (pra ter as colunas e a prévia sem a pessoa conectar de novo). Se religar falhar (Meta Ads
// não devolve o token pro navegador, por segurança), o passo 2 pede pra conectar outra vez.
// ---------------------------------------------------------------------------
async function carregarEIniciar(id) {
  const cfg = await getDashboard(id); // pode lançar .needsPassword
  Object.assign(state, prefillStateFromConfig(state, cfg));
  if (state.source) {
    try {
      state.dataset = await fetchDataForSource(state.source, state.id);
    } catch {
      state.dataset = null;
    }
  }
  const titulo = document.querySelector('#main h1');
  if (titulo) titulo.textContent = 'Editar painel';
  const sub = document.querySelector('#main .subtitle');
  if (sub) sub.textContent = `Você está alterando "${state.name || id}". Tudo já vem preenchido: mude só o que quiser e salve no último passo.`;
  document.title = 'Editar painel';
  render();
}

/** Tela isolada (fora dos 4 passos): painel protegido pede a senha antes de editar. */
function renderPedidoSenhaEdicao(id) {
  esconderPassos(barra);
  const entrada = el('input', { class: 'input', type: 'password', autocomplete: 'off', placeholder: 'Senha do painel' });
  const retorno = el('div');
  const botao = el('button', { class: 'btn', type: 'button', text: 'Continuar' });
  const tentar = async () => {
    if (!entrada.value) { entrada.focus(); return; }
    limpar(retorno);
    ocupar(botao, 'Abrindo...');
    try {
      setDashboardAuth(id, await sha256Hex(entrada.value));
      await carregarEIniciar(id);
    } catch {
      liberar(botao);
      retorno.appendChild(erro('Senha incorreta, ou não foi possível carregar o painel. Confira a senha e tente de novo.'));
      entrada.select();
    }
  };
  botao.addEventListener('click', tentar);
  entrada.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') tentar(); });
  limpar(corpo).appendChild(el('div', { class: 'card portao' }, [
    el('h2', { text: 'Este painel é protegido por senha' }),
    el('p', { class: 'portao__texto', text: 'Digite a senha atual para abrir a configuração e editar.' }),
    el('div', { class: 'portao__linha' }, [campo({ id: 'senhaEdicao', rotulo: 'Senha do painel', controle: entrada }), botao]),
    retorno,
  ]));
  entrada.focus();
}

/** Tela isolada: a config não pôde ser carregada (não existe, erro de rede etc). */
function renderErroCarregarExistente(err) {
  esconderPassos(barra);
  limpar(corpo).appendChild(el('div', { class: 'card portao' }, [
    el('h2', { text: 'Não foi possível abrir este painel para editar' }),
    el('p', { class: 'portao__texto', text: `${(err && err.message) || 'Erro inesperado ao carregar a configuração.'} Confira o endereço ou volte à lista de painéis.` }),
    el('div', { class: 'row-actions' }, [
      el('a', { class: 'btn', href: '/config.html', text: 'Criar um painel novo' }),
      el('a', { class: 'btn ghost', href: '/index.html', text: 'Ver meus painéis' }),
    ]),
  ]));
}

async function bootstrap() {
  if (portao) portao.iniciar(); // em paralelo: a pessoa fica sabendo da chave logo no começo
  const id = idDaQueryString(window.location.search);
  if (!id) { render(); return; }
  state.id = id;
  try {
    await carregarEIniciar(id);
  } catch (e) {
    if (e && e.needsPassword) { renderPedidoSenhaEdicao(id); return; }
    renderErroCarregarExistente(e);
  }
}

// Só inicializa a UI quando há DOM (evita rodar sob node:test).
if (noDom && barra && corpo) {
  bootstrap();
}
