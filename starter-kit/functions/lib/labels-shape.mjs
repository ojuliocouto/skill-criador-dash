// Valida a FORMA de config.labels: os nomes que a pessoa trocou no assistente
// ({ chave de campo ou de número: rótulo }). O servidor não conhece os templates (moram no
// front), então valida só a forma: mapa pequeno, chave curta, texto curto, sem sinal de tag e
// sem caractere de controle. Chave que não existe no modelo é ignorada na hora de desenhar
// (public/assets/js/lib/rotulos.js), e quem desenha sempre escapa o texto.
// A regra do texto é a MESMA de rotuloValido no navegador (paridade coberta por teste).
export const LIMITE_DO_ROTULO = 40;
export const MAX_ROTULOS = 40;
const CHAVE = /^[A-Za-z0-9_]{1,40}$/;
const CONTROLE = /[\u0000-\u001f\u007f]/;

/** @returns {string|null} mensagem de erro em PT-BR, ou null se a forma está certa */
export function validarLabels(config) {
  const labels = config && typeof config === 'object' ? config.labels : undefined;
  if (labels == null) return null;
  if (typeof labels !== 'object' || Array.isArray(labels)) {
    return 'Nomes trocados (labels) precisam ser um mapa, como { "leads": "Cadastros" }.';
  }
  const entradas = Object.entries(labels);
  if (entradas.length > MAX_ROTULOS) {
    return `Nomes trocados (labels): no máximo ${MAX_ROTULOS} itens.`;
  }
  for (const [chave, texto] of entradas) {
    if (!CHAVE.test(chave)) {
      return 'Nomes trocados (labels): cada chave é a chave de um campo ou de um número do modelo, como "leads".';
    }
    const ok = typeof texto === 'string' && texto.trim().length >= 1 && texto.length <= LIMITE_DO_ROTULO
      && !/[<>]/.test(texto) && !CONTROLE.test(texto);
    if (!ok) {
      return `Nomes trocados (labels): o nome de "${chave}" precisa ser um texto de 1 a ${LIMITE_DO_ROTULO} caracteres, sem os sinais < e > e sem quebra de linha.`;
    }
  }
  return null;
}
