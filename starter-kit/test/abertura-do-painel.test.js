// O que o servidor marca no HTML do painel ANTES de o navegador pintar: o modo (claro ou
// escuro) que o dono escolheu, quem a saudação cumprimenta, a cor da marca e o logotipo.
// Painel protegido por senha não entrega nome, cor nem logotipo.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { marcasIniciais } from '../functions/lib/abertura-do-painel.mjs';
import { onRequest as middleware } from '../functions/_middleware.js';
import { quemCumprimentar, porteDaSaudacao } from '../public/assets/js/lib/saudacao.js';
import { temaDoModo } from '../public/assets/js/lib/tema-inicial.js';

const painel = { id: 'pilates', name: 'Studio Equilíbrio - Anúncios', domain: 'marketing', accent: '#0e9f6e' };

test('marcasIniciais: modo escolhido pelo dono vira o tema inicial', () => {
  assert.deepEqual(
    { modo: marcasIniciais({ ...painel, tema: 'escuro' }).modo, tema: marcasIniciais({ ...painel, tema: 'escuro' }).tema },
    { modo: 'escuro', tema: 'dark' },
  );
  assert.equal(marcasIniciais({ ...painel, tema: 'claro' }).tema, 'light');
  for (const tema of ['auto', undefined, '', 'lixo']) {
    const m = marcasIniciais({ ...painel, tema });
    assert.equal(m.tema, null, `${tema}: quem decide é o navegador de quem abre`);
    assert.equal(m.modo, null);
  }
});

test('marcasIniciais: mesma tradução de modo que o navegador usa', () => {
  for (const tema of ['claro', 'escuro', 'auto', undefined]) {
    assert.equal(marcasIniciais({ ...painel, tema }).tema, temaDoModo(tema));
  }
});

test('marcasIniciais: saudação nasce ligada, com o nome escolhido ou o nome do painel', () => {
  assert.equal(marcasIniciais(painel).saudacao, 'Studio Equilíbrio - Anúncios');
  assert.equal(marcasIniciais({ ...painel, saudacao: 'Carla' }).saudacao, 'Carla');
  assert.equal(marcasIniciais({ ...painel, saudacaoLigada: false }).saudacao, null);
  for (const cfg of [painel, { ...painel, saudacao: 'Carla' }, { ...painel, saudacao: ' time ' }, { ...painel, saudacao: '<b>' }, { name: '' }]) {
    assert.equal(marcasIniciais(cfg).saudacao || '', quemCumprimentar(cfg), 'servidor e navegador cumprimentam a mesma pessoa');
  }
});

test('marcasIniciais: nome comprido já sai com o porte da letra, na mesma régua do navegador', () => {
  for (const saudacao of ['Carla', 'time do Studio', 'time do Studio Equilíbrio de Pilates', 'x'.repeat(12), 'x'.repeat(13), 'x'.repeat(24), 'x'.repeat(25)]) {
    assert.equal(marcasIniciais({ ...painel, saudacao }).porte || '', porteDaSaudacao(saudacao), saudacao);
  }
  assert.equal(marcasIniciais({ ...painel, saudacao: 'Carla' }).porte, null);
  assert.equal(marcasIniciais(painel).porte, 'longa', 'o nome do painel de exemplo é comprido');
});

test('marcasIniciais: cor e logotipo só quando são seguros', () => {
  assert.equal(marcasIniciais(painel).accent, '#0e9f6e');
  assert.equal(marcasIniciais({ ...painel, accent: 'red; background:url(x)' }).accent, null);
  assert.equal(marcasIniciais({ ...painel, logo: 'https://exemplo.com/l.png', logoFundo: 'escuro' }).logo, 'https://exemplo.com/l.png');
  assert.equal(marcasIniciais({ ...painel, logo: 'https://exemplo.com/l.png', logoFundo: 'escuro' }).logoFundo, 'escuro');
  assert.equal(marcasIniciais({ ...painel, logo: 'javascript:alert(1)' }).logo, null);
  assert.equal(marcasIniciais({ ...painel, logo: 'data:text/html,x' }).logo, null);
});

test('marcasIniciais: painel protegido só entrega o modo (nome, cor e logotipo ficam atrás da senha)', () => {
  const m = marcasIniciais({ ...painel, tema: 'escuro', saudacao: 'Carla', logo: 'https://exemplo.com/l.png' }, { protegido: true });
  assert.deepEqual(m, { modo: 'escuro', tema: 'dark', saudacao: null, porte: null, accent: null, logo: null, logoFundo: null });
});

