# Changelog

## 3.9.1

Rodada da aula (26/10), a partir do teste de aluno no clone limpo da 3.9.0.

- Exemplos acompanham o dia: `lancador.py iniciar` desloca a coluna Data dos 6 CSVs de exemplo (`examples/` e `public/modelos/`) até ontem, na cópia do aluno; `lancador.py exemplos <pasta>` refaz num outro dia. Antes, com "Hoje" do calendário, "7 dias" abria o painel inteiro vazio porque o exemplo terminava em 04/10. O repositório não muda.
- Celular: o cartão em destaque ocupa a largura cheia no topo (348 de 350 px).
- Vão entre o número e o minigráfico: de 47 px (desktop) e 59 px (celular) para 10 px em todos os cartões.
- Em "Tudo", o destaque diz "Escolha um período para comparar", no lugar da seta.
- Período cortado no último dado ("7 dias" com hoje ainda sem dado) diz "vs. período anterior", com as datas na dica, no lugar de "vs. 6 dias anteriores".
- Ondas do fundo só nas margens, a 0,18 de opacidade.
- Gaveta Filtros do celular: atalhos em 2 linhas de 3, sem rolar de lado.
- Legenda de cor da tabela só cita a cor que aparece nela.
- Eixo do gráfico com fonte de 12 px na tela (era 9 px).
- Testes: `npm test` 1436; `rodar-testes.mjs` 28 (novo `test-exemplos-ate-ontem.py`).

## 3.9.0

Revisão da 3.7.4 com auditoria adversarial em 25/10/2026 (nota média 5,8; confiabilidade dos números 4). Três frentes: números certos, segurança e receita do Meta, e visual.

Atenção: mudança de sentido

- Painel do Meta Ads: a coluna "Cliques" passa a ser o clique no link (`inline_link_clicks`), base do CTR e do CPC, como no Gerenciador de Anúncios. Todos os cliques vão para a coluna nova "Cliques (todos)". CTR e CPC de um painel Meta que já existia mudam de valor.
- A lista de painéis (`GET /api/dashboards` sem `id`) passa a exigir a chave de administrador. Quem abre um painel sem a chave recebe só a vista do painel.
- "Hoje", "7 dias" e "30 dias" contam do dia do calendário, não do último dia com dado. Com dado parado, o painel diz "Último dado: 04/10 (há 21 dias)" e mostra o estado vazio com o motivo.

Números

- A seta compara com os N dias anteriores ("vs. 7 dias anteriores"), não com a primeira metade do próprio período, que invertia o sinal (Leads em 7 dias: era ▼30,12%, agora ▲2,32%). Em "Tudo", ou sem período anterior nos dados, a seta some. `lib/periodo-anterior.js`.
- Taxa com denominador zero (CPA, CPL, CPC, CTR, ROAS, custo por resultado) mostra "sem dado" e o motivo, nunca R$ 0,00. `scripts/prova-dash.js` passa a reprovar R$ 0,00 em custo por X.
- Período sem linha mostra uma frase com o motivo e o botão "Ver todo o período", no lugar de 7 cartões zerados. `lib/estado-vazio.js`.
- Aba Dados abre nas linhas mais recentes, com "Mostrar mais 50", e ordenar mexe no conjunto inteiro (antes eram as 50 mais antigas).
- Meta passada do dobro vira múltiplo legível ("5x a meta") no lugar de "499,73% da meta proporcional".

Segurança, receita e histórico

- Lista com chave; vista do painel sem chave: CSV podado às colunas do colMap, sem o link da planilha; rota nova `/api/connectors/sheets?id=` que lê a planilha no servidor. O assistente avisa quando o painel vai ficar aberto mostrando Receita, Valor, Entrada ou Saída.
- Meta Ads: pede `action_values` e `inline_link_clicks`; Receita com a mesma regra das Conversões (com `omni_purchase` vale só ele); a coluna Receita só entra quando a conta tem compra. Painel antigo ganha Receita e ROAS sozinho.
- Modo histórico de verdade: tabela `snapshot_dias`, um registro por painel e por dia, retenção de `HISTORICO_DIAS` (400 por padrão), leitura por período. Banco anterior continua abrindo pela última foto. Reaplicar o `db/schema.sql` (ver `references/infra.md`).
- `gate-etapas.py` roda no Python 3.8; teste que trava recurso do 3.9 em diante; job `python-3-8` no CI.
- Gate 6.1: `high-end-visual-design` e `animate` viram aviso, não reprovação (o aluno não tem essas skills).

