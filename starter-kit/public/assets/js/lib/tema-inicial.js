// Com que modo (claro ou escuro) o painel ABRE. ESM, puro.
//
// Ordem de quem decide:
//   1. a escolha do visitante NAQUELE painel (vale só pra ele e só pra aquele painel);
//   2. o modo que o dono do painel escolheu (config.tema: 'claro' ou 'escuro');
//   3. com 'auto' ou sem o campo, o que já valia: a escolha geral guardada no navegador e,
//      por fim, o sistema de quem abre.
//
// O script inline das páginas (anti-piscar) decide a MESMA coisa antes do primeiro quadro
// pintado; há teste de paridade em test/tema-inicial.test.js. Se mudar aqui, mude lá e
// recalcule o hash da CSP em functions/_middleware.js.

export const CHAVE_GERAL = 'cd-theme';
export const MODOS = Object.freeze(['claro', 'escuro', 'auto']);

export function temaValido(v) {
  return v === 'light' || v === 'dark';
}

export function modoValido(v) {
  return typeof v === 'string' && MODOS.includes(v);
}

/** 'claro' vira 'light', 'escuro' vira 'dark'; 'auto', vazio ou lixo não decidem (null). */
export function temaDoModo(modo) {
  if (modo === 'claro') return 'light';
  if (modo === 'escuro') return 'dark';
  return null;
}

/** 'light' vira 'claro' e 'dark' vira 'escuro' (pro texto de tela e pra config). */
export function modoDoTema(tema) {
  return tema === 'light' ? 'claro' : 'escuro';
}

/** Chave onde fica a escolha do visitante pra UM painel. Sem id, não há chave. */
export function chaveDoTemaDoPainel(id) {
  const v = id == null ? '' : String(id).trim();
  return v ? `${CHAVE_GERAL}:${v}` : null;
}

/** Onde o botão de alternar guarda a escolha: no painel aberto, ou na escolha geral. */
export function chaveParaGuardar(idDoPainel) {
  return chaveDoTemaDoPainel(idDoPainel) || CHAVE_GERAL;
}

/** Id do painel aberto, lido da URL. Só a página do painel conta (editar no assistente não). */
export function idDoPainelNaUrl(pathname, search) {
  if (!/^\/dashboard(\.html)?$/.test(String(pathname || ''))) return null;
  const id = new URLSearchParams(String(search || '')).get('id');
  return id && id.trim() ? id.trim() : null;
}

/**
 * @param {{escolhaNoPainel?:string|null, modoDoPainel?:string|null, escolhaGeral?:string|null, sistemaClaro?:boolean}} [p]
 * @returns {'light'|'dark'}
 */
export function resolverTemaInicial({ escolhaNoPainel, modoDoPainel, escolhaGeral, sistemaClaro } = {}) {
  if (temaValido(escolhaNoPainel)) return escolhaNoPainel;
  const doDono = temaDoModo(modoDoPainel);
  if (doDono) return doDono;
  if (temaValido(escolhaGeral)) return escolhaGeral;
  return sistemaClaro ? 'light' : 'dark';
}
