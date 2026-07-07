// Alterna tema claro/escuro. Aplica o tema salvo (ou o preferido do sistema) o mais
// cedo possivel e injeta um botao de alternar na topbar. Persiste em localStorage.
// ESM, sem dependencias. Basta incluir <script type="module" src=".../lib/theme.js">.

const KEY = 'cd-theme';

const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

function preferido() {
  try {
    const salvo = localStorage.getItem(KEY);
    if (salvo === 'light' || salvo === 'dark') return salvo;
  } catch { /* ignora */ }
  try {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  } catch { /* ignora */ }
  return 'dark';
}

function aplicar(tema) {
  document.documentElement.dataset.theme = tema;
}

// Aplica o quanto antes para reduzir o flash.
aplicar(preferido());

function montarBotao() {
  const bar = document.querySelector('.topbar');
  if (!bar || bar.querySelector('.theme-toggle')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'theme-toggle';

  const desenhar = () => {
    // Mostra o icone do que vai virar ao clicar: no escuro, um sol (ir pro claro).
    const claro = document.documentElement.dataset.theme === 'light';
    btn.innerHTML = claro ? MOON : SUN;
    // Rotulo/titulo refletem o ALVO do clique (pra onde vai), nao o estado atual.
    const alvo = claro ? 'Mudar para tema escuro' : 'Mudar para tema claro';
    btn.setAttribute('aria-label', alvo);
    btn.setAttribute('title', alvo);
    // aria-pressed = tema claro ativo (true quando o modo claro esta ligado).
    btn.setAttribute('aria-pressed', String(claro));
  };

  btn.addEventListener('click', () => {
    const proximo = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(KEY, proximo); } catch { /* ignora */ }
    aplicar(proximo);
    desenhar();
  });

  // Coloca antes das acoes (Reconfigurar/Voltar) se existirem; senao, no fim da topbar.
  const actions = bar.querySelector('.actions');
  bar.insertBefore(btn, actions || null);
  desenhar();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', montarBotao);
} else {
  montarBotao();
}