Visual

- Abertura: saudação só na primeira visita do aparelho e no tema da página; números contam do zero só na primeira carga. Primeiro número legível: 2.338 ms antes, 971 ms na volta.
- Meta batida: sinal na barra e no selo, sem tingir o cartão.
- Gráfico de área com eixo no zero, topo justo e unidade (R$, %); série longa sem as 61 bolinhas.
- Funil: etapa abaixo de 5% da primeira em escala logarítmica, com nota; valor real sempre visível; taxa entre etapas numa linha própria.
- Celular: primeiro número a 238 px (era 642 px) no 390; filtros atrás do botão "Filtros"; as 5 abas cabem sem rolar.
- Sem o bloco preto do título; linhas do fundo a 30%; calculadora de meta abre vazia com a sugestão no placeholder; tabela semanal só pinta diferença acima de 5% e de um mínimo; tabela larga do Meta continua tabela a 1440.

Testes

- `npm test`: 1324 na 3.8.0, 1404 depois da junção. `rodar-testes.mjs`: 27 (novo `test-python-38.py`).
- Ficou de fora: vão de cerca de 45 px nos cartões da 2ª linha quando o texto da meta é longo; moeda da conta Meta (`account_currency`, os valores saem em R$); D1 provado no SQLite, não no runtime do Cloudflare; minigráfico de 61 pontos e o ROAS com uma casa.

## 3.8.0

Conector Meta Ads: puxa Resultados, Custo por resultado e Leads do jeito que o Gerenciador de Anúncios mostra, e lê todas as páginas da Graph API. Reclamação do dono: "ele não puxava do Meta Ads resultados, leads e custo por resultado".

Causa

- `starter-kit/functions/lib/meta.mjs` pedia só `campaign_name,spend,impressions,clicks,actions,date_start`: sem `results` nem `cost_per_result`, o painel não tinha como mostrar Resultados nem Custo por resultado.
- Leads contava só o `action_type` `lead`: conta que não devolve o agregado (só formulário instantâneo ou só pixel) saía com 0 lead.
- `starter-kit/functions/api/connectors/meta-ads.js` (`fetchMeta`) e `starter-kit/workers/snapshot/src/index.js` (`fetchMetaDataSet`) faziam UM fetch e ignoravam `paging.next`. Com `time_increment=1` no nível de campanha, a Graph manda a resposta em páginas: o painel ficava com a primeira e o total saía errado.

Documentação oficial lida em 25/10/2026

- Insights da conta: https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/insights. `results` e `cost_per_result` são `list<AdsInsightsResult>`; a página não descreve os subcampos de `AdsInsightsResult` (o SDK oficial em Python tipa como `list<Object>`). Por isso o conector aceita os dois desenhos, `{ indicator, values: [{ value, attribution_windows }] }` e `{ action_type, value }`, com teste para cada um, e nunca soma janelas de atribuição (vale a `default`).
- Ações: https://developers.facebook.com/docs/marketing-api/reference/ads-action-stats/. `lead` é "All offsite leads plus all On-Facebook leads"; `onsite_conversion.lead_grouped` é "All On-Facebook Leads"; `leadgen_grouped` é "On-Facebook leads coming from Messenger and Instant Forms"; `offsite_conversion.fb_pixel_lead` é o lead do pixel.
- Permissão: a página do Ads Insights API pede `ads_read`.

O que mudou

