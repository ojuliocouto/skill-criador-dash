// Logotipo enviado do computador (passo "Deixe com a sua cara"). O navegador reduz a imagem num
// canvas e exporta PNG em data URL pra config.logo. Aqui fica a parte pura: validação do arquivo,
// dimensões finais, luminância média e a escolha do fundo da plaquinha (logo claro pede placa
// escura e vice-versa, senão ele some).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  ALTURA_MAX_DO_LOGO, LARGURA_MAX_DO_LOGO, TAMANHO_MAX_DO_ARQUIVO, LIMITE_DO_DATA_URL,
  validarArquivoDeLogo, dimensoesDoLogo, alturasDeTentativa, cabeNoLimite,
  luminanciaMedia, fundoDaPlaca, fundoValido,
} from '../public/assets/js/lib/logo.js';
import { cabecalhoHtml } from '../public/assets/js/lib/cabecalho.js';
import { brandInnerHtml } from '../public/assets/js/lib/brand.js';
import { validarFundoDoLogo } from '../functions/lib/logo-shape.mjs';
import { onRequest as dashboards } from '../functions/api/dashboards.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- validação do arquivo ----------

test('validarArquivoDeLogo: aceita PNG, JPG, WebP e SVG', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']) {
    assert.equal(validarArquivoDeLogo({ type, size: 20000, name: 'logo' }), null, type);
  }
  assert.equal(validarArquivoDeLogo({ type: '', size: 900, name: 'Marca.SVG' }), null, 'sem tipo, vale a extensão');
});

test('validarArquivoDeLogo: arquivo que não é imagem recebe mensagem que diz o que fazer', () => {
  const msg = validarArquivoDeLogo({ type: 'application/pdf', size: 20000, name: 'logo.pdf' });
  assert.match(msg, /PNG, JPG, WebP ou SVG/);
  assert.ok(validarArquivoDeLogo({ type: 'image/gif', size: 20000, name: 'a.gif' }));
  assert.ok(validarArquivoDeLogo({ type: 'text/csv', size: 10, name: 'dados.csv' }));
  assert.ok(validarArquivoDeLogo(null));
});

test('validarArquivoDeLogo: grande demais e vazio têm mensagem própria', () => {
  assert.match(validarArquivoDeLogo({ type: 'image/png', size: TAMANHO_MAX_DO_ARQUIVO + 1, name: 'a.png' }), /5 MB/);
  assert.match(validarArquivoDeLogo({ type: 'image/png', size: 0, name: 'a.png' }), /vazio/);
});

// ---------- dimensões ----------

test('dimensoesDoLogo: reduz pra altura máxima mantendo a proporção', () => {
  assert.equal(ALTURA_MAX_DO_LOGO, 160);
  assert.deepEqual(dimensoesDoLogo(1200, 600), { largura: 320, altura: 160 });
  assert.deepEqual(dimensoesDoLogo(500, 500), { largura: 160, altura: 160 });
});

test('dimensoesDoLogo: nunca amplia imagem pequena', () => {
  assert.deepEqual(dimensoesDoLogo(120, 40), { largura: 120, altura: 40 });
});

test('dimensoesDoLogo: logo muito comprido respeita também a largura máxima', () => {
  const d = dimensoesDoLogo(4000, 400);
  assert.equal(d.largura, LARGURA_MAX_DO_LOGO);
  assert.equal(d.altura, Math.round(LARGURA_MAX_DO_LOGO / 10));
  assert.ok(d.altura <= ALTURA_MAX_DO_LOGO);
});

test('dimensoesDoLogo: aceita outra altura máxima e nunca devolve zero', () => {
  assert.deepEqual(dimensoesDoLogo(1200, 600, { alturaMax: 64 }), { largura: 128, altura: 64 });
  assert.deepEqual(dimensoesDoLogo(3000, 2), { largura: LARGURA_MAX_DO_LOGO, altura: 1 });
});

test('dimensoesDoLogo: imagem sem tamanho (corrompida) devolve null', () => {
  assert.equal(dimensoesDoLogo(0, 0), null);
  assert.equal(dimensoesDoLogo(NaN, 100), null);
  assert.equal(dimensoesDoLogo(100, -5), null);
});

test('alturasDeTentativa: começa na altura máxima e vai diminuindo', () => {
  const a = alturasDeTentativa();
  assert.equal(a[0], ALTURA_MAX_DO_LOGO);
  assert.ok(a.length >= 3);
  assert.deepEqual([...a].sort((x, y) => y - x), a);
});

test('o data URL final cabe com folga no limite que o servidor já valida', () => {
  const fonte = readFileSync(join(raiz, 'functions/api/dashboards.js'), 'utf8');
  const m = fonte.match(/const LOGO_MAX_LEN = (\d+) \* (\d+);/);
  assert.ok(m, 'limite do servidor encontrado');
  const limiteDoServidor = Number(m[1]) * Number(m[2]);
  assert.ok(LIMITE_DO_DATA_URL <= limiteDoServidor * 0.8, 'pelo menos 20% de folga');
  assert.equal(cabeNoLimite(`data:image/png;base64,${'A'.repeat(1000)}`), true);
  assert.equal(cabeNoLimite(`data:image/png;base64,${'A'.repeat(LIMITE_DO_DATA_URL)}`), false);
  assert.equal(cabeNoLimite(''), false);
  assert.equal(cabeNoLimite('data:image/svg+xml;base64,AAAA'), false, 'SVG cru nunca é guardado');
});

