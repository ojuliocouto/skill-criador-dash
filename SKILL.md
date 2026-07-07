---
name: criador-dash
description: "Construtor guiado de dashboards de marketing, vendas e suporte. NÃO entrega um app pronto: o agente conduz a pessoa, passo a passo, para construir e publicar o próprio dashboard na infra dela (conta Cloudflare, KV, Pages, domínio e, no modo histórico, D1 + Worker cron). Monta a partir de uma biblioteca de peças testadas (conectores, widgets, templates, motor de métricas) em starter-kit/, personalizando para a operação da pessoa, e escreve conectores sob medida quando a fonte é específica. Dois modos de dados: ao vivo (lê a fonte na hora) ou histórico (cron tira snapshots no D1). Use quando alguém quiser criar, personalizar e publicar um dashboard próprio no Cloudflare."
triggers:
  - criar dashboard
  - dashboard de marketing
  - dashboard de vendas
  - dashboard de suporte
  - painel de métricas
  - dashboard cloudflare
  - publicar dashboard
  - roas cpl cpa ticket médio
version: 3.1.0
author: Julio Couto
category: marketing-analytics
tags: [dashboard, marketing, vendas, suporte, cloudflare-pages, functions, kv, d1, cron, workers, google-sheets, csv, meta-ads, guiado, no-code, roas, cpl, cpa, ticket-medio]
---

# Criador Dash: Construtor Guiado de Dashboards

> Esta skill NÃO é um app que você entrega pronto: é um roteiro que VOCÊ (agente) conduz para
> construir, com a pessoa, o dashboard DELA, na conta Cloudflare DELA, a partir das peças testadas
> em `starter-kit/`. Placeholders ficam entre `<...>`. Nunca commite token, Account ID ou id real.

## Protocolo de operação (leia antes de tudo)

1. Você é o maestro. A entrega é o dashboard da PESSOA, publicado na infra DELA, feito sob medida.
2. NÃO reinvente: componha a partir da biblioteca de peças provadas em `starter-kit/` (conectores,
   widgets, templates, motor de métricas, wizard). Personalizar em cima de peça testada = rápido
   e confiável. Escrever tudo do zero a cada pessoa baixaria a qualidade.
3. Fonte específica da pessoa? Escreva um conector sob medida na hora, seguindo o Contrato 2 do
   `starter-kit/ARCHITECTURE.md` (o `meta-ads.js` é o exemplo com token). Assim o "genérico" é real:
   a pessoa não fica presa a uma lista de ferramentas, você cria a que ela precisa.
4. A pessoa escolhe o MODO DE DADOS (seção "Os dois modos de dados"): ao vivo ou histórico.
5. Toda operação no Cloudflare é na conta DA PESSOA. Pergunte SEMPRE qual conta antes de operar.

Documentação de apoio (leia o arquivo certo na hora certa, não tudo de uma vez):
- `references/infra.md`: comandos completos de provisionamento (KV, Pages, ADMIN_TOKEN, domínio, D1 + cron).
- `references/seguranca.md`: modelo de acesso fail-closed, senha por dashboard, validação da fonte.
- `references/recursos.md`: filtros, grid 2D, grupos com abas, tema, estética anti-IA, OpenGraph, árvore de arquivos.
- `references/extensao.md`: adicionar domínio, conector ou widget novo.
- `starter-kit/ARCHITECTURE.md`: os 7 contratos das camadas (fonte da verdade do código).

## Passo a passo (o roteiro que você conduz)

### 1. Onboarding e checklist
Nunca presuma que a pessoa leu o README. Explique em 3 frases:
- "Eu vou construir com você o seu dashboard, na sua conta Cloudflare, do jeito da sua operação."
- Não é um produto fechado de um nicho: adaptamos domínio, métricas e fonte a você.
- No fim, o dashboard fica publicado num domínio seu, e você é o dono do código e da infra.

Explique em uma frase cada palavra técnica antes de mandar comando (a pessoa pode nunca ter usado):
Cloudflare Pages = onde o dashboard fica hospedado (de graça). KV = banco chave-valor das configs.
wrangler = a linha de comando do Cloudflare, é por ela que a gente cria e publica.

Rode o preflight, que checa o ambiente de uma vez e diz o que falta:
```
python3 scripts/preflight.py --starter-kit starter-kit
```
Checklist (um item por vez; se faltar algo, resolva antes de seguir):
- [ ] Conta no Cloudflare? (plano grátis cobre Pages + Functions + KV; D1 tem free tier). Senão: dash.cloudflare.com.
- [ ] Node instalado? (`node -v`). Sem Node não roda wrangler nem os testes.
- [ ] wrangler disponível? `npm i -g wrangler` (3.60+ ou 4.x). Se `wrangler` não for achado depois de
      instalar, o bin global do npm não está no PATH (`npm prefix -g` mostra a pasta; adicione ao PATH,
      que é melhor do que apelar pra sudo). O `npm run dev` usa `npx wrangler`, então funciona mesmo sem global.
