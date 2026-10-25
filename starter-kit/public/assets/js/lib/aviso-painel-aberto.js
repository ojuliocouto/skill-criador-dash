// Aviso de painel aberto com dinheiro na tela (3.9.0, achado 6 da auditoria). ESM, puro.
//
// Sem senha, qualquer pessoa com o link do painel vê os números dele. Isso é ótimo para um painel de
// leads, e um risco para um painel com a Receita do negócio. O passo da aparência só dizia "Em branco:
// painel aberto", dentro de "Mais opções". Agora, quando o painel vai ficar aberto e mostra dinheiro que
// entra ou sai, o aviso aparece perto do botão de criar, com o nome do número.

// Campos de dinheiro do negócio, por área. Investimento em anúncio não entra: é o número que todo
// painel de tráfego mostra; a Receita é o que costuma ser sigiloso.
const CAMPOS_DE_DINHEIRO = { marketing: ['receita'], vendas: ['valor'], financeiro: ['entrada', 'saida'] };

function juntar(nomes) {
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/**
 * Texto do aviso, ou '' quando não há o que avisar.
 * @param {{template?:{id?:string, slots?:Array<{key:string,label:string}>}, colMap?:object, protegido?:boolean, senha?:string}} p
 * @returns {string}
 */
export function avisoDePainelAberto({ template, colMap, protegido = false, senha = '' } = {}) {
  if (protegido || (senha && String(senha).trim())) return '';
  const area = template && (template.id || template.key);
  const campos = CAMPOS_DE_DINHEIRO[area] || [];
  const mapa = colMap && typeof colMap === 'object' ? colMap : {};
  const slots = (template && Array.isArray(template.slots)) ? template.slots : [];
  const nomes = campos
    .filter((k) => typeof mapa[k] === 'string' && mapa[k].trim())
    .map((k) => (slots.find((s) => s.key === k) || { label: k }).label);
  if (!nomes.length) return '';
  const quais = nomes.length > 1 ? `os números de ${juntar(nomes)}` : `o número de ${nomes[0]}`;
  return `Este painel vai ficar aberto: quem tiver o link vê ${quais} e todos os outros dele. `
    + 'Se esse número é só seu, defina uma senha em Mais opções.';
}
