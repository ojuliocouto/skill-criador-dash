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

> Esta skill NAO e um app que voce entrega pronto. Ela e um roteiro que VOCE (agente) conduz
> para construir, com a pessoa, o dashboard DELA, na conta Cloudflare DELA. Voce monta a
> partir das pecas ja testadas em `starter-kit/` (nao reinventa a cada vez) e personaliza.
> Valores entre `<...>` ou em CAPS sao placeholders. Nunca commite token, Account ID ou id de KV/D1 real.

## MODO DE OPERACAO (leia antes de tudo)

1. Voce e o maestro. A entrega e o dashboard da PESSOA, publicado na infra DELA, feito sob medida.
2. NAO reinvente: componha a partir da biblioteca de pecas provadas em `starter-kit/` (conectores,
   widgets, templates, motor de metricas, wizard). Personalizar em cima de peca testada = rapido
   e confiavel. Escrever tudo do zero a cada pessoa baixaria a qualidade.
3. Fonte especifica da pessoa? Escreva um conector sob medida na hora, seguindo o Contrato 2 do
   `ARCHITECTURE.md` (o `meta-ads.js` e o exemplo de conector com token). Assim o "generico" e real:
   a pessoa nao fica presa a uma lista de ferramentas, voce cria a que ela precisa.
4. A pessoa escolhe o MODO DE DADOS (secao "Os dois modos de dados"): ao vivo ou historico.
5. Toda operacao no Cloudflare e na conta DA PESSOA. Pergunte SEMPRE qual conta antes de operar.

## PASSO A PASSO (o roteiro que voce conduz)

### 1. Onboarding e checklist
Nunca presuma que a pessoa leu o README. Explique em 3 frases e rode o checklist, um item por vez:
- O que e: "eu vou construir com voce o seu dashboard, na sua conta Cloudflare, do jeito da sua operacao".
- Nao e um produto fechado de um nicho: adaptamos dominio, metricas e fonte a voce.
- No fim, o dashboard fica publicado num dominio seu, e voce e o dono do codigo e da infra.

Explique em uma frase cada palavra tecnica antes de mandar comando (a pessoa pode nunca ter usado):
- Cloudflare Pages: onde o dashboard fica hospedado (de graca). KV: um banco chave-valor onde ficam as configs. wrangler: a ferramenta de linha de comando do Cloudflare, e por ela que a gente cria e publica.

Checklist (um item por vez; se faltar algo, resolva antes de seguir):
- [ ] Tem conta no Cloudflare? (o plano gratis ja cobre Pages + Functions + KV; D1 tambem tem free tier). Se nao tiver, peca pra criar em dash.cloudflare.com.
- [ ] Tem Node instalado? (`node -v`). Sem Node nao roda `wrangler` nem os testes.
- [ ] Instale o wrangler: `npm i -g wrangler`. No Mac, se der erro de permissao (EACCES), rode `sudo npm i -g wrangler`. Confirme com `wrangler --version`; se der "command not found", o bin global do npm nao esta no PATH (`npm prefix -g` mostra a pasta; adicione ao PATH).
- [ ] Faca login: `wrangler login` (abre o browser; a pessoa escolhe a conta Cloudflare dela e autoriza).
- [ ] Confirme a conta certa: `wrangler whoami` (mostra o email e o Account ID logado). Se for a conta errada, `wrangler logout` e login de novo.
- [ ] Tem Claude Code? (e por ele que eu conduzo a construcao).

### 2. Descoberta da operacao
Antes de montar, entenda:
- Que area ela quer medir: Marketing, Vendas, Suporte, ou mais de uma (um dashboard por area).
- Onde os dados dela vivem: planilha, um CRM, Meta Ads, WhatsApp, um sistema com API, etc.
- O que ela precisa DECIDIR olhando o dashboard (isso define quais metricas importam).

### 3. Escolher o modo de dados
Explique e deixe a pessoa escolher (ver secao "Os dois modos de dados"):
- AO VIVO: o dashboard le a fonte na hora. So precisa de KV pra config. Setup minimo. Bom pra maioria.
- HISTORICO: um Worker cron tira "fotos" (snapshots) da fonte e grava no D1; o dashboard le o D1.
  Da historico de verdade e nao depende da fonte ficar no ar. Mais robusto, mais setup.

