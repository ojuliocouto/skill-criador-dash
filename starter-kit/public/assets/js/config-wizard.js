// Wizard de configuração do dashboard. 4 passos, tudo client-side vanilla ESM.
// Importa apenas módulos prontos (read-only): api-client, templates, automap.

import { fetchSheet, uploadCsv, saveDashboard, previewMeta, setAdminToken } from './lib/api-client.js';
import { templates, getTemplate } from './templates/index.js';
import { autoMap } from './lib/automap.js';
import { getSource } from './sources/index.js';
import { sha256Hex } from './lib/auth.js';
import { aplicarAccent } from './lib/color.js';

// Le o tema atual do documento (o theme.js grava dataset.theme). Serve pra
// calibrar o accent do preview com o contraste certo do tema em uso.
function temaEscuroAtual() {
  return typeof document !== 'undefined' && document.documentElement.dataset.theme !== 'light';
}

// ---------------------------------------------------------------------------
// Validação pura de slots obrigatórios (testável, named export).
// Retorna a lista de slots required que não têm coluna escolhida.
// ---------------------------------------------------------------------------

/**
 * @param {{key:string,label:string,required:boolean}[]} slots
 * @param {{ [slotKey:string]: string|null }} colMap
 * @returns {{key:string,label:string}[]} slots obrigatórios sem coluna mapeada
 */
export function validateRequired(slots, colMap) {
  const map = colMap || {};
  return (slots || [])
    .filter((s) => s && s.required)
    .filter((s) => {
      const v = map[s.key];
      return v == null || String(v).trim() === '';
    })
    .map((s) => ({ key: s.key, label: s.label }));
}

// ---------------------------------------------------------------------------
// Estado em memória.
// ---------------------------------------------------------------------------

const state = {
  step: 1, // 1..4
  domain: null, // 'marketing' | 'vendas' | 'suporte'
  source: null, // { type:'sheets', url, gid } | { type:'csv', data }
  dataset: null, // DataSet { columns, rows, meta }
  colMap: {}, // { slotKey: columnName|null }
  name: '',
  accent: '#6d28d9',
  connecting: false, // trava o botão Conectar durante a chamada
};

const STEPS = [
  { n: 1, label: 'Domínio' },
  { n: 2, label: 'Fonte' },
  { n: 3, label: 'Mapear' },
  { n: 4, label: 'Finalizar' },
];

// ---------------------------------------------------------------------------
// Helpers de DOM.
// ---------------------------------------------------------------------------

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function errorBox(message) {
  return el('p', { class: 'error', text: message });
}

// ---------------------------------------------------------------------------
// Fluxo compartilhado de admin token.
// Quando o operador seta ADMIN_TOKEN no ambiente, as mutacoes E o preview do
// Meta respondem 401 needsAdmin sem o header x-admin-token. Este helper mostra um
// campo pra colar o token, guarda com setAdminToken e re-tenta a MESMA operacao
// (que a partir daí ja mandara o header). Reaproveitado pelo save (passo 4) e
// pelo card Meta (passo 2), para nao duplicar a logica.
// ---------------------------------------------------------------------------

/**
 * @param {HTMLElement} feedback  container onde o prompt é renderizado
 * @param {() => (void|Promise<void>)} retry  operação a re-tentar após colar o token
 */
function pedirAdminToken(feedback, retry) {
  const tokenInput = el('input', {
    class: 'input', id: 'adminToken', type: 'password',
    placeholder: 'Token de administrador', autocomplete: 'off',
  });
  const salvarBtn = el('button', { class: 'btn', type: 'button', text: 'Continuar com token' });
  const box = el('div', { class: 'card' }, [
    el('h3', { text: 'Este ambiente exige um token de administrador' }),
    el('p', { class: 'hint', text: 'Esta operacao esta protegida por um token. Cole o token de administrador para continuar.' }),
    el('label', { class: 'field' }, [
      el('span', { class: 'lbl', text: 'Token de administrador' }),
      tokenInput,
    ]),
    salvarBtn,
  ]);
  box.style.marginTop = '16px';
  feedback.appendChild(box);
  const reenviar = () => {
    const token = tokenInput.value.trim();
    if (!token) { tokenInput.focus(); return; }
    setAdminToken(token);
    retry();
  };
  salvarBtn.addEventListener('click', reenviar);
  tokenInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') reenviar(); });
  tokenInput.focus();
}

