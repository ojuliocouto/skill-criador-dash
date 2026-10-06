// Travas de gosto e de texto do assistente (o que o dono reprova na hora): palavra comum em
// texto de tela, nenhum travessão, nenhum script inline novo, um rótulo de verdade por campo e
// os cartões de origem ligados às fontes. Lê os arquivos como texto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { fonteDoAssistente, ARQUIVOS_DO_ASSISTENTE } from './apoio/fonte-do-assistente.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const TRAVESSAO = String.fromCharCode(8212);

// Literais de texto fora de comentário, com espaço (frase de tela, não chave nem classe).
function frases(fonte) {
  const out = [];
  let emBloco = false;
  for (const linha of fonte.split('\n')) {
    const t = linha.trim();
    if (emBloco) { if (t.includes('*/')) emBloco = false; continue; }
    if (t.startsWith('/*')) { if (!t.includes('*/')) emBloco = true; continue; }
    if (t.startsWith('//') || t.startsWith('*')) continue;
    const re = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|\/\/.*$/g;
    let m;
    while ((m = re.exec(linha)) !== null) {
      if (m[0].startsWith('//')) break;
      const corpo = m[0].slice(1, -1).replace(/\$\{[^}]*\}/g, ' ');
      if (/\s/.test(corpo)) out.push(corpo);
    }
  }
  return out;
}

test('o assistente foi quebrado em módulos (nenhum arquivo gigante)', () => {
  assert.ok(ARQUIVOS_DO_ASSISTENTE.length >= 6, 'orquestrador + um módulo por passo');
  for (const arq of ARQUIVOS_DO_ASSISTENTE) {
    const linhas = readFileSync(arq, 'utf8').split('\n').length;
    assert.ok(linhas <= 520, `${arq.replace(raiz, '')} tem ${linhas} linhas: quebre em mais módulos`);
  }
});

test('texto de tela em palavra comum: sem jargão', () => {
  const proibidas = [
    [/\bdom[ií]nios?\b/i, 'domínio'], [/\bwidgets?\b/i, 'widget'], [/\bslots?\b/i, 'slot'], [/\bhash\b/i, 'hash'],
    [/n[úu]mero her[óo]i/i, 'número herói'], [/\bbadges?\b/i, 'badge'], [/\bderiv(ar|e|ada)\b/i, 'derivar'],
    [/\bm[ée]tricas?\b/i, 'métrica'], [/\bmape(ar|ie|amento)\b/i, 'mapear'], [/\bKV\b/, 'KV'], [/\bcron\b/i, 'cron'],
    [/fail-closed/i, 'fail-closed'], [/\bdeploy\b/i, 'deploy'],
  ];
  const erros = [];
  for (const arq of ARQUIVOS_DO_ASSISTENTE) {
    for (const frase of frases(readFileSync(arq, 'utf8'))) {
      for (const [re, nome] of proibidas) if (re.test(frase)) erros.push(`${arq.replace(raiz, '')}: "${nome}" em "${frase.slice(0, 80)}"`);
    }
  }
  assert.deepEqual(erros, []);
});

test('"gid" só aparece explicando onde achar o número da aba; "token" sempre com explicação por perto', () => {
  const todas = frases(fonteDoAssistente());
  const comGid = todas.filter((f) => /\bgid\b/i.test(f));
  assert.ok(comGid.length >= 1 && comGid.length <= 2, `gid em ${comGid.length} frases`);
  assert.ok(comGid.every((f) => /endereço|link/i.test(f)), 'a frase diz onde olhar');
  assert.ok(todas.some((f) => /chave de administrador \(token\)/i.test(f)), 'token apresentado como chave de administrador');
  assert.ok(todas.some((f) => /ADMIN_TOKEN/.test(f) && /\.dev\.vars/.test(f)), 'diz onde a pessoa pega');
});

test('zero travessão nos arquivos do assistente, na página e no CSS dele', () => {
  const alvos = [
    ...ARQUIVOS_DO_ASSISTENTE,
    join(raiz, 'public/config.html'), join(raiz, 'public/assets/css/assistente.css'), join(raiz, 'public/assets/css/main.css'),
    join(raiz, 'public/assets/js/dashboard.js'), join(raiz, 'ARCHITECTURE.md'),
    ...readdirSync(join(raiz, 'public/assets/js/lib')).map((f) => join(raiz, 'public/assets/js/lib', f)),
    ...readdirSync(join(raiz, 'functions/lib')).map((f) => join(raiz, 'functions/lib', f)),
    join(raiz, 'functions/api/admin-check.js'), join(raiz, 'functions/api/dashboards.js'),
  ];
  for (const arq of alvos) assert.ok(!readFileSync(arq, 'utf8').includes(TRAVESSAO), `travessão em ${arq.replace(raiz, '')}`);
});

test('config.html: nenhum script inline novo (a CSP só libera o anti-flash) e o CSS do assistente ligado', () => {
  const html = readFileSync(join(raiz, 'public/config.html'), 'utf8');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)];
  assert.equal(inline.length, 1, 'só o script anti-flash de tema');
  assert.ok(html.includes('/assets/css/assistente.css'));
  assert.ok(html.includes('id="adminGate"'), 'lugar fixo da chave de administrador, acima do formulário');
  assert.ok(!/on(click|change|input)=/.test(html), 'sem handler inline');
  assert.ok(!/style="/.test(html), 'sem estilo inline na página');
});

test('nenhum módulo do assistente injeta HTML montado com dado da pessoa', () => {
  for (const arq of ARQUIVOS_DO_ASSISTENTE) {
    const fonte = readFileSync(arq, 'utf8');
    const usos = [...fonte.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
    const perigosos = usos.filter((u) => u !== "''" && !/^ICONE_|^SVG_/.test(u));
    assert.deepEqual(perigosos, [], `${arq.replace(raiz, '')}: innerHTML só pra limpar ou pra ícone fixo`);
  }
});

test('os quatro passos são perguntas em palavra comum', () => {
  const fonte = fonteDoAssistente();
  for (const titulo of ['O que você quer acompanhar?', 'Onde estão os seus números?', 'Confira as colunas', 'Deixe com a sua cara']) {
    assert.ok(fonte.includes(titulo), `falta o título "${titulo}"`);
  }
  for (const texto of ['Baixar planilha modelo', 'Opções avançadas', 'Qual aba da planilha', 'Mais opções', 'Copiar link', 'Abrir painel', 'Criar outro', 'Enviar logotipo', 'Remover logotipo']) {
    assert.ok(fonte.includes(texto), `falta o texto "${texto}"`);
  }
});