### 4. Provisionar a infra DELA
Pergunte qual conta Cloudflare usar. Depois (ver secao "Provisionar a infra"):
- KV `DASHBOARDS_KV` (sempre) e `DASHBOARD_CACHE` (opcional).
- Modo historico: D1 + aplicar `db/schema.sql` + Worker cron (`workers/snapshot/`).
- Projeto Pages + dominio customizado.

### 5. Montar o dashboard
- Escolha o dominio/template pronto (Marketing, Vendas, Suporte) ou crie um novo (secao "Adicionar dominio").
- Conecte a fonte: planilha (gviz CSV), upload CSV, Meta Ads (token), ou um conector sob medida.
- Mapeie colunas (auto-mapeamento por cabecalho pre-preenche), defina branding (cor), meta opcional e senha opcional.
- No modo ao vivo, a fonte fica na config; no modo historico, a fonte alimenta o cron e o dashboard le o D1.

### 6. Deploy e verificacao
- Publique na conta DA PESSOA (`wrangler pages deploy public --project-name=<NOME>`).
- Modo historico: deploy do Worker cron e rode uma primeira captura.
- Confirme com os proprios olhos: abra o dashboard publicado e cheque KPIs, funil, tendencia e a cor
  de marca, em desktop E mobile, antes de dizer pronto.

### 7. Encerramento
Salve o contexto do projeto da pessoa em `references/` (projeto Pages, dominio, fontes, decisoes,
modo de dados). Nunca coloque token, Account ID ou id de KV/D1 real: use placeholders.

## A CAIXA DE PECAS (biblioteca provada em `starter-kit/`)

Codigo real e testado (274 testes verdes, TDD). Voce compoe a partir daqui.

Arquitetura em 3 camadas desacopladas (contratos completos em `starter-kit/ARCHITECTURE.md`):
1. CONECTORES: buscam dados de uma fonte e devolvem um `DataSet` (schema comum tabular). Nao sabem de metricas.
2. WIDGETS: blocos visuais puros (KPI, serie temporal, funil, tabela, ranking). Recebem dados ja calculados.
3. TEMPLATES DE DOMINIO: definem slots semanticos, metricas e o layout de widgets de cada dominio.

```
Fonte -> Conector -> DataSet (schema comum) -> Template -> Widgets -> Render
```

Conectores e fontes disponiveis:
- Google Sheets via gviz CSV (carro-chefe, leigo-friendly): a pessoa compartilha a planilha como
  "qualquer pessoa com o link" e so cola o link. Sem OAuth, sem API key.
- Upload de CSV (fallback universal).
- Meta Ads (nativo, avancado): insights da Graph API com access token; o token fica SO no servidor.
- Conector sob medida: escreva um novo seguindo o Contrato 2 quando a fonte da pessoa for especifica.
- D1 (modo historico): le o snapshot mais recente gravado pelo cron.

Dominios prontos:
- MARKETING: investimento, impressoes, cliques, leads, conversoes, receita; derivadas CTR, CPC, CPL,
  CPA, ROAS. Layout: KPIs + funil de conversao + serie temporal + ranking por canal + tabela.
- VENDAS: numero de negocios, vendas ganhas, faturamento (soma do valor SO das ganhas), ticket medio
  e taxa de conversao. "Ganha" detectada pelo status; sem status, todas contam (fallback). Layout:
  KPIs + funil de fechamento + serie temporal + rankings + tabela.
- SUPORTE: atendimentos, resolvidos, taxa de resolucao, tempo de resposta (media) e CSAT (media).
  Layout: KPIs + funil de resolucao (atendimentos -> resolvidos) + serie temporal + ranking por canal + tabela.
- (Precisa de outro dominio, ex Financeiro? Crie conforme a operacao da pessoa: ver "Adicionar dominio".)

Recursos dos KPIs:
- Tendencia (comparativo de periodo): metrica com `betterWhen` (`higher`/`lower`) ganha um badge
  colorido comparando a 2a metade do periodo com a 1a (metades de mesmo tamanho). Verde melhora, vermelho piora.
- Meta vs realizado (opcional): meta na metrica principal do dominio (`primaryMetric`); o card mostra
  barra de progresso e percentual da meta.

