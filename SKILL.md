---
name: criador-dash
description: >
  Skill para criar, manter e replicar dashboards de marketing de lancamento
  (Cloudflare Pages + Workers). Cobre arquitetura, integracoes (Meta Ads, Hotmart,
  SendFlow, ManyChat, ActiveCampaign, Google Sheets), deploy, sync cron, tipos de campanha
  (lancamento pago, gratuito, downsell) e padroes visuais dark/light. Use quando precisar
  criar novo dashboard para cliente, adicionar campanha, debugar metricas ou fazer deploy.
version: 1.0.0
author: Julio Couto
category: marketing-analytics
tags: [dashboard, cloudflare, meta-ads, hotmart, sendflow, manychat, activecampaign, lancamento, whatsapp]
---

# Criador Dash — Skill Completa

> Versao generica (didatica). Todos os valores entre `<...>` ou em CAPS sao placeholders:
> troque pelos dados do seu projeto. Nunca commite tokens, Account IDs ou IDs de KV reais.

## ONBOARDING — PRIMEIRO USO (LEIA E EXECUTE ANTES DE CONSTRUIR)

Na PRIMEIRA vez que o aluno acionar esta skill numa conversa, NAO saia construindo.
Antes, faca o onboarding conversando com ele (de forma curta e amigavel):

**1. Explique em 3 frases o que esta skill e (e o que NAO e):**
- "Esta skill e um manual que eu (agente) sigo pra te ajudar a construir um dashboard
  de lancamento. Ela nao e um dashboard pronto: eu vou montando o codigo e o deploy
  contigo, seguindo a metodologia."
- "O visual ja vem com um design system definido (dark, profissional). Voce so troca
  a cor de destaque pela sua marca depois."
- "Os dados e tokens sao seus: nada sensivel fica no codigo, vai tudo nos secrets do Cloudflare."

**2. Pergunte em que pe ele esta (checklist), UMA pergunta de cada vez:**
- Voce ja tem conta na Cloudflare? (precisa, tem plano gratis)
- Ja tem o `wrangler` instalado? (`npm i -g wrangler`)
- Quais integracoes vai usar nesse dashboard? (Meta Ads, Hotmart, SendFlow, ManyChat, ActiveCampaign, Google Sheets)
- Voce ja tem os tokens dessas integracoes em maos, ou precisa de ajuda pra pegar cada um?
- Que tipo de campanha e? (lancamento pago / gratuito / downsell)

**3. So depois de entender o cenario, comece a construir** seguindo o resto desta skill.
Se faltar algo (ex: conta Cloudflare), oriente o aluno a resolver primeiro, sem travar.

> Regra: nunca presuma que o aluno leu o README do GitHub. Este onboarding e a unica
> garantia de que ele entende como a skill funciona. Faca-o sempre no primeiro uso.

---

## PROTOCOLO DE ENCERRAMENTO (OBRIGATORIO)

Ao finalizar qualquer tarefa com sucesso usando esta skill, SEMPRE executar:

1. **Atualizar SKILL.md** — adicionar em BUGS CONHECIDOS qualquer bug novo e em FEATURES IMPLEMENTADAS qualquer feature nova
2. **Criar/atualizar arquivo em `references/`** — salvar contexto curado:
   - Nome: `references/YYYYMMDD-descricao-curta.md`
   - Conteudo: o que foi feito, por que, logica relevante, valores antes/depois
3. **Nunca pular este passo** — o valor da skill cresce a cada sessao

---

## TEMPLATE DE PROJETO

Use como esqueleto ao montar um dashboard novo. Substitua os placeholders.

