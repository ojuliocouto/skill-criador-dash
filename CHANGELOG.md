# Changelog

## 3.7.2

- Prova de vídeo que não mente: o gravador espera o número de verdade (`esperar_numero`, obrigatório, até 45 s), conta os quadros com número e guarda no `video-info.json`; sem número em nenhum quadro, reprova. O gate da etapa 6 lê o arquivo (desktop e celular). Medido no dash local: 1,4 s até o primeiro número, 5 cargas seguidas (1482, 1397, 1409, 1412, 1406 ms).
- CI nos três sistemas (`.github/workflows/portabilidade.yml`: Windows, macOS e Linux, Node 22, Python 3.12, Playwright com Chromium, ffmpeg; mais o job do Windows em `C:\curso automação\skill`) e comando único `scripts/rodar-testes.mjs` (`--so-portateis`, `--lista`, `--filtro`). Teste sem Playwright se declara PULADO com o motivo; no CI esse pulo é falha. Teste de acentuação passa a ler as strings pela árvore `ast` (o f-string do Python 3.12 quebra o `tokenize`); chaves de hash do gate saem com `/`.

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