Protecao por senha (opcional): senha por dashboard; guarda-se so o hash SHA-256 (comparado em tempo
constante). O dashboard pede a senha; a API so devolve a config E OS DADOS (conectores por id) com o
hash correto no header `x-dash-auth`. `stripSecrets` remove recursivamente qualquer credencial da
fonte (token/secret/apikey/senha/authorization) das respostas.

Modelo de acesso (avise a pessoa): a API e ABERTA por padrao. Dashboard SEM senha pode ser lido,
sobrescrito ou apagado por qualquer um que tenha o id (fluxo self-serve). Para dado sensivel: ponha
senha. Para travar a instancia inteira, defina a env `ADMIN_TOKEN` no projeto Pages: com ela setada,
POST/DELETE exigem o header `x-admin-token`, entao so o dono cria/apaga dashboards.

Detalhe do gate por fonte: a senha protege a config e os conectores POR ID (D1 e Meta GET checam a
senha antes de devolver dado). Ja sheets/csv sao lidos com a URL/arquivo que estao na config: quem
nao passa a senha nao pega a config, entao nao chega na URL. O `POST` de preview do Meta (usado so no
wizard, com token transiente no corpo) e aberto por design e nao grava nada.

Tema claro/escuro: botao na topbar (`lib/theme.js`), injetado em todas as paginas; persiste no
localStorage e respeita a preferencia do sistema no primeiro acesso. A estetica e de ferramenta de
analytics (superficie chapada, borda de 1px, numeros tabulares, sem gradiente decorativo), pra NAO
ter cara de template de IA. A cor de destaque da marca funciona nos dois temas (o `--accent-soft`
deriva dela via color-mix, entao nao fica um roxo generico fixo).

Arvore de arquivos (`starter-kit/`, sem node_modules):
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

Rodar local:
```
cd starter-kit
npm test                       # suite completa (TDD)
wrangler pages dev public      # sobe local com Functions + KV
```

## OS DOIS MODOS DE DADOS

A pessoa escolhe no passo 3. Os dois convivem no mesmo starter-kit.

### Modo AO VIVO (padrao, mais simples)
- O `dashboard.html` chama o conector, que busca a fonte na hora (planilha/CSV/Meta/sob medida).
- KV `DASHBOARDS_KV` guarda so a config. `DASHBOARD_CACHE` (opcional) cacheia a resposta por 5 min.
- Sem banco de dados. Ideal pra maioria e pra quem so quer ver o numero atual.
- Limite: sem historico proprio (a tendencia usa o periodo que a fonte trouxer) e depende da fonte estar no ar.

### Modo HISTORICO (D1 + cron, mais robusto)
- Um Worker com cron trigger (`workers/snapshot/`) roda de tempos em tempos, busca a fonte e grava um
  snapshot no D1 (`db/schema.sql`, tabela `snapshots`).
- O `dashboard.html` usa o conector `d1.js`, que le o snapshot mais recente do D1 (`env.DASHBOARD_DB`).
- COMO O DASHBOARD SABE QUE E HISTORICO: a config precisa ter `storage: "d1"`. No wizard (passo Finalizar),
  quando a fonte e planilha ou Meta, aparece o seletor "Modo de dados"; escolher "Historico" grava
  `storage:"d1"`. Se voce montar a config na mao, inclua `storage:"d1"` (senao o dashboard le ao vivo).
- Da historico de verdade (uma linha do tempo mesmo que a fonte nao tenha datas) e nao quebra se a fonte cair.
- So faz sentido para fontes vivas (planilha/Meta); CSV e estatico e o cron o ignora.
- A logica pura (SQL de insert/select, `rowToDataSet`) esta em `functions/lib/snapshots.mjs` e e testada.

## PROVISIONAR A INFRA (guia de comandos)

Pergunte SEMPRE qual conta Cloudflare antes de operar. Confirme com `wrangler whoami`.
Nao ha passo de build: o `wrangler.toml` ja tem `pages_build_output_dir = "public"`, entao os comandos
usam a pasta `public/` direto.

