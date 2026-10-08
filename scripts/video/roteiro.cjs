/**
 * Parte PURA do gravador de vídeo de prova: valida o roteiro, monta os passos e dá nome aos arquivos.
 * Sem navegador, sem disco: o que for testável sem Playwright mora aqui (test-roteiro-de-video.cjs).
 *
 * Roteiro = JSON simples: { "nome": "...", "passos": [ { "acao": "abrir" }, ... ] }
 *
 *   abrir                         abre a URL do painel (tem que ser o primeiro passo)
 *   esperar          ms           pausa (0 a 10000)
 *   esperar_seletor  seletor      espera o elemento aparecer (até 20 s)
 *   clicar           seletor      clica (o mouse se move até lá antes)
 *   mover_mouse      seletor | x,y  leva o mouse até o elemento ou ao ponto
 *   rolar            y            rola a página até a posição y (pixels)
 *   escolher         seletor + indice | valor   escolhe uma opção de <select> (o filtro)
 *   esperar_numero   [ms]   espera (até 45 s por padrão, teto de 60 s) aparecer um .kpi__value visível com número de verdade; NÃO é opcional: o esqueleto de carregamento não conta, e sem número a gravação não vale
 *   digitar          seletor + texto   clica no campo e digita o texto aos poucos (ex.: as datas do filtro Personalizado)
 *   cruzar_meta      (sem campos)   procura, entre os atalhos de período, um par que leva a meta de "não batida" a "batida" e mostra o cruzamento; se o painel não tem meta ou nenhum par cruza, o passo é pulado e diz por quê
 *   teclar           tecla        aperta uma tecla no elemento em foco (ex.: ArrowRight muda o atalho de período sem voltar ao topo da página)
 *   print            nome         tira um quadro (PNG) no meio da gravação: vira a prancha de quadros
 *
 * "duracao_minima_s" (opcional, 10 a 15): o vídeo só fecha depois desse tempo, contado desde o começo da gravação.
 *  Garante o piso quando a página carrega depressa; o teto depende da rede, e o gravador avisa se passar.
 *
 * Qualquer passo aceita "opcional": true. Se o elemento não existir, o passo é pulado e avisado
 * (assim o mesmo roteiro serve a painéis de domínios diferentes, com ou sem abas).
 */
const path = require('node:path');

const ACOES = ['abrir', 'esperar', 'esperar_seletor', 'clicar', 'mover_mouse', 'rolar', 'escolher', 'esperar_numero', 'digitar', 'cruzar_meta', 'teclar', 'print'];
const MIN_PRINTS = 6;
const FAIXA_S = { min: 10, max: 15 };
const ESPERA_MAX_MS = 10000;

// Custo médio de cada ação (ms) além das esperas explícitas: o mouse se move, a página responde.
const CUSTO_MS = { abrir: 2000, esperar: 0, esperar_seletor: 500, esperar_numero: 800, clicar: 500, mover_mouse: 500, rolar: 700, escolher: 500, digitar: 500, cruzar_meta: 4000, teclar: 300, print: 300 };

const PERFIS = Object.freeze({
  desktop: Object.freeze({ viewport: Object.freeze({ width: 1440, height: 900 }), isMobile: false, hasTouch: false, deviceScaleFactor: 1 }),
  mobile: Object.freeze({ viewport: Object.freeze({ width: 390, height: 844 }), isMobile: true, hasTouch: true, deviceScaleFactor: 2 }),
});

const ehTexto = (v) => typeof v === 'string' && v.trim() !== '';
const ehNumero = (v) => typeof v === 'number' && Number.isFinite(v);

function erroDoPasso(p, i) {
  const rotulo = `passo ${i + 1}`;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return `${rotulo}: precisa ser um objeto com "acao"`;
  if (!ACOES.includes(p.acao)) return `${rotulo}: ação desconhecida "${p.acao}" (use: ${ACOES.join(', ')})`;
  switch (p.acao) {
    case 'esperar':
      if (!ehNumero(p.ms) || p.ms < 0 || p.ms > ESPERA_MAX_MS) return `${rotulo} (esperar): "ms" precisa ser um número de 0 a ${ESPERA_MAX_MS}`;
      break;
    case 'esperar_seletor': case 'clicar':
      if (!ehTexto(p.seletor)) return `${rotulo} (${p.acao}): falta "seletor"`;
      break;
    case 'mover_mouse':
      if (!ehTexto(p.seletor) && !(ehNumero(p.x) && ehNumero(p.y))) return `${rotulo} (mover_mouse): use "seletor" ou "x" e "y"`;
      break;
    case 'rolar':
      if (!ehNumero(p.y) || p.y < 0) return `${rotulo} (rolar): "y" precisa ser um número maior ou igual a 0`;
      break;
    case 'escolher':
      if (!ehTexto(p.seletor)) return `${rotulo} (escolher): falta "seletor"`;
      if (!ehNumero(p.indice) && !ehTexto(p.valor)) return `${rotulo} (escolher): use "indice" ou "valor"`;
      break;
    case 'esperar_numero':
      if (p.ms !== undefined && !(ehNumero(p.ms) && p.ms >= 1 && p.ms <= 60000)) return `${rotulo} (esperar_numero): "ms" precisa ser um número de 1 a 60000`;
      break;
    case 'digitar':
      if (!ehTexto(p.seletor)) return `${rotulo} (digitar): falta "seletor"`;
      if (!ehTexto(p.texto)) return `${rotulo} (digitar): falta "texto"`;
      break;
    case 'teclar':
      if (!ehTexto(p.tecla)) return `${rotulo} (teclar): falta "tecla"`;
      break;
    case 'print':
      if (!ehTexto(p.nome)) return `${rotulo} (print): falta "nome" do quadro`;
      break;
    default: break;
  }
  return null;
}