- **URL producao**: `dashboards.SEU-DOMINIO.com.br`
- **Pages.dev**: `<NOME-PROJETO>.pages.dev`
- **Projeto Cloudflare**: `<NOME-PROJETO>`
- **Account ID**: `<SEU_ACCOUNT_ID>` (Cloudflare > Workers & Pages > visao geral)
- **Diretorio local**: `/caminho/para/<NOME-PROJETO>-cf/`
- **Git**: `github.com/<SEU_USUARIO>/<NOME-PROJETO>-cf`
- **Deploy**: `CLOUDFLARE_API_TOKEN="" wrangler pages deploy dist --project-name=<NOME-PROJETO> --commit-dirty=true`
- **Sync Hotmart**: `sync-hotmart.py` via cron/launchd a cada 1h (popula KV com vendas)

### KV Namespaces
| Binding | ID | Uso |
|---------|-----|-----|
| CAMPAIGNS_KV | `<ID_DO_NAMESPACE_CAMPAIGNS>` | Config de campanhas (CRUD) |
| DASHBOARD_CACHE | `<ID_DO_NAMESPACE_CACHE>` | Cache de API (5min TTL) + sync Hotmart |

> DASHBOARD_CACHE deve ser configurado no painel Pages, NAO so no wrangler.toml.
> Crie os namespaces com `wrangler kv namespace create CAMPAIGNS_KV` e cole os IDs gerados aqui.

### Secrets (configurados no painel Pages, nunca no codigo)
- `META_ACCESS_TOKEN` — Meta Marketing API
- `META_AD_ACCOUNT_ID` — ID da conta de anuncios
- `HOTMART_BASIC_TOKEN` — OAuth Basic token (Base64)
- `SENDFLOW_API_TOKEN` — API SendFlow
- `ACTIVECAMPAIGN_URL` — URL da conta AC (ex: `https://<sua-conta>.api-us1.com`)
- `ACTIVECAMPAIGN_API_KEY` — Chave API do AC
- `MANYCHAT_API_TOKEN` — Token do ManyChat
- `GOOGLE_API_KEY` — API Key do Google (Sheets read-only)

---

## ARQUITETURA DE ARQUIVOS

```
dist/
├── index.html          — Seletor de campanhas
├── campaign.html       — Dashboard principal (campaign?campaign=ID)
├── config.html         — CRUD de campanhas
└── assets/
    ├── css/main.css
    ├── js/
    │   ├── campaigns-config.js  — Tipos de campanha, helpers, CAMPAIGNS{}
    │   ├── api-client.js        — Fetch wrapper para todos endpoints
    │   ├── data-processor.js    — Processamento de dados (Meta, Hotmart, SendFlow)
    │   ├── dashboard.js         — IIFE: funnel, metrics, charts, tables
    │   └── config.js            — UI do config.html
    └── img/

functions/
├── _middleware.js       — CORS + KV cache layer (5min TTL, nunca cacheia [])
└── api/
    ├── campaigns.js                    — CRUD campanhas no KV
    ├── meta/
    │   ├── insights.js                 — Meta Ads insights (campaign/daily)
    │   └── campaigns.js                — Lista campanhas Meta
    ├── hotmart/
    │   ├── sales.js                    — Vendas (KV-first, API fallback)
    │   ├── products.js                 — Lista produtos
    │   └── proxy.js                    — Proxy generico Hotmart
    ├── sendflow/
    │   ├── analytics.js                — Add/remove/clicks por dia
    │   ├── groups.js                   — Lista grupos + participantes + busca
    │   ├── unique-counts.js            — Contagem unica via leadscoring CSV
    │   ├── members.js                  — Download leadscoring CSV
    │   ├── releases.js                 — Lista releases
    │   └── proxy.js                    — Proxy generico SendFlow
    ├── activecampaign/
    │   └── contacts.js                 — Contatos, tags, lists, export_csv
    ├── manychat/
    │   ├── metrics.js                  — Contagem por tag
    │   ├── subscriber.js               — Busca por telefone
    │   └── tags.js                     — Lista tags
    └── googlesheets/
        └── survey.js                   — Pesquisa pos-evento (Google Sheets)
```

---

