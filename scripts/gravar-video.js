#!/usr/bin/env node
/**
 * Grava o VÍDEO DE PROVA do painel: abre, troca de aba e filtra, em desktop (1440x900) e celular
 * (390x844), com a gravação nativa do Playwright (sem ffmpeg seu e sem ferramenta só de Mac).
 * Além do vídeo, tira quadros no meio do roteiro e monta a PRANCHA: quem revisa lê imagem.
 *
 * Uso:
 *   node gravar-video.js <url-do-painel> --saida <pasta> [--roteiro padrao|efeitos|arquivo.json] [--senha X] [--perfis desktop,mobile]
 *   node gravar-video.js --check          só diz se o Playwright (e o gravador de vídeo dele) respondem
 *
 * Sem --roteiro usa scripts/roteiro-padrao.json, que serve ao painel de fábrica sem editar nada.
 * --roteiro efeitos usa scripts/roteiro-efeitos.json: período, meta batida, gráfico, tabela e o filtro Personalizado.
 * Saída em <pasta>: video-desktop.webm, video-mobile.webm, prancha-desktop.png, prancha-mobile.png,
 * quadros/ (um PNG por print do roteiro) e video-info.json (formato, tamanho, duração, passos pulados).
 * Sai com código diferente de zero se o roteiro for inválido ou um passo obrigatório falhar.
 */
const fs = require('node:fs');
const path = require('node:path');
const { acharPlaywright } = require('./video/achar-playwright.cjs');
const roteiro = require('./video/roteiro.cjs');
const { duracaoDoWebm } = require('./video/duracao-webm.cjs');
const { SCRIPT: CURSOR } = require('./video/cursor.cjs');
const { executar } = require('./video/executar.cjs');
const { montarPrancha } = require('./video/prancha.cjs');

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] || true) : d; };

const AVISO_FAIXA_S = { min: 8, max: 18 };

