// Logotipo enviado do computador: a parte de navegador. Lê o arquivo, desenha num canvas,
// reduz pra caber e exporta PNG em data URL (SVG também vira PNG: SVG cru nunca é guardado).
// As regras (tipos aceitos, dimensões, limite, fundo da plaquinha) estão em lib/logo.js.

import {
  validarArquivoDeLogo, dimensoesDoLogo, alturasDeTentativa, cabeNoLimite, luminanciaMedia, fundoDaPlaca,
} from '../lib/logo.js';

const ERRO_ABRIR = 'Não conseguimos abrir essa imagem: o arquivo pode estar corrompido. Exporte o logotipo de novo (PNG sempre funciona) e envie outra vez.';
const ERRO_GRANDE = 'Esse logotipo tem detalhe demais para o painel: mesmo reduzido, passa do limite de 150 KB. Envie uma versão mais simples, de preferência PNG com fundo transparente ou SVG.';

function lerComoDataUrl(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result || ''));
    leitor.onerror = () => reject(new Error(ERRO_ABRIR));
    leitor.readAsDataURL(arquivo);
  });
}

function carregarImagem(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(ERRO_ABRIR));
    img.src = src;
  });
}

/**
 * @param {File} arquivo
 * @returns {Promise<{dataUrl:string, fundo:'claro'|'escuro', largura:number, altura:number}>}
 * @throws {Error} com mensagem pronta pra tela (diz o que fazer)
 */
export async function prepararLogo(arquivo) {
  const recusa = validarArquivoDeLogo(arquivo);
  if (recusa) throw new Error(recusa);
  const img = await carregarImagem(await lerComoDataUrl(arquivo));
  let largura = img.naturalWidth;
  let altura = img.naturalHeight;
  // SVG sem tamanho próprio (só viewBox): alguns navegadores informam zero. Desenha numa caixa padrão.
  const svg = arquivo.type === 'image/svg+xml' || /\.svg$/i.test(arquivo.name || '');
  if (svg && !(largura > 0 && altura > 0)) { largura = 480; altura = 160; }

  for (const alturaMax of alturasDeTentativa()) {
    const d = dimensoesDoLogo(largura, altura, { alturaMax });
    if (!d) throw new Error(ERRO_ABRIR);
    const canvas = document.createElement('canvas');
    canvas.width = d.largura;
    canvas.height = d.altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(ERRO_ABRIR);
    let dataUrl;
    let pixels;
    try {
      ctx.clearRect(0, 0, d.largura, d.altura); // fundo transparente preservado
      ctx.drawImage(img, 0, 0, d.largura, d.altura);
      dataUrl = canvas.toDataURL('image/png');
      pixels = ctx.getImageData(0, 0, d.largura, d.altura).data;
    } catch {
      throw new Error(ERRO_ABRIR);
    }
    if (!cabeNoLimite(dataUrl)) continue;
    const luminancia = luminanciaMedia(pixels);
    if (luminancia == null) throw new Error('Essa imagem está toda transparente: não tem nada para mostrar. Confira o arquivo e envie outra vez.');
    return { dataUrl, fundo: fundoDaPlaca(luminancia), largura: d.largura, altura: d.altura };
  }
  throw new Error(ERRO_GRANDE);
}
