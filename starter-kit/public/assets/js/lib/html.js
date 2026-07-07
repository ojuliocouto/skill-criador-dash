// Sanitizacao de HTML compartilhada. Puro, sem dependencias.
//
// Fonte unica de verdade para escape de HTML no starter-kit. Antes esta funcao
// estava triplicada (dashboard.js, index-page.js e widgets/_util.js) e a copia
// de index-page.js NAO escapava aspa simples ('), abrindo risco de XSS quando o
// valor era interpolado dentro de um atributo delimitado por aspas simples.
//
// Comportamento:
//  - null e undefined viram string vazia.
//  - valores nao-string sao convertidos via String(v).
//  - escapa os cinco caracteres perigosos: & < > " '
//    (a aspa simples vira &#39; para cobrir atributos com aspas simples).

export function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
