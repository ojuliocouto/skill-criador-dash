/**
 * Parte pura do gravador de vídeo de prova (scripts/video/roteiro.cjs e scripts/video/duracao-webm.cjs):
 * validação do roteiro, montagem dos passos, nomes de arquivo e leitura da duração de um WebM.
 * Uso: node <dir-da-skill>/scripts/test-roteiro-de-video.cjs
 */
const assert = require('node:assert/strict');
const path = require('node:path');

let falhas = 0;
function teste(nome, fn) {
  try { fn(); console.log(`ok    ${nome}`); } catch (e) { falhas++; console.log(`FALHA ${nome} -> ${String(e.message).split('\n')[0]}`); }
}

const roteiro = require('./video/roteiro.cjs');
const webm = require('./video/duracao-webm.cjs');
const padrao = require('./roteiro-padrao.json');

const seis = (extra = []) => [
  { acao: 'abrir' }, { acao: 'esperar', ms: 3000 },
  ...[1, 2, 3, 4, 5, 6].flatMap((n) => [{ acao: 'print', nome: `quadro ${n}` }, { acao: 'esperar', ms: 1500 }]),
  ...extra,
];

teste('roteiro padrão é válido e prevê de 10 a 15 s', () => {
  const v = roteiro.validarRoteiro(padrao);
  assert.deepEqual(v.erros, []);
  const s = roteiro.duracaoPrevistaMs(padrao.passos) / 1000;
  assert.ok(s >= 10 && s <= 15, `previsto ${s} s`);
});

teste('o roteiro padrão tem no mínimo 6 prints (a prancha de quadros)', () => {
  assert.ok(padrao.passos.filter((p) => p.acao === 'print').length >= 6);
});

teste('o roteiro padrão troca dois atalhos de período e passa o mouse no gráfico, todos opcionais (o painel pode não ter)', () => {
  const clicaAtalho = padrao.passos.filter((p) => p.acao === 'clicar' && /data-atalho/.test(p.seletor || ''));
  assert.ok(clicaAtalho.length >= 2, `só ${clicaAtalho.length} clique(s) em atalho de período`);
  assert.ok(new Set(clicaAtalho.map((p) => p.seletor)).size >= 2, 'os dois cliques são em atalhos diferentes');
  assert.ok(clicaAtalho.every((p) => p.opcional === true), 'atalho de período precisa ser opcional');
  const gancho = padrao.passos.filter((p) => p.acao === 'mover_mouse' && /chart/.test(p.seletor || ''));
  assert.ok(gancho.length >= 1 && gancho.every((p) => p.opcional === true), 'passar o mouse no gráfico, opcional');
  const i = padrao.passos.findIndex((p) => p.acao === 'clicar' && /data-atalho/.test(p.seletor || ''));
  assert.ok(padrao.passos.slice(i, i + 4).some((p) => p.acao === 'print'), 'o quadro da troca de período sai logo depois do clique');
});

teste('roteiro sem passos, sem abrir no começo ou com ação desconhecida é recusado', () => {
  assert.ok(roteiro.validarRoteiro({ passos: [] }).erros.length);
  assert.ok(roteiro.validarRoteiro({}).erros.length);
  assert.match(roteiro.validarRoteiro({ passos: [{ acao: 'esperar', ms: 100 }] }).erros.join(), /abrir/);
  assert.match(roteiro.validarRoteiro({ passos: [{ acao: 'abrir' }, { acao: 'voar' }] }).erros.join(), /voar/);
});

teste('cada ação cobra os seus campos', () => {
  const erros = (p) => roteiro.validarRoteiro({ passos: [{ acao: 'abrir' }, p] }).erros.join();
  assert.match(erros({ acao: 'clicar' }), /seletor/);
  assert.match(erros({ acao: 'esperar' }), /ms/);
  assert.match(erros({ acao: 'esperar', ms: -5 }), /ms/);
  assert.match(erros({ acao: 'esperar', ms: 999999 }), /ms/);
  assert.match(erros({ acao: 'rolar' }), /y/);
  assert.match(erros({ acao: 'mover_mouse' }), /seletor|x/);
  assert.match(erros({ acao: 'escolher', seletor: 'select' }), /indice|valor/);
  assert.match(erros({ acao: 'print' }), /nome/);
  assert.match(erros({ acao: 'esperar_seletor' }), /seletor/);
});

