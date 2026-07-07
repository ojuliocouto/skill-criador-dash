# Provisionar a infra (guia de comandos)

Pergunte SEMPRE qual conta Cloudflare antes de operar. Confirme com `wrangler whoami`.
Não há passo de build: o `wrangler.toml` já tem `pages_build_output_dir = "public"`, então os comandos
usam a pasta `public/` direto. Todos os comandos abaixo rodam a partir da pasta `starter-kit/` (é onde
mora o `wrangler.toml`, o `db/schema.sql` e o `package.json`).

Antes de começar, rode o preflight (checa Node, wrangler, login, placeholders e token de ambiente):
```
python3 scripts/preflight.py --starter-kit starter-kit
```

## Base (os dois modos)

Faça os passos NA ORDEM, um de cada vez; o passo 2 é bloqueante (não pule).

### Passo 1: crie os namespaces KV
```
wrangler kv namespace create DASHBOARDS_KV
# O comando IMPRIME o id do namespace. Dependendo da versao do wrangler (3.x vs 4.x) o formato varia:
# pode vir como  id = "abc123..."  ou dentro de um bloco [[kv_namespaces]]. Em qualquer caso, copie o valor do id.
wrangler kv namespace create DASHBOARD_CACHE      # opcional (cache 5 min); imprime outro id
```

### Passo 2 (BLOQUEANTE, faça ANTES de qualquer deploy): edite o `wrangler.toml`

Troque `<SEU_KV_NAMESPACE_ID>` pelo id do DASHBOARDS_KV, `<SEU_KV_CACHE_ID>` pelo id do DASHBOARD_CACHE,
e o `name = "meu-dashboard"` do topo pelo `<NOME-DO-PROJETO>` (o `name` do toml e o `--project-name` do
deploy TÊM que ser iguais). Nunca commite id real em repo público. Confirme que NÃO sobrou nenhum
placeholder ANTES de seguir:
```
grep -n "<SEU_KV\|<NOME-DO-PROJETO\|meu-dashboard" wrangler.toml   # tem que voltar VAZIO. Se achar algo, ainda falta trocar.
# ou: python3 scripts/preflight.py --starter-kit starter-kit  (faz esta checagem e as demais)
```
Se você deployar com um placeholder de id ainda no toml, o deploy COMPILA e passa, mas a API responde 500
"Binding DASHBOARDS_KV não configurado" em runtime. Por isso o grep acima é obrigatório antes do passo 3.

### Passo 3: crie o projeto Pages e faça o deploy
```
wrangler pages project create <NOME-DO-PROJETO> --production-branch main   # cria o projeto Pages
wrangler pages deploy public --project-name=<NOME-DO-PROJETO> --branch main
```
Bindings em produção: com os ids já no `wrangler.toml`, o `wrangler pages deploy` aplica os bindings de KV
ao deployment. Se por algum motivo a API responder 500 "Binding DASHBOARDS_KV não configurado", vincule no
painel: Cloudflare Pages > seu projeto > Settings > Bindings > add KV binding `DASHBOARDS_KV` (e `DASHBOARD_CACHE`).

### Passo 4 (OBRIGATÓRIO, mutação é fail-closed): defina o `ADMIN_TOKEN`

O agente FAZ isso; a pessoa não precisa inventar nem decorar token:
```
# 1) gere um token aleatorio forte (o agente roda isto e GUARDA o valor pra passar pra pessoa):
openssl rand -base64 32
# 2) defina como secret do Pages (a partir de starter-kit/; cole o valor gerado quando ele pedir):
wrangler pages secret put ADMIN_TOKEN --project-name=<NOME-DO-PROJETO>
```
Ou pelo painel: Cloudflare Pages > seu projeto > Settings > Variables and Secrets > adicionar `ADMIN_TOKEN`
como Secret (tipo Secret/Encrypt, nunca texto plano). Depois de re-deploy, na PRIMEIRA vez que a pessoa
criar um dashboard no wizard, ele vai pedir o token (fluxo `needsAdmin`): ela cola o valor gerado UMA vez,
o wizard guarda no navegador (localStorage) e daí pra frente manda o header sozinho. A pessoa gerencia
zero token no dia a dia: cola uma vez o que o agente gerou. Guarde o token em local seguro (é o que
autoriza gerenciar os dashboards); se perder, é só gerar outro e repetir o `secret put`.