// ---------- luminância e fundo da plaquinha ----------

const pixels = (...rgba) => Uint8ClampedArray.from(rgba.flat());

test('luminanciaMedia: branco é 1, preto é 0, só conta pixel opaco', () => {
  assert.ok(luminanciaMedia(pixels([255, 255, 255, 255])) > 0.99);
  assert.ok(luminanciaMedia(pixels([0, 0, 0, 255])) < 0.01);
  const brancoComFundoTransparente = pixels([255, 255, 255, 255], [0, 0, 0, 0], [0, 0, 0, 0]);
  assert.ok(luminanciaMedia(brancoComFundoTransparente) > 0.99, 'pixel transparente não puxa a média pra baixo');
});

test('luminanciaMedia: imagem toda transparente ou vazia devolve null', () => {
  assert.equal(luminanciaMedia(pixels([0, 0, 0, 0], [255, 255, 255, 10])), null);
  assert.equal(luminanciaMedia(new Uint8ClampedArray(0)), null);
  assert.equal(luminanciaMedia(null), null);
});

test('fundoDaPlaca: logo claro vai em placa escura; logo escuro ou colorido vai em placa clara', () => {
  assert.equal(fundoDaPlaca(luminanciaMedia(pixels([255, 255, 255, 255]))), 'escuro');
  assert.equal(fundoDaPlaca(luminanciaMedia(pixels([250, 240, 200, 255]))), 'escuro');
  assert.equal(fundoDaPlaca(luminanciaMedia(pixels([0, 0, 0, 255]))), 'claro');
  assert.equal(fundoDaPlaca(luminanciaMedia(pixels([91, 98, 214, 255]))), 'claro');
  assert.equal(fundoDaPlaca(null), 'claro', 'sem medida, o padrão de sempre');
});

test('fundoValido: só claro e escuro', () => {
  assert.equal(fundoValido('claro'), true);
  assert.equal(fundoValido('escuro'), true);
  assert.equal(fundoValido('azul'), false);
  assert.equal(fundoValido(undefined), false);
});

// ---------- onde o fundo aparece ----------

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('cabeçalho de marca: logo claro ganha a placa escura; sem fundo informado, a placa clara de sempre', () => {
  const escuro = cabecalhoHtml({ nome: 'Painel', logo: PNG, logoFundo: 'escuro' });
  assert.match(escuro, /class="faixa__logo faixa__logo--escuro"/);
  const padrao = cabecalhoHtml({ nome: 'Painel', logo: PNG });
  assert.match(padrao, /class="faixa__logo"/);
  const invalido = cabecalhoHtml({ nome: 'Painel', logo: PNG, logoFundo: '"><script>' });
  assert.match(invalido, /class="faixa__logo"/);
  assert.ok(!invalido.includes('<script>'));
});

test('barra do topo: com fundo informado o logo vai numa placa; sem ele, nada muda', () => {
  assert.match(brandInnerHtml('ACME', PNG, 'escuro'), /class="brand-placa brand-placa--escuro"/);
  assert.match(brandInnerHtml('ACME', PNG, 'claro'), /class="brand-placa brand-placa--claro"/);
  assert.equal(brandInnerHtml('ACME', PNG), brandInnerHtml('ACME', PNG, 'lixo'));
  assert.ok(!brandInnerHtml('ACME', PNG).includes('brand-placa'));
});

// ---------- servidor ----------

test('validarFundoDoLogo: ausente passa; só aceita claro ou escuro', () => {
  assert.equal(validarFundoDoLogo({}), null);
  assert.equal(validarFundoDoLogo({ logoFundo: 'claro' }), null);
  assert.equal(validarFundoDoLogo({ logoFundo: 'escuro' }), null);
  assert.match(validarFundoDoLogo({ logoFundo: 'azul' }), /logoFundo/);
  assert.ok(validarFundoDoLogo({ logoFundo: 1 }));
});

test('POST /api/dashboards: grava logo em data URL com o fundo; recusa fundo inválido', async () => {
  const map = new Map();
  const kv = { async get(k) { return map.get(k) ?? null; }, async put(k, v) { map.set(k, v); }, async delete(k) { map.delete(k); }, async list() { return { keys: [] }; } };
  const env = { DASHBOARDS_KV: kv, ADMIN_TOKEN: 't' };
  const base = {
    name: 'Com logo', domain: 'marketing',
    source: { type: 'csv', data: 'Data,Investimento\n01/07/2026,"10,00"' },
    colMap: { data: 'Data', investimento: 'Investimento' },
  };
  const post = (body) => dashboards({ request: new Request('https://x/api/dashboards', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': 't' }, body: JSON.stringify(body),
  }), env });
  const ok = await post({ ...base, logo: PNG, logoFundo: 'escuro' });
  assert.equal(ok.status, 200);
  assert.equal(JSON.parse([...map.values()][0]).logoFundo, 'escuro');
  assert.equal((await post({ ...base, name: 'Outro', logo: PNG, logoFundo: 'neon' })).status, 400);
  const grande = `data:image/png;base64,${'A'.repeat(LIMITE_DO_DATA_URL - 30)}`;
  assert.equal((await post({ ...base, name: 'Grande', logo: grande })).status, 200, 'o maior logo que o navegador gera passa no servidor');
});
