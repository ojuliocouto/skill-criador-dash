// Landing/lista de dashboards. Busca as configs no KV via api-client e renderiza.
import { listDashboards, deleteDashboard } from './lib/api-client.js';
import { esc } from './lib/html.js';
import { safeLogoSrc } from './lib/brand.js';

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

function renderErro(msg) {
  lista.innerHTML = `
    <div class="card">
      <p class="error">Não foi possível carregar os dashboards: ${esc(msg)}</p>
      <div class="row-actions">
        <button class="btn ghost" id="retry">Tentar novamente</button>
      </div>
    </div>`;
  const btn = document.getElementById('retry');
  if (btn) btn.addEventListener('click', carregar);
}

function itemHTML(dash) {
  const id = esc(dash.id);
  const nome = esc(dash.name || dash.id);
  const dominio = esc(dash.domain || '');
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
    alert(`Falha ao excluir: ${err.message}`);
  }
}

async function carregar() {
  lista.innerHTML = '<div class="card"><p class="hint">Carregando...</p></div>';
  try {
    const dashboards = await listDashboards();
    if (!Array.isArray(dashboards) || dashboards.length === 0) {
      renderVazio();
      return;
    }
    renderLista(dashboards);
  } catch (err) {
    renderErro(err.message);
  }
}

carregar();
