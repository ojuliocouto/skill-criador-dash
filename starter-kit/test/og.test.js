import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  domainLabel, escapeAttr, faviconDataUri, buildMeta, metaTagsHtml, ogImageSvg,
} from '../functions/lib/og.mjs';

// ---------- domainLabel ----------
test('domainLabel: dominios conhecidos e fallback capitalizado', () => {
  assert.equal(domainLabel('marketing'), 'Marketing');
  assert.equal(domainLabel('vendas'), 'Vendas');
  assert.equal(domainLabel('financeiro'), 'Financeiro');
  assert.equal(domainLabel(undefined), 'Dashboard');
});

// ---------- escapeAttr ----------
test('escapeAttr: neutraliza aspas e angulares (anti-injecao no head)', () => {
  assert.equal(escapeAttr('a"><script>'), 'a&quot;&gt;&lt;script&gt;');
});

// ---------- faviconDataUri ----------
test('faviconDataUri: usa o accent (hex URL-encoded) e cai no default se invalido', () => {
  assert.ok(faviconDataUri('#FA243C').includes('%23FA243C'), 'hex valido tingido');
  assert.ok(faviconDataUri('rgb(1,2,3)').includes('%236d28d9'), 'invalido cai no default');
  assert.ok(faviconDataUri('#FA243C').startsWith('data:image/svg+xml,'), 'data uri de imagem');
});

// ---------- buildMeta ----------
test('buildMeta: dashboard de dominio usa nome + descricao do dominio + accent', () => {
  const cfg = { id: 'apple-music-marketing', name: 'Apple Music: Marketing', domain: 'marketing', accent: '#FA243C' };
  const m = buildMeta(cfg, { id: cfg.id, origin: 'https://x.pages.dev' });
  assert.equal(m.title, 'Apple Music: Marketing');
  assert.match(m.description, /Marketing/);
  assert.match(m.description, /CTR|ROAS/);
  assert.equal(m.themeColor, '#FA243C');
  assert.equal(m.imageUrl, 'https://x.pages.dev/og?id=apple-music-marketing');
  assert.ok(m.faviconHref.includes('%23FA243C'));
  assert.equal(m.robots, 'index');
});

test('buildMeta: grupo lista as areas na descricao', () => {
  const cfg = { id: 'apple-music', name: 'Apple Music', kind: 'group', accent: '#FA243C',
    tabs: [{ id: 'a', label: 'Marketing' }, { id: 'b', label: 'Vendas' }, { id: 'c', label: 'Suporte' }] };
  const m = buildMeta(cfg, { id: cfg.id, origin: 'https://x' });
  assert.equal(m.title, 'Apple Music');
  assert.match(m.description, /3 áreas/);
  assert.match(m.description, /Marketing, Vendas, Suporte/);
});

test('buildMeta: protegido NAO vaza nome/dominio (generico + noindex)', () => {
  const cfg = { id: 'secreto', name: 'Cliente Secreto', domain: 'vendas', accent: '#123456' };
  const m = buildMeta(cfg, { id: 'secreto', origin: 'https://x', isProtected: true });
  assert.notEqual(m.title, 'Cliente Secreto');
  assert.doesNotMatch(m.description, /Cliente Secreto/);
  assert.equal(m.robots, 'noindex');
});

test('buildMeta: sem config (nao achou) cai no generico do site', () => {
  const m = buildMeta(null, { id: 'x', origin: 'https://x' });
  assert.equal(m.title, 'Criador Dash');
  assert.equal(m.robots, 'index');
});

// ---------- metaTagsHtml ----------
test('metaTagsHtml: gera og/twitter/description/theme-color escapados', () => {
  const html = metaTagsHtml(buildMeta({ id: 'd', name: 'Dash "X"', domain: 'vendas', accent: '#abc' }, { id: 'd', origin: 'https://x' }));
  assert.match(html, /property="og:title" content="Dash &quot;X&quot;"/);
  assert.match(html, /property="og:image" content="https:\/\/x\/og\?id=d"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /name="theme-color" content="#abc"/);
  assert.ok(!html.includes('<script'), 'nao injeta script');
});

// ---------- ogImageSvg ----------
test('ogImageSvg: SVG 1200x630 com nome e accent', () => {
  const svg = ogImageSvg({ name: 'Apple Music', domain: 'marketing', accent: '#FA243C' }, { id: 'x' });
  assert.match(svg, /^<svg[^>]*width="1200" height="630"/);
  assert.ok(svg.includes('#FA243C'), 'usa o accent');
  assert.ok(svg.includes('Apple Music'), 'mostra o nome');
});

test('ogImageSvg: protegido nao mostra o nome', () => {
  const svg = ogImageSvg({ name: 'Cliente Secreto', domain: 'vendas', accent: '#111' }, { id: 'x', isProtected: true });
  assert.ok(!svg.includes('Cliente Secreto'), 'nao vaza nome protegido');
  assert.ok(svg.includes('protegido'), 'mostra estado protegido');
});