/**
 * Caso FAIL-CLOSED: o servidor NAO tem ADMIN_TOKEN configurado. Aqui NAO adianta
 * pedir pra colar token (o servidor nao tem contra o que comparar): mostra uma
 * instrucao clara de configuracao/deploy e NAO entra em loop de prompt.
 * @param {HTMLElement} feedback  container onde a mensagem e renderizada
 */
function mostrarAdminNaoConfigurado(feedback) {
  const box = el('div', { class: 'card' }, [
    el('h3', { text: 'O servidor ainda nao tem ADMIN_TOKEN configurado' }),
    el('p', { class: 'hint', text: 'Criar e gerenciar dashboards fica bloqueado ate o operador definir o token no servidor (modelo fail-closed). Colar um token aqui nao resolve, porque o servidor nao tem contra o que comparar.' }),
    el('p', { class: 'hint', text: 'Rode: wrangler pages secret put ADMIN_TOKEN --project-name=<seu-projeto> e faca o re-deploy. Depois recarregue esta pagina.' }),
  ]);
  box.style.marginTop = '16px';
  feedback.appendChild(box);
}

// ---------------------------------------------------------------------------
// Barra de passos.
// ---------------------------------------------------------------------------

function renderSteps() {
  const bar = document.getElementById('steps');
  bar.innerHTML = '';
  for (const s of STEPS) {
    const cls = ['step-chip'];
    if (s.n === state.step) cls.push('active');
    else if (s.n < state.step) cls.push('done');
    const chip = el('div', { class: cls.join(' ') }, [
      el('span', { class: 'num', text: s.n < state.step ? '✓' : String(s.n) }),
      el('span', { text: s.label }),
    ]);
    bar.appendChild(chip);
  }
}

// ---------------------------------------------------------------------------
// Navegação.
// ---------------------------------------------------------------------------

function goTo(step) {
  state.step = step;
  render();
}

function actions({ onBack, onNext, nextLabel = 'Avançar', nextDisabled = false, extra = null }) {
  const row = el('div', { class: 'row-actions' });
  if (onBack) row.appendChild(el('button', { class: 'btn ghost', type: 'button', onclick: onBack, text: 'Voltar' }));
  if (extra) row.appendChild(extra);
  if (onNext) {
    const btn = el('button', { class: 'btn', type: 'button', onclick: onNext, text: nextLabel });
    if (nextDisabled) btn.disabled = true;
    row.appendChild(btn);
  }
  return row;
}

// ---------------------------------------------------------------------------
// Passo 1: Domínio.
// ---------------------------------------------------------------------------

const DOMAIN_DESC = {
  marketing: 'Investimento, cliques, CTR, CPL, CPA e ROAS por canal e ao longo do tempo.',
  vendas: 'Faturamento, número de vendas, ticket médio e ranking por vendedor e produto.',
  suporte: 'Atendimentos, resolvidos, taxa de resolução, tempo de resposta e CSAT por canal e ao longo do tempo.',
};