teste('ação teclar: exige a tecla e entra na duração prevista (serve a mudar o atalho de período com o gráfico à vista no celular)', () => {
  const erros = (p) => roteiro.validarRoteiro({ passos: [{ acao: 'abrir' }, p] }).erros.join();
  assert.match(erros({ acao: 'teclar' }), /tecla/);
  assert.doesNotMatch(erros({ acao: 'teclar', tecla: 'ArrowRight' }), /tecla|desconhecida/);
  assert.ok(roteiro.ACOES.includes('teclar'));
  assert.ok(roteiro.duracaoPrevistaMs([{ acao: 'teclar', tecla: 'ArrowRight' }]) > 0);
});

teste('roteiro com menos de 6 prints é recusado', () => {
  const r = { passos: [{ acao: 'abrir' }, { acao: 'esperar', ms: 10000 }, { acao: 'print', nome: 'a' }] };
  assert.match(roteiro.validarRoteiro(r).erros.join(), /6 prints/);
});

teste('duração prevista fora de 10 a 15 s é recusada', () => {
  assert.match(roteiro.validarRoteiro({ passos: seis().slice(0, 14) }).erros.join(), /duração|segundos/);
  const longo = { passos: [...seis(), { acao: 'esperar', ms: 9000 }] };
  assert.match(roteiro.validarRoteiro(longo).erros.join(), /duração|segundos/);
});

teste('duracao_minima_s: aceita de 10 a 15 e recusa o resto', () => {
  const com = (v) => roteiro.validarRoteiro({ ...padrao, duracao_minima_s: v }).erros.join();
  assert.equal(com(11), '');
  assert.match(com(3), /duracao_minima_s/);
  assert.match(com(40), /duracao_minima_s/);
  assert.match(com('onze'), /duracao_minima_s/);
});

teste('montarPassos: preenche padrões e não muda o roteiro original', () => {
  const original = { passos: [{ acao: 'abrir' }, { acao: 'clicar', seletor: '.x', opcional: true }, { acao: 'rolar', y: 300 }] };
  const copia = JSON.stringify(original);
  const passos = roteiro.montarPassos(original);
  assert.equal(passos.length, 3);
  assert.equal(passos[0].opcional, false);
  assert.equal(passos[1].opcional, true);
  assert.equal(passos[0].ordem, 1);
  assert.equal(JSON.stringify(original), copia);
});

teste('perfis: desktop 1440x900 e celular 390x844', () => {
  assert.deepEqual(roteiro.PERFIS.desktop.viewport, { width: 1440, height: 900 });
  assert.deepEqual(roteiro.PERFIS.mobile.viewport, { width: 390, height: 844 });
  assert.equal(roteiro.PERFIS.mobile.isMobile, true);
});

teste('nomes de arquivo: sem espaço, sem acento, sem barra, numerados', () => {
  assert.equal(roteiro.nomeDoVideo('desktop'), 'video-desktop.webm');
  assert.equal(roteiro.nomeDoVideo('mobile'), 'video-mobile.webm');
  assert.equal(roteiro.nomeDoPrint('desktop', 3, 'Aba Evolução / filtro'), 'desktop-03-aba-evolucao-filtro.png');
  assert.equal(roteiro.nomeDoPrint('mobile', 12, '   '), 'mobile-12-quadro.png');
  assert.ok(!/[\\/:\s]/.test(roteiro.nomeDoPrint('mobile', 1, '../../etc')));
  assert.throws(() => roteiro.nomeDoVideo('tablet'));
});

teste('pasta de saída: só junta nomes, funciona com espaço e acento', () => {
  const pasta = path.join('saída com espaço', 'é');
  assert.equal(roteiro.caminhoDeSaida(pasta, 'video-desktop.webm'), path.join(pasta, 'video-desktop.webm'));
});

