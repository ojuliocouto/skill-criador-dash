// A meta tem período (3.7.1, D6). Antes ela valia para o período filtrado, qualquer que fosse o tamanho:
// uma meta de 400 contatos POR MÊS aparecia como "288% da meta" e "Meta batida" em "Tudo" (90 dias).
// Aqui mora a conta: dado o período da meta (goal.periodo) e a janela de datas que está na tela, diz contra
// QUANTO a medição é comparada, como escrever isso no cartão e se a comparação é justa para o marco
// "Meta batida". Puro, sem DOM. A lista de períodos é a mesma de functions/lib/meta-shape.mjs (teste de paridade).

import { fmtInteger } from './format.js';

/** Períodos que o assistente oferece, na ordem da tela. `mensal` é o padrão de quem cria hoje. */
export const PERIODOS_DA_META = Object.freeze([
  { valor: 'mensal', rotulo: 'Por mês', dica: 'Cada mês do período tem a meta inteira. É o mais comum.' },
  { valor: 'semanal', rotulo: 'Por semana', dica: 'Cada 7 dias do período têm a meta inteira.' },
  { valor: 'periodo', rotulo: 'Para o período que eu escolher', dica: 'A meta vale para o período selecionado no painel, qualquer que seja o tamanho.' },
  { valor: 'total', rotulo: 'Total (um número só)', dica: 'Uma meta única para tudo o que o painel mostra.' },
]);
export const PERIODO_PADRAO = 'mensal';

const DIA = 86400000;
const utc = (iso) => { const [a, m, d] = iso.split('-').map(Number); return Date.UTC(a, m - 1, d); };
const diasNoMes = (ano, mes0) => new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();

/** Quantos dias o período cobre, contando os dois extremos. */
function diasDaJanela(janela) { return Math.round((utc(janela.max) - utc(janela.min)) / DIA) + 1; }

/** Soma, dia a dia, 1 / (dias do mês do dia): quantos "meses" o período cobre pelo calendário. */
function mesesProporcionais(janela) {
  let soma = 0;
  for (let t = utc(janela.min); t <= utc(janela.max); t += DIA) {
    const d = new Date(t);
    soma += 1 / diasNoMes(d.getUTCFullYear(), d.getUTCMonth());
  }
  return soma;
}

const plural = (n, um, varios) => (n === 1 ? um : varios);

/**
 * Contra quanto comparar.
 * @param {{value:number, periodo?:string}} goal
 * @param {{min:string, max:string}|null} janela primeira e última data (ISO) das linhas que estão na tela
 * @returns {{alvo:number, rotulo:string, justa:boolean}}
 *   rotulo: o complemento depois do percentual ("da meta do mês", "da meta de 3 meses"...).
 *   justa: false quando o período é um pedaço de mês ou de semana comparado por proporção; aí o percentual
 *   aparece, mas o marco "Meta batida" não toca (bater uma fração proporcional não é bater a meta).
 */
export function alvoDaMeta(goal, janela) {
  const valor = Number(goal && goal.value);
  const periodo = goal && goal.periodo;
  const temJanela = janela && janela.min && janela.max;

  if (periodo === 'periodo') return { alvo: valor, rotulo: 'da meta do período', justa: true };
  if (periodo === 'total') return { alvo: valor, rotulo: 'da meta total', justa: true };
  if (periodo !== 'mensal' && periodo !== 'semanal') {
    // Config antiga (sem periodo) ou valor desconhecido: como era, o período filtrado inteiro.
    return { alvo: valor, rotulo: 'da meta', justa: true };
  }
  if (!temJanela) {
    return { alvo: valor, rotulo: `da meta ${periodo === 'mensal' ? 'mensal' : 'semanal'}, sem datas no período`, justa: false };
  }

  const dias = diasDaJanela(janela);
  if (periodo === 'semanal') {
    if (dias % 7 === 0) {
      const n = dias / 7;
      return { alvo: valor * n, rotulo: n === 1 ? 'da meta da semana' : `da meta de ${n} semanas`, justa: true };
    }
    const alvo = valor * dias / 7;
    return { alvo, rotulo: `da meta proporcional (${fmtInteger(alvo)} em ${dias} ${plural(dias, 'dia', 'dias')})`, justa: false };
  }

  // Mensal. Começa no dia 1: cada mês tocado tem a meta cheia (o mês corrente em andamento compara com a
  // meta do mês inteira, que é o que "400 por mês" quer dizer). Começa no meio do mês: proporcional aos dias.
  if (janela.min.endsWith('-01')) {
    const [a1, m1] = janela.min.split('-').map(Number);
    const [a2, m2] = janela.max.split('-').map(Number);
    const meses = (a2 - a1) * 12 + (m2 - m1) + 1;
    return { alvo: valor * meses, rotulo: meses === 1 ? 'da meta do mês' : `da meta de ${meses} meses`, justa: true };
  }
  const alvo = valor * mesesProporcionais(janela);
  return { alvo, rotulo: `da meta proporcional (${fmtInteger(alvo)} em ${dias} ${plural(dias, 'dia', 'dias')})`, justa: false };
}