function renderDomain(body) {
  body.appendChild(el('h2', { text: 'Escolha o domínio' }));
  body.appendChild(el('p', { class: 'hint', text: 'O domínio define quais métricas e widgets o dashboard vai mostrar.' }));

  const choices = el('div', { class: 'choices' });
  for (const id of Object.keys(templates)) {
    const tpl = templates[id];
    const cls = ['choice', 'card'];
    const isSelected = state.domain === id;
    if (isSelected) cls.push('selected');
    // aria-pressed reflete a selecao pra leitor de tela saber qual dominio esta escolhido.
    const card = el('div', { class: cls.join(' '), role: 'button', tabindex: '0', 'aria-pressed': isSelected ? 'true' : 'false' }, [
      el('h3', { text: tpl.label }),
      el('p', { text: DOMAIN_DESC[id] || '' }),
    ]);
    const pick = () => {
      state.domain = id;
      goTo(2);
    };
    card.addEventListener('click', pick);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
    });
    choices.appendChild(card);
  }
  body.appendChild(choices);
}

// ---------------------------------------------------------------------------
// Passo 2: Fonte.
// ---------------------------------------------------------------------------

function renderSource(body) {
  body.appendChild(el('h2', { text: 'Conecte a fonte de dados' }));
  body.appendChild(el('p', { class: 'hint', text: 'Atenção à privacidade: a planilha fica acessível por link e o dashboard publicado pode ser aberto por qualquer pessoa que tenha a URL. Use dados que voce nao se importa que sejam vistos por quem tiver o link.' }));

  // Opção A: Google Sheets
  const sheetsCard = el('div', { class: 'card' }, [
    el('h3', { text: 'Google Sheets' }),
    el('p', { class: 'hint', text: 'Cole o link da planilha. A planilha precisa estar compartilhada como "qualquer pessoa com o link".' }),
    el('label', { class: 'field' }, [
      el('span', { class: 'lbl', text: 'Link da planilha' }),
      el('input', { class: 'input', id: 'sheetUrl', type: 'url', placeholder: 'https://docs.google.com/spreadsheets/d/...' }),
    ]),
    el('label', { class: 'field' }, [
      el('span', { class: 'lbl', text: 'gid da aba (opcional)' }),
      el('input', { class: 'input', id: 'sheetGid', type: 'text', placeholder: '0' }),
    ]),
    el('button', { class: 'btn', type: 'button', id: 'connectSheet', text: 'Conectar planilha' }),
  ]);
  sheetsCard.style.marginBottom = '16px';

  // Opção B: CSV
  const csvCard = el('div', { class: 'card' }, [
    el('h3', { text: 'Arquivo CSV' }),
    el('p', { class: 'hint', text: 'Suba um arquivo .csv do seu computador.' }),
    el('label', { class: 'field' }, [
      el('span', { class: 'lbl', text: 'Arquivo' }),
      el('input', { class: 'input', id: 'csvFile', type: 'file', accept: '.csv,text/csv' }),
    ]),
    el('button', { class: 'btn', type: 'button', id: 'connectCsv', text: 'Conectar CSV' }),
  ]);

  body.appendChild(sheetsCard);
  body.appendChild(csvCard);

  // Opcao C: Meta Ads (nativo), so faz sentido no dominio Marketing.
  let metaCard = null;
  if (state.domain === 'marketing') {
    metaCard = el('div', { class: 'card' }, [
      el('h3', { text: 'Meta Ads (avançado)' }),
      el('p', { class: 'hint', text: 'Puxa insights de campanha direto da Graph API. Precisa de um access token (System User do Business Manager) e do ID da conta de anuncios. O token fica so no servidor, nunca aparece no dashboard.' }),
      el('label', { class: 'field' }, [
        el('span', { class: 'lbl', text: 'Access token' }),
        el('input', { class: 'input', id: 'metaToken', type: 'password', placeholder: 'EAAB...', autocomplete: 'off' }),
      ]),
      el('label', { class: 'field' }, [
        el('span', { class: 'lbl', text: 'ID da conta de anuncios' }),
        el('input', { class: 'input', id: 'metaAccount', type: 'text', placeholder: 'act_1234567890 ou 1234567890' }),
      ]),
      el('label', { class: 'field' }, [
        el('span', { class: 'lbl', text: 'De (opcional)' }),
        el('input', { class: 'input', id: 'metaSince', type: 'date' }),
      ]),
      el('label', { class: 'field' }, [
        el('span', { class: 'lbl', text: 'Ate (opcional)' }),
        el('input', { class: 'input', id: 'metaUntil', type: 'date' }),
      ]),
      el('button', { class: 'btn', type: 'button', id: 'connectMeta', text: 'Conectar Meta Ads' }),
    ]);
    metaCard.style.marginTop = '16px';
    body.appendChild(metaCard);
  }

  const feedback = el('div', { id: 'sourceFeedback' });
  body.appendChild(feedback);

  // Se já conectou antes, mostra o preview de novo.
  if (state.dataset) feedback.appendChild(preview(state.dataset));

  const nav = actions({
    onBack: () => goTo(1),
    onNext: () => { if (state.dataset) goTo(3); },
    nextDisabled: !state.dataset,
  });
  body.appendChild(nav);

  const nextBtn = nav.querySelector('.btn:not(.ghost)');

  function setConnecting(on) {
    state.connecting = on;
    sheetsCard.querySelector('#connectSheet').disabled = on;
    csvCard.querySelector('#connectCsv').disabled = on;
    if (metaCard) metaCard.querySelector('#connectMeta').disabled = on;
  }

  function onConnected(ds, source) {
    state.dataset = ds;
    state.source = source;
    // Novo dataset invalida mapeamento anterior.
    state.colMap = {};
    feedback.innerHTML = '';
    feedback.appendChild(preview(ds));
    nextBtn.disabled = false;
  }

  function onError(e) {
    feedback.innerHTML = '';
    feedback.appendChild(errorBox(e && e.message ? e.message : 'Não foi possível conectar à fonte.'));
    nextBtn.disabled = !state.dataset;
  }

  sheetsCard.querySelector('#connectSheet').addEventListener('click', async () => {
    if (state.connecting) return;
    const url = sheetsCard.querySelector('#sheetUrl').value.trim();
    const gid = sheetsCard.querySelector('#sheetGid').value.trim() || '0';
    feedback.innerHTML = '';
    if (!url) { feedback.appendChild(errorBox('Cole o link da planilha antes de conectar.')); return; }
    setConnecting(true);
    feedback.appendChild(el('p', { class: 'hint', text: 'Conectando...' }));
    try {
      const ds = await fetchSheet(url, gid);
      onConnected(ds, { type: 'sheets', url, gid });
    } catch (e) {
      onError(e);
    } finally {
      setConnecting(false);
    }
  });

  csvCard.querySelector('#connectCsv').addEventListener('click', () => {
    if (state.connecting) return;
    const input = csvCard.querySelector('#csvFile');
    const file = input.files && input.files[0];
    feedback.innerHTML = '';
    if (!file) { feedback.appendChild(errorBox('Selecione um arquivo CSV antes de conectar.')); return; }
    const reader = new FileReader();
    reader.onerror = () => { setConnecting(false); onError(new Error('Falha ao ler o arquivo.')); };
    reader.onload = async () => {
      const text = String(reader.result || '');
      feedback.innerHTML = '';
      feedback.appendChild(el('p', { class: 'hint', text: 'Conectando...' }));
      try {
        const ds = await uploadCsv(text);
        onConnected(ds, { type: 'csv', data: text });
      } catch (e) {
        onError(e);
      } finally {
        setConnecting(false);
      }
    };
    setConnecting(true);
    reader.readAsText(file);
  });

  if (metaCard) {
    // Tenta o preview do Meta. Se o ambiente exigir admin token (401 needsAdmin,
    // mesmo caso do save), reaproveita o fluxo compartilhado: pede o token e
    // re-tenta a MESMA chamada (que agora ja mandara o header x-admin-token).
    async function tentarConectarMeta(params) {
      setConnecting(true);
      feedback.innerHTML = '';
      feedback.appendChild(el('p', { class: 'hint', text: 'Conectando ao Meta Ads...' }));
      try {
        const ds = await previewMeta(params);
        onConnected(ds, { type: 'meta', meta: params });
      } catch (e) {
        feedback.innerHTML = '';
        if (e && e.adminNotConfigured) {
          // FAIL-CLOSED: servidor sem ADMIN_TOKEN. Nao pede token (nao adianta),
          // mostra a instrucao de configuracao/deploy e nao re-tenta em loop.
          mostrarAdminNaoConfigurado(feedback);
          return;
        }
        if (e && e.needsAdmin) {
          pedirAdminToken(feedback, () => tentarConectarMeta(params));
          return;
        }
        onError(e);
      } finally {
        setConnecting(false);
      }
    }

    metaCard.querySelector('#connectMeta').addEventListener('click', () => {
      if (state.connecting) return;
      const token = metaCard.querySelector('#metaToken').value.trim();
      const account = metaCard.querySelector('#metaAccount').value.trim();
      const since = metaCard.querySelector('#metaSince').value || undefined;
      const until = metaCard.querySelector('#metaUntil').value || undefined;
      feedback.innerHTML = '';
      if (!token || !account) { feedback.appendChild(errorBox('Informe o access token e o ID da conta de anuncios.')); return; }
      tentarConectarMeta({ token, account, since, until });
    });
  }
}