- [ ] Login: `wrangler login`. ATENÇÃO: um `CLOUDFLARE_API_TOKEN` exportado no shell SOBREPÕE o login e
      pode apontar pra outra conta (o preflight avisa); se indevido, `unset CLOUDFLARE_API_TOKEN`.
- [ ] Conta certa? `wrangler whoami` (mostra email e Account ID). Errada: `wrangler logout` e login de novo.

### 2. Descoberta da operação
- Que área medir: Marketing, Vendas, Suporte, ou mais de uma (um dashboard por área; junte num grupo com abas).
- Onde os dados vivem: planilha, CRM, Meta Ads, WhatsApp, sistema com API etc.
- O que ela precisa DECIDIR olhando o dashboard (isso define quais métricas importam).

### 3. Escolher o modo de dados
Explique e deixe a pessoa escolher (detalhe na seção "Os dois modos de dados"):
- AO VIVO: lê a fonte na hora, só KV pra config, setup mínimo. Bom pra maioria.
- HISTÓRICO: Worker cron tira snapshots no D1; dá histórico de verdade e não depende da fonte no ar. Mais setup.

### 4. Provisionar a infra DELA
Pergunte qual conta Cloudflare usar e siga `references/infra.md` na ordem (o passo do wrangler.toml é
BLOQUEANTE: rode `python3 scripts/preflight.py --starter-kit starter-kit` antes do deploy):
- KV `DASHBOARDS_KV` (sempre) e `DASHBOARD_CACHE` (opcional).
- Modo histórico: D1 + `db/schema.sql` + Worker cron (`workers/snapshot/`).
- Projeto Pages + domínio customizado.
- `ADMIN_TOKEN` (OBRIGATÓRIO): mutação é fail-closed, sem o token ninguém cria/apaga dashboard.

### 5. Montar o dashboard
- Escolha o domínio pronto (Marketing, Vendas, Suporte) ou crie um novo (`references/extensao.md`).
- Conecte a fonte: planilha (gviz CSV), upload CSV, Meta Ads (token; card só no domínio Marketing) ou
  conector sob medida.
- Mapeie colunas (auto-mapeamento pré-preenche), defina branding (cor), meta opcional e senha opcional.
- No modo ao vivo a fonte fica na config; no histórico ela alimenta o cron e o dashboard lê o D1.

### 6. Deploy e verificação
- Publique na conta DA PESSOA (`wrangler pages deploy public --project-name=<NOME>`).
- Modo histórico: deploy do Worker cron e força uma primeira captura (`references/infra.md`).
- Confirme com os próprios olhos: abra o dashboard publicado e cheque KPIs, funil, tendência e a cor
  de marca, em desktop E mobile, nos DOIS temas, antes de dizer pronto.

### 7. Encerramento
Salve o contexto do projeto da pessoa em `projetos/YYYYMMDD-descricao.md` (crie a pasta com
`mkdir -p projetos`; ela é gitignored de propósito, é contexto privado do cliente): projeto Pages,
domínio, modo de dados, fontes, decisões. Nunca coloque token, Account ID ou id real: use placeholders.

## A caixa de peças (biblioteca provada em `starter-kit/`)

Código real e testado (500+ testes verdes, TDD; `npm test` mostra a contagem atual). Você compõe a
partir daqui. Arquitetura em 3 camadas desacopladas (contratos completos em `starter-kit/ARCHITECTURE.md`):
1. CONECTORES: buscam dados de uma fonte e devolvem um `DataSet` (schema comum tabular). Não sabem de métricas.
2. WIDGETS: blocos visuais puros (KPI, série temporal, funil, tabela, ranking). Recebem dados já calculados.
3. TEMPLATES DE DOMÍNIO: slots semânticos, métricas e layout de widgets de cada domínio.

```
Fonte -> Conector -> DataSet (schema comum) -> Template -> Widgets -> Render
```

Conectores prontos: Google Sheets via gviz CSV (carro-chefe: a pessoa só cola o link compartilhado,
sem OAuth), upload de CSV (fallback universal), Meta Ads (Graph API, token só no servidor), D1 (modo
histórico) e sob medida (Contrato 2) pra qualquer outra fonte.

