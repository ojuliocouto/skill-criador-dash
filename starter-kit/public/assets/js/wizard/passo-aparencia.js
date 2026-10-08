// Passo 4: "Deixe com a sua cara". À esquerda poucas decisões (nome, logotipo, cor, número em
// destaque, meta) e o resto em "Mais opções"; à direita a prévia ao vivo do painel de verdade.
// Antes eram nove decisões soltas e a pessoa criava às cegas.

import { el, limpar, campo, erro, recado, ocupar, liberar, chamarAtencao, entrar, acoes, SVG_CHECK } from './dom.js';
import { getTemplate } from '../templates/index.js';
import { getSource } from '../sources/index.js';
import { metricasDoPainel } from '../lib/personalizacao.js';
import { aplicarRotulos } from '../lib/rotulos.js';
import { safeLogoSrc } from '../lib/brand.js';
import { ACEITA_NO_SELETOR } from '../lib/logo.js';
import { montarConfig } from '../lib/config-do-painel.js';
import { PERIODOS_DA_META } from '../lib/meta-periodo.js';
import { prepararLogo } from './logo-arquivo.js';
import { criarPrevia } from './previa.js';
import { criarEscolhaDeModo, criarCamposDePresenca } from './passo-modo.js';
import { menosMovimento } from '../lib/movimento.js';

const CORES = [
  ['#5b62d6', 'Índigo'], ['#2563eb', 'Azul'], ['#0e9f6e', 'Verde'], ['#d9730d', 'Laranja'],
  ['#dc2626', 'Vermelho'], ['#db2777', 'Rosa'], ['#7c3aed', 'Roxo'], ['#334155', 'Grafite'],
];
const SEGUNDA_COR_INICIAL = '#3cd3a4';
let previaAtual = null;

/**
 * @param {HTMLElement} corpo
 * @param {{state:object, ir:(n:number)=>void, salvar:(config:object, senha:string, botao:HTMLElement, retorno:HTMLElement)=>void}} ctx
 */
