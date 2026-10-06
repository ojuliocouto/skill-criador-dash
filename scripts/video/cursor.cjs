/**
 * Bolinha que segue o mouse, injetada na página só durante a gravação. O navegador sem janela não
 * desenha o cursor no vídeo, então sem isto "clicou na aba" não se vê. Só transform e opacity.
 */
const SCRIPT = `
(() => {
  const montar = () => {
    if (document.getElementById('__cursor-de-prova')) return;
    const b = document.createElement('div');
    b.id = '__cursor-de-prova';
    b.style.cssText = 'position:fixed;left:0;top:0;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:rgba(255,90,20,.55);border:2px solid rgba(255,255,255,.9);box-shadow:0 0 0 1px rgba(0,0,0,.35);z-index:2147483647;pointer-events:none;opacity:0;transform:translate(-100px,-100px);transition:transform 60ms linear,opacity 150ms';
    document.documentElement.appendChild(b);
    let pressionado = false;
    const pos = (e) => { b.style.opacity = '1'; b.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px) scale(' + (pressionado ? 0.6 : 1) + ')'; };
    addEventListener('mousemove', pos, true);
    addEventListener('mousedown', (e) => { pressionado = true; pos(e); }, true);
    addEventListener('mouseup', (e) => { pressionado = false; pos(e); }, true);
  };
  if (document.documentElement) montar(); else addEventListener('DOMContentLoaded', montar);
})();
`;
module.exports = { SCRIPT };