Base (os dois modos):
```
wrangler kv namespace create DASHBOARDS_KV
# O comando IMPRIME algo como:  id = "abc123...".  Copie esse id.
wrangler kv namespace create DASHBOARD_CACHE      # opcional (cache 5 min); imprime outro id
```
Abra `wrangler.toml` e troque os placeholders pelos ids impressos: `<SEU_KV_NAMESPACE_ID>` pelo id do
DASHBOARDS_KV e `<SEU_KV_CACHE_ID>` pelo id do DASHBOARD_CACHE. Nunca commite id real em repo publico.
```
wrangler pages project create <NOME-DO-PROJETO> --production-branch main   # cria o projeto Pages
wrangler pages deploy public --project-name=<NOME-DO-PROJETO> --branch main
```
Bindings em producao: com os ids ja no `wrangler.toml`, o `wrangler pages deploy` aplica os bindings de KV
ao deployment. Se por algum motivo a API responder 500 "Binding DASHBOARDS_KV nao configurado", vincule no
painel: Cloudflare Pages > seu projeto > Settings > Bindings > add KV binding `DASHBOARDS_KV` (e `DASHBOARD_CACHE`).
Depois: no painel Pages > Custom domains, aponte o dominio da pessoa. Abra `config.html` no dominio e crie o dashboard.

Modo historico (adiciona, so se a pessoa escolheu Historico):
```
wrangler d1 create dashboard-db
# imprime database_id = "..."; cole em workers/snapshot/wrangler.toml (DASHBOARD_DB) e no binding D1 do Pages
wrangler d1 execute dashboard-db --remote --file db/schema.sql   # cria a tabela snapshots no D1 REMOTO
```
Em `workers/snapshot/wrangler.toml`, preencha os bindings DASHBOARD_DB (D1) e DASHBOARDS_KV, e o cron.
ATENCAO: o `id` do `DASHBOARDS_KV` tem que ser EXATAMENTE o MESMO nos dois arquivos (raiz e worker) e
o mesmo namespace do Pages. Se divergir, o cron lista o prefixo `dash:` num KV vazio e nao captura nada,
sem erro visivel.
```
cd workers/snapshot && wrangler deploy                 # sobe o Worker com cron trigger (captura de hora em hora)
```
PASSO QUE NAO PODE FALTAR (senao o dashboard historico cai no 500 do d1.js mesmo com o cron gravando):
vincule o binding D1 no PAGES. Duas formas: (a) descomente o bloco `[[d1_databases]]` do `wrangler.toml`
da raiz e cole o `database_id`, e re-deploy o Pages; ou (b) no painel Pages > seu projeto > Settings >
Bindings > add D1 binding `DASHBOARD_DB` apontando pro mesmo banco.
A primeira captura acontece no proximo disparo do cron (de hora em hora), entao o dashboard mostra
"Ainda nao ha dados capturados" ate la (nao esta quebrado). Para ver dado NA HORA, force uma captura:
```
cd workers/snapshot && wrangler dev --remote --test-scheduled   # --test-scheduled expoe a rota /__scheduled; --remote usa o D1/KV reais
# noutro terminal, dispara o scheduled uma vez:
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```
Sem o flag `--test-scheduled` a rota `/__scheduled` nao existe e o curl da 404. Depois e so recarregar
o dashboard. (Alternativa: inserir um snapshot manual no D1 com um INSERT em `snapshots`.)

Deploy do Pages: sem CLOUDFLARE_API_TOKEN forcado, usa o OAuth do `wrangler login`.

## ADICIONAR UM NOVO DOMINIO (ex: Financeiro)

Marketing, Vendas e Suporte ja vem prontos. Para um novo (ex: Financeiro), siga o Contrato 5 do
`ARCHITECTURE.md` e use `vendas.js`/`suporte.js` como molde. TDD: teste antes.
1. `public/assets/js/templates/<dominio>.js` exportando `template` com `id`, `label`, `primaryMetric`,
   `slots` (com `aliases` lowercase sem acento pro auto-mapeamento), `metrics` (base antes das derivadas;
   marque `betterWhen` nas que tem direcao) e `layout` (kpi/timeseries/funnel/table/ranking).
   Ex Financeiro: slots data, categoria, entrada, saida; metricas receita (sum entrada), despesa (sum saida),
   saldo (derived entrada-saida), margem (ratio saldo/entrada).
2. Registre em `templates/index.js`.
3. Escreva o teste em `test/templates.test.js` (autoMap + estrutura). Nao mexe em widgets nem conectores.

## ADICIONAR UM NOVO CONECTOR

