/**
 * Os sinais da lista de "tells" de painel (references/direcao-de-arte.md, Fase 3) que dá para MEDIR no navegador,
 * e os que não dá (gosto). `medirNaPagina` roda DENTRO da página (page.evaluate): é uma função só, sem
 * dependências, que devolve { sinais: { chave: { achados, onde: [..] } } } para o estado atual da tela.
 * Não finge medir o que é gosto: `NAO_MEDIDOS` fica de fora e o gate pede o print olhado, item por item.
 */
const SINAIS = Object.freeze({
  tinta_de_accent: 'card com fundo tingido da cor de destaque',
  barrinha_no_topo: 'barrinha colorida no topo de widget',
  gradiente_atras_de_numero: 'gradiente decorativo atrás de número',
  icone_por_metrica: 'ícone colorido por métrica',
  sombra_sem_hairline: 'sombra difusa grande em card, sem hairline',
  sem_dados_sem_motivo: '"Sem dados" como único estado vazio',
  caixa_alta_espacada: 'rótulo em CAIXA ALTA espaçada (kicker)',
  numero_em_mono_esticado: 'número em fonte mono com espaçamento esticado',
  card_com_metade_vazia: 'card com metade vazia',
  data_formato_americano: 'data em formato americano (mm/dd/aaaa)',
});
// O que a lista tem e a máquina não alcança: cor como significado (não enfeite) e o olho sobre a tela inteira.
const NAO_MEDIDOS = Object.freeze({
  cor_como_enfeite: 'cor usada como enfeite em vez de significado (bom, ruim, neutro, marca)',
  olhado_claro: 'o painel inteiro olhado no tema claro (desktop e celular)',
  olhado_escuro: 'o painel inteiro olhado no tema escuro (desktop e celular)',
});

