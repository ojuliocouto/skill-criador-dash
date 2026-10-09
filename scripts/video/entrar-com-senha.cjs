/**
 * Entrar num painel protegido por senha, do jeito que a pessoa entra: esperar a tela de senha aparecer,
 * digitar, e esperar o painel de verdade desenhar.
 *
 * Por que isto existe (prova no ar de 08/10/2026): a tela de senha NÃO está na página quando ela carrega. O painel
 * abre com o esqueleto, pergunta à API, recebe 401 e só então desenha o campo. Os três scripts de prova procuravam o
 * campo logo depois do carregamento, não achavam, seguiam sem senha e: a prova de tela reprovava um painel bom, o
 * gravador estourava os 45 s do "esperar número", e o passe de gosto dava VERDE medindo a tela de senha.
 *
 * Usado por prova-dash.js, passe-de-gosto.js e video/executar.cjs (gravar-video.js).
 */

/** Espera por até esperaMs: ou o campo de senha aparece, ou o painel já mostra número (não era protegido). */
async function esperarCampoOuNumero(page, esperaMs) {
  const alvo = await page.waitForFunction(() => {
    const visivel = (e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
    const campo = [...document.querySelectorAll('input[type="password"]')].find(visivel);
    if (campo) return 'campo';
    const numero = [...document.querySelectorAll('.kpi__value')].some((e) => visivel(e) && /\d/.test(e.textContent || ''));
    return numero ? 'numero' : false;
  }, null, { timeout: esperaMs }).catch(() => null);
  return alvo ? await alvo.jsonValue() : null;
}

/**
 * @param {import('playwright').Page} page página já aberta (depois do goto)
 * @param {string|undefined} senha
 * @param {{esperaMs?: number}} [opcoes]
 * @returns {Promise<{pediu: boolean}>} pediu = o painel pediu a senha e ela foi aceita
 * @throws {Error} se a senha for recusada ou nem a tela de senha nem o painel aparecerem
 */
async function entrarComSenha(page, senha, opcoes = {}) {
  if (!senha) return { pediu: false };
  const esperaMs = opcoes.esperaMs || 30000;
  const o = await esperarCampoOuNumero(page, esperaMs);
  if (o === 'numero') return { pediu: false };
  if (o !== 'campo') throw new Error(`nem a tela de senha nem o painel apareceram em ${Math.round(esperaMs / 1000)} s: confira o endereço e a conexão`);
  const campo = page.locator('input[type="password"]').first();
  await campo.fill(String(senha));
  await page.keyboard.press('Enter');
  // Depois de enviar: ou o painel desenha número, ou o painel volta a pedir a senha com "Senha incorreta".
  const depois = await page.waitForFunction(() => {
    const visivel = (e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
    const erro = document.getElementById('pwErr');
    if (erro && /incorret/i.test(erro.textContent || '')) return 'recusada';
    return [...document.querySelectorAll('.kpi__value')].some((e) => visivel(e) && /\d/.test(e.textContent || '')) ? 'aceita' : false;
  }, null, { timeout: esperaMs }).catch(() => null);
  const r = depois ? await depois.jsonValue() : null;
  if (r === 'recusada') throw new Error('a senha foi recusada pelo painel ("Senha incorreta"). Confira a senha e tente de novo');
  if (r !== 'aceita') throw new Error(`depois de digitar a senha o painel não mostrou número em ${Math.round(esperaMs / 1000)} s`);
  return { pediu: true };
}

module.exports = { entrarComSenha };