## TIPOS DE CAMPANHA

### 1. Lancamento Pago (`lancamento_pago`)
Funil: **Cliques → Pagina → Popup (opt) → Ingresso → Onboarding AC → Grupo → Pesquisa (opt)**

Integracoes: Meta Ads + Hotmart (ticket) + ActiveCampaign + SendFlow + Google Sheets

Config necessaria:
```javascript
{
  type: 'lancamento_pago',
  period: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' },
  meta: { campaign_filter: 'FILTRO' },
  hotmart: {
    ticket_product_id: 12345,          // Produto ingresso
    main_product_id: null,              // Produto principal (opcional)
    bump_product_id: null,              // Order bump (opcional)
    downsell_product_id: null,          // Downsell (opcional)
    sales_start: 'YYYY-MM-DD'          // Inicio vendas (se diff do periodo)
  },
  sendflow: { release_id: 'XXXXX' },
  activecampaign: { tag_id: 123 },
  manychat: { tags: { onboarding_started: 'TAG_NAME' } },
  popup_capture: { enabled: true, ac_tag_id: 456 },  // Opcional
  google_forms: {                                      // Opcional
    campanha_tag: 'TAG',
    sheet_id: 'XXXXX',                  // Opcional (tem fallback)
    sheet_name: 'NOME_ABA',            // Opcional (tem fallback)
    campanha_col: 15                    // Opcional (default 15)
  }
}
```

### 2. Lancamento Gratuito (`lancamento_gratuito`)
Funil: **Cliques → Cadastro → Onboarding → Grupo → Pesquisa (opt) → Vendas**

Integracoes: Meta Ads + ActiveCampaign (signup) + ManyChat (onboarding) + SendFlow + Hotmart (sales)

### 3. Downsell (`downsell`)
Funil: **Cliques → Cadastro → Onboarding → Grupo → Pesquisa (opt) → Vendas**

Mesmo funil do gratuito, aplicado a ofertas de downsell.

---

## FLUXO DE DADOS

### 1. Fetch (paralelo via Promise.allSettled)
```
loadAllData() → {start, end} = getActivePeriod()
├── Meta Insights (campaign + daily)
├── Hotmart Sales (ticket, main, bump, downsell)
├── ManyChat Metrics (tags)
├── SendFlow Analytics + Groups
├── ActiveCampaign Contacts (tag count)
├── Popup Capture (AC tag, se enabled)
└── Google Sheets Survey (se campanha_tag configurada)
```

### 2. Processamento (data-processor.js)
- **Meta**: clicks, impressions, spend, CTR, CPC, CPM, landing_page_views
- **Hotmart**: total_sales, total_revenue, average_ticket, salesByDate. Converte moeda para BRL
- **SendFlow**: add/remove/clicks por dia (datas DDMMYYYY → ISO). `add.total` = entradas, `groups[].participantsAmount` = membros atuais por grupo

### 3. Render
- `renderFunnel()` + `updateFunnelValues()` — funil visual com % entre steps
- `renderKeyMetrics()` — cards de metricas principais
- `renderCharts()` — graficos SendFlow (timeline + acumulado)
- `renderGroupsSummary()` + `renderGroups()` — resumo e cards de grupos
- `renderSurveyTab()` — aba Pesquisa. **Base da %**: lancamento pago = ingressos (`hotmartTicketData.total_sales`); demais tipos = onboardings (`acData.total`). Usar `isPago = campaign.type...includes('pago')`.
- `renderSalesTable()` — ultimas 50 vendas
- `renderSalesGrids()` — grids de vendas por produto
- `renderMetaCampaignsTable()` — breakdown de campanhas Meta

---

## DESIGN SYSTEM (NEUTRO — OBRIGATORIO)