// ---- duração de WebM (EBML) ----
function vint(n) { // tamanho EBML de 4 bytes
  return Buffer.from([0x10 | ((n >> 24) & 0x0f), (n >> 16) & 255, (n >> 8) & 255, n & 255]);
}
function el(idHex, corpo) { return Buffer.concat([Buffer.from(idHex, 'hex'), vint(corpo.length), corpo]); }
function cluster(tempoMs, blocosMs) {
  const tc = el('e7', Buffer.from([(tempoMs >> 8) & 255, tempoMs & 255]));
  const blocos = blocosMs.map((rel) => el('a3', Buffer.from([0x81, (rel >> 8) & 255, rel & 255, 0x80, 1, 2, 3])));
  return el('1f43b675', Buffer.concat([tc, ...blocos]));
}
function arquivoFalso(clusters, tamanhoDesconhecido) {
  const cab = el('1a45dfa3', el('4282', Buffer.from('webm')));
  const corpo = Buffer.concat(clusters);
  const seg = tamanhoDesconhecido
    ? Buffer.concat([Buffer.from('18538067', 'hex'), Buffer.from('01ffffffffffffff', 'hex'), corpo])
    : el('18538067', corpo);
  return Buffer.concat([cab, seg]);
}

teste('duracaoDoWebm: soma o tempo do último cluster com o do último bloco', () => {
  const buf = arquivoFalso([cluster(0, [0, 40, 80]), cluster(5000, [0, 40]), cluster(10000, [0, 40, 480])], false);
  assert.equal(webm.duracaoDoWebm(buf), 10480);
});

teste('duracaoDoWebm: aceita o Segment de tamanho desconhecido (gravação ao vivo)', () => {
  const buf = arquivoFalso([cluster(0, [0, 40]), cluster(7000, [0, 960])], true);
  assert.equal(webm.duracaoDoWebm(buf), 7960);
});

teste('duracaoDoWebm: lixo ou arquivo vazio devolve null, nunca inventa número', () => {
  assert.equal(webm.duracaoDoWebm(Buffer.alloc(0)), null);
  assert.equal(webm.duracaoDoWebm(Buffer.from('isto não é um vídeo')), null);
  assert.equal(webm.duracaoDoWebm(arquivoFalso([], false)), null);
});

// ---- 3.7.1 (D10): o roteiro mostra os efeitos da 3.7.0, e o gravador sabe digitar ----
const fs = require('node:fs');
const efeitos = require('./roteiro-efeitos.json');
const { spawnSync } = require('node:child_process');

teste('ação digitar: exige seletor e texto, e entra na duração prevista', () => {
  const erros = (p) => roteiro.validarRoteiro({ passos: [{ acao: 'abrir' }, p] }).erros.join();
  assert.ok(roteiro.ACOES.includes('digitar'));
  assert.match(erros({ acao: 'digitar', texto: '01/08/2026' }), /seletor/);
  assert.match(erros({ acao: 'digitar', seletor: '#fb-from' }), /texto/);
  assert.doesNotMatch(erros({ acao: 'digitar', seletor: '#fb-from', texto: '01/08/2026' }), /seletor|texto|desconhecida/);
  assert.ok(roteiro.duracaoPrevistaMs([{ acao: 'digitar', seletor: 'x', texto: '01/08/2026' }]) > 0);
});

teste('ação cruzar_meta: existe, custa tempo e não pede campo nenhum', () => {
  assert.ok(roteiro.ACOES.includes('cruzar_meta'));
  assert.deepEqual(roteiro.validarRoteiro({ passos: [{ acao: 'abrir' }, { acao: 'cruzar_meta' }] }).erros.filter((e) => /cruzar_meta/.test(e)), []);
  assert.ok(roteiro.duracaoPrevistaMs([{ acao: 'cruzar_meta' }]) >= 3000, 'o cruzamento da meta leva alguns segundos');
});

