// Leitura da resposta de POST /api/admin-check (a checagem da chave de administrador que o
// assistente faz ANTES de a pessoa preencher tudo). ESM, puro.

/**
 * @param {number} status  status HTTP da resposta
 * @param {object|null} corpo  JSON já lido (ou null)
 * @returns {'sem-config'|'precisa'|'confere'|'espere'|'indisponivel'}
 *   sem-config:   o servidor não tem ADMIN_TOKEN (criar e alterar ficam bloqueados);
 *   precisa:      o servidor tem, e a chave mandada falta ou não confere;
 *   confere:      a chave mandada é a certa;
 *   espere:       tentativas demais em pouco tempo (429);
 *   indisponivel: não deu pra saber (rede, servidor antigo sem a rota). A tela segue como
 *                 antes: a chave é pedida na hora de salvar.
 */
export function interpretarChecagem(status, corpo) {
  if (status === 429) return 'espere';
  const c = corpo && typeof corpo === 'object' ? corpo : null;
  if (status !== 200 || !c || typeof c.adminConfigurado !== 'boolean') return 'indisponivel';
  if (!c.adminConfigurado) return 'sem-config';
  return c.tokenConfere === true ? 'confere' : 'precisa';
}