Os dashboards NAO devem ter visual improvisado/ad hoc. Use SEMPRE os tokens abaixo.
Este e um design system **neutro e profissional** (dark): nao pertence a nenhuma marca
especifica. Pra aplicar a marca do cliente/aluno, troque APENAS `--accent` (e opcionalmente
a fonte). O resto fica como esta pra garantir consistencia.

### Tokens (cole em `assets/css/main.css`)
```css
:root {
  /* === COR DE DESTAQUE (UNICA coisa que se troca por marca) === */
  --accent:        #4F8CFF;   /* azul neutro. Troque pela cor da marca */
  --accent-soft:   #4F8CFF22; /* mesma cor com alpha pra fundos/realces */

  /* === SUPERFICIES (dark) === */
  --bg:            #0B0F14;   /* fundo da pagina */
  --surface:       #141A22;   /* cards, paineis */
  --surface-2:     #1B232D;   /* hover, linhas alternadas de tabela */
  --border:        #243040;   /* bordas e divisores */

  /* === TEXTO === */
  --text:          #E6EDF3;   /* texto principal */
  --text-muted:    #8B98A8;   /* labels, legendas */

  /* === SEMANTICAS (status/metricas) === */
  --positive:      #2FBF71;   /* alta, sucesso, vendas */
  --negative:      #F0556C;   /* queda, erro, saidas */
  --warning:       #F4B740;   /* atencao, atraso */

  /* === PALETA DE GRAFICOS (ordem fixa) === */
  --chart-1: #4F8CFF;
  --chart-2: #2FBF71;
  --chart-3: #F4B740;
  --chart-4: #B07CFF;
  --chart-5: #34D3C0;

  /* === TIPOGRAFIA === */
  --font-ui: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --fs-display: 32px;  /* numero grande de metrica */
  --fs-title:   20px;  /* titulo de secao */
  --fs-body:    14px;  /* corpo */
  --fs-label:   12px;  /* labels/legendas */

  /* === ESPACAMENTO (base 4px) === */
  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px;  --sp-4: 16px;  --sp-6: 24px;  --sp-8: 32px;

  /* === RAIO E SOMBRA === */
  --radius-card: 14px;
  --radius-ctrl: 9px;
  --shadow-card: 0 1px 0 rgba(255,255,255,.03), 0 8px 24px rgba(0,0,0,.35);
}
```

### Regras de uso
- **Numeros de metrica**: `--fs-display`, peso 700, `font-variant-numeric: tabular-nums` (alinha digitos).
- **Cards**: fundo `--surface`, borda `1px solid --border`, raio `--radius-card`, sombra `--shadow-card`, padding `--sp-6`.
- **Variacao positiva/negativa** (ex: +12%, -4%): usar `--positive` / `--negative`, nunca verde/vermelho aleatorio.
- **Funil**: cada step com fundo `--surface-2`, barra de progresso em `--accent`; o % entre steps em `--text-muted`.
- **Graficos**: usar a paleta `--chart-1..5` NA ORDEM. Nao sortear cores.
- **Tabelas**: header `--text-muted` + `--fs-label` maiusculo; linhas zebradas com `--surface-2`; borda `--border`.
- **Fonte Inter**: carregar via `<link>` Google Fonts ou self-host. Fallback ja esta no token.

### Rebranding (o que o aluno faz)
1. Trocar `--accent` e `--accent-soft` pela cor primaria da marca dele.
2. (Opcional) Trocar `--font-ui` pela fonte da marca.
3. (Opcional) Colocar o logo no header (`dist/assets/img/`).
4. NAO mexer nas superficies/semanticas — sao calibradas pra contraste e legibilidade no dark.

> Quer tema light tambem? Duplique o bloco `:root` num `[data-theme="light"]` invertendo
> superficies (`--bg` claro, `--text` escuro) e mantendo accent/semanticas.

---

## HOTMART — KV-FIRST (CRITICO)

O `sales.js` NAO chama a API Hotmart diretamente por padrao. O fluxo e:

