// Período anterior do mesmo tamanho: contra o que a seta do indicador compara. ESM, puro.
//
// 3.9 (achado 3 da auditoria de 25/10/2026): antes a seta comparava a 2a metade do período com a 1a
// metade ("vs. início"). Em 7 dias isso pôs segunda a quarta contra sexta, fim de semana e o dia de
// hoje pela metade, e mostrou Leads ▼30,12% numa semana em que os leads subiram 2,32%. Agora vale o
// que Stripe, Vercel Analytics e PostHog fazem: o período escolhido contra os mesmos N dias logo antes.
//
// Regras (cada uma tem teste em test/periodo-anterior.test.js):
//   - "Tudo" (sem data escolhida) não tem período anterior: sem seta;
//   - dias depois do último dado não entram na conta (a fonte que ainda não trouxe hoje não vira queda):
//     o período atual termina no último dia com dado e o anterior tem o mesmo número de dias;
//   - o período anterior precisa caber inteiro nos dados (começar no primeiro dia com dado ou depois);
//     se não couber, não há seta, em vez de uma comparação com dias que a fonte não tem.

import { isoParaBR } from './data-br.js';

const DIA = 86400000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const paraMs = (iso) => { const m = ISO.exec(iso || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
const paraIso = (ms) => new Date(ms).toISOString().slice(0, 10);

/** 'vs. dia anterior' ou 'vs. N dias anteriores'. */
export function rotuloDaComparacao(dias) {
  return dias === 1 ? 'vs. dia anterior' : `vs. ${dias} dias anteriores`;
}

/**
 * @param {{from?:string|null, to?:string|null}|null} filtro  datas escolhidas (ISO), como em lib/filters.js
 * @param {{min:string|null, max:string|null}|null} limites   primeiro e último dia com dado na fonte (ISO)
 * @returns {null|{atual:{from:string,to:string}, anterior:{from:string,to:string}, dias:number, rotulo:string, titulo:string}}
 */
export function comparacaoDoPeriodo(filtro, limites) {
  const f = filtro && typeof filtro === 'object' ? filtro : {};
  const min = paraMs(limites && limites.min);
  const max = paraMs(limites && limites.max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (!f.from && !f.to) return null;
  const ini = Math.max(Number.isFinite(paraMs(f.from)) ? paraMs(f.from) : min, min);
  const fimPedido = Number.isFinite(paraMs(f.to)) ? paraMs(f.to) : max;
  const fim = Math.min(fimPedido, max);
  if (fim < ini) return null;
  const dias = Math.round((fim - ini) / DIA) + 1;
  const antFim = ini - DIA;
  const antIni = ini - dias * DIA;
  if (antIni < min) return null;
  const de = paraIso(antIni);
  const ate = paraIso(antFim);
  return {
    atual: { from: paraIso(ini), to: paraIso(fim) },
    anterior: { from: de, to: ate },
    dias,
    // Período cortado no último dado ("7 dias" com hoje ainda sem dado): "vs. 6 dias anteriores" confunde;
    // o rótulo diz período anterior e a dica traz as datas (3.9.1).
    rotulo: fim < fimPedido ? 'vs. período anterior' : rotuloDaComparacao(dias),
    titulo: de === ate ? `Comparado com ${isoParaBR(de)}` : `Comparado com ${isoParaBR(de)} a ${isoParaBR(ate)}`,
  };
}
