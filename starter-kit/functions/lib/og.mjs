// Metadados de compartilhamento (preview de link / OpenGraph) por dashboard.
// Puro e testavel: recebe a config (ou null) e devolve titulo, descricao, cor,
// favicon tingido e a URL/o SVG da imagem OG. O middleware injeta isso no <head>
// da pagina no SERVIDOR (crawler de link nao roda JS, entao precisa vir no HTML).
//
// Privacidade: dashboard protegido por senha NAO vaza nome/dominio aqui (cai no
// texto generico), igual a listagem publica.

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const DEFAULT_ACCENT = '#6d28d9';
const SITE = 'Criador Dash';

const DOMAIN_LABELS = { marketing: 'Marketing', vendas: 'Vendas', suporte: 'Suporte' };
const DOMAIN_DESC = {
  marketing: 'Investimento, leads, CTR, CPL, CPA e ROAS.',
  vendas: 'Faturamento, negócios, ticket médio e taxa de conversão.',
  suporte: 'Atendimentos, taxa de resolução, tempo de resposta e CSAT.',
};

export function domainLabel(domain) {
  if (DOMAIN_LABELS[domain]) return DOMAIN_LABELS[domain];
  if (!domain) return 'Dashboard';
  return String(domain).charAt(0).toUpperCase() + String(domain).slice(1);
}

function safeAccent(accent) {
  return accent && HEX.test(String(accent)) ? String(accent) : DEFAULT_ACCENT;
}

// Escapa pra ATRIBUTO HTML (aspas duplas) e pra texto XML/SVG.
export function escapeAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function truncate(s, max) {
  const str = String(s == null ? '' : s).trim();
  return str.length > max ? str.slice(0, max - 1).trimEnd() + '…' : str;
}

// Favicon tingido com a cor da marca (mesma forma de barras da favicon padrao).
// data:image/svg+xml com o hex URL-encoded (# -> %23); casa com img-src data:.
export function faviconDataUri(accent) {
  const enc = safeAccent(accent).replace('#', '%23');
  return (
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E" +
    `%3Crect width='32' height='32' rx='7' fill='${enc}'/%3E` +
    "%3Crect x='8' y='16' width='4' height='9' fill='white'/%3E" +
    "%3Crect x='14' y='11' width='4' height='14' fill='white'/%3E" +
    "%3Crect x='20' y='7' width='4' height='18' fill='white'/%3E%3C/svg%3E"
  );
}

/**
 * Monta os metadados a partir da config (parseada) do dashboard.
 * @param {object|null} config  config crua do KV (ou null se nao achou)
 * @param {{ id:string, origin:string, isProtected?:boolean }} ctx
 * @returns {{title,description,themeColor,imageUrl,siteName,faviconHref,isProtected,robots}}
 */
export function buildMeta(config, ctx = {}) {
  const { id = '', origin = '', isProtected = false } = ctx;
  const imageUrl = origin ? `${origin}/og?id=${encodeURIComponent(id)}` : `/og?id=${encodeURIComponent(id)}`;

  // Protegido, sem config, ou config invalida: generico, sem vazar identidade.
  if (isProtected || !config || typeof config !== 'object') {
    return {
      title: isProtected ? 'Dashboard protegido' : SITE,
      description: isProtected
        ? 'Este painel é protegido por senha.'
        : 'Painel de métricas de marketing, vendas e suporte.',
      themeColor: DEFAULT_ACCENT,
      imageUrl,
      siteName: SITE,
      faviconHref: faviconDataUri(DEFAULT_ACCENT),
      isProtected: !!isProtected,
      robots: isProtected ? 'noindex' : 'index',
    };
  }

  const name = truncate(config.name || 'Dashboard', 70);
  const accent = safeAccent(config.accent);
  let description;
  if (config.kind === 'group') {
    const tabs = Array.isArray(config.tabs) ? config.tabs.filter((t) => t && t.id) : [];
    const labels = tabs.map((t) => truncate(t.label || t.id, 20)).slice(0, 6);
    description = labels.length
      ? `Painel com ${tabs.length} área${tabs.length === 1 ? '' : 's'}: ${labels.join(', ')}.`
      : 'Painel com abas.';
  } else {
    const label = domainLabel(config.domain);
    description = `Painel de ${label}. ${DOMAIN_DESC[config.domain] || ''}`.trim();
  }

  return {
    title: name,
    description: truncate(description, 200),
    themeColor: accent,
    imageUrl,
    siteName: SITE,
    faviconHref: faviconDataUri(accent),
    isProtected: false,
    robots: 'index',
  };
}

