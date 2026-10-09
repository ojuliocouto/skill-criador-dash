// "A última vale": quando a pessoa troca de aba (ou de painel) com a carga anterior ainda no ar, só a carga
// da última escolha pode desenhar. Sem isto, a resposta atrasada da aba antiga desenhava por cima da aba nova:
// número de um painel sob o nome de outro, com cara de certo (achado da prova no ar de 08/10/2026, no celular).
// Puro, sem DOM, testável em node.

/**
 * Cria um guarda. Cada `nova()` invalida as anteriores e devolve a função `vale()` da própria carga.
 * @returns {() => (() => boolean)}
 */
export function criarUltimaVale() {
  let atual = 0;
  return function nova() {
    const minha = ++atual;
    return () => minha === atual;
  };
}