function preview(ds) {
  const cols = ds.columns || [];
  const rowCount = (ds.meta && ds.meta.rowCount != null) ? ds.meta.rowCount : (ds.rows ? ds.rows.length : 0);
  const box = el('div', { class: 'card' }, [
    el('h3', { text: 'Fonte conectada' }),
    el('p', { class: 'hint', text: `${rowCount} linha(s) detectada(s).` }),
    el('p', { class: 'lbl', text: `Colunas detectadas (${cols.length}):` }),
  ]);
  const wrap = el('div');
  for (const c of cols) wrap.appendChild(el('span', { class: 'badge', text: c }));
  // Espacinho entre os badges.
  wrap.querySelectorAll('.badge').forEach((b) => { b.style.marginRight = '6px'; b.style.marginBottom = '6px'; });
  box.appendChild(wrap);
  box.style.marginTop = '16px';
  return box;
}

// ---------------------------------------------------------------------------
// Passo 3: Mapear colunas.
// ---------------------------------------------------------------------------

function renderMap(body) {
  const tpl = getTemplate(state.domain);
  if (!tpl) { body.appendChild(errorBox('Domínio inválido.')); return; }
  const columns = (state.dataset && state.dataset.columns) || [];

  // Pré-preenche com autoMap se ainda não houver mapeamento definido.
  if (!state.colMap || Object.keys(state.colMap).length === 0) {
    state.colMap = autoMap(tpl.slots, columns);
  }

  body.appendChild(el('h2', { text: 'Mapeie as colunas' }));
  body.appendChild(el('p', { class: 'hint', text: 'Cada campo do domínio aponta para uma coluna da sua fonte. Os campos com asterisco são obrigatórios.' }));

  const card = el('div', { class: 'card' });
  for (const slot of tpl.slots) {
    const label = el('span', { class: 'slot' }, [slot.label]);
    if (slot.required) label.appendChild(el('span', { class: 'req', text: '*' }));

    const select = el('select', { class: 'input', 'data-slot': slot.key });
    select.appendChild(el('option', { value: '', text: '(nenhuma)' }));
    for (const c of columns) select.appendChild(el('option', { value: c, text: c }));
    const cur = state.colMap[slot.key];
    select.value = cur == null ? '' : cur;
    select.addEventListener('change', () => {
      state.colMap[slot.key] = select.value === '' ? null : select.value;
    });

    card.appendChild(el('div', { class: 'maprow' }, [label, select]));
  }
  body.appendChild(card);

  const feedback = el('div', { id: 'mapFeedback' });
  body.appendChild(feedback);

  body.appendChild(actions({
    onBack: () => goTo(2),
    onNext: () => {
      const missing = validateRequired(tpl.slots, state.colMap);
      feedback.innerHTML = '';
      if (missing.length) {
        const nomes = missing.map((m) => m.label).join(', ');
        feedback.appendChild(errorBox(`Escolha uma coluna para os campos obrigatórios: ${nomes}.`));
        return;
      }
      goTo(4);
    },
  }));
}