/** Duração prevista do roteiro (ms): esperas explícitas mais o custo médio de cada ação. */
function duracaoPrevistaMs(passos) {
  return (passos || []).reduce((soma, p) => soma + (p && p.acao === 'esperar' && ehNumero(p.ms) ? p.ms : 0) + (CUSTO_MS[p && p.acao] || 0), 0);
}

/** @returns {{ok:boolean, erros:string[], avisos:string[]}} */
function validarRoteiro(r) {
  const erros = [];
  const avisos = [];
  if (!r || typeof r !== 'object' || !Array.isArray(r.passos) || r.passos.length === 0) {
    return { ok: false, erros: ['o roteiro precisa ter uma lista "passos" com pelo menos um passo'], avisos };
  }
  r.passos.forEach((p, i) => { const e = erroDoPasso(p, i); if (e) erros.push(e); });
  if (r.passos[0] && r.passos[0].acao !== 'abrir') erros.push('o primeiro passo precisa ser "abrir"');
  if (r.passos.slice(1).some((p) => p && p.acao === 'abrir')) avisos.push('há mais de um "abrir": o vídeo recarrega o painel');
  const prints = r.passos.filter((p) => p && p.acao === 'print').length;
  if (prints < MIN_PRINTS) erros.push(`o roteiro precisa de no mínimo ${MIN_PRINTS} prints (tem ${prints}): quem revisa lê a prancha de quadros, não o vídeo`);
  if (r.duracao_minima_s !== undefined && !(ehNumero(r.duracao_minima_s) && r.duracao_minima_s >= FAIXA_S.min && r.duracao_minima_s <= FAIXA_S.max)) {
    erros.push(`"duracao_minima_s" precisa ser um número de ${FAIXA_S.min} a ${FAIXA_S.max} (o vídeo espera até esse tempo antes de fechar)`);
  }
  if (!erros.length) {
    const s = duracaoPrevistaMs(r.passos) / 1000;
    if (s < FAIXA_S.min || s > FAIXA_S.max) erros.push(`duração prevista de ${s.toFixed(1)} segundos fora da faixa de ${FAIXA_S.min} a ${FAIXA_S.max} segundos (ajuste os "esperar")`);
  }
  return { ok: erros.length === 0, erros, avisos };
}

/** Passos prontos pra executar: com ordem (1, 2, 3...), "opcional" explícito e uma cópia (o original não muda). */
function montarPassos(r) {
  return r.passos.map((p, i) => ({ ...p, ordem: i + 1, opcional: p.opcional === true }));
}

function nomeSeguro(texto) {
  const s = String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s || 'quadro';
}
function conferirPerfil(perfil) {
  if (!PERFIS[perfil]) throw new Error(`perfil desconhecido: ${perfil} (use desktop ou mobile)`);
}
const nomeDoVideo = (perfil) => { conferirPerfil(perfil); return `video-${perfil}.webm`; };
const nomeDoPrint = (perfil, n, nome) => { conferirPerfil(perfil); return `${perfil}-${String(n).padStart(2, '0')}-${nomeSeguro(nome)}.png`; };
const caminhoDeSaida = (pasta, arquivo) => path.join(pasta, arquivo);

/** O texto tem número de verdade (um dígito)? Esqueleto, traço e "Não mapeada" não têm. */
const textoTemNumero = (texto) => /\d/.test(String(texto == null ? '' : texto));
const ESPERA_NUMERO_MS = 45000;

// Pares de atalhos de período (de, para) que o cruzar_meta tenta, nesta ordem: sai de um período em que a meta
// não está batida e vai para um maior (ou outro) em que pode estar.
const PARES_DE_ATALHOS = Object.freeze([['mes', 'tudo'], ['30d', 'tudo'], ['7d', 'mes'], ['7d', '30d']].map((p) => Object.freeze(p)));
/** true só quando a meta ESTAVA não batida e PASSOU a batida (null = o painel não tem meta). */
const cruzouAMeta = (antes, depois) => antes === false && depois === true;

/** `--roteiro efeitos` ou `--roteiro padrao` apontam os roteiros oficiais; qualquer outra coisa é um arquivo. */
function resolverRoteiro(valor, pastaDosScripts) {
  const v = valor == null || valor === true ? 'padrao' : String(valor);
  if (v === 'padrao' || v === 'efeitos') return path.join(pastaDosScripts, `roteiro-${v}.json`);
  return path.resolve(v);
}

module.exports = { textoTemNumero, ESPERA_NUMERO_MS, PARES_DE_ATALHOS, cruzouAMeta, resolverRoteiro, ACOES, MIN_PRINTS, FAIXA_S, PERFIS, validarRoteiro, duracaoPrevistaMs, montarPassos, nomeDoVideo, nomeDoPrint, caminhoDeSaida };
