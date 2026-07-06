// Utilitarios compartilhados entre widgets. Puro, sem dependencias.

import { fmtCurrency, fmtNumber, fmtPercent, fmtInteger } from '../lib/format.js';

// Escapa texto para evitar injecao de HTML.
export function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Formata um numero de acordo com o formato semantico do template.
export function fmtBy(format, value) {
  switch (format) {
    case 'currency': return fmtCurrency(value);
    case 'percent': return fmtPercent(value);
    case 'integer': return fmtInteger(value);
    case 'number':
    default: return fmtNumber(value);
  }
}
