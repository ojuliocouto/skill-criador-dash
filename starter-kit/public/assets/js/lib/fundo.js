// Fundo vivo: a parte de tela. Monta as camadas (duas manchas e duas folhas de curvas), liga e
// desliga o movimento e pausa quando a aba do navegador não está visível. ESM.
// As cores vêm de variáveis CSS gravadas por lib/marca.js; o desenho e o movimento estão no
// presenca.css (só transform, em camadas próprias da placa de vídeo).

/**
 * Caminho SVG suave passando por pontos igualmente espaçados na largura (curva de gráfico).
 * Pura. Usa a tangente de Catmull-Rom convertida em curva de Bézier cúbica.
 * @param {number[]} ys       alturas dos pontos
 * @param {number} [largura]  largura total do desenho
 * @returns {string} atributo d do path ('' com menos de 2 pontos)
 */
export function caminhoSuave(ys, largura = 1600) {
  const pontos = (Array.isArray(ys) ? ys : []).map(Number).filter((n) => Number.isFinite(n));
  if (pontos.length < 2) return '';
  const passo = largura / (pontos.length - 1);
  const p = pontos.map((y, i) => [i * passo, y]);
  const n = (v) => Math.round(v * 10) / 10;
  let d = `M${n(p[0][0])} ${n(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i += 1) {
    const p0 = p[i - 1] || p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(p2[0])} ${n(p2[1])}`;
  }
  return d;
}

// Séries fixas (texto do código, nunca dado da pessoa): curvas com cara de evolução no tempo,
// subindo da esquerda pra direita. Cada folha tem duas e anda num ritmo diferente.
const FOLHAS = [
  [[742, 706, 728, 640, 668, 574, 610, 512, 548, 446, 486, 392, 420], [860, 838, 852, 800, 816, 752, 778, 716, 736, 668, 690, 628, 640]],
  [[318, 352, 300, 338, 262, 296, 224, 268, 190, 232, 150, 196, 128], [560, 532, 548, 486, 510, 452, 470, 404, 432, 372, 388, 330, 344]],
];

/** HTML das camadas do fundo. Puro (o teste confere a forma). */
export function fundoHtml() {
  const folhas = FOLHAS.map((series, i) => (
    `<svg class="fundo__linhas${i ? ` fundo__linhas--${i + 1}` : ''}" viewBox="0 0 1600 900" preserveAspectRatio="none" focusable="false">` +
      series.map((ys, j) => `<path class="fundo__linha${j ? ' fundo__linha--fina' : ''}" d="${caminhoSuave(ys)}" />`).join('') +
    `</svg>`
  )).join('');
  return `<div class="fundo__brilho fundo__brilho--a"></div><div class="fundo__brilho fundo__brilho--b"></div>${folhas}`;
}

let ouvindoVisibilidade = false;
function pausarForaDaVista() {
  if (ouvindoVisibilidade || typeof document === 'undefined') return;
  ouvindoVisibilidade = true;
  const acertar = () => {
    for (const el of document.querySelectorAll('.fundo')) el.classList.toggle('fundo--pausado', document.hidden);
  };
  document.addEventListener('visibilitychange', acertar);
  acertar();
}

/**
 * Põe o fundo dentro de `onde` (uma vez só: chamar de novo devolve o mesmo).
 * @param {HTMLElement} [onde]  padrão: a página inteira
 * @param {{local?:boolean}} [opcoes]  local: ocupa só o trecho (a prévia do assistente)
 * @returns {HTMLElement|null}
 */
export function montarFundo(onde, { local = false } = {}) {
  if (typeof document === 'undefined') return null;
  const alvo = onde || document.body;
  if (!alvo) return null;
  let el = [...alvo.children].find((c) => c.classList && c.classList.contains('fundo'));
  if (!el) {
    el = document.createElement('div');
    el.className = `fundo${local ? ' fundo--local' : ''}`;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = fundoHtml();
    alvo.insertBefore(el, alvo.firstChild);
    // Entra em fade (só opacity) no quadro seguinte: não pisca.
    const mostrar = () => el.classList.add('fundo--pronto');
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(mostrar)); else mostrar();
    setTimeout(mostrar, 120);
  }
  pausarForaDaVista();
  return el;
}

/** Liga ou desliga o movimento (config.fundoAnimado). Desligado, o fundo fica parado. */
export function moverFundo(ligado, onde) {
  if (typeof document === 'undefined') return;
  const alvo = onde || document.body;
  const el = alvo && [...alvo.children].find((c) => c.classList && c.classList.contains('fundo'));
  if (el) el.classList.toggle('fundo--parado', ligado === false);
}
