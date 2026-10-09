# Changelog

## 3.7.3

Provado nos navegadores que as pessoas usam, no celular, com axe-core e no ar (Cloudflare Pages de teste), em 08/10/2026. Três frentes: navegadores e acessibilidade, senha e grupo e planilha ao vivo, e o fechamento.

Navegadores, celular e acessibilidade

- Matriz de navegadores (`scripts/test-navegadores.cjs`): o painel de verdade, servido pelas Functions reais com a CSP real (`scripts/stack-local.cjs`), roda em Chromium, Firefox, WebKit (Safari), iPhone 14 e Pixel 7. 14 verificações por perfil: carga sem erro de console nem violação de CSP, números dos cartões contra a soma calculada do CSV, atalho de período, ordenar, tabela em cartões no celular, os 7 efeitos terminando no estado final, movimento reduzido e encaixe das telas. Motor ausente pula; no CI falha.
- Acessibilidade (`scripts/test-acessibilidade.cjs`): axe-core 4.13.0 (versão fixa) nas telas do painel, da lista, do assistente (4 passos) e da tela de senha, claro e escuro, computador e celular: 0 violações. Só teclado (Tab, setas, Enter, Espaço, foco visível com 3:1), nomes acessíveis, contraste do texto sobre as linhas do fundo e um detector com defeitos plantados. Não substitui VoiceOver nem TalkBack.
- CI: o workflow instala Chromium, Firefox e WebKit e o axe-core fixo nos três sistemas.
- Corrigido no Safari e no iPhone: o seletor "Canal" saía com 23 px de altura (agora 38, e 44 no celular).
- Corrigido no iPhone e no Pixel: a marca da lista de painéis era espremida pelos botões e o "Excluir" passava da linha do painel; no assistente, "Meus dashboards" vira "Dashboards" no celular.
- Corrigido com movimento reduzido: o cartão da lista de painéis agora abre o painel (antes só o link "Abrir" funcionava).
- "Limpar filtros" e outros botões largos têm o texto no centro.

Senha, grupo e planilha do Google

- Senha: `prova-dash.js`, `passe-de-gosto.js` e `gravar-video.js` esperam a tela de senha aparecer (ela só nasce depois do 401 da API). Antes, a prova de tela reprovava painel bom, o gravador estourava os 45 s e o passe de gosto dava verde medindo a tela de senha. Senha recusada reprova com a causa; o PNG só sai depois da saudação de abertura. A senha pode vir da variável `CD_SENHA` (nova `scripts/hash-senha.mjs` calcula o hash do POST).
- Senha: abrir o link sem digitar senha não gasta mais o limite de 8 tentativas erradas por IP; o campo de senha não é mais trocado por "Muitas tentativas".
- Grupo: a última aba clicada vale (antes, no celular, a resposta atrasada da aba anterior desenhava por cima); a aba de um painel com senha pede a senha ali mesmo (antes era um beco sem saída); o assistente não dá o mesmo nome a duas abas do mesmo domínio.
- Planilha do Google: o link da segunda aba (`#gid=`) lê a segunda aba (antes lia a primeira em silêncio); o gid só aceita dígitos.
- Documentação: POST de painel com senha (hash, id embaralhado, `x-dash-auth`), grupo pela API com painel protegido, aba da planilha, o que conta no limite de tentativas.

Fechamento (achados da prova no ar, cada um com teste que reprovava antes)

