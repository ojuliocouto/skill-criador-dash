// O que a tela final do assistente diz sobre onde o painel está (3.7.1, D15). Antes ela dizia "Seu painel
// está no ar" mesmo com o endereço em localhost, o que promete uma publicação que não existe. Aqui a frase
// depende do endereço: local (este computador ou a rede de casa) ou público. Puro, sem DOM.

/** true quando o endereço só abre neste computador ou na rede local: não é um painel publicado. */
export function enderecoLocal(host) {
  const h = String(host == null ? '' : host).trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return false;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '::1' || h === '0.0.0.0') return true;
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!ip) return false;
  const [a, b] = [Number(ip[1]), Number(ip[2])];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

/**
 * @param {{host:string, nome:string, editando:boolean, comSenha:boolean}} p
 * @returns {{titulo:string, texto:string, proximoPasso:string|null}}
 */
export function textoDaEntrega({ host, nome, editando, comSenha }) {
  const local = enderecoLocal(host);
  if (local) {
    return {
      titulo: editando ? 'Alterações salvas neste computador' : 'Seu dash está criado e rodando neste computador',
      texto: comSenha
        ? `"${nome}" está pronto, mas o link abaixo só abre neste computador. Quem abrir precisa da senha.`
        : `"${nome}" está pronto, mas o link abaixo só abre neste computador. Ninguém mais consegue ver ainda.`,
      proximoPasso: 'Próximo passo: publicar. Para outras pessoas abrirem, o dash precisa ir para a internet, na sua conta Cloudflare (o roteiro guia você, a partir de provisionar a infra).',
    };
  }
  return {
    titulo: editando ? 'Alterações salvas' : 'Seu painel está no ar',
    texto: comSenha
      ? `"${nome}" está pronto. Quem receber o link vai precisar da senha para abrir.`
      : `"${nome}" está pronto. Qualquer pessoa com o link abaixo abre o painel.`,
    proximoPasso: null,
  };
}