function medirNaPagina() {
  const saida = {};
  const marcar = (chave, onde) => { (saida[chave] = saida[chave] || { achados: 0, onde: [] }).achados += 1; if (saida[chave].onde.length < 6) saida[chave].onde.push(onde); };
  const visivel = (el) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  const rotulo = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
  const rgb = (c) => { const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?/.exec(c || ''); if (!m) return null; const a = m[4] == null ? 1 : (String(m[4]).endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])); return { r: +m[1], g: +m[2], b: +m[3], a }; };
  const sat = (c) => { const k = rgb(c); if (!k || k.a < 0.05) return 0; const mx = Math.max(k.r, k.g, k.b) / 255; const mn = Math.min(k.r, k.g, k.b) / 255; const l = (mx + mn) / 2; const d = mx - mn; return d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)); };
  const luz = (c) => { const k = rgb(c); return k ? (Math.max(k.r, k.g, k.b) + Math.min(k.r, k.g, k.b)) / 510 : 0; };
  const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

  const cartoes = [...document.querySelectorAll('.card, .kpi, .resumo, .table, .chart, .ranking, .funnel, .widget')].filter(visivel);

  for (const el of cartoes) {
    const s = getComputedStyle(el);
    // 1. fundo tingido: cor viva (saturação alta), nem quase preta nem quase branca do tema
    const l = luz(s.backgroundColor);
    if (sat(s.backgroundColor) > 0.25 && l > 0.15 && l < 0.97) marcar('tinta_de_accent', rotulo(el));
    // 2. barrinha colorida no topo: borda de cima viva e grossa, ou pseudo-elemento fininho colado no topo
    if (px(s.borderTopWidth) >= 2 && sat(s.borderTopColor) > 0.25) marcar('barrinha_no_topo', rotulo(el));
    for (const p of ['::before', '::after']) {
      const ps = getComputedStyle(el, p);
      if (ps.content === 'none' || ps.content === 'normal') continue;
      const alto = px(ps.height); const larg = px(ps.width);
      if (ps.position === 'absolute' && px(ps.top) <= 1 && alto > 0 && alto <= 6 && larg >= el.getBoundingClientRect().width * 0.4 && sat(ps.backgroundColor) > 0.25) marcar('barrinha_no_topo', rotulo(el) + p);
    }
    // 5. sombra difusa grande e nenhuma linha fina (hairline) em volta
    const blurs = [...(s.boxShadow || '').matchAll(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/g)].map((m) => parseFloat(m[3]));
    const semBorda = px(s.borderTopWidth) + px(s.borderLeftWidth) + px(s.borderRightWidth) + px(s.borderBottomWidth) === 0;
    if (blurs.some((b) => b >= 24) && semBorda && !el.closest('.grid.kpis')) marcar('sombra_sem_hairline', rotulo(el));
  }
  // O contêiner da faixa de números faz o papel de hairline dos cartões que ele guarda.
  for (const el of document.querySelectorAll('.grid.kpis')) {
    const s = getComputedStyle(el);
    const blurs = [...(s.boxShadow || '').matchAll(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/g)].map((m) => parseFloat(m[3]));
    if (blurs.some((b) => b >= 24) && px(s.borderTopWidth) === 0) marcar('sombra_sem_hairline', rotulo(el));
  }

  // 3. gradiente atrás de número e 4. ícone por métrica, dentro de cada cartão de número
  for (const k of document.querySelectorAll('.kpi')) {
    if (!visivel(k)) continue;
    for (const el of [k, ...k.querySelectorAll('.kpi__value, .kpi__valor, [class*="value"]')]) {
      for (const p of [null, '::before', '::after']) {
        const s = getComputedStyle(el, p);
        if (p && (s.content === 'none' || s.content === 'normal')) continue;
        if ((s.backgroundImage || '').includes('gradient') && !el.matches('.kpi__onda, .kpi__faixa')) marcar('gradiente_atras_de_numero', rotulo(el) + (p || ''));
      }
    }
    for (const ic of k.querySelectorAll('svg, img')) {
      if (ic.closest('.kpi__spark, .kpi__selo, .kpi__goal, .kpi__trend, .kpi__roleta, .kpi__onda')) continue;
      const r = ic.getBoundingClientRect();
      if (r.width >= 14 && r.width <= 56 && r.height >= 14 && r.height <= 56) marcar('icone_por_metrica', rotulo(k));
    }
  }

  // 6. "Sem dados" como o único recado de um estado vazio
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length || !visivel(el)) continue;
    const t = (el.textContent || '').trim();
    if (/^sem dados\.?$/i.test(t)) marcar('sem_dados_sem_motivo', rotulo(el));
  }

  // 7. caixa alta espaçada, 8. número em mono esticado, 10. data americana
  const textos = [...document.querySelectorAll('body *')].filter((el) => !el.children.length && visivel(el) && (el.textContent || '').trim().length >= 2 && !/^(SCRIPT|STYLE|OPTION)$/.test(el.tagName));
  for (const el of textos) {
    const s = getComputedStyle(el);
    const t = (el.textContent || '').trim();
    const fonte = px(s.fontSize) || 14;
    const espaco = s.letterSpacing === 'normal' ? 0 : px(s.letterSpacing) / fonte;
    const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
    const caixaAlta = s.textTransform === 'uppercase' || (letras.length >= 4 && letras === letras.toUpperCase() && /[A-ZÀ-Ý]/.test(letras));
    if (caixaAlta && espaco >= 0.05) marcar('caixa_alta_espacada', `${rotulo(el)} "${t.slice(0, 24)}"`);
    const ehNumero = el.matches('.kpi__value, .num, td.num, .kpi__valor') || (/^[R$\s\d.,%+-]+$/.test(t) && /\d/.test(t) && el.closest('.kpi'));
    if (ehNumero) {
      const mono = /mono|courier|consolas/i.test(s.fontFamily);
      if ((mono && espaco > 0.02) || espaco >= 0.06) marcar('numero_em_mono_esticado', `${rotulo(el)} "${t.slice(0, 16)}"`);
    }
    if (/\b(0?[1-9]|1[0-2])\/(1[3-9]|2\d|3[01])\/(19|20)\d{2}\b/.test(t)) marcar('data_formato_americano', `${rotulo(el)} "${t.slice(0, 24)}"`);
  }

  // 9. card com metade vazia: o conteúdo ocupa menos da metade da altura do cartão
  for (const k of document.querySelectorAll('.kpi')) {
    if (!visivel(k)) continue;
    const caixa = k.getBoundingClientRect();
    if (caixa.height < 120) continue;
    let fundo = caixa.top;
    for (const f of k.querySelectorAll('*')) { const r = f.getBoundingClientRect(); if (r.height > 0 && r.width > 0 && f.offsetParent !== null && !f.matches('.kpi__onda, .kpi__faixa, [aria-hidden="true"]:empty')) fundo = Math.max(fundo, r.bottom); }
    const usado = (fundo - caixa.top) / caixa.height;
    if (usado < 0.5) marcar('card_com_metade_vazia', `${rotulo(k)} usa ${Math.round(usado * 100)}% de ${Math.round(caixa.height)} px`);
  }
  return saida;
}

module.exports = { SINAIS, NAO_MEDIDOS, medirNaPagina };