1. **sync-hotmart.py** roda a cada 1h via cron/launchd
2. Busca TODAS as vendas de TODOS os produtos de TODAS as campanhas ativas
3. Salva no KV: `hotmart_sales:{product_id}:{start}:{end}:{status}`
4. **sales.js** le do KV primeiro (`X-Source: kv-sync`)
5. Se KV miss, faz fallback pra API (pode dar timeout em datasets grandes)

### Chaves KV do sync
```
hotmart_sales:<PRODUCT_ID>:2026-01-01:2026-02-15:APPROVED,COMPLETE
hotmart_sales:<PRODUCT_ID>:2026-01-01:2026-02-15:all
```

### Replicar pra novo cliente
1. Copiar `sync-hotmart.py`, trocar `BASIC_TOKEN` e `KV_NAMESPACE`
2. Criar cron/LaunchAgent pra rodar a cada 1h
3. Secrets do Pages: `HOTMART_BASIC_TOKEN` = mesmo Base64

### ATENCAO: BINDING DASHBOARD_CACHE (erro comum)
`sales.js`, `products.js` e o `_middleware` leem de `env.DASHBOARD_CACHE`. O projeto Pages PRECISA ter o binding `DASHBOARD_CACHE` apontando pro MESMO namespace que o `KV_NAMESPACE` do `sync-hotmart.py` escreve. Se faltar o binding (ou apontar pra outro namespace), Hotmart vem `[]` (`x-source: hotmart-api` = KV MISS) e o cache do site inteiro fica inativo, mesmo com o sync rodando OK. Conferir em wrangler.toml E no painel/API do Pages (`deployment_configs.production.kv_namespaces`).

Chave KV de vendas: `hotmart_sales:{pid}:{YYYY-MM-DD}:{YYYY-MM-DD}:APPROVED,COMPLETE`. O dashboard manda `start_date`/`end_date` em YYYY-MM-DD + `status=APPROVED,COMPLETE` — tem que casar exatamente com a chave do sync.

---

## SENDFLOW — CONTAGEM DO GRUPO (CRITICO)

**Regra de ouro: o dash espelha a tela "Visao Geral" do SendFlow. Use as mesmas duas fontes que ela usa.**

| Numero no dash | Fonte na API | Endpoint |
|---|---|---|
| **Entrou no grupo** (= "Entraram") | `analytics.add.total` | `/releases/{id}/analytics` |
| Sairam | `analytics.remove.total` | idem |
| Cliques | `analytics.clicks.total` | idem |
| **Continua no grupo** (membros agora) | `Σ groups[].participantsAmount` | `/releases/{id}/groups` |
| Membros por grupo (cards) | `g.participantsAmount` | idem |

```javascript
// Funil "Grupo" e card "Entrou no grupo"
const groupEntrou = sendflowAnalytics?.add?.total || 0;
// Card "Continua no grupo" e membros por grupo
const groupContinua = (sendflowGroups || []).reduce((s, g) => s + (g.participantsAmount || 0), 0);
```

### NAO use leadscoring para contar grupo (erro comum)
O `analytics` conta **eventos** (pessoa em 3 grupos = 3 adds), mas a propria "Visao Geral" do SendFlow exibe `add.total` como "Entraram", entao o dash deve casar com isso, nao tentar deduplicar.

O `leadscoring CSV` e **cumulativo** (inclui quem ja saiu) e por isso seu unique (`continua_unique`) fica MAIOR que os participantes reais. A tentativa de deduplicar (`unique-counts.js` com `entrou_unique`/`dedupRatio`) inflava ambos os numeros e nao batia com o SendFlow.

### Limitacao conhecida
A API publica (`/sendapi`) NAO expoe o "Participantes" deduplicado por pessoa (o numero exato da Visao Geral). `Σ participantsAmount` conta quem esta em 2+ grupos mais de uma vez, entao fica ~10-20% acima do deduplicado. E o melhor dado real disponivel via API; rotular como "membros nos grupos", nao como "pessoas unicas".