Domínios prontos (métricas e layout por domínio):
- MARKETING: investimento, impressões, cliques, leads, conversões, receita; derivadas CTR, CPC, CPL, CPA, ROAS.
- VENDAS: negócios, vendas ganhas, faturamento (só das ganhas; sem coluna de status, todas contam),
  ticket médio, taxa de conversão.
- SUPORTE: atendimentos, resolvidos, taxa de resolução, tempo de resposta (média), CSAT (média).
- Outro (ex: Financeiro)? Crie conforme a operação da pessoa: `references/extensao.md`.

Recursos inclusos (detalhes e código em `references/recursos.md`): tendência por período nos KPIs,
meta vs realizado, grid 2D no desktop (`col` 3..8), filtros client-side por período e dimensão,
dashboard-grupo com abas (`kind:'group'`), tema claro/escuro, estética de ferramenta premium
(Geist self-hosted, painel hairline, sem gradiente) e preview de link OpenGraph por dashboard.
Segurança (fail-closed, senha PBKDF2, validação de fonte no POST): `references/seguranca.md`.

## Os dois modos de dados

A pessoa escolhe no passo 3. Os dois convivem no mesmo starter-kit.

AO VIVO (padrão, mais simples): o `dashboard.html` chama o conector, que busca a fonte na hora.
KV guarda só a config; `DASHBOARD_CACHE` (opcional) cacheia 5 min. Sem banco. Limite: sem histórico
próprio e depende da fonte estar no ar.

HISTÓRICO (D1 + cron, mais robusto): um Worker cron (`workers/snapshot/`) grava snapshots da fonte
no D1; o dashboard lê o snapshot mais recente via conector `d1.js`. COMO LIGA: a config precisa de
`storage: "d1"` (no wizard, o seletor "Modo de dados" no passo Finalizar grava isso; na mão, inclua
o campo, senão lê ao vivo). Só faz sentido pra fonte viva (planilha/Meta); CSV estático o cron ignora.
Setup completo do D1 + cron + bindings: `references/infra.md`.

## Rodar local e seed por API

```
cd starter-kit
npm test                       # suite completa (TDD)
npm run dev                    # local com Functions + KV (npx wrangler pages dev public)
```
Para o fluxo completo local (criar dashboard pelo wizard ou curl), crie `starter-kit/.dev.vars` com
`ADMIN_TOKEN=<valor-de-dev>` antes do `npm run dev` (mutação é fail-closed até em dev; o arquivo é
gitignored, nunca o commite). O preflight avisa se faltar.

Seed de um dashboard por API (formato de `source` por tipo no Contrato 7 do `ARCHITECTURE.md`;
atenção: csv usa `data`, sheets usa `url`, meta usa `meta:{token,account}`):
```
curl -X POST "$BASE/api/dashboards" -H "content-type: application/json" -H "x-admin-token: $ADMIN" \
  -d '{"name":"Meu Marketing","domain":"marketing","accent":"#0ea5e9",
       "source":{"type":"csv","data":"Data,Canal,Investimento\n01/07/2026,Instagram,\"1.250,00\""},
       "colMap":{"data":"Data","canal":"Canal","investimento":"Investimento"}}'
```
O POST valida a forma da fonte nos tipos conhecidos (csv/sheets/meta) e devolve 400 apontando o campo
errado; tipo desconhecido (conector sob medida) passa, a forma é do conector. Se algo falhar no caminho,
toda resposta de erro da API vem em PT-BR dizendo o que corrigir (ex: 403 `adminNotConfigured` ensina o
`secret put`; 400 de fonte aponta o campo).

## Estender (domínio, conector, widget)

Roteiros completos em `references/extensao.md`. Regras de ouro: TDD (teste antes); domínio novo se
registra no array `DOMAINS` em DOIS arquivos com teste de paridade; conector de fonte viva se pluga em
4 lugares (registry, LIVE_FETCHERS, card do wizard, SNAPSHOT_FETCHERS se `canHistory`), e as guardas de
import + testes quebram na hora se faltar um; widget novo é `render` puro + entrada no registry.

## Protocolo de encerramento

Ao terminar um trabalho nesta skill:
1. Atualize este `SKILL.md` (e o `references/` correspondente) se algo mudou: novo domínio, conector, modo, passo.
2. Salve o contexto do projeto da pessoa em `projetos/YYYYMMDD-descricao.md` (pasta gitignored; crie com
   `mkdir -p projetos`). Nunca coloque token, Account ID ou id de KV/D1 real: use placeholders.
3. Antes de distribuir/publicar o repo, apague o cache local `rm -rf starter-kit/.wrangler` (fica
   gitignored, mas guarda Account ID e dados de dev em cache; não deve ir junto num zip/cópia).
