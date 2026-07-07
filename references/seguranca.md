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
- Nunca commite token, Account ID ou id de KV/D1 real: use placeholders `<...>` em qualquer repo público.
