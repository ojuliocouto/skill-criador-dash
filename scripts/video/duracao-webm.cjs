/**
 * Lê a duração de um arquivo WebM sem ffprobe, olhando a estrutura (EBML) do próprio arquivo.
 *
 * Por que: o WebM que o Playwright grava sai do ffmpeg dele em modo ao vivo e NÃO traz o campo de
 * duração no cabeçalho. O que existe são os blocos de vídeo, cada um com a sua marca de tempo.
 * Duração = maior (tempo do cluster + tempo do bloco dentro dele). Supõe a escala de tempo padrão
 * do WebM (1 ms), que é a que o Playwright usa. Devolve null se não entender o arquivo: nunca inventa número.
 */
const ID_CABECALHO = '1a45dfa3';
const CONTAINERS = new Set(['18538067', '1f43b675', 'a0']); // Segment, Cluster, BlockGroup: entra, sem pular
const ID_TEMPO_DO_CLUSTER = 'e7';
const IDS_DE_BLOCO = new Set(['a3', 'a1']); // SimpleBlock, Block

function lerId(buf, pos) {
  if (pos >= buf.length) return null;
  const b = buf[pos];
  let len = 1;
  while (len <= 4 && !(b & (0x80 >> (len - 1)))) len += 1;
  if (len > 4 || pos + len > buf.length) return null;
  return { hex: buf.subarray(pos, pos + len).toString('hex'), len };
}

function lerTamanho(buf, pos) {
  if (pos >= buf.length) return null;
  const b = buf[pos];
  let len = 1;
  while (len <= 8 && !(b & (0x80 >> (len - 1)))) len += 1;
  if (len > 8 || pos + len > buf.length) return null;
  let valor = b & (0xff >> len);
  let tudoUm = valor === (0xff >> len);
  for (let i = 1; i < len; i += 1) { valor = valor * 256 + buf[pos + i]; if (buf[pos + i] !== 0xff) tudoUm = false; }
  return { len, valor, desconhecido: tudoUm };
}

function duracaoDoWebm(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16 || buf.subarray(0, 4).toString('hex') !== ID_CABECALHO) return null;
  let pos = 0;
  let tempoDoCluster = 0;
  let maior = null;
  while (pos < buf.length) {
    const id = lerId(buf, pos);
    if (!id) break;
    const tam = lerTamanho(buf, pos + id.len);
    if (!tam) break;
    const inicio = pos + id.len + tam.len;
    if (CONTAINERS.has(id.hex)) { pos = inicio; continue; }
    if (tam.desconhecido || inicio + tam.valor > buf.length) break;
    if (id.hex === ID_TEMPO_DO_CLUSTER) {
      let v = 0;
      for (let i = 0; i < tam.valor; i += 1) v = v * 256 + buf[inicio + i];
      tempoDoCluster = v;
    } else if (IDS_DE_BLOCO.has(id.hex) && tam.valor >= 4) {
      const trilha = lerTamanho(buf, inicio);
      if (trilha && inicio + trilha.len + 2 <= buf.length) {
        const relativo = buf.readInt16BE(inicio + trilha.len);
        const t = tempoDoCluster + relativo;
        if (maior === null || t > maior) maior = t;
      }
    }
    pos = inicio + tam.valor;
  }
  return maior;
}

module.exports = { duracaoDoWebm };
