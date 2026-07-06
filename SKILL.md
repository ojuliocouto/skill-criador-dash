---
name: criador-dash
description: >
  Criador plug-and-play de dashboards de marketing e vendas. Nao e um dashboard pronto
  de um nicho: e um starter kit de codigo real e testado (Cloudflare Pages + Functions + KV)
  com wizard de 4 passos que qualquer pessoa usa sem escrever codigo. Conecta a fonte de
  dados por link do Google Sheets (endpoint gviz CSV, sem OAuth, sem API key, sem publicar
  na web) ou upload de CSV, escolhe o dominio (Marketing ou Vendas), mapeia colunas
  (auto-mapeamento por nome de cabecalho), nomeia, escolhe a cor de destaque e publica.
  Arquitetura em 3 camadas desacopladas (conectores, widgets, templates de dominio).
  Use quando precisar criar um dashboard novo para um cliente, adicionar um dominio ou
  conector, ou publicar um dashboard no Cloudflare Pages.
version: 2.0.0
author: Julio Couto
category: marketing-analytics
tags: [dashboard, marketing, vendas, plug-and-play, cloudflare-pages, functions, kv, google-sheets, csv, wizard, no-code, roas, cpl, cpa, ticket-medio]
---

# Criador Dash: Criador Plug-and-Play de Dashboards

> Versao generica. Todo valor entre `<...>` ou em CAPS e placeholder: troque pelos dados
> do seu projeto. Nunca commite tokens, Account IDs ou IDs de KV reais. No MVP (Google
> Sheets ou CSV) voce NAO precisa de nenhum token: a planilha compartilhada por link basta.

## ONBOARDING (PRIMEIRO USO)

O agente conduz o aluno leigo, sem presumir que ele leu o README ou este arquivo.

O que e, em 3 frases:
1. Isto e um CRIADOR plug-and-play de dashboards de marketing e vendas, nao um dashboard pronto de um nicho so.
2. Voce nao escreve codigo: um wizard de 4 passos gera o dashboard a partir da sua planilha ou CSV.
3. Roda no Cloudflare Pages, guarda as configuracoes no KV e nao pede nenhum token no MVP (Google Sheets ou CSV).

Checklist antes de comecar (pergunte ao aluno, um por um):
- [ ] Tem conta no Cloudflare? (gratuita ja serve para o Pages + Functions + KV)
- [ ] Tem o `wrangler` instalado e logado? (`npm i -g wrangler` e `wrangler login`)
- [ ] Tem Node instalado? (para rodar os testes e o `wrangler pages dev`)
- [ ] Sua fonte de dados e uma planilha do Google ou um arquivo CSV?
- [ ] Se for planilha: ela esta compartilhada como "qualquer pessoa com o link"? (o conector le por link, sem OAuth; sem esse compartilhamento o fetch falha)

Regra do agente: nunca presuma que o aluno ja leu o README. Conduza o checklist acima
antes de mandar qualquer comando. Se ele nao tiver Cloudflare ou wrangler, resolva isso
primeiro; sem isso nao da para publicar.

## O QUE E / O QUE NAO E

E:
- Um starter kit de codigo real, testado (73 testes verdes, TDD) e pronto para rodar.
- Um criador generico: dois dominios prontos (Marketing e Vendas) e arquitetura para adicionar mais.
- Plug-and-play: o usuario final so cola um link de planilha ou sobe um CSV e publica pelo wizard.
- Zero dependencia externa em runtime (SVG na mao, ESM puro).

Nao e:
- Nao e um SaaS hospedado: voce mesmo publica no seu Cloudflare Pages.
- Nao e um dashboard fechado de um unico nicho (lancamento, e-commerce, etc.).
- CRM e Hotmart ainda sao stubs de 2a onda (documentados, nao prontos). Meta Ads JA e um conector real (via access token da Graph API).
- A fonte padrao (planilha/CSV) nao pede OAuth nem API key: a planilha publica por link basta. O Meta Ads exige um access token (caminho avancado, opcional).

## ARQUITETURA: 3 CAMADAS DESACOPLADAS

O contrato completo esta em `starter-kit/ARCHITECTURE.md`. Resumo das camadas:

1. CONECTORES: buscam dados de uma fonte e devolvem um `DataSet` (schema comum tabular). Nao sabem de metricas.
2. WIDGETS: blocos visuais puros (KPI, serie temporal, funil, tabela, ranking). Recebem dados ja calculados, devolvem HTML/DOM. Nao conhecem template nem conector.
3. TEMPLATES DE DOMINIO: definem os slots semanticos, as metricas e o layout de widgets de cada dominio (Marketing, Vendas).

Fluxo de dados:

```
Fonte de dados -> Conector -> DataSet (schema comum) -> Template -> Widgets -> Render
```

