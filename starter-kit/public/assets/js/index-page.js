// Landing/lista de dashboards. Busca as configs no KV via api-client e renderiza.
import { listDashboards, deleteDashboard, setDashboardAuth } from './lib/api-client.js';
import { esc } from './lib/html.js';
import { safeLogoSrc } from './lib/brand.js';
import { sha256Hex } from './lib/auth.js';
import { esqueletoDaListaHtml } from './lib/esqueleto.js';
import { erroHtml, explicarFalha } from './lib/estado-de-erro.js';
import { comecarProgresso, terminarProgresso } from './lib/carregamento.js';
import { animar, menosMovimento, DURACAO } from './lib/movimento.js';

const lista = document.getElementById('lista');

function fmtData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function renderVazio() {
  lista.innerHTML = `
    <div class="empty-state">
      <p>Nenhum dashboard ainda. Crie o primeiro.</p>
      <a class="btn" href="/config.html">Novo dashboard</a>
    </div>`;
}

// Falha ao buscar a lista: o que aconteceu, o que fazer e "Tentar de novo". Nunca tela vazia.
function renderErro(err) {
  const falha = explicarFalha(err, 'painel');
  lista.innerHTML = erroHtml({ ...falha, titulo: 'Não deu para carregar os seus painéis', oQueFazer: 'Clique em Tentar de novo. Se continuar, confira a sua internet.' });
  const btn = lista.querySelector('[data-tentar]');
  if (btn) btn.addEventListener('click', carregar);
}

function itemHTML(dash) {
  const id = esc(dash.id);
  const nome = esc(dash.name || dash.id);
  // Grupo (dashboard com abas) nao tem dominio: mostra o rotulo "Grupo" no badge,
  // pra distinguir de um dashboard comum na lista.
  const dominio = dash.kind === 'group' ? 'Grupo' : esc(dash.domain || '');
  const data = fmtData(dash.createdAt);
  const metaData = data ? `<span class="meta">Criado em ${data}</span>` : '';
  // Logo do dashboard ao lado do nome, quando o src for seguro (https/data:image).
  const logo = safeLogoSrc(dash.logo);
  const logoImg = logo ? `<img class="brand-logo" alt="${nome}" src="${esc(logo)}" />` : '';
  return `
    <div class="list-item" data-id="${id}" style="padding:14px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;gap:10px;">
        ${logoImg}
        <div>
          <div class="js-name" style="font-weight:600;margin-bottom:4px;">${nome}</div>
          <div style="display:flex;align-items:center;gap:10px;">
            ${dominio ? `<span class="badge">${dominio}</span>` : ''}
            ${metaData}
          </div>
        </div>
      </div>
      <div class="row-actions" style="margin-top:0;">
        <a class="btn ghost" href="/dashboard.html?id=${encodeURIComponent(dash.id)}">Abrir</a>
        <button class="btn danger" data-excluir="${id}">Excluir</button>
      </div>
    </div>`;
}

function renderLista(dashboards) {
  const itens = dashboards.map(itemHTML).join('');
  lista.innerHTML = `<div class="card">${itens}</div>`;
  lista.querySelectorAll('[data-excluir]').forEach((btn) => {
    btn.addEventListener('click', () => excluir(btn.getAttribute('data-excluir'), btn));
  });
  // Os itens entram em sequência curta (só transform e opacity; com movimento reduzido, parados).
  lista.querySelectorAll('.list-item').forEach((item, i) => {
    animar(item, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
      { duration: DURACAO.entrada, delay: Math.min(i, 8) * 40, fill: 'backwards' });
  });
}

