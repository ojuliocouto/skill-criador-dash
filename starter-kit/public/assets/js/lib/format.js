// Formatação e parsing de números/datas no padrão brasileiro.
// Puro, sem dependências. Importável no browser (ESM) e no node:test.

/**
 * Converte string BR/US em número. "1.234,56" -> 1234.56, "1234.56" -> 1234.56.
 * Remove símbolos de moeda e espaços. Retorna NaN se não for numérico.
 */
export function parseNumberBR(v) {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  // remove moeda, %, espacos e caracteres nao numericos das pontas uteis
  s = s.replace(/R\$/gi, '').replace(/%/g, '').replace(/\s/g, '').trim();
  if (!s) return NaN;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // assume padrao BR: ponto = milhar, virgula = decimal
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    // so virgula -> decimal BR
    s = s.replace(',', '.');
  } else if (hasDot) {
    // so ponto: se parece milhar (ex 1.234 ou 1.234.567), remove; senao mantem decimal
    const parts = s.split('.');
    const looksThousand = parts.length > 1 && parts.slice(1).every((p) => p.length === 3);
    if (looksThousand) s = parts.join('');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Normaliza data em ISO YYYY-MM-DD. Aceita DD/MM/AAAA, AAAA-MM-DD, D/M/AAAA.
 * Retorna null se inválida.
 */
export function parseDateBR(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // ja ISO
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    return isValidYMD(+m[1], +m[2], +m[3]) ? iso : null;
  }
  // DD/MM/AAAA ou D/M/AAAA (aceita - ou . como separador)
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    d = +d; mo = +mo; y = +y;
    if (y < 100) y += 2000;
    if (!isValidYMD(y, mo, d)) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

function isValidYMD(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

const nf = (min, max) => new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: min, maximumFractionDigits: max,
});

export function fmtCurrency(n) {
  const v = Number.isFinite(n) ? n : 0;
  return 'R$ ' + nf(2, 2).format(v);
}

export function fmtNumber(n) {
  const v = Number.isFinite(n) ? n : 0;
  return nf(0, 2).format(v);
}

export function fmtPercent(n) {
  const v = Number.isFinite(n) ? n : 0;
  return nf(2, 2).format(v * 100) + '%';
}

export function fmtInteger(n) {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  return nf(0, 0).format(v);
}