teste('cruzar_meta: tenta pares de atalhos que partem de "meta não batida" e dá o motivo quando nenhum cruza', () => {
  assert.ok(roteiro.PARES_DE_ATALHOS.length >= 3);
  assert.ok(roteiro.PARES_DE_ATALHOS.every(([a, b]) => a !== b && ['hoje', '7d', '30d', 'mes', 'tudo'].includes(a) && ['hoje', '7d', '30d', 'mes', 'tudo'].includes(b)));
  assert.equal(roteiro.cruzouAMeta(false, true), true);
  assert.equal(roteiro.cruzouAMeta(true, true), false, 'já batida antes não é cruzamento');
  assert.equal(roteiro.cruzouAMeta(false, false), false);
  assert.equal(roteiro.cruzouAMeta(null, true), false, 'sem meta no painel não há o que cruzar');
});

teste('roteiro padrão mostra período, gráfico, tabela que reordena (todas as abas com tabela) e a aba Dados, tudo opcional', () => {
  const sel = (re) => padrao.passos.filter((p) => re.test(p.seletor || ''));
  const ordena = sel(/data-ordenavel/);
  assert.ok(ordena.length >= 2, 'clica em cabeçalho ordenável pelo menos duas vezes (cresce, desce)');
  assert.ok(ordena.every((p) => p.acao === 'clicar' && p.opcional === true));
  const iAbaEvolucao = padrao.passos.findIndex((p) => /role=\\"tab\\"\] >> nth=2|nth=2/.test(p.seletor || ''));
  const iGrafico = padrao.passos.findIndex((p) => p.acao === 'mover_mouse' && /chart/.test(p.seletor || ''));
  assert.ok(iAbaEvolucao >= 0 && iGrafico > iAbaEvolucao, 'o mouse vai ao gráfico DEPOIS de abrir a aba que tem gráfico (antes caía na aba Canais e era pulado)');
});

teste('roteiro de efeitos: oficial, válido, de 10 a 15 s, com meta batida e Personalizado, tudo o que depende do painel é opcional', () => {
  const v = roteiro.validarRoteiro(efeitos);
  assert.deepEqual(v.erros, []);
  const s = roteiro.duracaoPrevistaMs(efeitos.passos) / 1000;
  assert.ok(s >= 10 && s <= 15, `previsto ${s} s`);
  const acoes = efeitos.passos.map((p) => p.acao);
  for (const a of ['cruzar_meta', 'digitar']) assert.ok(acoes.includes(a), `o roteiro de efeitos usa ${a}`);
  assert.ok(efeitos.passos.filter((p) => p.acao !== 'abrir' && p.acao !== 'esperar' && p.acao !== 'print' && p.acao !== 'esperar_seletor').every((p) => p.opcional === true), 'todo passo que depende do painel é opcional');
  assert.ok(efeitos.passos.some((p) => /personalizado/.test(p.seletor || '')), 'abre o filtro Personalizado');
});

teste('--roteiro aceita o nome de um roteiro oficial (padrao, efeitos) além de um arquivo', () => {
  assert.equal(path.basename(roteiro.resolverRoteiro('efeitos', __dirname)), 'roteiro-efeitos.json');
  assert.equal(path.basename(roteiro.resolverRoteiro('padrao', __dirname)), 'roteiro-padrao.json');
  assert.equal(roteiro.resolverRoteiro('meu.json', __dirname), path.resolve('meu.json'));
  assert.equal(path.basename(roteiro.resolverRoteiro(undefined, __dirname)), 'roteiro-padrao.json');
});

teste('roteiro inválido: os erros saem na saída normal (não somem se o aluno filtra o stderr)', () => {
  const pasta = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'roteiro-invalido-'));
  const arq = path.join(pasta, 'ruim.json');
  fs.writeFileSync(arq, JSON.stringify({ passos: [{ acao: 'abrir' }, { acao: 'print', nome: 'a' }] }), 'utf8');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'gravar-video.js'), 'http://localhost:1/x', '--roteiro', arq, '--saida', pasta], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /Roteiro inválido/);
  assert.match(r.stdout, /6 prints/);
});

process.exitCode = falhas ? 1 : 0;
console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo verde.');
