/**
 * Junta os quadros de um vídeo numa imagem só (a PRANCHA): quem revisa lê imagem, não vídeo.
 * Monta uma página HTML com os PNG embutidos e fotografa com o próprio Chromium: sem ferramenta extra.
 */
const fs = require('node:fs');

const COLUNAS = { desktop: 2, mobile: 3 };

function htmlDaPrancha(perfil, quadros) {
  const colunas = COLUNAS[perfil] || 2;
  const largura = perfil === 'mobile' ? 300 : 700;
  const celulas = quadros.map((q, i) => {
    const b64 = fs.readFileSync(q.arquivo).toString('base64');
    const legenda = String(q.nome).replace(/[<>&]/g, '');
    return `<figure><img src="data:image/png;base64,${b64}" alt=""><figcaption>${i + 1}. ${legenda}</figcaption></figure>`;
  }).join('');
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:16px;background:#e9eaee;font:14px/1.3 system-ui,sans-serif;width:${colunas * (largura + 16) + 16}px}
.g{display:grid;grid-template-columns:repeat(${colunas},${largura}px);gap:16px}
figure{margin:0}img{display:block;width:${largura}px;border:1px solid #bbb;background:#fff}
figcaption{padding:6px 2px;color:#222;font-weight:600}</style><div class="g">${celulas}</div>`;
}

async function montarPrancha(browser, perfil, quadros, destino) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  await page.setContent(htmlDaPrancha(perfil, quadros), { waitUntil: 'load' });
  await page.screenshot({ path: destino, fullPage: true });
  await ctx.close();
  return destino;
}

module.exports = { montarPrancha, htmlDaPrancha };