Siga os Contratos 1 e 2 do `ARCHITECTURE.md`. Todo conector devolve exatamente um `DataSet`
(`{ columns, rows, meta }`), com os valores das linhas como STRING crua.
1. `functions/api/connectors/<nome>.js` com `export async function onRequest(context)` respondendo o DataSet.
2. Logica pura de parse/mapeamento fora do handler (ex: `functions/lib/<nome>.mjs`), pra testar sem rede.
3. Credencial (token) nunca vai pro browser: guarde na config e resolva no servidor por id (veja `meta-ads.js`).
   Se o conector precisar checar senha, importe `needsAuth`/`authOk` de `functions/lib/auth-config.mjs`
   (modulo neutro), NAO de `dashboards.js`.
4. Erro da fonte: lance `Error` com mensagem amigavel em PT-BR.
5. Escreva o teste da logica pura antes (TDD).

IMPORTANTE (conector de fonte VIVA nao e so 1 arquivo): pra ele ser usado de ponta a ponta, plugue em 4 lugares. Comece SEMPRE pelo registro, que e a fonte de verdade:
1. `public/assets/js/sources/index.js`: registre a fonte `{ type, label, canHistory }`. Sem isso, `getSource(type)` volta `undefined` e `fetchDataForSource` lanca "Tipo de fonte desconhecido". E o `label`/`podeHistorico` do wizard saem daqui.
2. `public/assets/js/lib/api-client.js`: adicione o fetcher live em `LIVE_FETCHERS` (chave = `type`). Ha uma guarda no import: se um `type` do registry (menos `d1`) ficar sem fetcher, o modulo lanca no load apontando qual faltou. Nao ha como esquecer em silencio.
3. `public/assets/js/config-wizard.js`: um card/opcao no passo 2 (Fonte) pra pessoa conectar (como o Meta).
4. Modo historico (so se `canHistory:true`): adicione o fetcher em `SNAPSHOT_FETCHERS` de `workers/snapshot/src/index.js`. Outra guarda no import exige que as chaves batam EXATAMENTE com `historyTypes()` do registry.
As guardas de import e o `test/sources.test.js` (paridade) quebram na hora se um passo faltar, nunca em producao. Sheets/CSV/Meta ja estao plugados. Um conector SO com o arquivo do handler nunca e chamado.

## ADICIONAR UM NOVO WIDGET

Os widgets vivem em `public/assets/js/widgets/` e sao registrados num registry
(`widgets/index.js`), igual aos templates. Kpi/timeseries/funnel/table/ranking ja vem
prontos. Para um novo (ex: gauge), TDD: teste antes.
1. `public/assets/js/widgets/<nome>.js` exportando `render(props, data)` puro (sem DOM),
   que devolve string HTML e trata o caso vazio ("Sem dados"). Use os widgets atuais como molde.
2. Registre em `widgets/index.js`: adicione uma entrada `<nome>: { render, toHtml(item, ctx) }`.
   O `toHtml` faz a preparacao de dados especifica (le `dataset`/`colMap`/`computed`,
   agrupa/soma o que precisar), aplica os guards (pula quando falta coluna ou nao ha dado,
   devolvendo `''`) e chama `render`, embrulhando com `ctx.card(title, html, extraClass)`.
   O `ctx` traz `{ template, dataset, colMap, computed, findMetricDef, card }`.
3. Use no `layout` de um template (ex: `{ widget: '<nome>', props: { ... } }`). O `dashboard.js`
   despacha sozinho via `registry[item.widget].toHtml(item, ctx)`, sem tocar em if-chain.
4. Escreva o teste do render puro em `test/widgets.test.js` (saida HTML + caso vazio). Nao mexe
   em dominios nem conectores.

## PROTOCOLO DE ENCERRAMENTO

Ao terminar um trabalho nesta skill:
1. Atualize este `SKILL.md` se algo mudou (novo dominio, novo conector, novo modo, novo passo).
2. Salve o contexto do projeto da pessoa em `references/YYYYMMDD-descricao.md` (crie a pasta com
   `mkdir -p references` se nao existir): projeto Pages, dominio, modo de dados, fontes usadas,
   decisoes. Nunca coloque token, Account ID ou id de KV/D1 real: use placeholders.
3. Antes de distribuir/publicar o repo, apague o cache local `rm -rf starter-kit/.wrangler` (fica
   gitignored, mas guarda Account ID e dados de dev em cache; nao deve ir junto num zip/copia).
