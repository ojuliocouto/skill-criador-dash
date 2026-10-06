// Logotipo enviado do computador: a parte pura. ESM.
// O navegador desenha a imagem num canvas, reduz e exporta PNG em data URL (wizard/logo-arquivo.js).
// Aqui: validação do arquivo, dimensões finais, luminância média e o fundo da plaquinha.

export const TIPOS_DE_LOGO = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const EXTENSOES = /\.(png|jpe?g|webp|svg)$/i;
export const ACEITA_NO_SELETOR = '.png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml';

// Arquivo de entrada: 5 MB sobra pra qualquer logo e evita travar a aba com uma foto enorme.
export const TAMANHO_MAX_DO_ARQUIVO = 5 * 1024 * 1024;
// Saída: a faixa do painel mostra o logo com 32 px de altura; 160 px dá folga de 5x pra tela
// de alta densidade. Largura máxima de 640 px cobre logo horizontal de 4:1.
export const ALTURA_MAX_DO_LOGO = 160;
export const LARGURA_MAX_DO_LOGO = 640;
// O servidor recusa logo acima de 200 KB (LOGO_MAX_LEN em functions/api/dashboards.js). O
// navegador para em 150 KB: 25% de folga, e o painel inteiro continua leve no KV.
export const LIMITE_DO_DATA_URL = 150 * 1024;

/** @returns {string|null} mensagem que diz o que fazer, ou null se o arquivo serve */
export function validarArquivoDeLogo(arquivo) {
  const a = arquivo && typeof arquivo === 'object' ? arquivo : null;
  const tipoOk = a && (TIPOS_DE_LOGO.includes(a.type) || (!a.type && EXTENSOES.test(String(a.name || ''))));
  if (!tipoOk) return 'Esse arquivo não é uma imagem que dá pra usar. Envie o logotipo em PNG, JPG, WebP ou SVG.';
  if (!(a.size > 0)) return 'O arquivo está vazio. Exporte o logotipo de novo e envie outra vez.';
  if (a.size > TAMANHO_MAX_DO_ARQUIVO) return 'O arquivo passa de 5 MB. Exporte o logotipo em tamanho menor (500 px de largura já basta) e envie de novo.';
  return null;
}

/**
 * Tamanho final do desenho: cabe na altura e na largura máximas, mantém a proporção e nunca
 * amplia. Imagem sem tamanho (corrompida) devolve null.
 */
export function dimensoesDoLogo(largura, altura, { alturaMax = ALTURA_MAX_DO_LOGO, larguraMax = LARGURA_MAX_DO_LOGO } = {}) {
  if (!(Number.isFinite(largura) && Number.isFinite(altura) && largura > 0 && altura > 0)) return null;
  const escala = Math.min(1, alturaMax / altura, larguraMax / largura);
  return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)) };
}

/** Alturas tentadas, da maior pra menor, até o PNG caber no limite. */
export function alturasDeTentativa() {
  return [ALTURA_MAX_DO_LOGO, 128, 96, 64];
}

/** O data URL é PNG e cabe no limite? (SVG cru nunca é guardado.) */
export function cabeNoLimite(dataUrl) {
  return typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png;base64,') && dataUrl.length < LIMITE_DO_DATA_URL;
}

// Pixel quase transparente (borda suavizada) não entra na média.
const ALFA_MINIMO = 32;

/**
 * Luminância média (0 preto, 1 branco) dos pixels opacos, pesada pelo alfa.
 * @param {Uint8ClampedArray|number[]} rgba  pixels em sequência R, G, B, A
 * @returns {number|null} null quando não há pixel opaco
 */
export function luminanciaMedia(rgba) {
  if (!rgba || !rgba.length) return null;
  let soma = 0;
  let peso = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a < ALFA_MINIMO) continue;
    const l = (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;
    soma += l * a;
    peso += a;
  }
  return peso ? soma / peso : null;
}

// Acima disso o logo é claro (branco, creme, amarelo pálido) e some numa placa branca.
const LOGO_CLARO_A_PARTIR_DE = 0.62;

/** Fundo da plaquinha: logo claro vai em placa escura; o resto, na placa clara de sempre. */
export function fundoDaPlaca(luminancia) {
  return Number.isFinite(luminancia) && luminancia >= LOGO_CLARO_A_PARTIR_DE ? 'escuro' : 'claro';
}

export function fundoValido(v) {
  return v === 'claro' || v === 'escuro';
}
