---
name: criador-dash
description: >
  Construtor guiado de dashboards de marketing, vendas e suporte. NAO entrega um app pronto:
  o agente conduz a pessoa, passo a passo, para construir e publicar o proprio dashboard na
  infra dela (conta Cloudflare, KV, Pages, dominio e, no modo historico, D1 + Worker cron).
  O agente MONTA a partir de uma biblioteca de pecas ja testadas (conectores, widgets,
  templates, motor de metricas) em `starter-kit/`, personalizando para a operacao da pessoa,
  e escreve conectores sob medida quando a fonte e especifica. Dois modos de dados: ao vivo
  (le a fonte na hora, KV so guarda config) ou historico (cron tira snapshots no D1). Use
  quando alguem quiser criar, personalizar e publicar um dashboard proprio no Cloudflare.
version: 3.0.0
author: Julio Couto
category: marketing-analytics
tags: [dashboard, marketing, vendas, suporte, cloudflare-pages, functions, kv, d1, cron, workers, google-sheets, csv, meta-ads, guiado, no-code, roas, cpl, cpa, ticket-medio]
---

# Criador Dash: Construtor Guiado de Dashboards

> Esta skill NAO é um app que você entrega pronto. Ela é um roteiro que VOCÊ (agente) conduz
> para construir, com a pessoa, o dashboard DELA, na conta Cloudflare DELA. Você monta a
> partir das peças já testadas em `starter-kit/` (não reinventa a cada vez) e personaliza.
> Valores entre `<...>` ou em CAPS são placeholders. Nunca commite token, Account ID ou id de KV/D1 real.

## MODO DE OPERAÇÃO (leia antes de tudo)

1. Você é o maestro. A entrega é o dashboard da PESSOA, publicado na infra DELA, feito sob medida.
2. NÃO reinvente: componha a partir da biblioteca de peças provadas em `starter-kit/` (conectores,
   widgets, templates, motor de métricas, wizard). Personalizar em cima de peça testada = rápido
   e confiável. Escrever tudo do zero a cada pessoa baixaria a qualidade.
3. Fonte específica da pessoa? Escreva um conector sob medida na hora, seguindo o Contrato 2 do
   `ARCHITECTURE.md` (o `meta-ads.js` é o exemplo de conector com token). Assim o "genérico" é real:
   a pessoa não fica presa a uma lista de ferramentas, você cria a que ela precisa.
4. A pessoa escolhe o MODO DE DADOS (seção "Os dois modos de dados"): ao vivo ou histórico.
5. Toda operação no Cloudflare é na conta DA PESSOA. Pergunte SEMPRE qual conta antes de operar.

## PASSO A PASSO (o roteiro que você conduz)

### 1. Onboarding e checklist
Nunca presuma que a pessoa leu o README. Explique em 3 frases e rode o checklist, um item por vez:
- O que é: "eu vou construir com você o seu dashboard, na sua conta Cloudflare, do jeito da sua operação".
- Não é um produto fechado de um nicho: adaptamos domínio, métricas e fonte a você.
- No fim, o dashboard fica publicado num domínio seu, e você é o dono do código e da infra.

Explique em uma frase cada palavra técnica antes de mandar comando (a pessoa pode nunca ter usado):
- Cloudflare Pages: onde o dashboard fica hospedado (de graça). KV: um banco chave-valor onde ficam as configs. wrangler: a ferramenta de linha de comando do Cloudflare, é por ela que a gente cria e publica.

