// Utilitarios compartilhados entre widgets. Puro, sem dependencias.

import { fmtCurrency, fmtNumber, fmtPercent, fmtInteger } from '../lib/format.js';

// Escape de HTML: reexportado da fonte unica em lib/html.js para nao duplicar.
// Os widgets importam `esc` daqui, entao mantemos o reexport para nao quebrar
// os imports existentes.
export { esc } from '../lib/html.js';

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
