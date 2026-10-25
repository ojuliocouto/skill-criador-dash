/* Primeira visita do aparelho (3.9). Roda antes do primeiro quadro, logo depois do script inline
   de tema. A saudação e a contagem dos números do zero são só da primeira vez que este aparelho
   abre o painel: com a marca no localStorage, a saudação que o inline ligou (marca de sessão) sai
   antes de pintar, e os números já nascem no valor final (data-sem-contagem, ver presenca.css).
   As marcas são gravadas por lib/abertura.js. Sem localStorage: segue como antes. */
(function () {
  try {
    if (!/^\/dashboard(\.html)?$/.test(location.pathname)) return;
    var id = new URLSearchParams(location.search).get('id');
    if (!id) return;
    var raiz = document.documentElement;
    if (localStorage.getItem('cd-saudou:' + id)) raiz.removeAttribute('data-saudar');
    if (localStorage.getItem('cd-contou:' + id)) raiz.setAttribute('data-sem-contagem', '');
  } catch (e) { /* armazenamento bloqueado: abre como antes */ }
})();

/* Capa de abertura do painel (efeito 6). Script CLÁSSICO, no <head>, antes do primeiro quadro:
   se a lista de painéis deixou um aviso recente no sessionStorage, acende a capa na cor da marca
   daquele painel já no primeiro desenho. O resto (nome, levantar a capa) é do módulo
   lib/cartao-vira-tela.js. Se nada der certo, a capa sai sozinha em 6 s: nunca prende a tela. */
(function () {
  try {
    var bruto = sessionStorage.getItem('cd-capa');
    if (!bruto) return;
    sessionStorage.removeItem('cd-capa');
    var aviso = JSON.parse(bruto);
    if (!aviso || !/^#[0-9a-f]{6}$/i.test(String(aviso.cor)) || typeof aviso.t !== 'number') return;
    var idade = Date.now() - aviso.t;
    if (idade < 0 || idade > 8000) return;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var raiz = document.documentElement;
    raiz.style.setProperty('--cobertura-cor', aviso.cor);
    raiz.setAttribute('data-cobertura', String(aviso.nome || '').replace(/[<>]/g, '').slice(0, 40));
    setTimeout(function () {
      raiz.removeAttribute('data-cobertura');
      raiz.style.removeProperty('--cobertura-cor');
    }, 6000);
  } catch (e) { /* sem sessionStorage: abre sem capa */ }
})();
