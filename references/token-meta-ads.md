# Como gerar o token do Meta Ads (passo a passo do aluno)

O dash lê os números da sua conta de anúncio com um **token** (uma chave de leitura) e o **ID da conta**.
O token certo é o de **usuário do sistema**: ele não vence e não depende do seu login pessoal.
Leva uns 10 minutos e você faz uma vez só.

Você precisa ser **admin do portfólio empresarial** (o antigo Business Manager) onde está a conta de anúncio.

Os nomes abaixo são os que aparecem na tela da Meta em português (conferido em 02/10/2026). Se algum
botão mudou de nome, procure pelo mais parecido no mesmo lugar.

## 1. Crie um app (se o seu portfólio ainda não tem um)

1. Abra **developers.facebook.com/apps** logado no Facebook que é admin do portfólio.
2. Clique em **Criar app**.
3. Quando perguntar o caso de uso, escolha **Outro**. No tipo de app, escolha **Empresa**.
4. Dê um nome (por exemplo `Dash da minha empresa`) e, no campo de portfólio, escolha **o seu portfólio**.
5. Conclua. Não precisa publicar o app nem pedir revisão: ele só vai ler dados da sua própria conta.

Se o portfólio já tem um app (aparece em **Configurações > Contas > Apps**), pode usar ele e pular este passo.

## 2. Crie o usuário do sistema

1. Abra **business.facebook.com/settings** e escolha o seu portfólio no topo.
2. No menu da esquerda: **Usuários > Usuários do sistema**.
3. Clique em **Adicionar**.
4. Nome: `dash-leitura`. Função: **Funcionário** (não precisa ser admin; quanto menos poder, mais seguro).
5. Confirme.

## 3. Dê ao usuário do sistema acesso à conta de anúncio

1. Ainda em **Usuários do sistema**, clique no `dash-leitura`.
2. Na aba **Ativos atribuídos**, clique em **Atribuir ativos** (ou **Adicionar ativos**).
3. Escolha **Contas de anúncios** e marque a conta que o dash vai ler.
4. Em permissão, deixe só **Ver desempenho** (leitura). Não marque gerenciar campanhas.
5. Na mesma tela, em **Apps**, atribua o app do passo 1.
6. Salve.

## 4. Gere o token

1. Com o `dash-leitura` aberto, clique em **Gerar token**.
2. Escolha o **app** do passo 1.
3. Validade: **Nunca**.
4. Permissões: marque **ads_read**. É a permissão que a Meta exige para ler os números dos anúncios
   (Insights). `read_insights` é de Página e não é necessária; se já marcou, não atrapalha.
5. Clique em **Gerar token** e **copie na hora**: a Meta mostra o token uma vez só.
   Ele começa com `EAA`.

Guarde o token num lugar seguro (gerenciador de senhas). **Nunca** cole em grupo, print ou planilha
compartilhada: quem tem o token lê os números da sua conta.

## 5. Pegue o ID da conta de anúncio

1. Abra o **Gerenciador de Anúncios**.
2. Olhe a barra de endereço: tem um trecho `act=1234567890`. Esse número é o ID.
   (Também aparece em **Configurações > Contas > Contas de anúncios**, abaixo do nome da conta, como "Identificação".)
3. No dash, pode colar só o número ou com `act_` na frente: os dois funcionam.

## 6. Cole no dash

No wizard do dash, no cartão do Meta Ads, cole o token no campo **Token** e o ID no campo **Conta**.
O dash testa na hora e mostra o nome da conta se deu certo.

## Se der erro

