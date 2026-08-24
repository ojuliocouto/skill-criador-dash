# Segurança: modelo de acesso, ADMIN_TOKEN e senha por dashboard

## Modelo de acesso (FAIL-CLOSED, avise a pessoa)

A LEITURA de um dashboard publicado é pública (ele existe pra ser visto). Mas CRIAR, sobrescrever e
APAGAR (POST/DELETE) são fail-closed: exigem o header `x-admin-token`. Sem um `ADMIN_TOKEN` configurado
no servidor, a API BLOQUEIA toda mutação (responde 403 `adminNotConfigured`), então ninguém cria ou
apaga nada anonimamente. Além disso, dashboard com senha protege a config E os dados por id. Ou seja:
configurar o `ADMIN_TOKEN` faz parte do setup, não é opcional (comandos em `references/infra.md`, Passo 4).

Token errado (ou ausente, com `ADMIN_TOKEN` setado) responde 401 `{ needsAdmin: true }`: o wizard pede o
token uma vez, guarda no localStorage (`cd-admin-token`) e reenviará sozinho dali em diante.

## Validação da fonte no POST

O POST valida a forma de `source` nos tipos conhecidos e devolve 400 apontando o campo errado:
- `csv` exige `data` (string com o conteúdo do CSV; é `data`, não `csvText`)
- `sheets` exige `url` (link da planilha)
- `meta` exige `meta.token` e `meta.account`

Tipo desconhecido (conector sob medida) passa sem exigências: a forma é do conector
(`functions/lib/source-shape.mjs`, testada em `test/source-shape.test.js`).

## Proteção por senha (opcional, por dashboard)

O cliente manda um SHA-256 da senha no header `x-dash-auth`; o servidor guarda só um verifier
PBKDF2-SHA256 salgado por dashboard (nunca a senha, nunca um hash reenviável), recomputa e compara em
tempo constante. O dashboard pede a senha; a API só devolve a config E OS DADOS (conectores por id) com
o header correto. Tentativas erradas têm rate limit por KV. `stripSecrets` remove recursivamente
qualquer credencial da fonte (token/secret/apikey/senha/authorization) das respostas.

## ID do dashboard protegido (por que ele fica opaco)

Dashboard SEM senha tem id legível, derivado do nome: "Vendas Time Comercial" vira
`vendas-time-comercial`. Dashboard COM senha recebe um id OPACO e aleatório (`dash-` mais 32
caracteres hex, 128 bits de entropia), sem nenhuma relação com o nome.

O motivo: o id sai na listagem pública e na URL. A listagem já era endurecida para não devolver
name/domain/accent de dashboard protegido, mas enquanto o id fosse o slug do nome ela devolvia
`{"id":"faturamento-acme-janeiro","protected":true}` e entregava o nome do cliente para qualquer um
que abrisse a landing. Pior: um id adivinhável virava oráculo, porque
`GET /api/dashboards?id=sigiloso-cliente` respondia 401 `needsPassword` (existe) contra 404 (não
existe), ou seja, dava para confirmar nomes de clientes por tentativa.

### A decisão (id opaco, em vez de sumir com o dashboard da listagem)

Havia duas saídas: parar de listar dashboards protegidos, ou desacoplar o id do nome. O id opaco
fecha mais e quebra menos:

- Parar de listar não resolveria o vazamento. O nome continuaria dentro do id, ou seja, na URL que
  você manda para o cliente e no histórico do navegador dele, e o oráculo 401 contra 404 continuaria
  confirmando nomes.
- Parar de listar também tiraria do dono a única tela de gestão que existe: a landing lista os
  dashboards e é de lá que se abre e se exclui. Ela chama a API sem header nenhum, então nem abrir
  exceção para quem tem o `ADMIN_TOKEN` resolveria sem mexer no front.
- Com o id opaco a landing continua funcionando igual, o dashboard protegido segue aparecendo como
  `{ id, protected: true }` e nada do nome vaza.

### Contrato

- POST com bloco `auth` criando um dashboard: o servidor gera o id opaco e ignora um `id` sugerido
  pelo cliente. Sem isso, bastaria mandar `id: "sigiloso-cliente"` para reintroduzir o vazamento por
  fora do wizard.
- POST com bloco `auth` sobrescrevendo um id que JÁ existe e JÁ era protegido: o id é preservado. O
  link de um dashboard protegido publicado não pode mudar por causa de uma edição.
- POST sem senha: nada muda, o id continua sendo o slug legível do nome.
- POST com bloco `auth` sobrescrevendo um id que JÁ existe mas AINDA NÃO era protegido (dashboard
  público ganhando senha agora): o id ROTACIONA para o formato opaco. Preservar o slug legível aqui
  reintroduziria o mesmo vazamento que o id opaco existe para fechar, então o servidor migra o
  registro no KV (grava no id novo, apaga o antigo) e devolve o id novo na resposta, para o cliente
  saber o link novo. O id antigo deixa de responder (404): não sobra um registro órfão respondendo
  em paralelo com o novo.

Quem tem a senha tem o link direto, e o link opaco ainda ganha em privacidade: mandar
`.../dashboard.html?id=dash-aa56d44b...` para o cliente não expõe o nome dele em nenhum lugar por
onde essa URL passar (mensagem, histórico, log de proxy).

Código em `functions/api/dashboards.js` (`resolverId`, `gerarIdOpaco`, `temSenha`), testes em
`test/protected-id.test.js`.

## Detalhe do gate por fonte

A senha protege a config e os conectores POR ID (D1 e Meta GET checam a senha antes de devolver dado).
Já sheets/csv são lidos com a URL/arquivo que estão na config: quem não passa a senha não pega a config,
então não chega na URL. O `POST` de preview do Meta (usado só no wizard, com token transiente no corpo)
não grava nada, tem rate limit por IP e, quando `ADMIN_TOKEN` está setado, TAMBÉM exige o header
`x-admin-token` (o wizard já manda esse header e, se faltar, pede o token e re-tenta, igual ao salvar).
Ou seja: se você fechou a instância com `ADMIN_TOKEN`, o preview Meta continua funcionando pra você
(que tem o token), e fica barrado pra anônimo.

## Avisos que o agente deve dar à pessoa

- Uma planilha compartilhada "com o link" é legível por qualquer um com o link; um dashboard publicado
  não tem login, a menos que você defina a senha. Use dados que possam circular por link e coloque senha
  no que for sensível.
- O token do Meta Ads fica SÓ no servidor (KV): nunca é devolvido ao browser; o conector resolve por id.
- O link de um dashboard com senha é embaralhado de propósito (`dash-` mais um código aleatório):
  é isso que impede o nome do cliente de aparecer na listagem pública e na URL. Guarde o link, ele
  não é reconstruível a partir do nome.
- Nunca commite token, Account ID ou id de KV/D1 real: use placeholders `<...>` em qualquer repo público.