Sem o `ADMIN_TOKEN`, criar/apagar dashboard é bloqueado (403 `adminNotConfigured`), então este passo não
é opcional. O modelo de acesso completo está em `references/seguranca.md`.

### Domínio customizado (opcional)

É pelo painel, não por CLI. Cloudflare Pages > seu projeto > Custom domains > Set up a domain, digite o
domínio (tem que estar na MESMA conta Cloudflare, como zona). O painel cria o registro DNS (CNAME)
automaticamente se a zona é da conta; se o domínio está em outro provedor de DNS, o painel mostra o
CNAME pra você criar lá. Antes do domínio propagar, valide tudo pela URL nativa
`https://<NOME-DO-PROJETO>.pages.dev`. Abra `config.html` (no `.pages.dev` ou no domínio) e crie o dashboard.

## Modo histórico (adiciona, só se a pessoa escolheu Histórico)

Sempre a partir de `starter-kit/`:
```
wrangler d1 create dashboard-db
# imprime database_id = "..."; cole em workers/snapshot/wrangler.toml (DASHBOARD_DB) e no binding D1 do Pages
wrangler d1 execute dashboard-db --remote --file=db/schema.sql   # cria a tabela snapshots no D1 REMOTO
```
O `--remote` é OBRIGATÓRIO: sem ele o schema vai pro D1 LOCAL (só do seu `wrangler dev`), e o Worker de
produção fica sem a tabela `snapshots`, quebrando o dashboard histórico mesmo com o cron rodando.

Em `workers/snapshot/wrangler.toml`, preencha os bindings DASHBOARD_DB (D1) e DASHBOARDS_KV, e o cron.
ATENÇÃO: o `id` do `DASHBOARDS_KV` tem que ser EXATAMENTE o MESMO nos dois arquivos (raiz e worker) e
o mesmo namespace do Pages. Se divergir, o cron lista o prefixo `dash:` num KV vazio e não captura nada,
sem erro visível.
```
cd workers/snapshot && wrangler deploy                 # sobe o Worker com cron trigger (captura de hora em hora)
```
(Dentro de `workers/snapshot/` o schema fica em `../../db/schema.sql`; por isso, se preferir aplicar o
schema já dentro dessa pasta, o caminho é `wrangler d1 execute dashboard-db --remote --file=../../db/schema.sql`.
São o mesmo arquivo: só muda o diretório de onde você chama o comando.)

PASSO QUE NÃO PODE FALTAR (senão o dashboard histórico cai no 500 do d1.js mesmo com o cron gravando):
vincule o binding D1 no PAGES. Duas formas: (a) descomente o bloco `[[d1_databases]]` do `wrangler.toml`
da raiz e cole o `database_id`, e re-deploy o Pages; ou (b) no painel Pages > seu projeto > Settings >
Bindings > add D1 binding `DASHBOARD_DB` apontando pro mesmo banco.

A primeira captura acontece no próximo disparo do cron (de hora em hora), então o dashboard mostra
"Ainda nao ha dados capturados" até lá (não está quebrado). Para ver dado NA HORA, force uma captura:
```
cd workers/snapshot && wrangler dev --remote --test-scheduled   # --test-scheduled expoe a rota /__scheduled; --remote usa o D1/KV reais
# noutro terminal, dispara o scheduled uma vez:
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```
Sem o flag `--test-scheduled` a rota `/__scheduled` não existe e o curl dá 404. Depois é só recarregar
o dashboard. (Alternativa: inserir um snapshot manual no D1 com um INSERT em `snapshots`.)

Deploy do Pages: sem CLOUDFLARE_API_TOKEN forçado, usa o OAuth do `wrangler login`.