export function renderAparencia(corpo, ctx) {
  const { state } = ctx;
  const tplBase = getTemplate(state.domain);
  if (!tplBase || !state.dataset) {
    corpo.appendChild(erro('Antes de escolher a aparência, traga os seus números e confira as colunas.'));
    corpo.appendChild(acoes({ aoVoltar: () => ctx.ir(state.dataset ? 3 : 2) }));
    return;
  }
  // Os nomes trocados no passo anterior valem aqui também (lista de números, rótulo da meta).
  const tpl = aplicarRotulos(tplBase, state.labels);
  const numeros = metricasDoPainel(tpl);
  if (!numeros.some((m) => m.key === state.heroMetric)) state.heroMetric = '';
  const destaque = () => state.heroMetric || tpl.primaryMetric;
  const nomeDe = (k) => { const d = numeros.find((m) => m.key === k); return d ? d.label : ''; };

  corpo.appendChild(el('h2', { text: 'Deixe com a sua cara' }));
  corpo.appendChild(el('p', { class: 'passo-lead', text: 'Poucas escolhas, e a prévia mostra o painel com os seus números a cada mudança.' }));

  // ---- prévia ----
  if (previaAtual) previaAtual.desligar();
  const moldura = el('div', { class: 'previa__moldura' });
  const verTudo = el('button', { class: 'link previa__ver-tudo', type: 'button', text: 'Ver a prévia inteira', 'aria-expanded': 'false' });
  const verAbertura = el('button', { class: 'link previa__abertura', id: 'verAbertura', type: 'button', text: 'Ver a abertura' });
  const recadoDaAbertura = el('p', { class: 'hint previa__recado', role: 'status' });
  const previaBox = el('section', { class: 'previa', 'aria-label': 'Prévia do painel' }, [
    el('div', { class: 'previa__cabeca' }, [el('p', { class: 'previa__titulo', text: 'Prévia do seu painel' }), verAbertura]),
    recadoDaAbertura,
    moldura,
    verTudo,
  ]);
  verTudo.addEventListener('click', () => {
    const aberta = previaBox.classList.toggle('is-inteira');
    verTudo.textContent = aberta ? 'Recolher a prévia' : 'Ver a prévia inteira';
    verTudo.setAttribute('aria-expanded', aberta ? 'true' : 'false');
  });
  const previa = criarPrevia(moldura);
  previaAtual = previa;
  let agendado = 0;
  const configDaPrevia = () => montarConfig({ ...state, name: state.name.trim() || 'Seu painel' }, tplBase);
  // modo.atualizar redesenha as duas amostras de modo (elas mostram cor, logotipo e nome de agora).
  let modo = null;
  const repintar = (ja) => {
    clearTimeout(agendado);
    const fazer = () => { previa.atualizar(configDaPrevia(), state.dataset); if (modo) modo.atualizar(); };
    if (ja) fazer(); else agendado = setTimeout(fazer, 160);
  };
  verAbertura.addEventListener('click', () => {
    recadoDaAbertura.textContent = '';
    if (state.saudacaoLigada === false) {
      recadoDaAbertura.textContent = 'A saudação está desligada em Mais opções. Marque "Cumprimentar quem abre o painel" para ver a abertura.';
      return;
    }
    if (menosMovimento()) {
      recadoDaAbertura.textContent = 'O seu aparelho está com "reduzir movimento" ligado: para quem usa assim, o painel abre direto, sem a saudação.';
      return;
    }
    clearTimeout(agendado);
    previa.atualizar(configDaPrevia(), state.dataset);
    previa.tocarAbertura();
  });

  const retorno = el('div', { id: 'finishFeedback' });

  // ---- nome ----
  const nome = el('input', { class: 'input', type: 'text', maxlength: '80', placeholder: 'Ex.: Marketing de setembro', value: state.name || '' });
  nome.addEventListener('input', () => { state.name = nome.value; if (nome.value.trim()) limpar(retorno); repintar(false); });

  // ---- logotipo ----
  const logoRetorno = el('div', { class: 'logo__retorno' });
  const logoVista = el('div', { class: 'logo__vista' });
  const logoArquivo = el('input', { id: 'logoArquivo', class: 'so-arquivo', type: 'file', accept: ACEITA_NO_SELETOR, hidden: true, 'aria-label': 'Arquivo do logotipo' });
  const logoEnviar = el('button', { class: 'btn ghost', id: 'logoEnviar', type: 'button', text: 'Enviar logotipo' });
  const logoRemover = el('button', { class: 'link', id: 'logoRemover', type: 'button', text: 'Remover logotipo' });
  const logoUrl = el('input', { class: 'input', type: 'url', placeholder: 'https://.../logo.png', value: /^https:/i.test(state.logo || '') ? state.logo : '' });
  const zona = el('div', { class: 'logo' });

  function desenharLogo() {
    limpar(logoVista);
    const src = safeLogoSrc(state.logo);
    logoEnviar.textContent = src ? 'Trocar logotipo' : 'Enviar logotipo';
    logoRemover.hidden = !src;
    logoVista.hidden = !src;
    if (!src) return;
    const img = el('img', { class: 'logo__img', alt: 'Logotipo enviado', src });
    logoVista.appendChild(entrar(el('span', { class: `logo__placa logo__placa--${state.logoFundo === 'escuro' ? 'escuro' : 'claro'}` }, [img])));
  }
  async function receberLogo(arquivo) {
    if (!arquivo) return;
    limpar(logoRetorno).appendChild(recado('Preparando o logotipo...'));
    ocupar(logoEnviar, 'Preparando...');
    try {
      const pronto = await prepararLogo(arquivo);
      state.logo = pronto.dataUrl;
      state.logoFundo = pronto.fundo;
      logoUrl.value = '';
      limpar(logoRetorno);
    } catch (e) {
      limpar(logoRetorno).appendChild(erro(e && e.message ? e.message : 'Não conseguimos usar esse arquivo. Envie o logotipo em PNG, JPG, WebP ou SVG.'));
      chamarAtencao(zona);
    } finally {
      liberar(logoEnviar);
      desenharLogo();
      repintar(true);
    }
  }
  logoEnviar.addEventListener('click', () => logoArquivo.click());
  logoArquivo.addEventListener('change', () => { receberLogo(logoArquivo.files && logoArquivo.files[0]); logoArquivo.value = ''; });
  logoRemover.addEventListener('click', () => {
    state.logo = ''; state.logoFundo = ''; logoUrl.value = '';
    limpar(logoRetorno); desenharLogo(); repintar(true); logoEnviar.focus();
  });
  logoUrl.addEventListener('input', () => {
    const v = logoUrl.value.trim();
    limpar(logoRetorno);
    if (!v) { if (/^https:/i.test(state.logo || '')) { state.logo = ''; state.logoFundo = ''; } }
    else if (safeLogoSrc(v) && /^https:/i.test(v)) { state.logo = v; state.logoFundo = ''; }
    else { logoRetorno.appendChild(erro('Esse endereço não serve: precisa começar com https:// e apontar para uma imagem. O logotipo atual foi mantido.')); }
    desenharLogo(); repintar(false);
  });
  for (const tipo of ['dragenter', 'dragover']) zona.addEventListener(tipo, (ev) => { ev.preventDefault(); zona.classList.add('is-sobre'); });
  for (const tipo of ['dragleave', 'drop']) zona.addEventListener(tipo, (ev) => { ev.preventDefault(); zona.classList.remove('is-sobre'); });
  zona.addEventListener('drop', (ev) => receberLogo(ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]));
  zona.append(
    el('p', { class: 'campo__rotulo', id: 'logoRotulo', text: 'Logotipo (opcional)' }),
    el('div', { class: 'logo__linha' }, [logoVista, el('div', { class: 'logo__botoes' }, [logoEnviar, logoRemover, logoArquivo])]),
    el('p', { class: 'hint', text: 'PNG, JPG, WebP ou SVG. Também dá para arrastar o arquivo até aqui.' }),
    logoRetorno,
    el('details', { class: 'avancado' }, [
      el('summary', { text: 'Usar um endereço de imagem' }),
      campo({ id: 'dashLogo', rotulo: 'Endereço do logotipo na internet', controle: logoUrl, dica: 'Para quem já tem o logotipo publicado num site. Precisa começar com https://.' }),
    ]),
  );
  zona.setAttribute('role', 'group');
  zona.setAttribute('aria-labelledby', 'logoRotulo');

  // ---- cor ----
  const corLivre = el('input', { class: 'cor__livre', type: 'color', value: state.accent || CORES[0][0] });
  const corTexto = el('p', { class: 'cor__escolhida', role: 'status' });
  const amostras = el('div', { class: 'cor__amostras', role: 'group', 'aria-label': 'Cores prontas' });
  function marcarCor() {
    const atual = String(state.accent || '').toLowerCase();
    let nomeDaCor = '';
    for (const b of amostras.querySelectorAll('.cor__amostra')) {
      const sim = b.dataset.cor === atual;
      b.setAttribute('aria-pressed', sim ? 'true' : 'false');
      if (sim) nomeDaCor = b.getAttribute('aria-label');
    }
    limpar(corTexto).append(
      el('span', { class: 'cor__chip', style: `background:${atual}` }),
      `Cor escolhida: ${nomeDaCor ? `${nomeDaCor} (${atual})` : atual}`,
    );
    corLivre.value = atual;
  }
  for (const [hex, rotulo] of CORES) {
    const b = el('button', { class: 'cor__amostra', type: 'button', 'data-cor': hex, 'aria-label': rotulo, title: rotulo, style: `background:${hex}`, 'aria-pressed': 'false' });
    b.innerHTML = SVG_CHECK;
    b.addEventListener('click', () => { state.accent = hex; marcarCor(); repintar(true); });
    amostras.appendChild(b);
  }
  corLivre.addEventListener('input', () => { state.accent = corLivre.value; marcarCor(); repintar(false); });

  // ---- número em destaque e meta ----
  const heroi = el('select', { class: 'input' }, numeros.map((m) => el('option', { value: m.key, text: m.label })));
  heroi.value = destaque() || '';
  const meta = el('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: 'Em branco se não tiver meta', value: state.goal || '' });
  const metaCampo = campo({ id: 'dashGoal', rotulo: '', controle: meta, dica: 'Com a meta, o painel mostra quanto dela já foi alcançado.' });
  const rotuloDaMeta = () => { metaCampo.querySelector('label').textContent = `Meta de ${nomeDe(destaque())} (opcional)`; };
  // A meta tem período: 400 por mês não é 400 em 90 dias. Padrão mensal; painel antigo reaberto mantém o que tinha.
  const periodoMeta = el('select', { class: 'input' }, [
    ...(state.goalPeriodo === '' && state.goal ? [el('option', { value: '', text: 'Como estava: vale para o período que o painel mostrar' })] : []),
    ...PERIODOS_DA_META.map((p) => el('option', { value: p.valor, text: p.rotulo, title: p.dica })),
  ]);
  periodoMeta.value = state.goalPeriodo === '' && !state.goal ? PERIODO_PADRAO : state.goalPeriodo;
  const periodoCampo = campo({ id: 'dashGoalPeriodo', rotulo: 'Essa meta vale para', controle: periodoMeta, dica: 'Só conta se você preencheu a meta. Com "Por mês", o painel compara com a meta de cada mês do período que estiver na tela e escreve contra o quê.' });
  periodoMeta.addEventListener('change', () => { state.goalPeriodo = periodoMeta.value; repintar(false); });
  rotuloDaMeta();
  heroi.addEventListener('change', () => { state.heroMetric = heroi.value === tpl.primaryMetric ? '' : heroi.value; rotuloDaMeta(); desenharOcultos(); repintar(true); });
  meta.addEventListener('input', () => { state.goal = meta.value; repintar(false); });

  // ---- mais opções ----
  const usarSegunda = el('input', { id: 'dashAccent2Usar', type: 'checkbox' });
  usarSegunda.checked = !!state.accent2;
  const segunda = el('input', { class: 'cor__livre', type: 'color', value: state.accent2 || SEGUNDA_COR_INICIAL });
  segunda.disabled = !state.accent2;
  usarSegunda.addEventListener('change', () => { segunda.disabled = !usarSegunda.checked; state.accent2 = usarSegunda.checked ? segunda.value : ''; repintar(true); });
  segunda.addEventListener('input', () => { if (usarSegunda.checked) { state.accent2 = segunda.value; repintar(false); } });

  const ocultos = el('div', { class: 'ocultos' });
  function desenharOcultos() {
    limpar(ocultos);
    state.hiddenMetrics = (state.hiddenMetrics || []).filter((k) => k !== destaque());
    for (const m of numeros.filter((x) => x.naFaixa && x.key !== destaque())) {
      const id = `oculta-${m.key}`;
      const chk = el('input', { id, type: 'checkbox', value: m.key, 'data-oculta': m.key });
      chk.checked = state.hiddenMetrics.includes(m.key);
      chk.addEventListener('change', () => {
        state.hiddenMetrics = [...ocultos.querySelectorAll('[data-oculta]')].filter((c) => c.checked).map((c) => c.value);
        repintar(true);
      });
      ocultos.appendChild(el('label', { class: 'ocultos__item', for: id }, [chk, el('span', { text: m.label })]));
    }
  }
  desenharOcultos();

  const senha = el('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: state.protegido ? 'Em branco: mantém a senha atual' : 'Em branco: painel aberto', value: state.senha || '' });
  senha.addEventListener('input', () => { state.senha = senha.value; });
  const fonte = getSource(state.source && state.source.type);
  const historico = el('select', { class: 'input' }, [
    el('option', { value: '', text: 'Ao vivo: lê os números toda vez que alguém abre' }),
    el('option', { value: 'd1', text: 'Com histórico: guarda uma cópia a cada atualização' }),
  ]);
  historico.value = state.storage === 'd1' ? 'd1' : '';
  historico.addEventListener('change', () => { state.storage = historico.value; });

  modo = criarEscolhaDeModo({ state, configAtual: configDaPrevia, aoMudar: () => repintar(true) });
  const mais = el('details', { class: 'avancado mais-opcoes', id: 'maisOpcoes' }, [
    el('summary', { text: 'Mais opções' }),
    ...criarCamposDePresenca({ state, aoMudar: () => repintar(false) }),
    el('div', { class: 'campo' }, [
      el('label', { class: 'marcar', for: 'dashAccent2Usar' }, [usarSegunda, el('span', { text: 'Usar uma segunda cor' })]),
      campo({ id: 'dashAccent2', rotulo: 'Segunda cor', controle: segunda, soLeitor: true, dica: 'Tinge de leve o fundo dos gráficos. Sem ela, vale a cor principal.' }),
    ]),
    el('fieldset', { class: 'campo ocultos__grupo' }, [
      el('legend', { class: 'campo__rotulo', text: 'Números que não aparecem (opcional)' }),
      ocultos,
      el('p', { class: 'hint', text: 'Marque o que ninguém usa para decidir. Sai da faixa de números, das tabelas e do funil deste painel.' }),
    ]),
    campo({
      id: 'dashPassword', rotulo: 'Senha para abrir o painel (opcional)', controle: senha,
      dica: state.protegido
        ? 'Este painel já tem senha. Escreva aqui só se quiser trocar.'
        : 'Com senha, quem abrir o link precisa digitá-la. Sem senha, qualquer pessoa com o link vê os números. Guardamos a senha embaralhada, nunca o texto dela.',
    }),
    fonte && fonte.canHistory ? campo({
      id: 'dashStorage', rotulo: 'Guardar histórico', controle: historico,
      dica: 'O histórico precisa de um banco de dados e de uma atualização automática ligados no servidor. Se você não instalou isso, deixe em Ao vivo.',
    }) : null,
  ]);
  if (state.accent2 || (state.hiddenMetrics || []).length || state.storage === 'd1' || state.saudacao || state.saudacaoLigada === false || state.fundoAnimado === false) mais.open = true;

  // ---- montagem ----
  const criar = el('button', { class: 'btn', id: 'criarPainel', type: 'button', text: state.id ? 'Salvar alterações' : 'Criar painel' });
  criar.addEventListener('click', () => {
    limpar(retorno);
    state.name = nome.value;
    if (!state.name.trim()) {
      retorno.appendChild(erro('Dê um nome ao painel: é o título que aparece no topo dele. Escreva no primeiro campo e clique de novo.'));
      chamarAtencao(nome);
      nome.focus();
      return;
    }
    ctx.salvar(montarConfig(state, tplBase), state.senha || '', criar, retorno);
  });

  const escolhas = el('div', { class: 'card aparencia__escolhas' }, [
    campo({ id: 'dashName', rotulo: 'Nome do painel', controle: nome }),
    zona,
    el('div', { class: 'campo cor' }, [
      el('p', { class: 'campo__rotulo', id: 'corRotulo', text: 'Cor' }),
      amostras,
      el('div', { class: 'cor__outra' }, [campo({ id: 'dashAccent', rotulo: 'Outra cor', controle: corLivre }), corTexto]),
    ]),
    modo.el,
    campo({ id: 'dashHero', rotulo: 'Número em destaque', controle: heroi, dica: 'É o número que aparece maior, no começo do painel.' }),
    metaCampo,
    periodoCampo,
    mais,
    retorno,
    acoes({ aoVoltar: () => ctx.ir(3) }, criar),
  ]);
  corpo.appendChild(el('div', { class: 'aparencia' }, [escolhas, previaBox]));

  desenharLogo();
  marcarCor();
  repintar(true);
}