// Abrir um painel a partir da lista: a lista sai subindo um pouco e só então a página troca; o
// painel entra com a abertura dele (saudação ou carregamento). Clique com tecla de atalho (nova
// aba) e movimento reduzido navegam direto, como sempre.
const principal = document.getElementById('main');
lista.addEventListener('click', (ev) => {
  const link = ev.target && ev.target.closest ? ev.target.closest('a[href^="/dashboard"]') : null;
  if (!link || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  if (menosMovimento() || !principal) return;
  ev.preventDefault();
  comecarProgresso();
  animar(principal, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-12px)' }],
    { duration: DURACAO.toque, easing: 'ease-in', fill: 'forwards' });
  setTimeout(() => { window.location.href = link.href; }, DURACAO.toque);
});
// Voltou pela seta do navegador com a página guardada: desfaz a saída.
window.addEventListener('pageshow', (ev) => {
  if (!ev.persisted || !principal || !principal.getAnimations) return;
  for (const a of principal.getAnimations()) a.cancel();
  terminarProgresso();
});

// BECO SEM SAIDA (aula 24/08, bug 3): dashboard protegido por senha nunca
// podia ser excluido pela interface. O DELETE devolvia 401 needsPassword e a
// tela so tinha um `alert()` com a mensagem crua: nenhum jeito de digitar a
// senha e tentar de novo. Mesmo modelo do "pede a senha e re-tenta" que
// dashboard.js ja usa pra abrir um dashboard protegido (renderPasswordPrompt):
// abre um campo de senha ao lado do item, calcula o hash, guarda com
// setDashboardAuth e reenvia o MESMO delete (que a partir dai ja manda o
// header x-dash-auth, ver api-client.js).
function pedirSenhaExclusao(item, id) {
  // Evita empilhar formularios se o aluno clicar em Excluir mais de uma vez.
  const antigo = item.querySelector('.excluir-senha');
  if (antigo) antigo.remove();

  const box = document.createElement('div');
  box.className = 'excluir-senha';
  box.style.cssText = 'margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
  box.innerHTML = `
    <input class="input" type="password" placeholder="Senha do dashboard" autocomplete="off" style="max-width:220px" />
    <button class="btn" type="button" data-confirmar>Confirmar exclusão</button>
    <button class="btn ghost" type="button" data-cancelar>Cancelar</button>
    <p class="error" style="margin:0;width:100%;"></p>
  `;
  item.appendChild(box);

  const input = box.querySelector('input');
  const erroEl = box.querySelector('.error');
  const confirmarBtn = box.querySelector('[data-confirmar]');
  box.querySelector('[data-cancelar]').addEventListener('click', () => box.remove());

  const tentar = async () => {
    const pw = input.value;
    if (!pw) { input.focus(); return; }
    confirmarBtn.disabled = true;
    erroEl.textContent = '';
    try {
      setDashboardAuth(id, await sha256Hex(pw));
      await deleteDashboard(id);
      await carregar();
    } catch (err) {
      confirmarBtn.disabled = false;
      if (err && err.needsPassword) {
        erroEl.textContent = 'Senha incorreta. Tente de novo.';
        input.value = '';
        input.focus();
      } else {
        erroEl.textContent = `Falha ao excluir: ${err.message}`;
      }
    }
  };
  confirmarBtn.addEventListener('click', tentar);
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') tentar(); });
  input.focus();
}

async function excluir(id, btn) {
  const item = lista.querySelector(`.list-item[data-id="${CSS.escape(id)}"]`);
  const nome = item ? item.querySelector('.js-name')?.textContent : id;
  if (!confirm(`Excluir o dashboard "${nome || id}"? Esta ação não pode ser desfeita.`)) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Excluindo...'; }
  try {
    await deleteDashboard(id);
    await carregar();
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Excluir'; }
    if (err && err.needsPassword && item) {
      pedirSenhaExclusao(item, id);
      return;
    }
    alert(`Falha ao excluir: ${err.message}`);
  }
}

async function carregar() {
  lista.innerHTML = esqueletoDaListaHtml();
  comecarProgresso();
  try {
    const dashboards = await listDashboards();
    if (!Array.isArray(dashboards) || dashboards.length === 0) {
      renderVazio();
      return;
    }
    renderLista(dashboards);
  } catch (err) {
    renderErro(err);
  } finally {
    terminarProgresso();
  }
}

carregar();