---

## MIDDLEWARE — CACHE + PROTECOES

```javascript
// Cache layer (KV, 5min TTL)
// NUNCA cacheia respostas vazias ([], {}, null)
// Retorna Cache-Control: no-store (impede cache do browser)
// CORS: Access-Control-Allow-Origin: *
```

---

## DEPLOY

### Comando
```bash
CLOUDFLARE_API_TOKEN="" wrangler pages deploy dist --project-name=<NOME_PROJETO> --commit-dirty=true
```

> Sem `CLOUDFLARE_API_TOKEN=""` usa OAuth salvo do wrangler (pode expirar). O `""` forca OAuth interativo.

### Checklist de deploy
1. `node -c` em todos os .js modificados
2. `git add` + `git commit` + `git push`
3. `wrangler pages deploy`
4. Testar endpoint principal: `curl -s https://<DOMINIO>/api/hotmart/sales?...`
5. Verificar `X-Source: kv-sync` (vem do KV) ou `X-Cache: HIT` (cache middleware)

### Checklist pra NOVO CLIENTE
1. Criar projeto Cloudflare Pages: `wrangler pages project create <NOME>`
2. Copiar `dist/` e `functions/` do projeto referencia
3. Criar KV namespaces: `wrangler kv namespace create CAMPAIGNS_KV` + `DASHBOARD_CACHE`
4. Configurar bindings no painel Pages (Settings > Bindings)
5. Configurar secrets no painel Pages (Settings > Environment variables)
6. Configurar dominio customizado no painel Pages (Custom domains)
7. Copiar e adaptar `sync-hotmart.py` (tokens, KV namespace)
8. Criar cron/LaunchAgent pra sync (a cada 1h)
9. Deploy: `wrangler pages deploy dist --project-name=<NOME>`
10. Criar primeira campanha via `/config.html`

---

## BUGS CONHECIDOS E SOLUCOES

### Grupo > 100% dos ingressos
- **Causa**: SendFlow analytics.add.total conta eventos (duplicatas multi-grupo)
- **Decisao**: o dash espelha a "Visao Geral" do SendFlow (nao deduplica). Rotular `Σ participantsAmount` como "membros nos grupos", nao "pessoas unicas"

### Hotmart zerou (timeout do Worker)
- **Causa**: sales.js paginava milhares de vendas direto da API, Worker estourava 30s
- **Fix**: sales.js le do KV (populado pelo sync-hotmart.py a cada 1h)
- **Prevencao**: MAX_PAGES=100 em todos os endpoints paginados

### Cache de respostas vazias
- **Causa**: API falhava temporariamente, middleware cacheava [] no KV por 5min
- **Fix**: Middleware nunca cacheia [], {} ou null
- **Prevencao**: Cache-Control: no-store impede cache do browser

### KV propagacao lenta
- **Causa**: Deletar chave do KV pode levar 30-60s pra propagar globalmente
- **Workaround**: Aguardar ou usar URL de deploy especifica (hash.pages.dev)

---

## FEATURES IMPLEMENTADAS (historico)

### v1.0.0
- Dashboard completo com 3 tipos de campanha
- Funil visual com conversoes entre steps
- Integracoes: Meta Ads, Hotmart, SendFlow, ManyChat, ActiveCampaign, Google Sheets
- KV-first pra Hotmart sales (sync-hotmart.py + fallback API)
- Export CSV do ActiveCampaign
- Google Sheets configuravel por campanha (sheet_id, sheet_name, campanha_col)
- Protecao MAX_PAGES em todos os endpoints paginados
- Middleware com protecao contra cache vazio + no-store
- Config UI (config.html) pra criar/editar campanhas
- Design system neutro definido (tokens de cor, tipografia, espacamento) — accent trocavel por marca
- Date filter (periodo customizado vs periodo total)