test('marcasIniciais: sem config (painel que não existe) não marca nada', () => {
  assert.deepEqual(marcasIniciais(null), { modo: null, tema: null, saudacao: null, porte: null, accent: null, logo: null, logoFundo: null });
});

// ---------- o middleware aplica as marcas no HTML (HTMLRewriter de mentira, só pro teste) ----------

class ReescritorDeTeste {
  constructor() { this.regras = []; }
  on(seletor, tratador) { this.regras.push([seletor, tratador]); return this; }
  transform(response) {
    const marcas = {};
    for (const [seletor, tratador] of this.regras) {
      const el = {
        setAttribute: (n, v) => { marcas[`${seletor}@${n}`] = v; },
        removeAttribute: (n) => { marcas[`${seletor}@-${n}`] = true; },
        setInnerContent: (v, o) => { marcas[`${seletor}#texto`] = { v, html: !!(o && o.html) }; },
        append: () => {},
      };
      if (tratador.element) tratador.element(el);
    }
    const r = new Response('ok', { status: 200, headers: response.headers });
    r.marcas = marcas;
    ReescritorDeTeste.ultimas = marcas;
    return r;
  }
}

async function abrir(config, url = 'https://x/dashboard?id=pilates') {
  const anterior = globalThis.HTMLRewriter;
  globalThis.HTMLRewriter = ReescritorDeTeste;
  ReescritorDeTeste.ultimas = null;
  try {
    await middleware({
      request: new Request(url),
      env: { DASHBOARDS_KV: { async get(k) { return k === 'dash:pilates' && config ? JSON.stringify(config) : null; } } },
      next: async () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }),
    });
    return ReescritorDeTeste.ultimas;
  } finally {
    globalThis.HTMLRewriter = anterior;
  }
}

test('middleware: painel com modo escuro sai do servidor já marcado como escuro', async () => {
  const marcas = await abrir({ ...painel, tema: 'escuro', saudacao: 'Carla' });
  assert.equal(marcas['html@data-theme'], 'dark');
  assert.equal(marcas['html@data-modo'], 'escuro');
  assert.equal(marcas['html@data-saudacao'], 'Carla');
  assert.equal(marcas['html@style'], '--accent:#0e9f6e');
  assert.deepEqual(marcas['.saudacao__nome#texto'], { v: 'Carla', html: false }, 'o nome entra como TEXTO, nunca como HTML');
  assert.equal(marcas['.saudacao@class'], undefined, 'nome curto: letra no porte maior');
});

test('middleware: painel antigo (sem os campos) não ganha tema marcado, mas ganha a saudação', async () => {
  const marcas = await abrir(painel);
  assert.equal(marcas['html@data-theme'], undefined);
  assert.equal(marcas['html@data-modo'], undefined);
  assert.equal(marcas['html@data-saudacao'], 'Studio Equilíbrio - Anúncios');
  assert.equal(marcas['.saudacao@class'], 'saudacao saudacao--longa');
});

test('middleware: saudação desligada não marca a saudação', async () => {
  const marcas = await abrir({ ...painel, saudacaoLigada: false });
  assert.equal(marcas['html@data-saudacao'], undefined);
});

test('middleware: painel protegido não entrega nome, cor nem logotipo no HTML', async () => {
  const marcas = await abrir({ ...painel, tema: 'claro', saudacao: 'Carla', logo: 'https://exemplo.com/l.png', auth: { salt: 's', verifier: 'v', iterations: 1 } });
  assert.equal(marcas['html@data-theme'], 'light');
  assert.equal(marcas['html@data-saudacao'], undefined);
  assert.equal(marcas['html@style'], undefined);
  assert.equal(marcas['.saudacao__nome#texto'], undefined);
  assert.ok(!JSON.stringify(marcas).includes('Carla'));
  assert.ok(!JSON.stringify(marcas).includes('exemplo.com'));
});

test('middleware: logotipo seguro vai pra tela de saudação com a plaquinha certa', async () => {
  const marcas = await abrir({ ...painel, logo: 'data:image/png;base64,AAAA', logoFundo: 'escuro' });
  assert.equal(marcas['.saudacao__logo-img@src'], 'data:image/png;base64,AAAA');
  assert.equal(marcas['.saudacao__logo@-hidden'], true);
  assert.match(marcas['.saudacao__logo@class'], /saudacao__logo--escuro/);
});
