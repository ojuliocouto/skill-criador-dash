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
4. Permissões: marque **ads_read** e **read_insights**. Só essas duas.
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
| `(#200) ... ads_read` ou "permissão" | O token foi gerado sem `ads_read` | Volte ao passo 4 e gere de novo marcando `ads_read` e `read_insights` |
| `(#100) ... does not exist` ou "conta não encontrada" | O usuário do sistema não tem acesso à conta, ou o ID está errado | Passo 3 (atribuir a conta) e passo 5 (conferir o número) |
| `Invalid OAuth access token` | Token copiado pela metade, ou foi anulado | Gere outro no passo 4 e copie inteiro |
| `Session has expired` | Você usou um token pessoal (do Explorer), que vence em horas | Use o token do usuário do sistema, com validade **Nunca** |
| O dash abre com tudo zerado | A conta não teve gasto no período escolhido | Normal em conta nova: troque o período ou espere a primeira campanha rodar |

## Por que não usar o token do Explorer da Graph API

O token que o Explorer gera vence em 1 ou 2 horas. O dash para de funcionar no dia seguinte e você
não entende por quê. O de usuário do sistema não vence.