function dicaDeInstalacao(e) {
  const msg = String(e.message || e);
  if (/ffmpeg/i.test(msg)) return 'O gravador de vídeo do Playwright (ffmpeg dele) não está instalado: npx playwright install ffmpeg';
  if (/Executable doesn't exist|browserType\.launch/i.test(msg)) return 'O Chromium do Playwright não está instalado: npx playwright install chromium';
  return null;
}

async function main() {
  const pw = acharPlaywright();
  if (!pw) { console.error('Playwright não encontrado (nem local, nem na pasta do `npm root -g`). Instale: npm i -g playwright'); return 1; }

  if (args.includes('--check')) {
    let bin;
    try { bin = pw.chromium.executablePath(); } catch (e) { console.error('Playwright resolve, mas não sabe o caminho do Chromium: ' + e.message); return 1; }
    if (!bin || !fs.existsSync(bin)) { console.error('Playwright instalado, mas o Chromium não foi baixado: npx playwright install chromium'); return 1; }
    console.log('Playwright OK, Chromium em ' + bin);
    return 0;
  }

  const url = args.find((a) => /^https?:/.test(a));
  if (!url) { console.error('uso: node gravar-video.js <url-do-painel> --saida <pasta> [--roteiro arquivo.json] [--senha X] [--perfis desktop,mobile]'); return 2; }
  const saida = path.resolve(String(flag('--saida', path.join(process.cwd(), 'prova'))));
  const arquivoDoRoteiro = roteiro.resolverRoteiro(flag('--roteiro'), __dirname);
  const perfis = String(flag('--perfis', 'desktop,mobile')).split(',').map((s) => s.trim()).filter(Boolean);
  const senha = flag('--senha');

  let doc;
  try { doc = JSON.parse(fs.readFileSync(arquivoDoRoteiro, 'utf8')); } catch (e) { console.error(`Não consegui ler o roteiro ${arquivoDoRoteiro}: ${e.message}`); return 2; }
  const v = roteiro.validarRoteiro(doc);
  v.avisos.forEach((a) => console.log('  aviso: ' + a));
  // Na saída normal (e não só no stderr): quem filtra a saída do comando não pode perder o motivo.
  if (!v.ok) { console.log('Roteiro inválido:\n' + v.erros.map((e) => '  - ' + e).join('\n')); return 2; }
  for (const p of perfis) if (!roteiro.PERFIS[p]) { console.error(`perfil desconhecido: ${p} (use desktop e/ou mobile)`); return 2; }

  const pastaDeQuadros = roteiro.caminhoDeSaida(saida, 'quadros');
  fs.mkdirSync(pastaDeQuadros, { recursive: true });
  let browser;
  try { browser = await pw.chromium.launch(); } catch (e) {
    console.error('Não consegui abrir o Chromium do Playwright: ' + String(e.message).split('\n')[0]);
    console.error(dicaDeInstalacao(e) || 'Instale o navegador: npx playwright install chromium');
    if (process.platform === 'linux') console.error('No Linux faltando biblioteca (libnss3, libatk...): npx playwright install --with-deps chromium (pede sudo)');
    return 1;
  }

  const info = { url, roteiro: doc.nome || path.basename(arquivoDoRoteiro), gravadoEm: new Date().toISOString(), perfis: {} };
  const falhas = [];
  for (const nome of perfis) {
    const perfil = roteiro.PERFIS[nome];
    const temporaria = roteiro.caminhoDeSaida(saida, `.gravando-${nome}`);
    fs.mkdirSync(temporaria, { recursive: true });
    let ctx;
    try {
      ctx = await browser.newContext({ ...perfil, recordVideo: { dir: temporaria, size: perfil.viewport } });
    } catch (e) {
      falhas.push(`[${nome}] ${String(e.message).split('\n')[0]}`);
      const dica = dicaDeInstalacao(e); if (dica) console.error(dica);
      continue;
    }
    await ctx.addInitScript(CURSOR);
    const page = await ctx.newPage();
    const video = page.video();
    const inicio = Date.now();
    const r = await executar(page, roteiro.montarPassos(doc), { url, perfil: nome, pastaDeQuadros, senha, inicio });
    // Piso de duração: se a página carregou depressa, espera até o tempo mínimo do roteiro.
    const faltaMs = (doc.duracao_minima_s || 0) * 1000 - (Date.now() - inicio) - 600;
    if (faltaMs > 0) await page.waitForTimeout(faltaMs);
    await page.waitForTimeout(600);
    const duracaoDasMarcasMs = Date.now() - inicio;
    await ctx.close();
    const destino = roteiro.caminhoDeSaida(saida, roteiro.nomeDoVideo(nome));
    await video.saveAs(destino);
    fs.rmSync(temporaria, { recursive: true, force: true });

    const bytes = fs.statSync(destino).size;
    const duracaoWebmMs = duracaoDoWebm(fs.readFileSync(destino));
    const prancha = r.quadros.length ? await montarPrancha(browser, nome, r.quadros, roteiro.caminhoDeSaida(saida, `prancha-${nome}.png`)) : null;
    info.perfis[nome] = {
      arquivo: path.basename(destino), formato: 'webm', bytes, mb: Number((bytes / 1048576).toFixed(2)),
      duracaoWebmMs, duracaoDasMarcasMs, quadros: r.quadros.map((q) => path.basename(q.arquivo)),
      prancha: prancha ? path.basename(prancha) : null, passosPulados: r.pulados, falha: r.falha,
      // Em quantos quadros há número de verdade (indicador visível com dígito). O gate da etapa 6 lê isto.
      quadrosComNumero: r.quadros.filter((q) => q.numeros > 0).map((q) => path.basename(q.arquivo)),
      totalQuadrosComNumero: r.quadros.filter((q) => q.numeros > 0).length,
    };
    const s = (duracaoWebmMs ?? duracaoDasMarcasMs) / 1000;
    console.log(`  ${nome}: ${destino} (${info.perfis[nome].mb} MB, ${s.toFixed(1)} s, ${r.quadros.length} quadros, prancha ${prancha || 'não montada'})`);
    r.pulados.forEach((p) => console.log(`    passo opcional pulado: ${p}`));
    if (s < AVISO_FAIXA_S.min || s > AVISO_FAIXA_S.max) console.log(`    aviso: duração de ${s.toFixed(1)} s fora de ${AVISO_FAIXA_S.min} a ${AVISO_FAIXA_S.max} s (rede lenta? ajuste os "esperar" do roteiro)`);
    if (r.falha) falhas.push(`[${nome}] ${r.falha}`);
    // Prova que mente: quadros só com o esqueleto de carregamento não provam nada. Sem número em NENHUM quadro, reprova.
    else if (doc.exige_numero !== false && info.perfis[nome].totalQuadrosComNumero === 0) falhas.push(`[${nome}] nenhum quadro tem número na tela (só esqueleto de carregamento ou "sem dado"): a gravação não vale`);
  }
  await browser.close();
  fs.writeFileSync(roteiro.caminhoDeSaida(saida, 'video-info.json'), JSON.stringify(info, null, 2), 'utf8');

  console.log('\n' + '='.repeat(70));
  if (falhas.length) { falhas.forEach((f) => console.log('  FALHA: ' + f)); console.log('\n  O vídeo NÃO está completo. Não declare pronto.\n'); return 1; }
  console.log('  Vídeos gravados. LEIA as pranchas (prancha-desktop.png e prancha-mobile.png) antes de entregar:');
  console.log('  o vídeo prova o movimento, a prancha prova que há número, que a aba trocou e que o filtro mudou.\n');
  return 0;
}

main().then((c) => process.exit(c), (e) => { console.error('FALHA inesperada: ' + e.message); process.exit(1); });