Checklist (um item por vez; se faltar algo, resolva antes de seguir):
- [ ] Tem conta no Cloudflare? (o plano grátis já cobre Pages + Functions + KV; D1 também tem free tier). Se não tiver, peça pra criar em dash.cloudflare.com.
- [ ] Tem Node instalado? (`node -v`). Sem Node não roda `wrangler` nem os testes.
- [ ] Instale o wrangler: `npm i -g wrangler`. No Mac, se der erro de permissão (EACCES), rode `sudo npm i -g wrangler`. Confirme com `wrangler --version`; se der "command not found", o bin global do npm não está no PATH (`npm prefix -g` mostra a pasta; adicione ao PATH).
- [ ] Faça login: `wrangler login` (abre o browser; a pessoa escolhe a conta Cloudflare dela e autoriza).
- [ ] Confirme a conta certa: `wrangler whoami` (mostra o email e o Account ID logado). Se for a conta errada, `wrangler logout` e login de novo.
- [ ] Tem Claude Code? (é por ele que eu conduzo a construção).

### 2. Descoberta da operação
Antes de montar, entenda:
- Que área ela quer medir: Marketing, Vendas, Suporte, ou mais de uma (um dashboard por área).
- Onde os dados dela vivem: planilha, um CRM, Meta Ads, WhatsApp, um sistema com API, etc.
- O que ela precisa DECIDIR olhando o dashboard (isso define quais métricas importam).

### 3. Escolher o modo de dados
Explique e deixe a pessoa escolher (ver seção "Os dois modos de dados"):
- AO VIVO: o dashboard lê a fonte na hora. Só precisa de KV pra config. Setup mínimo. Bom pra maioria.
- HISTÓRICO: um Worker cron tira "fotos" (snapshots) da fonte e grava no D1; o dashboard lê o D1.
  Dá histórico de verdade e não depende da fonte ficar no ar. Mais robusto, mais setup.

### 4. Provisionar a infra DELA
Pergunte qual conta Cloudflare usar. Depois (ver seção "Provisionar a infra"):
- KV `DASHBOARDS_KV` (sempre) e `DASHBOARD_CACHE` (opcional).
- Modo histórico: D1 + aplicar `db/schema.sql` + Worker cron (`workers/snapshot/`).
- Projeto Pages + domínio customizado.

### 5. Montar o dashboard
- Escolha o domínio/template pronto (Marketing, Vendas, Suporte) ou crie um novo (seção "Adicionar domínio").
- Conecte a fonte: planilha (gviz CSV), upload CSV, Meta Ads (token), ou um conector sob medida.
- Mapeie colunas (auto-mapeamento por cabeçalho pré-preenche), defina branding (cor), meta opcional e senha opcional.
- No modo ao vivo, a fonte fica na config; no modo histórico, a fonte alimenta o cron e o dashboard lê o D1.

### 6. Deploy e verificação
- Publique na conta DA PESSOA (`wrangler pages deploy public --project-name=<NOME>`).
- Modo histórico: deploy do Worker cron e rode uma primeira captura.
- Confirme com os próprios olhos: abra o dashboard publicado e cheque KPIs, funil, tendência e a cor
  de marca, em desktop E mobile, antes de dizer pronto.

### 7. Encerramento
Salve o contexto do projeto da pessoa em `references/` (projeto Pages, domínio, fontes, decisões,
modo de dados). Nunca coloque token, Account ID ou id de KV/D1 real: use placeholders.

## A CAIXA DE PEÇAS (biblioteca provada em `starter-kit/`)

Código real e testado (274 testes verdes, TDD). Você compõe a partir daqui.

Arquitetura em 3 camadas desacopladas (contratos completos em `starter-kit/ARCHITECTURE.md`):
1. CONECTORES: buscam dados de uma fonte e devolvem um `DataSet` (schema comum tabular). Não sabem de métricas.
2. WIDGETS: blocos visuais puros (KPI, série temporal, funil, tabela, ranking). Recebem dados já calculados.
3. TEMPLATES DE DOMÍNIO: definem slots semânticos, métricas e o layout de widgets de cada domínio.

```
Fonte -> Conector -> DataSet (schema comum) -> Template -> Widgets -> Render
```

Conectores e fontes disponíveis:
- Google Sheets via gviz CSV (carro-chefe, leigo-friendly): a pessoa compartilha a planilha como
  "qualquer pessoa com o link" e só cola o link. Sem OAuth, sem API key.