- CONECTOR carro-chefe: Google Sheets via endpoint gviz CSV. O usuario compartilha a planilha
  como "qualquer pessoa com o link" e so cola o link. Sem OAuth, sem API key, sem publicar na web.
  O conector extrai o ID do link e busca `https://docs.google.com/spreadsheets/d/{ID}/gviz/tq?tqx=out:csv&gid={GID}`.
- FALLBACK: upload de arquivo CSV (POST do texto, parse com deteccao de delimitador).
- META ADS (nativo, avancado): busca insights de campanha na Graph API com um access token
  (System User do Business Manager) + ID da conta de anuncios. O token fica SO no servidor
  (guardado na config e nunca devolvido ao browser); a Function resolve o token por id do dashboard.
  So aparece no wizard no dominio Marketing.
- CONECTORES DE 2a ONDA (stubs documentados, ainda nao prontos): CRM, Hotmart.

Protecao por senha (opcional): no wizard da pra definir uma senha por dashboard. Guarda-se
so o hash SHA-256 (nunca a senha em texto puro). Ao abrir o link, o dashboard pede a senha;
a config so e devolvida pela API com o hash correto no header `x-dash-auth`. Segredos (hash da
senha e token do Meta) sao removidos da resposta da API.

Dominios prontos e suas metricas:
- MARKETING: investimento, impressoes, cliques, leads, conversoes, receita (base); CTR (cliques/impressoes), CPC (invest/cliques), CPL (invest/leads), CPA (invest/conversoes) e ROAS (receita/investimento) (derivadas). Layout: KPIs + funil de conversao (impressoes -> cliques -> leads -> conversoes com % entre etapas) + serie temporal de investimento + ranking por canal + tabela.
- VENDAS: numero de negocios (contagem), vendas ganhas, faturamento (soma do valor SO das ganhas), ticket medio (faturamento por venda ganha) e taxa de conversao (ganhas / negocios). "Ganha" e detectada pelo status (ganh/won/fechad/pago/aprovad); sem coluna de status, todas contam como venda (fallback). Layout: KPIs + funil de fechamento (negocios -> ganhas) + serie temporal + ranking por vendedor e por produto + tabela.

Widgets: KPI (com badge de tendencia opcional), serie temporal (SVG puro), funil, tabela, ranking. Sem dependencias externas.

Tendencia (comparativo de periodo): cada KPI cuja metrica tenha `betterWhen` (`higher`/`lower`) mostra um badge colorido comparando a 2a metade do periodo com a 1a (metades com o mesmo numero de datas). Verde quando melhora, vermelho quando piora (ex: CPL caindo aparece verde). Metricas de soma so sao comparadas entre metades de mesmo tamanho, para nao inflar o numero.

Meta vs realizado (opcional): no ultimo passo do wizard da pra informar uma meta para a metrica principal do dominio (`primaryMetric`: leads no Marketing, faturamento em Vendas). O card principal passa a mostrar uma barra de progresso e o percentual da meta (verde quando bate ou passa de 100%). Sem meta informada, nada muda.

## COMO USAR O STARTER KIT

O codigo vive em `starter-kit/`. Nao edite os arquivos de codigo/testes ao publicar para
um cliente: eles ja estao validados. Clone/copie a pasta e configure por cima.

Rodar local:
```
cd starter-kit
npm test                       # 73 testes unitarios, node --test 'test/*.test.js'
wrangler pages dev public      # sobe local com Functions + KV
```

Criar um dashboard (wizard de 4 passos, zero codigo), abrindo `config.html`:
1. Escolher o dominio (Marketing ou Vendas).
2. Conectar a fonte: colar o link do Google Sheets ou subir um CSV. O conector busca e mostra o preview das colunas.
3. Mapear colunas: o auto-mapeamento por nome de cabecalho pre-preenche; o usuario ajusta o que faltar. Valida os slots obrigatorios.
4. Nomear + escolher a cor de destaque (branding). Salva no KV e redireciona para o dashboard.

O dashboard (`dashboard.html`) le `?id=`, busca a config no KV, busca os dados pelo conector,
roda `computeAll` + o layout do template e renderiza os widgets.