// HTML das tags de <head> a injetar (og/twitter/description/theme-color/robots).
// O <title> e a favicon sao trocados a parte pelo middleware (elementos que ja
// existem). Todos os valores escapados pra atributo.
export function metaTagsHtml(meta) {
  const a = (v) => escapeAttr(v);
  const tags = [
    `<meta name="description" content="${a(meta.description)}">`,
    `<meta name="theme-color" content="${a(meta.themeColor)}">`,
    `<meta name="robots" content="${a(meta.robots)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${a(meta.siteName)}">`,
    `<meta property="og:title" content="${a(meta.title)}">`,
    `<meta property="og:description" content="${a(meta.description)}">`,
    `<meta property="og:image" content="${a(meta.imageUrl)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${a(meta.title)}">`,
    `<meta name="twitter:description" content="${a(meta.description)}">`,
    `<meta name="twitter:image" content="${a(meta.imageUrl)}">`,
  ];
  return tags.join('');
}

// SVG da imagem de compartilhamento (1200x630), na cara do dashboard: fundo
// escuro, um mini grafico de barras na cor da marca, nome grande + rotulo. Fonte
// generica (o crawler renderiza com a dele; nao embute Geist pra nao pesar).
export function ogImageSvg(config, ctx = {}) {
  const isProtected = !!(ctx && ctx.isProtected);
  const has = config && typeof config === 'object' && !isProtected;
  const accent = safeAccent(has ? config.accent : DEFAULT_ACCENT);
  const bg = '#0c0e12';
  const text = '#e9ecf1';
  const dim = '#99a1ae';
  const border = '#262b33';

  let title = SITE;
  let sub = 'Painel de métricas';
  if (isProtected) {
    title = 'Dashboard protegido';
    sub = 'Acesso por senha';
  } else if (has) {
    title = truncate(config.name || 'Dashboard', 34);
    sub = config.kind === 'group'
      ? `Grupo · ${SITE}`
      : `${domainLabel(config.domain)} · ${SITE}`;
  }

  // Mini grafico de barras (motivo de marca), canto inferior direito.
  const bars = [120, 200, 150, 240, 300, 210, 270]
    .map((h, i) => `<rect x="${760 + i * 58}" y="${520 - h}" width="34" height="${h}" rx="4" fill="${accent}" opacity="${0.55 + (i % 3) * 0.15}"/>`)
    .join('');

  const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const t = escapeAttr(title);
  const s = escapeAttr(sub);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">` +
    `<rect width="1200" height="630" fill="${bg}"/>` +
    `<rect x="0" y="0" width="1200" height="630" fill="none" stroke="${border}" stroke-width="2"/>` +
    bars +
    `<rect x="80" y="470" width="1040" height="1" fill="${border}"/>` +
    `<rect x="80" y="84" width="22" height="22" rx="5" fill="${accent}"/>` +
    `<text x="116" y="102" font-family="${font}" font-size="26" font-weight="600" fill="${dim}">${escapeAttr(SITE)}</text>` +
    `<text x="80" y="300" font-family="${font}" font-size="72" font-weight="700" fill="${text}">${t}</text>` +
    `<text x="80" y="356" font-family="${font}" font-size="30" fill="${dim}">${s}</text>` +
    `</svg>`
  );
}