- Upload de CSV (fallback universal).
- Meta Ads (nativo, avançado): insights da Graph API com access token; o token fica SÓ no servidor.
- Conector sob medida: escreva um novo seguindo o Contrato 2 quando a fonte da pessoa for específica.
- D1 (modo histórico): lê o snapshot mais recente gravado pelo cron.

Domínios prontos:
- MARKETING: investimento, impressões, cliques, leads, conversões, receita; derivadas CTR, CPC, CPL,
  CPA, ROAS. Layout: KPIs + funil de conversão + série temporal + ranking por canal + tabela.
- VENDAS: número de negócios, vendas ganhas, faturamento (soma do valor SÓ das ganhas), ticket médio
  e taxa de conversão. "Ganha" detectada pelo status; sem status, todas contam (fallback). Layout:
  KPIs + funil de fechamento + série temporal + rankings + tabela.
- SUPORTE: atendimentos, resolvidos, taxa de resolução, tempo de resposta (média) e CSAT (média).
  Layout: KPIs + funil de resolução (atendimentos -> resolvidos) + série temporal + ranking por canal + tabela.
- (Precisa de outro domínio, ex Financeiro? Crie conforme a operação da pessoa: ver "Adicionar domínio".)

Recursos dos KPIs:
- Tendência (comparativo de período): métrica com `betterWhen` (`higher`/`lower`) ganha um badge
  colorido comparando a 2a metade do período com a 1a (metades de mesmo tamanho). Verde melhora, vermelho piora.
- Meta vs realizado (opcional): meta na métrica principal do domínio (`primaryMetric`); o card mostra
  barra de progresso e percentual da meta.

Proteção por senha (opcional): senha por dashboard; guarda-se só o hash SHA-256 (comparado em tempo
constante). O dashboard pede a senha; a API só devolve a config E OS DADOS (conectores por id) com o
hash correto no header `x-dash-auth`. `stripSecrets` remove recursivamente qualquer credencial da
fonte (token/secret/apikey/senha/authorization) das respostas.

Modelo de acesso (avise a pessoa): a API é ABERTA por padrão. Dashboard SEM senha pode ser lido,
sobrescrito ou apagado por qualquer um que tenha o id (fluxo self-serve). Para dado sensível: ponha
senha. Para restringir a instância inteira, defina a env `ADMIN_TOKEN` no projeto Pages: com ela setada,
POST/DELETE exigem o header `x-admin-token`, então só o dono cria/apaga dashboards.

Como definir o `ADMIN_TOKEN` no projeto Pages (dois caminhos, escolha um):
```
# via CLI (a partir de starter-kit/, ele pergunta o valor do segredo):
wrangler pages secret put ADMIN_TOKEN --project-name=<NOME-DO-PROJETO>
```
Ou pelo painel: Cloudflare Pages > seu projeto > Settings > Variables and Secrets >
adicionar `ADMIN_TOKEN` como Secret (tipo "Encrypt"/Secret, não como texto plano).
Efeito: com o `ADMIN_TOKEN` setado, POST/DELETE passam a exigir o header `x-admin-token` com esse
valor, então só você (o dono, que conhece o token) consegue criar ou apagar dashboards.

Detalhe do gate por fonte: a senha protege a config e os conectores POR ID (D1 e Meta GET checam a
senha antes de devolver dado). Já sheets/csv são lidos com a URL/arquivo que estão na config: quem
não passa a senha não pega a config, então não chega na URL. O `POST` de preview do Meta (usado só no
wizard, com token transiente no corpo) é aberto por design e não grava nada.

Tema claro/escuro: botão na topbar (`lib/theme.js`), injetado em todas as páginas; persiste no
localStorage e respeita a preferência do sistema no primeiro acesso. A estética é de ferramenta de
analytics (superfície chapada, borda de 1px, números tabulares, sem gradiente decorativo), pra NÃO
ter cara de template de IA. A cor de destaque da marca funciona nos dois temas (o `--accent-soft`
deriva dela via color-mix, então não fica um roxo genérico fixo).