Arvore de arquivos real (`starter-kit/`, sem node_modules):
```
ARCHITECTURE.md                 contratos das 3 camadas (fonte da verdade)
package.json
wrangler.toml
examples/
  marketing-exemplo.csv
  vendas-exemplo.csv
functions/
  _middleware.js
  api/
    dashboards.js               CRUD das configs no KV
    connectors/
      sheets.js                 conector carro-chefe (gviz CSV)
      csv.js                     conector de upload
      meta-ads.js                conector Meta Ads (Graph API, token no servidor)
      crm.js                     stub 2a onda
      hotmart.js                 stub 2a onda
  lib/
    csv.mjs                     parseCSV + detectDelimiter (logica pura, testavel)
public/
  index.html
  config.html                   wizard de 4 passos
  dashboard.html
  assets/
    css/main.css
    js/
      config-wizard.js
      dashboard.js
      index-page.js
      lib/
        api-client.js
        automap.js               auto-mapeamento slot -> coluna
        format.js                parse/format BR (moeda, numero, data)
        metrics.js               computeMetric, computeAll, groupBy, timeSeries
      templates/
        index.js
        marketing.js
        vendas.js
      widgets/
        _util.js
        kpi.js
        timeseries.js
        funnel.js
        table.js
        ranking.js
test/
  csv.test.js
  dashboards.test.js
  format.test.js
  metrics.test.js
  render.test.js
  templates.test.js
  widgets.test.js
  wizard.test.js
```

## COMO ADICIONAR UM NOVO DOMINIO

Exemplo: um dominio "Suporte". Siga o Contrato 5 do `ARCHITECTURE.md`.

1. Crie `public/assets/js/templates/suporte.js` exportando um `template` com:
   - `id`, `label`.
   - `slots`: cada slot com `key`, `label`, `required` e `aliases` (nomes de cabecalho comuns, lowercase e sem acento, para o auto-mapeamento). Ex: tickets, tempo_resposta, resolvido, canal.
   - `metrics`: use `agg` `sum`/`avg`/`count`/`countDistinct`/`ratio`/`derived`. Coloque as metricas base antes das derivadas (a ordem importa). Ex: total de tickets (count), tempo medio de resposta (avg), taxa de resolucao (ratio resolvidos/tickets).
   - `layout`: lista de widgets (`kpi`/`timeseries`/`funnel`/`table`/`ranking`) com suas props.
2. Registre o template em `public/assets/js/templates/index.js` para ele aparecer no wizard.
3. Escreva o teste antes (TDD) em `test/templates.test.js`: cobre `autoMap` e `computeAll` do novo dominio.
4. Nao precisa mexer em widgets nem conectores: eles sao agnosticos de dominio.

## COMO ADICIONAR UM NOVO CONECTOR

Siga os Contratos 1 e 2 do `ARCHITECTURE.md`. Todo conector devolve exatamente um `DataSet`:
`{ columns: string[], rows: Object[], meta: { source, fetchedAt, rowCount, name? } }`, com
os valores das linhas como STRING crua (a normalizacao de numero/data e da camada de metricas).

1. Crie `functions/api/connectors/<nome>.js` com o handler Cloudflare `export async function onRequest(context)` que responde o `DataSet` em JSON.
2. Mantenha a logica pura de parse fora do handler (ex: em `functions/lib/csv.mjs`), para poder testar sem rede.
3. Se a fonte falhar, lance `Error` com mensagem amigavel em PT-BR.
4. Escreva o teste da logica pura antes (TDD).
5. `meta-ads.js` ja e um exemplo de conector com credencial (token no servidor); `crm.js` e `hotmart.js` sao stubs, ponto de partida da 2a onda.

## CHECKLIST DE DEPLOY PARA NOVO CLIENTE

Para o MVP (Google Sheets ou CSV) NAO ha nenhum secret ou token a configurar.

1. Copie o `starter-kit/` para o projeto do cliente (nao edite o codigo validado).
2. Crie os namespaces KV no Cloudflare:
   - `DASHBOARDS_KV` (obrigatorio, guarda as configs dos dashboards).
   - `DASHBOARD_CACHE` (opcional, cache de 5 min dos dados).
   ```
   wrangler kv namespace create DASHBOARDS_KV
   wrangler kv namespace create DASHBOARD_CACHE
   ```
3. Cole os ids retornados no `wrangler.toml` (bindings). Nunca commite ids reais em repo publico: use placeholders.
4. Publique:
   ```
   wrangler pages deploy public --project-name=<NOME-DO-PROJETO>
   ```
5. (Opcional) Aponte o dominio customizado do cliente no painel do Cloudflare Pages.
6. Abra `config.html` no dominio publicado e crie o primeiro dashboard pelo wizard.
7. Confirme com os proprios olhos: abra o dashboard publicado, cheque KPIs e a troca de cor de marca, em desktop e mobile, antes de reportar pronto.

## PROTOCOLO DE ENCERRAMENTO

Ao terminar um trabalho nesta skill:
1. Atualize este `SKILL.md` se algo mudou (novo dominio, novo conector, novo passo de deploy).
2. Salve o contexto do projeto do cliente em `references/` (nome do projeto Pages, dominio, dominios de dados usados, links de planilha, decisoes). Nunca coloque token, Account ID ou id de KV real nesses arquivos: use placeholders.