- Grupo no celular: a barra de abas do grupo ganhou a mesma borda esmaecida das abas internas (só do lado em que há mais abas), a aba ativa fica sempre inteira ao abrir direto numa aba do fim e ao tocar nas abas, e a borda acompanha a rolagem mesmo depois que o painel da aba carrega. No celular as abas têm alvo de 44 px e preenchimento menor: três abas de rótulo comum ("Planilha ao vivo", "Meta mensal", "Com senha") cabem inteiras em 390 px, sem rolar.
- Tela de senha (da página e da aba): rótulo visível ligado ao campo (`label for`), em vez de só o placeholder; a mensagem de erro é anunciada (`role="alert"`) e o título da tela de senha da página passa a ser o `h1` (o axe, em melhor prática, acusava página sem título principal).
- Minigráfico dos cartões: todos da mesma grade têm a mesma altura (44 px, diferença de até 2 px, teto de 56 px) no computador e no celular, no pé do cartão. Antes o cartão do Investimento esticava o traço até ~110 px porque o cartão crescia com a linha do destaque (que tem a barra da meta), e o serrilhado ficava exagerado.
- Passe de gosto: só começa a medir depois de um dígito visível fora do esqueleto de carregamento (como o `prova-dash.js` já fazia); sem número em 45 s (`--espera-ms`) reprova com a causa. Antes o esqueleto satisfazia a espera.
- Gráfico de linha só com teclado: Tab leva ao gráfico, as setas esquerda e direita andam pelos dias (Home e End vão às pontas, Esc esconde) e o valor do dia é anunciado numa região `aria-live`; mouse e toque seguem iguais.
- Assistente, passo 3: cada botão "Trocar nome" agora diz de qual campo é e começa pelo texto visível ("Trocar nome de Investimento"). O nome acessível anterior já era único, mas não continha o texto visível (WCAG 2.5.3): quem fala "Trocar nome" para o aparelho não achava o botão.

Limites declarados: não provado em aparelho físico (iPhone, Android), no aplicativo Safari, nem com leitor de tela de verdade (VoiceOver, TalkBack, NVDA; o que foi medido é a árvore de acessibilidade, nomes, papéis e teclado). O assistente (`/config.html`, `/group.html`) no site publicado, com a chave de administrador, só foi visto na bancada local. Grupo com senha no próprio grupo (e não nas abas) e planilha com locale en_US não foram testados. O WebKit no Windows e o Chromium no Linux do CI ficam por provar no primeiro CI.

## 3.7.2

- Prova de vídeo que não mente: o gravador espera o número de verdade (`esperar_numero`, obrigatório, até 45 s), conta os quadros com número e guarda no `video-info.json`; sem número em nenhum quadro, reprova. O gate da etapa 6 lê o arquivo (desktop e celular). Medido no dash local: 1,4 s até o primeiro número, 5 cargas seguidas (1482, 1397, 1409, 1412, 1406 ms).
- CI nos três sistemas (`.github/workflows/portabilidade.yml`: Windows, macOS e Linux, Node 22, Python 3.12, Playwright com Chromium, ffmpeg; mais o job do Windows em `C:\curso automação\skill`) e comando único `scripts/rodar-testes.mjs` (`--so-portateis`, `--lista`, `--filtro`). Teste sem Playwright se declara PULADO com o motivo; no CI esse pulo é falha. Teste de acentuação passa a ler as strings pela árvore `ast` (o f-string do Python 3.12 quebra o `tokenize`); chaves de hash do gate saem com `/`.
- Gravador: o roteiro é conferido antes de exigir o Playwright; roteiro inválido em máquina sem Playwright sai com a lista de erros (código 2), não com o aviso de instalação. Achado pelo CI do Windows em pasta com acento.

## 3.7.1

Correções do teste de ponta a ponta de 02/10/2026 (achados D1 a D15).

