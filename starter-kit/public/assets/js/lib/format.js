// Formatação e parsing de números/datas no padrão brasileiro.
// Puro, sem dependências. Importável no browser (ESM) e no node:test.

/**
 * Converte string BR/US em número. "1.234,56" -> 1234.56, "1234.56" -> 1234.56.
 * Remove símbolos de moeda e espaços. Retorna NaN se não for numérico.
 */
export function parseNumberBR(v) {
  // Fast-path de number: mas guarda a finitude. Antes, um number nao-finito
  // (Infinity/-Infinity/NaN) escapava direto e vazava pro UI. Entrada nao-finita
  // vira NaN (o mesmo fallback dos demais invalidos), que metrics.js ja filtra.
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (v == null) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  // Remove moeda, %, espacos. DECISAO (travada em teste): o '%' e apenas removido
  // e o numero volta COMO ESTA, sem dividir por 100. Ou seja '50%' -> 50 (o valor
  // "por cento" como numero 50), NAO 0.5. Converter de por-cento para fracao e
  // responsabilidade da metrica que consome o dado (ex: uma MetricDef de ratio ou
  // um compute que divide por 100), nunca deste parser cru. Assim parseNumberBR
  // continua sendo um leitor de NUMERO da celula, sem semantica de percentual
  // embutida, e somar uma coluna de '50%'/'30%' da 80 (nao 0.8), coerente com
  // metrics.js, que trata a celula como numero cru.
  s = s.replace(/R\$/gi, '').replace(/%/g, '').replace(/\s/g, '').trim();
  if (!s) return NaN;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // Ambos os separadores presentes: o DECIMAL e o que aparece por ULTIMO na string.
    // Se o ultimo for '.', formato US (virgula = milhar): '1,234.56' -> 1234.56.
    // Se o ultimo for ',', formato BR (ponto = milhar): '1.234,56' -> 1234.56.
    if (s.lastIndexOf('.') > s.lastIndexOf(',')) {
      // US: remove virgulas (milhar), mantem ponto decimal.
      s = s.replace(/,/g, '');
    } else {
      // BR: remove pontos (milhar), troca virgula por ponto decimal.
      s = s.replace(/\./g, '').replace(',', '.');
    }
  } else if (hasComma) {
    // So virgula, ambiguo (ex '1,234' pode ser 1234 milhar US ou 1.234 decimal BR).
    // Simetrico ao ramo so-com-ponto: se a virgula separa grupos de EXATAMENTE 3
    // digitos, e milhar -> remove as virgulas ('1,234' -> 1234, '1,000,000' -> 1000000).
    // Caso contrario e decimal BR -> troca virgula por ponto ('1,23' -> 1.23, '1,5' -> 1.5).
    const grupos = s.split(',');
    const primeiroTemDigitos = /^\d{1,3}$/.test(grupos[0]);
    const restoGrupoDe3 = grupos.slice(1).every((p) => /^\d{3}$/.test(p));
    const looksThousand = grupos.length > 1 && primeiroTemDigitos && restoGrupoDe3;
    if (looksThousand) s = grupos.join('');
    else s = s.replace(',', '.');
  } else if (hasDot) {
    // So ponto, ambiguo (ex '100.000' pode ser 100 mil ou 100.0).
    // HEURISTICA (limitacao conhecida e AMBIGUA): se cada grupo apos o 1o ponto
    // tem exatamente 3 digitos, tratamos como milhar -> remove os pontos
    // ('100.000' -> 100000, '1.234.567' -> 1234567). Caso contrario, mantem o
    // ponto como decimal ('1234.56' -> 1234.56).
    // ATENCAO: essa regra CORROMPE um preco decimal legitimo de 3 casas, ex
    // '1.234' que deveria ser 1.234 reais e lido como 1234. Nao da pra desfazer
    // essa ambiguidade so pela string (o mesmo texto pode ser mil-e-poucos OU
    // um decimal de 3 casas). A escolha "3 digitos = milhar" e deliberada e esta
    // travada em teste; se um dia precisar do outro comportamento, o caminho e
    // um override explicito de locale/decimais no chamador, nunca adivinhar aqui.
    const parts = s.split('.');
    const looksThousand = parts.length > 1 && parts.slice(1).every((p) => p.length === 3);
    if (looksThousand) s = parts.join('');
  }
  // Guard de corretude: neste ponto `s` deveria ser um numero DECIMAL plausivel
  // (digitos, no maximo um ponto decimal, sinal opcional). Number() sozinho e
  // permissivo demais: aceita hexadecimal ('0x1A'), binario ('0b101'), notacao
  // cientifica ('1e3' -> 1000), 'Infinity' e formas degeneradas ('5.', '.5').
  // Numa celula de planilha isso vira mis-parse silencioso ('FF' ou '1e3' como
  // numero). Validamos o formato antes de converter: exige pelo menos um digito
  // ANTES e, se houver ponto, pelo menos um digito DEPOIS. Rejeita o resto.
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Normaliza data em ISO YYYY-MM-DD. Aceita ISO AAAA-MM-DD e AAAA/MM/DD (com barra),
 * alem de BR DD/MM/AAAA e D/M/AAAA (separador /, . ou -).
 * NAO adivinha formato US MM/DD/AAAA por ser ambiguo com o BR DD/MM/AAAA.
 * Retorna null se inválida.
 */
export function parseDateBR(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // ja ISO (aceita hifen ou barra como separador: AAAA-MM-DD ou AAAA/MM/DD).
  // Mes e dia aceitam 1-2 digitos (ex '2026-2-1', '2026/1/1'), coerente com o ramo BR.
  // O fim so aceita: data pura, OU data seguida de um separador de hora RECONHECIDO
  // ('T' ou espaco, ex '2026-12-31T10:00', '2026-12-31 10:00'). Sufixo colado
  // nao reconhecido ('2026-01-01lixo', '2026-01-0110') e rejeitado -> cai pra null.
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ].*)?$/);
  if (m) {
    const y = +m[1]; const mo = +m[2]; const d = +m[3];
    if (!isValidYMD(y, mo, d)) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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
  let v = Number.isFinite(n) ? Math.round(n) : 0;
  // Normaliza zero negativo (Math.round(-0.4) === -0) para evitar a saida '-0'.
  if (v === 0) v = 0;
  return nf(0, 0).format(v);
}
