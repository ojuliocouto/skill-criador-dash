# Estender o starter-kit: novo domínio, novo conector, novo widget

Sempre TDD: teste antes. Os contratos completos estão em `starter-kit/ARCHITECTURE.md`.

## Adicionar um novo domínio (ex: RH)

Marketing, Vendas, Suporte, Financeiro e Estoque já vêm prontos. Para um novo (ex: RH, Logística,
Assinaturas), siga o Contrato 5 do `ARCHITECTURE.md` e use `vendas.js`/`suporte.js`/`financeiro.js`/
`estoque.js` como molde (`public/assets/js/templates/`): são as referências prontas pra copiar,
principalmente `financeiro.js` (métrica derivada simples, saldo = entrada menos saída) e `estoque.js`
(métrica em razão de dois slots, giro = vendido sobre estoque).
1. `public/assets/js/templates/<dominio>.js` exportando `template` com `id`, `label`, `primaryMetric`,
   `dateSlot` (qual slot é o eixo de tempo, ex `'data'`), `slots` (com `aliases` lowercase sem acento pro
   auto-mapeamento), `metrics` (base antes das derivadas; marque `betterWhen` nas que têm direção) e `layout`
   (kpi/timeseries/funnel/table/ranking). Nos itens não-kpi do `layout`, opcionalmente declare `col`
   (span de 3 a 8 no grid de 12 colunas; sem `col` = largura toda) pra dispor os widgets em 2D no desktop,
   ex: `{ widget:'timeseries', col:8, ... }` ao lado de `{ widget:'funnel', col:4, ... }`. A ordem do array
   é a ordem do fluxo no grid. Slots categóricos (nem o `dateSlot`, nem coluna de métrica) viram filtro
   automático na barra, então nomeie-os com clareza.
   Ex RH: slots data, departamento, contratacoes, desligamentos; métricas contratacoes (sum),
   desligamentos (sum), headcount (derived contratacoes - desligamentos), turnover (ratio
   desligamentos/headcount).
2. Registre a CHAVE do domínio (ex `'financeiro'`) no array `DOMAINS`, em DOIS lugares que um teste de
   paridade mantém iguais: `public/assets/js/domains.mjs` (fonte do browser) E `functions/lib/domains.mjs`
   (fonte do servidor, que valida o POST). Esta é a fonte da verdade: `templates/index.js` monta o registry
   a partir de `DOMAINS`, então sem a chave aqui o template NUNCA é registrado (`getTemplate` volta undefined)
   e o servidor rejeita o POST com 400 "Domínio inválido". Editar só o `byId` de `templates/index.js` não basta.
3. Adicione o `import` do template novo no `byId` de `templates/index.js` (é só o mapa de template por id;
   o registro efetivo é a chave em `DOMAINS` do passo 2).
4. Escreva o teste em `test/templates.test.js` (autoMap + estrutura). Não mexe em widgets nem conectores.

## Adicionar um novo conector

Siga os Contratos 1 e 2 do `ARCHITECTURE.md`. Todo conector devolve exatamente um `DataSet`
(`{ columns, rows, meta }`), com os valores das linhas como STRING crua.
1. `functions/api/connectors/<nome>.js` com `export async function onRequest(context)` respondendo o DataSet.
2. Lógica pura de parse/mapeamento fora do handler (ex: `functions/lib/<nome>.mjs`), pra testar sem rede.
3. Credencial (token) nunca vai pro browser: guarde na config e resolva no servidor por id (veja `meta-ads.js`).
   Se o conector precisar checar senha, importe `needsAuth`/`authOk` de `functions/lib/auth-config.mjs`
   (módulo neutro), NÃO de `dashboards.js`.
4. Erro da fonte: lance `Error` com mensagem amigável em PT-BR.
5. Escreva o teste da lógica pura antes (TDD).

IMPORTANTE (conector de fonte VIVA não é só 1 arquivo): pra ele ser usado de ponta a ponta, plugue em
4 lugares. Comece SEMPRE pelo registro, que é a fonte de verdade:
1. `public/assets/js/sources/index.js`: registre a fonte `{ type, label, canHistory }`. Sem isso,
   `getSource(type)` volta `undefined` e `fetchDataForSource` lança "Tipo de fonte desconhecido". E o
   `label`/`podeHistorico` do wizard saem daqui.
2. `public/assets/js/lib/api-client.js`: adicione o fetcher live em `LIVE_FETCHERS` (chave = `type`).
   Há uma guarda no import: se um `type` do registry (menos `d1`) ficar sem fetcher, o módulo lança no
   load apontando qual faltou. Não há como esquecer em silêncio.
3. `public/assets/js/config-wizard.js`: um card/opção no passo 2 (Fonte) pra pessoa conectar. Atenção:
   o card do Meta é filtrado por domínio (só aparece em Marketing); se a sua fonte serve qualquer
   domínio, não replique esse gate. Este é o passo que era manual e silencioso; agora
   `test/wizard-cards.test.js` faz a paridade (toda fonte viva do registry precisa de card), então
   esquecer o card também quebra o teste.
4. Modo histórico (só se `canHistory:true`): adicione o fetcher em `SNAPSHOT_FETCHERS` de
   `workers/snapshot/src/index.js`. Outra guarda no import exige que as chaves batam EXATAMENTE com
   `historyTypes()` do registry.

As guardas de import + `test/sources.test.js` + `test/wizard-cards.test.js` quebram na hora se qualquer
um dos 4 passos faltar, nunca em produção. Sheets/CSV/Meta já estão plugados. Um conector SÓ com o
arquivo do handler nunca é chamado.

## Adicionar um novo widget

Os widgets vivem em `public/assets/js/widgets/` e são registrados num registry (`widgets/index.js`),
igual aos templates. Kpi/timeseries/funnel/table/ranking já vêm prontos. Para um novo (ex: gauge):
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