- Roteiro: sem conta Cloudflare dá para construir e provar em local (etapa 4 com `"modo": "local"`; a 5 e a 7 fecham, a 6 recusa, sem publicação falsa). A etapa 4 passa a conferir arquivo (`wrangler whoami` e `wrangler.toml` com id real do KV), não texto. A pasta do projeto se cria antes do preflight, que aceita pasta ausente. Todo comando usa `<dir-da-skill>` e `scripts/lancador.py` imprime os comandos com o caminho completo (aspas em espaço e acento); `lancador.py porta-livre` acha porta para o `npm run dev`; avisos do preflight (token da Cloudflare, porta 8788) explicados no passo.
- Meta com período (`goal.periodo`: mensal, semanal, periodo, total); 400 por mês deixa de aparecer como 288% da meta em 90 dias. Config antiga sem `periodo` não muda.
- Assistente: a prévia carrega `efeitos.css` (o cartão do número em destaque não vira coluna com triângulo preto), sinônimos em português com confirmação ("contatos" é Leads, "avaliações agendadas" é Conversões, só pelo nome parecido e só depois de "Está certo"), todo número exibido pode ser escondido e a lista fica à vista, "Continuar" desabilitado de verdade com a dica do que falta, e a tela final diz "rodando neste computador" quando o endereço é local.
- Tabela que reordena em todas as tabelas, total fixo no fim.
- Celular (360 e 390): "Dados linha a linha" vira cartões com "Ordenar por", atalhos de período e abas rolam por dentro com borda esmaecida, alvo de 44 px, abas numa linha.
- Vídeo: roteiro padrão mostra período, gráfico e tabela que reordena; roteiro oficial `efeitos` (meta batida, Personalizado); ações `digitar` e `cruzar_meta`; erro de roteiro sai também na saída normal.
- Layout de fábrica sem cartão meio vazio: os cartões vizinhos do destaque ganham minigráfico de tendência com a variação ao lado (se desenha na abertura, se transforma na troca de período, parado com movimento reduzido); faixa em 2 colunas no celular. O medidor do passe de gosto dá 0 nos 5 domínios de template (antes: marketing com meta 2, estoque 1).
- Barra do topo opaca ao rolar (sem texto fantasma por trás). Meta proporcional acima de 100% diz "acima do ritmo" e não ganha selo nem marco.
- Passe de gosto medido (`scripts/passe-de-gosto.js`): 10 sinais da lista de tells medidos no navegador; o gate da etapa 6 recusa `depois: 0` com sinal na tela e exige o print olhado nos itens de gosto.

## 3.7.0

Movimento do painel: 7 efeitos com nome, todos desligados com movimento reduzido.

- Novos: cartão que vira a tela, gráfico que responde, período em um clique, números de roleta, gráfico que se transforma, meta batida e tabela que reordena (`starter-kit/public/assets/css/efeitos.css` e um módulo por efeito em `public/assets/js/lib/`).
- Meta batida mais forte: cartão inteiro acende na cor da marca, faixa de luz atravessa, clarão na barra, pulso no número e selo com peso, uma vez por cruzamento, cerca de 1,9 s. Medido no navegador: 96% dos pixels do cartão mudam no meio do efeito (mínimo 25%) e no fim ele volta ao normal com o selo.
- Tabela que reordena: a ordem escolhida sobrevive a filtro, troca de período e Atualizar, até novo clique ou troca de aba.
- Roleta mais limpa: cada casa é uma janela de uma linha só com o dígito que sai e o que entra, sem dígito de passagem; separadores não rolam; a largura não varia.
- Travas de movimento e presença passam a cobrir o `efeitos.css` (só `transform`, `opacity`, `stroke-dashoffset` e `clip-path`; sem filtro, caixa alta, letra espaçada nem sombra de texto; sem opacidade 0 fora de keyframes). Os limites existentes não mudaram. Faixa própria dos efeitos em `test/efeitos-duracao.test.js`: até 2,4 s, troca de período até 1,0 s.
- Teste no navegador: `scripts/test-efeitos-no-navegador.cjs` (bancada em `scripts/efeitos-harness.cjs`).
- Roteiro de vídeo padrão: troca dois atalhos de período e passa o mouse no gráfico (passos opcionais, 10 a 15 s).

## 3.6.0

Vídeo de prova no painel, com prancha de quadros (`scripts/gravar-video.js`).