Árvore de arquivos (`starter-kit/`, sem node_modules):
```
ARCHITECTURE.md                 contratos das 3 camadas (fonte da verdade)
package.json  wrangler.toml
db/schema.sql                   tabela de snapshots do modo historico (D1)
examples/                       marketing-exemplo.csv, vendas-exemplo.csv, suporte-exemplo.csv
functions/
  _middleware.js                CORS + cache KV (5 min) dos conectores
  api/
    dashboards.js               CRUD das configs no KV + gate de senha + strip de segredos
    connectors/
      sheets.js                 conector carro-chefe (gviz CSV)
      csv.js                     conector de upload
      meta-ads.js                conector Meta Ads (Graph API, token no servidor)
      d1.js                      conector do modo historico (le snapshot do D1)
      crm.js  hotmart.js         stubs (ponto de partida)
  lib/
    csv.mjs                     parseCSV + detectDelimiter (puro, testavel)
    sheets-url.mjs              sheetUrlToCsv (compartilhado por sheets.js e pelo worker)
    meta.mjs                    buildInsightsUrl + mapInsightsToDataSet (puro)
    snapshots.mjs               SQL do modo historico + rowToDataSet (puro)
    auth-config.mjs             needsAuth/authOk/safeEqual (neutro; conectores importam daqui)
workers/
  snapshot/                     Worker com cron que grava snapshots no D1
public/
  index.html  config.html (wizard)  dashboard.html
  assets/css/main.css
  assets/js/
    config-wizard.js  dashboard.js  index-page.js
    lib/ api-client.js  automap.js  format.js  metrics.js  auth.js  theme.js
    templates/ index.js  marketing.js  vendas.js  suporte.js
    widgets/ index.js (registry)  _util.js  kpi.js  timeseries.js  funnel.js  table.js  ranking.js
test/                           274 testes (npm test  ->  node --test test/*.test.js)
```

Rodar local (o `npm run dev` já embute a `--compatibility-date` do `package.json`):
```
cd starter-kit
npm test                       # suite completa (TDD)
npm run dev                    # sobe local com Functions + KV (wrangler pages dev public --compatibility-date=2026-01-01)
```

## OS DOIS MODOS DE DADOS

A pessoa escolhe no passo 3. Os dois convivem no mesmo starter-kit.

### Modo AO VIVO (padrão, mais simples)
- O `dashboard.html` chama o conector, que busca a fonte na hora (planilha/CSV/Meta/sob medida).
- KV `DASHBOARDS_KV` guarda só a config. `DASHBOARD_CACHE` (opcional) cacheia a resposta por 5 min.
- Sem banco de dados. Ideal pra maioria e pra quem só quer ver o número atual.
- Limite: sem histórico próprio (a tendência usa o período que a fonte trouxer) e depende da fonte estar no ar.

### Modo HISTÓRICO (D1 + cron, mais robusto)
- Um Worker com cron trigger (`workers/snapshot/`) roda de tempos em tempos, busca a fonte e grava um
  snapshot no D1 (`db/schema.sql`, tabela `snapshots`).
- O `dashboard.html` usa o conector `d1.js`, que lê o snapshot mais recente do D1 (`env.DASHBOARD_DB`).
- COMO O DASHBOARD SABE QUE É HISTÓRICO: a config precisa ter `storage: "d1"`. No wizard (passo Finalizar),
  quando a fonte é planilha ou Meta, aparece o seletor "Modo de dados"; escolher "Histórico" grava
  `storage:"d1"`. Se você montar a config na mão, inclua `storage:"d1"` (senão o dashboard lê ao vivo).
- Dá histórico de verdade (uma linha do tempo mesmo que a fonte não tenha datas) e não quebra se a fonte cair.
- Só faz sentido para fontes vivas (planilha/Meta); CSV é estático e o cron o ignora.
- A lógica pura (SQL de insert/select, `rowToDataSet`) está em `functions/lib/snapshots.mjs` e é testada.