// ---------------------------------------------------------------------------
// Passo 4: Finalizar.
// ---------------------------------------------------------------------------

function renderFinish(body) {
  body.appendChild(el('h2', { text: 'Finalize o dashboard' }));

  // Metrica principal do dominio, para a meta opcional (meta vs realizado).
  const tpl = getTemplate(state.domain) || {};
  const primaryKey = tpl.primaryMetric;
  const primaryDef = (tpl.metrics || []).find((m) => m.key === primaryKey);
  const primaryLabel = primaryDef ? primaryDef.label : 'meta';

  const fields = [
    el('label', { class: 'field' }, [
      el('span', { class: 'lbl', text: 'Nome do dashboard' }),
      el('input', { class: 'input', id: 'dashName', type: 'text', placeholder: 'Ex: Marketing setembro', value: state.name || '' }),
    ]),
    el('label', { class: 'field' }, [
      el('span', { class: 'lbl', text: 'Cor de destaque' }),
      el('input', {
        class: 'input', id: 'dashAccent', type: 'color', value: state.accent || '#6d28d9',
        // Ao escolher a cor, calibra --accent/--accent-fg/--accent-text/--focus-ring
        // pro tema atual (contraste WCAG) e grava em dataset.accent pra o theme.js
        // achar no toggle. Assim o preview do wizard reflete o contraste correto.
        oninput: (ev) => aplicarAccent(document.documentElement, ev.target.value, temaEscuroAtual()),
      }),
    ]),
  ];
  if (primaryKey) {
    fields.push(el('label', { class: 'field' }, [
      el('span', { class: 'lbl', text: `Meta de ${primaryLabel} (opcional)` }),
      el('input', { class: 'input', id: 'dashGoal', type: 'number', min: '0', placeholder: 'Deixe em branco se nao tiver meta' }),
      el('span', { class: 'hint', text: 'Mostra o progresso (percentual da meta) no card principal.' }),
    ]));
  }
  fields.push(el('label', { class: 'field' }, [
    el('span', { class: 'lbl', text: 'Senha de acesso (opcional)' }),
    el('input', { class: 'input', id: 'dashPassword', type: 'password', placeholder: 'Deixe em branco para dashboard aberto', autocomplete: 'new-password' }),
    el('span', { class: 'hint', text: 'Com senha, quem abrir o link precisa digita-la. A senha nao e guardada em texto puro, so o hash.' }),
  ]));
  // Modo de dados: so oferece historico para fontes que suportam (canHistory no
  // registry de fontes). Hoje: planilha e Meta suportam; CSV nao.
  const sourceType = state.source && state.source.type;
  const podeHistorico = !!(getSource(sourceType) && getSource(sourceType).canHistory);
  if (podeHistorico) {
    const modeSelect = el('select', { class: 'input', id: 'dashStorage' }, [
      el('option', { value: 'live', text: 'Ao vivo (le a fonte na hora)' }),
      el('option', { value: 'd1', text: 'Historico (guarda no banco D1 via cron)' }),
    ]);
    fields.push(el('label', { class: 'field' }, [
      el('span', { class: 'lbl', text: 'Modo de dados' }),
      modeSelect,
      el('span', { class: 'hint', text: 'Historico precisa do D1 e do Worker cron provisionados (o agente configura). Ao vivo nao precisa de banco.' }),
    ]));
  }
  const card = el('div', { class: 'card' }, fields);
  body.appendChild(card);

  // Aplica o accent atual ao entrar no passo, pra o preview ja sair calibrado.
  aplicarAccent(document.documentElement, state.accent || '#6d28d9', temaEscuroAtual());

  const feedback = el('div', { id: 'finishFeedback' });
  body.appendChild(feedback);

  const nav = actions({
    onBack: () => goTo(3),
    onNext: onCreate,
    nextLabel: 'Criar dashboard',
  });
  body.appendChild(nav);

  const createBtn = nav.querySelector('.btn:not(.ghost)');

  async function onCreate() {
    const name = card.querySelector('#dashName').value.trim();
    const accent = card.querySelector('#dashAccent').value || '#6d28d9';
    state.name = name;
    state.accent = accent;
    // Garante que as variaveis CSS refletem o accent final antes de salvar.
    aplicarAccent(document.documentElement, accent, temaEscuroAtual());
    feedback.innerHTML = '';

    if (!name) { feedback.appendChild(errorBox('Dê um nome ao dashboard.')); return; }

    const config = {
      name,
      domain: state.domain,
      source: state.source,
      colMap: state.colMap,
      accent,
    };

    // Meta opcional (meta vs realizado) na metrica principal do dominio.
    const goalInput = card.querySelector('#dashGoal');
    const goalVal = goalInput ? Number(goalInput.value) : NaN;
    if (primaryKey && Number.isFinite(goalVal) && goalVal > 0) {
      config.goal = { metricKey: primaryKey, value: goalVal };
    }

    // Senha opcional: guarda so o hash SHA-256 (nunca a senha em texto puro).
    const pwInput = card.querySelector('#dashPassword');
    const pw = pwInput ? pwInput.value : '';
    if (pw) {
      config.auth = { hash: await sha256Hex(pw) };
    }

    // Modo de dados: historico le do D1 (via cron); ao vivo le a fonte na hora.
    const storageInput = card.querySelector('#dashStorage');
    if (storageInput && storageInput.value === 'd1') {
      config.storage = 'd1';
    }

    await tentarSalvar(config);
  }

  // Envia a config. Se o backend responder 401 needsAdmin (o operador setou
  // ADMIN_TOKEN neste ambiente), mostra um campo pra digitar o token, guarda com
  // setAdminToken e reenvia a MESMA config. So aparece nesse caso.
  async function tentarSalvar(config) {
    createBtn.disabled = true;
    feedback.innerHTML = '';
    feedback.appendChild(el('p', { class: 'hint', text: 'Salvando...' }));
    try {
      const saved = await saveDashboard(config);
      const id = saved && saved.id;
      if (!id) throw new Error('O servidor não retornou o id do dashboard.');
      window.location.href = `/dashboard.html?id=${encodeURIComponent(id)}`;
    } catch (e) {
      feedback.innerHTML = '';
      if (e && e.adminNotConfigured) {
        // FAIL-CLOSED: servidor sem ADMIN_TOKEN. Nao adianta pedir token; mostra a
        // instrucao de configuracao/deploy e nao entra em loop de prompt.
        createBtn.disabled = false;
        mostrarAdminNaoConfigurado(feedback);
        return;
      }
      if (e && e.needsAdmin) {
        // Mesmo fluxo compartilhado do card Meta: pede o token e re-tenta o save.
        createBtn.disabled = false;
        pedirAdminToken(feedback, () => tentarSalvar(config));
        return;
      }
      feedback.appendChild(errorBox(e && e.message ? e.message : 'Não foi possível salvar o dashboard.'));
      createBtn.disabled = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Render principal.
// ---------------------------------------------------------------------------

function render() {
  renderSteps();
  const body = document.getElementById('stepBody');
  body.innerHTML = '';
  if (state.step === 1) renderDomain(body);
  else if (state.step === 2) renderSource(body);
  else if (state.step === 3) renderMap(body);
  else if (state.step === 4) renderFinish(body);
}

// Só inicializa a UI quando há DOM (evita rodar sob node:test).
if (typeof document !== 'undefined' && document.getElementById('steps')) {
  render();
}
