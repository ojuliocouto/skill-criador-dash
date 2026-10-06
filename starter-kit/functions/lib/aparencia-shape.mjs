// Valida a FORMA dos campos de aparência do painel: tema (modo claro, escuro ou automático),
// saudacao (quem o painel cumprimenta), saudacaoLigada e fundoAnimado. Mesmo padrão dos outros
// campos opcionais: ausente é válido (painel antigo continua como estava) e, quando vem, só o
// tipo e os valores conhecidos passam. O texto da saudação vai pra tela: curto, sem sinal de
// tag e sem caractere de controle. A regra do texto é a MESMA de saudacaoValida no navegador
// (public/assets/js/lib/saudacao.js; paridade coberta por teste).
export const MODOS_ACEITOS = new Set(['claro', 'escuro', 'auto']);
export const LIMITE_DA_SAUDACAO = 40;
const CONTROLE = /[\u0000-\u001f\u007f]/;

/** @returns {string|null} mensagem de erro em PT-BR, ou null se a forma está certa */
export function validarAparencia(config) {
  const c = config && typeof config === 'object' ? config : {};

  if (c.tema != null && c.tema !== '') {
    if (typeof c.tema !== 'string' || !MODOS_ACEITOS.has(c.tema)) {
      return 'Modo do painel (tema) inválido. Use "claro", "escuro" ou "auto".';
    }
  }

  if (c.saudacao != null && c.saudacao !== '') {
    const s = c.saudacao;
    const vazio = typeof s === 'string' && s.trim() === '';
    const ok = typeof s === 'string' && s.length <= LIMITE_DA_SAUDACAO && !/[<>]/.test(s) && !CONTROLE.test(s);
    if (!vazio && !ok) {
      return `Quem o painel cumprimenta (saudacao) precisa ser um texto de até ${LIMITE_DA_SAUDACAO} caracteres, sem os sinais < e > e sem quebra de linha. Use um nome curto, como "Carla".`;
    }
  }

  if (c.saudacaoLigada != null && typeof c.saudacaoLigada !== 'boolean') {
    return 'Saudação de abertura (saudacaoLigada) inválida. Use true para ligar ou false para desligar.';
  }
  if (c.fundoAnimado != null && typeof c.fundoAnimado !== 'boolean') {
    return 'Movimento do fundo (fundoAnimado) inválido. Use true para ligar ou false para desligar.';
  }
  return null;
}