## PROVISIONAR A INFRA (guia de comandos)

Pergunte SEMPRE qual conta Cloudflare antes de operar. Confirme com `wrangler whoami`.
Não há passo de build: o `wrangler.toml` já tem `pages_build_output_dir = "public"`, então os comandos
usam a pasta `public/` direto. Todos os comandos abaixo rodam a partir da pasta `starter-kit/` (é onde
mora o `wrangler.toml`, o `db/schema.sql` e o `package.json`).

Base (os dois modos):
```
wrangler kv namespace create DASHBOARDS_KV
# O comando IMPRIME algo como:  id = "abc123...".  Copie esse id.
wrangler kv namespace create DASHBOARD_CACHE      # opcional (cache 5 min); imprime outro id
```
Abra `wrangler.toml` e troque os placeholders pelos ids impressos: `<SEU_KV_NAMESPACE_ID>` pelo id do
DASHBOARDS_KV e `<SEU_KV_CACHE_ID>` pelo id do DASHBOARD_CACHE. Nunca commite id real em repo público.
```
wrangler pages project create <NOME-DO-PROJETO> --production-branch main   # cria o projeto Pages
wrangler pages deploy public --project-name=<NOME-DO-PROJETO> --branch main
```
Bindings em produção: com os ids já no `wrangler.toml`, o `wrangler pages deploy` aplica os bindings de KV
ao deployment. Se por algum motivo a API responder 500 "Binding DASHBOARDS_KV nao configurado", vincule no
painel: Cloudflare Pages > seu projeto > Settings > Bindings > add KV binding `DASHBOARDS_KV` (e `DASHBOARD_CACHE`).
Depois: no painel Pages > Custom domains, aponte o domínio da pessoa. Abra `config.html` no domínio e crie o dashboard.

Modo histórico (adiciona, só se a pessoa escolheu Histórico), sempre a partir de `starter-kit/`:
```
wrangler d1 create dashboard-db
# imprime database_id = "..."; cole em workers/snapshot/wrangler.toml (DASHBOARD_DB) e no binding D1 do Pages
wrangler d1 execute dashboard-db --remote --file=db/schema.sql   # cria a tabela snapshots no D1 REMOTO
```
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

## ADICIONAR UM NOVO DOMÍNIO (ex: Financeiro)

Marketing, Vendas e Suporte já vêm prontos. Para um novo (ex: Financeiro), siga o Contrato 5 do
`ARCHITECTURE.md` e use `vendas.js`/`suporte.js` como molde. TDD: teste antes.
1. `public/assets/js/templates/<dominio>.js` exportando `template` com `id`, `label`, `primaryMetric`,
   `slots` (com `aliases` lowercase sem acento pro auto-mapeamento), `metrics` (base antes das derivadas;
   marque `betterWhen` nas que têm direção) e `layout` (kpi/timeseries/funnel/table/ranking).
   Ex Financeiro: slots data, categoria, entrada, saida; métricas receita (sum entrada), despesa (sum saida),
   saldo (derived entrada-saida), margem (ratio saldo/entrada).
2. Registre em `templates/index.js`.
3. Escreva o teste em `test/templates.test.js` (autoMap + estrutura). Não mexe em widgets nem conectores.

## ADICIONAR UM NOVO CONECTOR

Siga os Contratos 1 e 2 do `ARCHITECTURE.md`. Todo conector devolve exatamente um `DataSet`
(`{ columns, rows, meta }`), com os valores das linhas como STRING crua.
1. `functions/api/connectors/<nome>.js` com `export async function onRequest(context)` respondendo o DataSet.
2. Lógica pura de parse/mapeamento fora do handler (ex: `functions/lib/<nome>.mjs`), pra testar sem rede.
3. Credencial (token) nunca vai pro browser: guarde na config e resolva no servidor por id (veja `meta-ads.js`).
   Se o conector precisar checar senha, importe `needsAuth`/`authOk` de `functions/lib/auth-config.mjs`
   (módulo neutro), NÃO de `dashboards.js`.
