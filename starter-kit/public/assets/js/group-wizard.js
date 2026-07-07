// Wizard de GRUPO: junta dashboards existentes num unico link com abas.
// Client-side vanilla ESM. Reusa a API (listDashboards/saveDashboard) e o mesmo
// fluxo de admin token do config-wizard. A logica pura (elegibilidade, montar a
// config, validar) e exportada e testada em test/group-wizard.test.js.

import { listDashboards, saveDashboard, setAdminToken } from './lib/api-client.js';

// ---------------------------------------------------------------------------
// Logica pura (testavel, sem DOM).
// ---------------------------------------------------------------------------

/**
 * Dashboards que PODEM entrar num grupo: exclui outros grupos (nao se aninha) e
 * protegidos por senha (nao embutem e a listagem nem expoe o nome deles).
 * @param {Array<{id:string, kind?:string, protected?:boolean}>} dashboards
 * @returns {Array}
 */
export function eligibleForGroup(dashboards) {
  return (dashboards || []).filter((d) => d && d.id && d.kind !== 'group' && !d.protected);
}

/**
 * Monta a config de grupo pronta pro POST. Apara nome e labels, remove abas sem
 * id, e so inclui accent quando preenchido (senao herda o comportamento padrao).
 * @param {{name:string, accent?:string, tabs:Array<{id:string,label?:string}>}} input
 * @returns {{name:string, kind:'group', tabs:Array<{id:string,label:string}>, accent?:string}}
 */
export function buildGroupConfig({ name, accent, tabs } = {}) {
  const cleanTabs = (tabs || [])
    .filter((t) => t && t.id)
    .map((t) => ({ id: String(t.id), label: String(t.label || t.id).trim() || String(t.id) }));
  const cfg = { name: String(name || '').trim(), kind: 'group', tabs: cleanTabs };
  if (accent && String(accent).trim()) cfg.accent = String(accent).trim();
  return cfg;
}

/**
 * Valida a intencao do usuario antes de montar/enviar. Devolve lista de erros
 * (vazia = ok). Regras: nome obrigatorio e pelo menos 2 dashboards no grupo.
 * @returns {string[]}
 */
export function validateGroup({ name, tabs } = {}) {
  const errs = [];
  if (!name || !String(name).trim()) errs.push('Dê um nome ao grupo.');
  const n = (tabs || []).filter((t) => t && t.id).length;
  if (n < 2) errs.push('Escolha pelo menos 2 dashboards para o grupo.');
  return errs;
}

// ---------------------------------------------------------------------------
// DOM (so roda no browser).
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

// Rotulo default de uma aba: prefere o dominio capitalizado (Marketing/Vendas/
// Suporte), que descreve a AREA melhor que o nome completo do dashboard.
function defaultLabel(d) {
  if (d && d.domain) return d.domain.charAt(0).toUpperCase() + d.domain.slice(1);
  return (d && d.name) || (d && d.id) || '';
}

// Prompt de admin token (mesmo contrato do config-wizard): mostra um campo, guarda
// o token e re-tenta a MESMA operacao.
function pedirAdminToken(feedback, retry) {
  const tokenInput = el('input', { class: 'input', type: 'password', placeholder: 'Token de administrador', autocomplete: 'off' });
  const btn = el('button', { class: 'btn', type: 'button', text: 'Continuar com token' });
  const box = el('div', { class: 'card' }, [
    el('h3', { text: 'Este ambiente exige um token de administrador' }),
    el('p', { class: 'hint', text: 'Cole o token de administrador para publicar o grupo.' }),
    el('label', { class: 'field' }, [el('span', { class: 'lbl', text: 'Token de administrador' }), tokenInput]),
    btn,
  ]);
  box.style.marginTop = '16px';
  feedback.appendChild(box);
  const go = () => {
    const t = tokenInput.value.trim();
    if (!t) { tokenInput.focus(); return; }
    setAdminToken(t);
    feedback.innerHTML = '';
    retry();
  };
  btn.addEventListener('click', go);
  tokenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  tokenInput.focus();
}

