/**
 * Executa os passos de um roteiro numa página do Playwright e devolve o que aconteceu:
 * marca de tempo de cada passo (a base da checagem de duração quando o vídeo não diz), os quadros
 * tirados, os passos opcionais pulados e a falha, se houve. Não decide nada sobre o roteiro: isso é do roteiro.cjs.
 */
const fs = require('node:fs');
const roteiro = require('./roteiro.cjs');

const TEMPO_OBRIGATORIO_MS = 20000;
const TEMPO_OPCIONAL_MS = 2500;

async function aparecer(page, seletor, opcional) {
  const alvo = page.locator(seletor).first();
  try {
    await alvo.waitFor({ state: 'visible', timeout: opcional ? TEMPO_OPCIONAL_MS : TEMPO_OBRIGATORIO_MS });
    return alvo;
  } catch (_) {
    return null;
  }
}

async function levarMouse(page, alvo) {
  // No meio da tela: com o alvo rente ao topo, a barra fixa do painel fica por cima e o clique cai nela (as abas, depois de rolar a página).
  await alvo.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' })).catch(() => {});
  await page.waitForTimeout(80);
  const caixa = await alvo.boundingBox();
  if (!caixa) return null;
  const x = caixa.x + caixa.width / 2;
  const y = caixa.y + Math.min(caixa.height / 2, 40);
  await page.mouse.move(x, y, { steps: 12 });
  return { x, y };
}

const metaBatida = (page) => page.evaluate(() => {
  const f = document.querySelector('.kpi__goal-fill');
  return f ? f.classList.contains('is-done') : null;
});

async function clicarAtalho(page, id) {
  const alvo = await aparecer(page, `.atalho[data-atalho="${id}"]`, true);
  if (!alvo) return false;
  const ponto = await levarMouse(page, alvo);
  if (ponto) await page.mouse.click(ponto.x, ponto.y); else await alvo.click();
  return true;
}

/**
 * Procura um par de atalhos de período que leva a meta de "não batida" a "batida" e deixa o cruzamento
 * acontecer na tela (o marco dura cerca de 1,9 s). Sem meta no painel, ou sem par que cruze, devolve o motivo.
 */
async function cruzarMeta(page) {
  if ((await metaBatida(page)) === null) return { ok: false, motivo: 'o painel não tem meta para cruzar' };
  const limite = Date.now() + 4500;
  for (const [de, para] of roteiro.PARES_DE_ATALHOS) {
    if (Date.now() > limite) break;
    if (!(await clicarAtalho(page, de))) continue;
    await page.waitForTimeout(900);
    if ((await metaBatida(page)) !== false) continue; // já batida (ou sem meta) neste período: não dá para cruzar daqui
    if (!(await clicarAtalho(page, para))) continue;
    await page.waitForTimeout(450);
    if (roteiro.cruzouAMeta(false, await metaBatida(page))) { await page.waitForTimeout(1500); return { ok: true }; }
  }
  return { ok: false, motivo: 'nenhum par de atalhos de período leva a meta de não batida a batida (a meta pode ser mensal e o painel não ter um período que a ultrapasse)' };
}

/**
 * @param {import('playwright').Page} page
 * @param {object[]} passos  saída de roteiro.montarPassos
 * @param {{url:string, perfil:string, pastaDeQuadros:string, senha?:string, inicio:number}} o
 */
async function executar(page, passos, o) {
  const marcas = [];
  const quadros = [];
  const pulados = [];
  let falha = null;
  for (const p of passos) {
    try {
      switch (p.acao) {
        case 'abrir': {
          const resp = await page.goto(o.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
          if (resp && resp.status() >= 400) throw new Error(`a página voltou ${resp.status()}`);
          if (o.senha) {
            const campo = page.locator('input[type="password"]').first();
            if (await campo.count()) { await campo.fill(String(o.senha)); await page.keyboard.press('Enter'); }
          }
          await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
          break;
        }
        case 'esperar': await page.waitForTimeout(p.ms); break;
        case 'esperar_numero': {
          const teto = p.ms || roteiro.ESPERA_NUMERO_MS;
          const t0 = Date.now();
          try {
            await page.waitForFunction(() => [...document.querySelectorAll('.kpi__value')].some((e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && /\d/.test(e.textContent || ''); }), null, { timeout: teto });
          } catch (_) {
            throw new Error(`o dash não mostrou número em ${Math.round((Date.now() - t0) / 1000)} s: a gravação não vale`);
          }
          break;
        }
        case 'esperar_seletor': {
          const alvo = await aparecer(page, p.seletor, p.opcional);
          if (!alvo) throw new Error(`"${p.seletor}" não apareceu`);
          break;
        }
        case 'clicar': case 'mover_mouse': case 'escolher': {
          if (p.acao === 'mover_mouse' && !p.seletor) { await page.mouse.move(p.x, p.y, { steps: 12 }); break; }
          const alvo = await aparecer(page, p.seletor, p.opcional);
          if (!alvo) throw new Error(`"${p.seletor}" não apareceu`);
          const ponto = await levarMouse(page, alvo);
          if (p.acao === 'clicar') { if (ponto) await page.mouse.click(ponto.x, ponto.y); else await alvo.click(); }
          if (p.acao === 'escolher') await alvo.selectOption(typeof p.indice === 'number' ? { index: p.indice } : { value: p.valor });
          break;
        }
        case 'digitar': {
          const alvo = await aparecer(page, p.seletor, p.opcional);
          if (!alvo) throw new Error(`"${p.seletor}" não apareceu`);
          await levarMouse(page, alvo);
          await alvo.click();
          await alvo.fill('');
          await alvo.pressSequentially(p.texto, { delay: 45 });
          break;
        }
        case 'cruzar_meta': {
          const r = await cruzarMeta(page);
          if (!r.ok) throw new Error(r.motivo);
          break;
        }
        case 'rolar':
          await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), p.y);
          break;
        case 'teclar': await page.keyboard.press(p.tecla); break;
        case 'print': {
          const arquivo = roteiro.caminhoDeSaida(o.pastaDeQuadros, roteiro.nomeDoPrint(o.perfil, quadros.length + 1, p.nome));
          // Quantos indicadores com número de verdade (dígito) estão visíveis neste quadro: prova que o quadro não é só o esqueleto.
          const numeros = await page.evaluate(() => [...document.querySelectorAll('.kpi__value')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && /\d/.test(e.textContent || ''); }).length);
          await page.screenshot({ path: arquivo });
          quadros.push({ nome: p.nome, arquivo, bytes: fs.statSync(arquivo).size, numeros });
          break;
        }
        default: throw new Error(`ação desconhecida: ${p.acao}`);
      }
      marcas.push({ passo: p.ordem, acao: p.acao, tMs: Date.now() - o.inicio });
    } catch (e) {
      if (p.opcional) { pulados.push(`passo ${p.ordem} (${p.acao}): ${String(e.message).split('\n')[0]}`); continue; }
      falha = `passo ${p.ordem} (${p.acao}): ${String(e.message).split('\n')[0]}`;
      break;
    }
  }
  return { marcas, quadros, pulados, falha };
}

module.exports = { executar };