4. Erro da fonte: lance `Error` com mensagem amigável em PT-BR.
5. Escreva o teste da lógica pura antes (TDD).

IMPORTANTE (conector de fonte VIVA não é só 1 arquivo): pra ele ser usado de ponta a ponta, plugue em 4 lugares. Comece SEMPRE pelo registro, que é a fonte de verdade:
1. `public/assets/js/sources/index.js`: registre a fonte `{ type, label, canHistory }`. Sem isso, `getSource(type)` volta `undefined` e `fetchDataForSource` lança "Tipo de fonte desconhecido". E o `label`/`podeHistorico` do wizard saem daqui.
2. `public/assets/js/lib/api-client.js`: adicione o fetcher live em `LIVE_FETCHERS` (chave = `type`). Há uma guarda no import: se um `type` do registry (menos `d1`) ficar sem fetcher, o módulo lança no load apontando qual faltou. Não há como esquecer em silêncio.
3. `public/assets/js/config-wizard.js`: um card/opção no passo 2 (Fonte) pra pessoa conectar (como o Meta).
4. Modo histórico (só se `canHistory:true`): adicione o fetcher em `SNAPSHOT_FETCHERS` de `workers/snapshot/src/index.js`. Outra guarda no import exige que as chaves batam EXATAMENTE com `historyTypes()` do registry.
As guardas de import e o `test/sources.test.js` (paridade) quebram na hora se um passo faltar, nunca em produção. Sheets/CSV/Meta já estão plugados. Um conector SÓ com o arquivo do handler nunca é chamado.

## ADICIONAR UM NOVO WIDGET

Os widgets vivem em `public/assets/js/widgets/` e são registrados num registry
(`widgets/index.js`), igual aos templates. Kpi/timeseries/funnel/table/ranking já vêm
prontos. Para um novo (ex: gauge), TDD: teste antes.
1. `public/assets/js/widgets/<nome>.js` exportando `render(props, data)` puro (sem DOM),
   que devolve string HTML e trata o caso vazio ("Sem dados"). Use os widgets atuais como molde.
2. Registre em `widgets/index.js`: adicione uma entrada `<nome>: { render, toHtml(item, ctx) }`.
   O `toHtml` faz a preparação de dados específica (lê `dataset`/`colMap`/`computed`,
   agrupa/soma o que precisar), aplica os guards (pula quando falta coluna ou não há dado,
   devolvendo `''`) e chama `render`, embrulhando com `ctx.card(title, html, extraClass)`.
   O `ctx` traz `{ template, dataset, colMap, computed, findMetricDef, card }`.
3. Use no `layout` de um template (ex: `{ widget: '<nome>', props: { ... } }`). O `dashboard.js`
   despacha sozinho via `registry[item.widget].toHtml(item, ctx)`, sem tocar em if-chain.
4. Escreva o teste do render puro em `test/widgets.test.js` (saída HTML + caso vazio). Não mexe
   em domínios nem conectores.

## PROTOCOLO DE ENCERRAMENTO

Ao terminar um trabalho nesta skill:
1. Atualize este `SKILL.md` se algo mudou (novo domínio, novo conector, novo modo, novo passo).
2. Salve o contexto do projeto da pessoa em `references/YYYYMMDD-descricao.md` (crie a pasta com
   `mkdir -p references` se não existir): projeto Pages, domínio, modo de dados, fontes usadas,
   decisões. Nunca coloque token, Account ID ou id de KV/D1 real: use placeholders.
3. Antes de distribuir/publicar o repo, apague o cache local `rm -rf starter-kit/.wrangler` (fica
   gitignored, mas guarda Account ID e dados de dev em cache; não deve ir junto num zip/cópia).