function renderForm(app, cands) {
  const nomeInput = el('input', { class: 'input', type: 'text', placeholder: 'Ex: Minha Empresa' });
  const accentInput = el('input', { class: 'input', type: 'color', value: (cands[0] && cands[0].accent) || '#6d28d9' });
  accentInput.style.maxWidth = '80px';
  accentInput.style.padding = '4px';
  accentInput.style.height = '42px';

  // Uma linha por dashboard candidato: checkbox + nome + badge de dominio + input
  // de rotulo da aba (habilita quando marcado).
  const rows = cands.map((d) => {
    const check = el('input', { type: 'checkbox', 'data-id': d.id });
    const label = el('input', { class: 'input', type: 'text', value: defaultLabel(d), 'data-label-for': d.id, disabled: 'disabled' });
    label.style.maxWidth = '200px';
    check.addEventListener('change', () => { label.disabled = !check.checked; });
    return el('div', { class: 'list-item', style: 'padding:12px 0;border-bottom:1px solid var(--border);gap:12px' }, [
      el('label', { style: 'display:flex;align-items:center;gap:10px;cursor:pointer;min-width:0' }, [
        check,
        el('span', { text: d.name || d.id, style: 'font-weight:600' }),
        d.domain ? el('span', { class: 'badge', text: d.domain }) : null,
      ]),
      el('div', { style: 'display:flex;align-items:center;gap:8px' }, [
        el('span', { class: 'hint', text: 'aba:' }),
        label,
      ]),
    ]);
  });

  const criarBtn = el('button', { class: 'btn', type: 'button', text: 'Criar grupo' });
  const feedback = el('div', {});
  feedback.style.marginTop = '14px';

  const collect = () => {
    // Ordem = ordem da lista; entram so os marcados, com o rotulo digitado.
    const tabs = [];
    for (const d of cands) {
      const check = app.querySelector(`input[type=checkbox][data-id="${CSS.escape(d.id)}"]`);
      if (check && check.checked) {
        const lbl = app.querySelector(`input[data-label-for="${CSS.escape(d.id)}"]`);
        tabs.push({ id: d.id, label: (lbl && lbl.value) || defaultLabel(d) });
      }
    }
    return tabs;
  };

  const submit = async () => {
    feedback.innerHTML = '';
    const name = nomeInput.value;
    const tabs = collect();
    const errs = validateGroup({ name, tabs });
    if (errs.length) { feedback.appendChild(errorBox(errs.join(' '))); return; }
    const config = buildGroupConfig({ name, accent: accentInput.value, tabs });
    criarBtn.disabled = true;
    criarBtn.textContent = 'Criando...';
    try {
      const saved = await saveDashboard(config);
      location.href = `/dashboard.html?id=${encodeURIComponent(saved.id)}`;
    } catch (e) {
      criarBtn.disabled = false;
      criarBtn.textContent = 'Criar grupo';
      if (e && e.adminNotConfigured) {
        feedback.appendChild(errorBox('Este ambiente esta com a criacao bloqueada (ADMIN_TOKEN nao configurado no servidor). Peca pra configurar o secret ADMIN_TOKEN no projeto Pages.'));
        return;
      }
      if (e && e.needsAdmin) {
        pedirAdminToken(feedback, submit);
        return;
      }
      feedback.appendChild(errorBox(e && e.message ? e.message : 'Falha ao criar o grupo.'));
    }
  };
  criarBtn.addEventListener('click', submit);

  app.innerHTML = '';
  app.appendChild(el('div', { class: 'card' }, [
    el('label', { class: 'field' }, [
      el('span', { class: 'lbl', text: 'Nome do grupo' }),
      nomeInput,
    ]),
    el('label', { class: 'field' }, [
      el('span', { class: 'lbl', text: 'Cor de destaque' }),
      accentInput,
    ]),
    el('p', { class: 'lbl', text: 'Dashboards no grupo (vira uma aba cada)' }),
    ...rows,
    el('div', { class: 'row-actions' }, [criarBtn]),
    feedback,
  ]));
}

function errorBox(message) {
  return el('p', { class: 'error', text: message });
}

async function init() {
  const app = document.getElementById('groupApp');
  if (!app) return;
  app.innerHTML = '<div class="card"><p class="hint">Carregando dashboards...</p></div>';
  let all;
  try {
    all = await listDashboards();
  } catch (e) {
    app.innerHTML = '';
    app.appendChild(el('div', { class: 'card' }, [errorBox(`Não foi possível carregar os dashboards: ${e && e.message ? e.message : e}`)]));
    return;
  }
  // Ordem dos candidatos = ordem de criacao (mais antigo primeiro), que vira a
  // ordem das abas. Mais intuitivo que "mais novo primeiro" da listagem.
  const cands = eligibleForGroup(all)
    .slice()
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  if (cands.length < 2) {
    app.innerHTML = '';
    app.appendChild(el('div', { class: 'empty-state' }, [
      el('p', { text: 'Você precisa de pelo menos 2 dashboards (não protegidos) para montar um grupo.' }),
      el('a', { class: 'btn', href: '/config.html', text: 'Criar um dashboard' }),
    ]));
    return;
  }
  renderForm(app, cands);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}
