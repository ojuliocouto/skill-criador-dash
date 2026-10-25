// "Atualizado há X": a idade dos números em palavra comum. ESM, puro.
// O painel chama textoAtualizado pra escrever e proximaTroca pra saber quando escrever de novo
// (o relógio da tela acorda só quando o texto vai mudar, não a cada segundo).

const SEG = 1000;
const MIN = 60 * SEG;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

function instante(quando) {
  if (quando == null || quando === '') return NaN;
  const t = typeof quando === 'number' ? quando : new Date(quando).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/**
 * @param {string|number|Date} quando  quando os números foram lidos da fonte
 * @param {number} [agora]
 * @returns {string} '' quando a data não serve (não inventa texto)
 */
export function textoAtualizado(quando, agora = Date.now()) {
  const t = instante(quando);
  if (Number.isNaN(t)) return '';
  const idade = Math.max(0, agora - t); // relógio adiantado não vira tempo negativo
  if (idade < MIN) return 'Atualizado agora';
  if (idade < HORA) return `Atualizado há ${Math.floor(idade / MIN)} min`;
  if (idade < DIA) return `Atualizado há ${Math.floor(idade / HORA)} h`;
  const dias = Math.floor(idade / DIA);
  return `Atualizado há ${dias} dia${dias === 1 ? '' : 's'}`;
}

/** Milissegundos até o texto mudar (nunca menos de 1 s); null se a data não serve. */
export function proximaTroca(quando, agora = Date.now()) {
  const t = instante(quando);
  if (Number.isNaN(t)) return null;
  const idade = Math.max(0, agora - t);
  const passo = idade < HORA ? MIN : (idade < DIA ? HORA : DIA);
  return Math.max(SEG, passo - (idade % passo));
}

/** 'HH:MM' no horário de quem está vendo; '' se a data não serve. */
export function horaCurta(quando) {
  const t = instante(quando);
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  const dois = (n) => String(n).padStart(2, '0');
  return `${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

const ISO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const diaEmMs = (iso) => { const m = ISO_DIA.exec(iso || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };

/**
 * O texto da faixa sobre o frescor dos números (3.9, achado 5 da auditoria de 25/10/2026). "Atualizado
 * agora" mede a LEITURA da fonte, não o dado: com a planilha parada em 04/10, o painel dizia "Atualizado
 * agora" em 25/10. Quando o dia mais recente com dado é anterior a hoje, o texto diz a data dele.
 * @param {{lidoEm?:string|number|Date|null, ultimoDia?:string|null, hoje:string, agora?:number}} p
 *   ultimoDia e hoje em ISO (AAAA-MM-DD); hoje no calendário de quem vê (periodo-atalhos.js: hojeLocal).
 * @returns {string} 'Último dado: 04/10 (há 21 dias)', 'Último dado: 24/10 (ontem)' ou o textoAtualizado
 */
export function textoDoFrescor({ lidoEm, ultimoDia, hoje, agora = Date.now() } = {}) {
  const ultimo = diaEmMs(ultimoDia);
  const dHoje = diaEmMs(hoje);
  if (Number.isFinite(ultimo) && Number.isFinite(dHoje) && ultimo < dHoje) {
    const dias = Math.round((dHoje - ultimo) / DIA);
    const [a, m, d] = ultimoDia.split('-');
    const data = a === hoje.slice(0, 4) ? `${d}/${m}` : `${d}/${m}/${a}`;
    return `Último dado: ${data} (${dias === 1 ? 'ontem' : `há ${dias} dias`})`;
  }
  return textoAtualizado(lidoEm, agora);
}