| O que aparece | O que é | O que fazer |
|---|---|---|
| `(#200) ... ads_read` ou "permissão" | O token foi gerado sem `ads_read` | Volte ao passo 4 e gere de novo marcando `ads_read` |
| `(#100) ... does not exist` ou "conta não encontrada" | O usuário do sistema não tem acesso à conta, ou o ID está errado | Passo 3 (atribuir a conta) e passo 5 (conferir o número) |
| `Invalid OAuth access token` | Token copiado pela metade, ou foi anulado | Gere outro no passo 4 e copie inteiro |
| `Session has expired` | Você usou um token pessoal (do Explorer), que vence em horas | Use o token do usuário do sistema, com validade **Nunca** |
| O dash abre com tudo zerado | A conta não teve gasto no período escolhido | Normal em conta nova: troque o período ou espere a primeira campanha rodar |
| "o período tem mais de 40 páginas de dados" | Período longo demais para uma conta com muitas campanhas (mais de 20.000 linhas de campanha por dia) | Encurte o período (campos De e Até) ou crie um painel para cada conta |
| "a Meta atingiu o limite de chamadas desta conta na página N" | Limite de uso da API da Meta (códigos 4, 17, 32, 613, 80000 e parecidos) | Espere uns 15 minutos e clique em Atualizar; se repetir, encurte o período |
| "a Meta devolveu erro na página N" ou "parou de responder na página N" | A Meta falhou no meio da leitura | Nada foi mostrado pela metade. Tente de novo em alguns minutos |

## O que o dash puxa da Meta

Uma linha por campanha por dia, com estas colunas:

| Coluna | De onde vem |
|---|---|
| Data, Campanha, Investimento, Impressões | Os campos de sempre da Meta (`date_start`, `campaign_name`, `spend`, `impressions`) |
| Cliques | Cliques no link (`inline_link_clicks`), o número que o Gerenciador usa no CTR e no CPC de link. É a base do CTR e do CPC do painel |
| Cliques (todos) | Todos os cliques no anúncio (`clicks`): curtida, foto, perfil e link |
| Leads | Formulário instantâneo, Messenger e pixel do site, sem contar o mesmo lead duas vezes: vale o total `lead` da Meta; sem ele, leads no Facebook mais leads do pixel |
| Conversões | Compras (`omni_purchase`; sem ele, `purchase` mais compras do pixel) |
| Receita | Valor das compras (`action_values`), com a mesma regra das Conversões: `omni_purchase`; sem ele, `purchase` mais compras do pixel. Nunca soma o total com as partes |
| Resultados e Tipo de resultado | A coluna "Resultados" do Gerenciador de Anúncios (`results`): o que a campanha otimiza (lead, conversa, compra, alcance...) |
| Custo por resultado | A coluna "Custo por resultado" do Gerenciador (`cost_per_result`) |
| CPL | Investimento dividido por Leads, na linha |

- Os números seguem a atribuição de cada conjunto de anúncios (`use_unified_attribution_setting`), a mesma do Gerenciador.
- A coluna Receita só existe quando a Meta manda valor de compra (pixel ou API de conversões com `value`). Conta de captação, sem compra, fica sem Receita e sem ROAS, em vez de mostrar R$ 0,00. Painel do Meta criado antes ganha a Receita sozinho quando a coluna chega.
- O valor sai na moeda da conta de anúncios. O painel formata em R$: conta em outra moeda precisa de conversão antes.
- Documentação oficial dos campos: https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights/ (`action_values`, `inline_link_clicks`, `clicks`) e https://developers.facebook.com/docs/marketing-api/reference/ads-action-stats/ (tipos de ação).
- Campanha sem "Resultados" na Meta (campanha antiga): o dash usa os Leads, ou as Compras se não houver lead, e escreve "(calculado pelo painel)" no Tipo de resultado.
- O dash lê todas as páginas da resposta (500 linhas por página, até 40 páginas). Passou disso, ele avisa em vez de mostrar um total pela metade.
- Os números da Meta podem mudar por alguns dias depois (atribuição atrasada). É normal o painel de hoje não bater com o de ontem para os últimos dias.

## Por que não usar o token do Explorer da Graph API

O token que o Explorer gera vence em 1 ou 2 horas. O dash para de funcionar no dia seguinte e você
não entende por quê. O de usuário do sistema não vence.
