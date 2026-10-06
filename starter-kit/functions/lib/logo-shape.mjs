// Valida config.logoFundo: o fundo da plaquinha do logotipo ('claro' ou 'escuro'), escolhido
// pelo assistente a partir da luminância do logo enviado. O valor vira nome de classe CSS no
// painel, então só os dois valores conhecidos passam. O src do logo continua validado por
// isLogoSeguro em functions/api/dashboards.js (nada mudou lá).
const FUNDOS = new Set(['claro', 'escuro']);

/** @returns {string|null} mensagem de erro em PT-BR, ou null se a forma está certa */
export function validarFundoDoLogo(config) {
  const v = config && typeof config === 'object' ? config.logoFundo : undefined;
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || !FUNDOS.has(v)) {
    return 'Fundo do logo (logoFundo) inválido. Use "claro" ou "escuro".';
  }
  return null;
}