- URL: `fields` ganha `results,cost_per_result`; `limit=500`; `use_unified_attribution_setting=true` (a atribuição de cada conjunto de anúncios, a mesma do Gerenciador).
- Leads sem dobra: com `lead`, vale só ele; sem ele, `lead_grouped` (ou `leadgen_grouped`, quando só ele vem) mais `fb_pixel_lead`. Mesma regra do `omni_purchase` nas Conversões.
- DataSet: as 7 colunas de sempre na mesma ordem, mais `Resultados`, `Tipo de resultado` (em português: "Leads no formulário", "Conversas por mensagem", "Compras no site"...), `Custo por resultado` e `CPL`. Campanha sem `results` cai nos Leads, depois nas Compras, com "(calculado pelo painel)" no tipo; sem nada, Resultados 0 e custo vazio. Dois tipos na mesma linha: soma, junta os nomes e o custo vira investimento / total.
- Paginação (`buscarTodasAsPaginas`, com o fetch injetado): segue `paging.next` até a última página, com teto de 40 páginas (20.000 linhas) e mensagem clara se passar; erro na página 2 em diante (inclusive limite de chamadas, códigos 4, 17, 32, 613 e 80000 em diante) vira mensagem pública com o número da página, e o texto cru da Meta fica só no log; erro na página 1 continua genérico (o preview não vira oráculo de token); só segue link da Graph API; link repetido para em vez de entrar em laço. O handler do Pages e o Worker de snapshot usam a mesma função: nenhum snapshot pela metade.
- Painel de Marketing: slot `resultados` (campo `extra`: só aparece no passo das colunas quando o arquivo tem a coluna) e métricas `resultados` e `custo_resultado` (investimento / resultados, nunca a soma dos custos). Visão geral e o layout plano ganham os cartões Resultados e Custo por resultado; os resumos por canal e por semana ganham as colunas. Tudo marcado com `seMapeada`: num CSV sem a coluna, some calado, sem "Não mapeada" nem nota "ficou de fora". A planilha modelo e o placar das colunas de quem usa CSV não mudam ("8 de 8").
- Dash do Meta criado antes da 3.8.0: `lib/colmap-meta.js` liga a coluna Resultados na hora de desenhar, sem regravar a config, sem mexer no que a pessoa escolheu e sem ligar em snapshot antigo que não tem a coluna.
- Assistente e guia do token: a permissão é `ads_read` (`read_insights` é de Página e não é necessária); o guia ganhou a tabela do que o dash puxa e as mensagens novas de erro.

Testes

- Novos: `test/meta-resultados.test.js` (16), `test/meta-paginacao.test.js` (13), `test/meta-resultados-painel.test.js` (11). Reprovavam antes (import de `contarLeads`, `buscarTodasAsPaginas` e `lib/colmap-meta.js` inexistentes) e passam depois.
- Atualizados de propósito: `test/meta.test.js` (fields e colunas novas), `test/layout-padrao/*` (faixa de fábrica do Marketing com os 2 cartões novos) e `test/modelos.test.js` (campo `extra` não faz parte da planilha modelo).
- O que não foi provado: uma chamada de verdade à Graph API com conta real (os testes usam o formato oficial com fetch falso).

## 3.7.4

Corrige a falha do CI da 3.7.3 (run 37870517417, só no ubuntu-latest): `WebKit iPhone 14: efeito 1, cartão que vira a tela` lia o número do cartão como `4.4724.472` em vez de `4.472`.

- Causa: era o TESTE, não o painel. Na abertura o painel conta os números por `requestAnimationFrame`, com um visor `.kpi__conta` (`aria-hidden`, `user-select: none`, em posição absoluta sobre o texto real, que fica transparente) dentro do `.kpi__value`. O teste lia o `textContent` do cartão descartando a roleta e o selo, mas não o visor, então somava o texto real ao do visor; e o `quieto` só esperava as animações da API de animações, que não enxerga a contagem por `requestAnimationFrame`. Numa máquina lenta a capa já tinha saído e o visor ainda estava no DOM no instante da leitura. No Mac o visor fecha antes e a falha não aparecia.
- Não é defeito do painel: medido no WebKit iPhone 14 com o `requestAnimationFrame` atrasado em 450 ms, o texto que o leitor de tela lê durante a contagem (tudo menos o `aria-hidden`) é só o valor final, e no print o número aparece uma vez (o visor sobre o texto real transparente).
- Correção no teste (`scripts/test-navegadores.cjs`): `lerValor` descarta também o visor `.kpi__conta`; `quieto` passa a esperar o fim da contagem (nenhum visor, roleta ou `.is-contando` no DOM), sem afrouxar nenhuma conferência de número.
- Teste novo, "efeito 1, máquina lenta": mesma passagem lista -> painel com o `requestAnimationFrame` atrasado em 450 ms; no instante em que o visor está vivo confere que o número lido e o texto do leitor de tela são só o valor final, e que depois de quieto não sobra camada. Reprovava antes da correção (`4.4720` lido) e passa depois.
- `NAVEGADORES_RAF_LENTO=<ms>` simula máquina lenta em toda a matriz. Com 450 ms, o teste original reprovava 5 de 5 vezes com a mesma mensagem do CI (`4.4724.423` e parecidos) e, com a correção, passa 5 de 5.
- Nenhum arquivo do painel mudou: o painel que as pessoas recebem é o mesmo da 3.7.3.

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
