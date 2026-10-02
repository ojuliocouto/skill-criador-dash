---
name: criador-dash
description: "Construtor guiado de dashboards de marketing, vendas, suporte, financeiro e estoque. NÃO entrega um app pronto: o agente conduz a pessoa, passo a passo, para construir e publicar o próprio dashboard na infra dela (conta Cloudflare, KV, Pages, domínio e, no modo histórico, D1 + Worker cron). Monta a partir de uma biblioteca de peças testadas (conectores, widgets, templates, motor de métricas) em starter-kit/, personalizando para a operação da pessoa, e escreve conectores sob medida quando a fonte é específica. Dois modos de dados: ao vivo (lê a fonte na hora) ou histórico (cron tira snapshots no D1). Use quando alguém quiser criar, personalizar e publicar um dashboard próprio no Cloudflare."
triggers:
  - criar dashboard
  - dashboard de marketing
  - dashboard de vendas
  - dashboard de suporte
  - dashboard financeiro
  - dashboard de estoque
  - painel de métricas
  - dashboard cloudflare
  - publicar dashboard
  - roas cpl cpa ticket médio
version: 3.1.0
author: Julio Couto
category: marketing-analytics
tags: [dashboard, marketing, vendas, suporte, financeiro, estoque, cloudflare-pages, functions, kv, d1, cron, workers, google-sheets, csv, meta-ads, guiado, no-code, roas, cpl, cpa, ticket-medio, giro]
---

# Criador Dash: Construtor Guiado de Dashboards

> Esta skill NÃO é um app que você entrega pronto: é um roteiro que VOCÊ (agente) conduz para
> construir, com a pessoa, o dashboard DELA, na conta Cloudflare DELA, a partir das peças testadas
> em `starter-kit/`. Placeholders ficam entre `<...>`. Nunca commite token, Account ID ou id real.

## Pastas: onde fica cada coisa (defina antes do primeiro comando)

| Nome no roteiro | Caminho | O que é |
|---|---|---|
| pasta da skill | `~/.claude/skills/criador-dash` | o roteiro, os scripts e a biblioteca original. Só leitura: nunca trabalhe nem guarde dado de cliente aqui. |
| pasta do projeto | `~/meu-dash` | a CÓPIA do starter-kit que vira o dashboard da pessoa. Todo trabalho acontece aqui. |

A pasta do projeto nasce de um comando só, no passo 1:

```bash
cp -R ~/.claude/skills/criador-dash/starter-kit ~/meu-dash
cd ~/meu-dash
```

Daí em diante, todo comando roda de dentro de `~/meu-dash`, e todo caminho relativo do roteiro
(`evidencias/`, `prova/`, `projetos/`, `.dev.vars`, `public/`) é relativo a ela. Os scripts da
skill são chamados pelo caminho completo (`python3 ~/.claude/skills/criador-dash/scripts/...`).
Se a pessoa preferir outro nome de pasta, troque `~/meu-dash` em todos os comandos.

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
- `references/direcao-de-arte.md`: as TRÊS fases do diretor de arte (concepção, construção, passe final), com o norte Linear/Vercel/Stripe.
- `references/recursos.md`: filtros, grid 2D, grupos com abas, tema, estética anti-IA, OpenGraph, árvore de arquivos.
- `references/extensao.md`: adicionar domínio, conector ou widget novo.
- `references/token-meta-ads.md`: passo a passo pra pessoa gerar o próprio token do Meta Ads (usuário do sistema), com a tabela de erros.
- `starter-kit/ARCHITECTURE.md`: os 7 contratos das camadas (fonte da verdade do código).

## Passo a passo (o roteiro que você conduz)

### 0. FERRAMENTAS: instalar e conectar TUDO antes de qualquer outra coisa

**Este é o primeiro passo da skill. Ele BLOQUEIA: enquanto houver ferramenta crítica sem
responder, não existe Passo 1.** Não é um checklist que você lê e segue mesmo assim: item de
checklist é pulado, gate não.

```
python3 ~/.claude/skills/criador-dash/scripts/checar-ferramentas.py
```

O verificador não pergunta se a ferramenta está instalada: ele MANDA cada uma fazer alguma
coisa e confere se voltou. Sai com código diferente de zero quando falta algo crítico.

**Por que isso existe (26/08/2026, custou meses sem ninguém perceber):** na skill irmã
(construtor-paginas) o MCP do 21st.dev estava configurado e MORTO havia tempo indeterminado
(`Not authenticated: your API key is missing or was reset`). A skill mandava usar componentes
dele (MORTO) ou fazer à mão, o MCP nunca respondia, e ela caía no "à mão" TODA VEZ. Ninguém viu,
porque **fallback silencioso não reclama**: o sintoma chegou pelo RESULTADO ("o design não está
interessante"), meses depois. O criador-dash estava pior: não mencionava nenhuma ferramenta
visual e não tinha prova de tela nenhuma. Eram 654 testes passando, e nenhum olhava o dashboard.

**"Está instalada" e "aparece na lista" não são verificação.** Verificação é mandar fazer e
conferir o retorno.

**O que fazer com o resultado:**

| Resultado | Ação |
|---|---|
| Tudo respondendo | Segue pro Passo 1 |
| **Crítico sem responder** | **PARA.** Conduza a pessoa pela instalação (tabela abaixo) e rode de novo. Não comece o dashboard. |
| Só opcional degradado | Segue, e DECLARE a degradação na entrega |

**CONDUZIR, não avisar.** Quem usa esta skill quase sempre não sabe o que é um MCP. Não diga
"você precisa instalar o Playwright": dê o comando pronto, espere terminar e confirme que
respondeu. Uma ferramenta por vez, do jeito que o Passo 1 ensina cada palavra técnica
antes de mandar comando.

| Ferramenta | Para quê | Como conduzir |
|---|---|---|
| **Node 22+** | o wrangler 4.x não roda em versão mais velha; com Node 18/20 nem os testes nem o deploy funcionam | `nvm install 22` ou `brew install node`. Confira com `node -v`. |
| **wrangler** | publicar no Cloudflare (Pages, KV, D1) | `npm i -g wrangler`. Se o comando não for achado depois de instalar, o bin global do npm não está no PATH (`npm prefix -g` mostra a pasta). |
| **Login Cloudflare** | é a conta DA PESSOA que recebe o dashboard | `wrangler login`, depois `wrangler whoami` pra confirmar a conta. **Um `CLOUDFLARE_API_TOKEN` exportado no shell SOBREPÕE o login e pode publicar na conta errada:** o verificador denuncia; se for indevido, `unset CLOUDFLARE_API_TOKEN`. |
| **Peças do starter-kit** | é a biblioteca testada de onde o dashboard é montado | o verificador roda o `npm test` da biblioteca sozinho. Peça quebrada não vira dashboard de ninguém: conserte antes. |
| **Playwright** | prova de tela: abre o dashboard publicado e confere que ele mostra número | `npm i -g playwright && npx playwright install chromium` (~265 MB; a versão leve é `--only-shell`, ~94 MB). |
| **magic (21st.dev), opcional** | inspiração de componente; nunca bloqueia o passo 0 | O código do componente é pago e vem em React + Tailwind, e o starter-kit é HTML montado em string: não encaixa direto. Aluno sem chave pula e segue. Quem já tem a chave pode usar só como referência visual. |
| **skill frontend-design** (obrigatória) | plano visual do painel antes do código (passo 2.5) | `npx -y skills add anthropics/skills --skill frontend-design --agent claude-code` |
| **skill design-taste-frontend** (opcional, só leitura de apoio) | ela se declara fora de escopo pra dashboard; serve de apoio pra tipografia e hierarquia | `npx skills add Leonxlnx/taste-skill` |
| **skills de acabamento (opcionais)** | acabamento e microinteração | `high-end-visual-design`, `animate` |

**Regra que nasceu daqui, e vale pra qualquer ferramenta que esta skill venha a usar:** toda
dependência nova entra no `checar-ferramentas.py` com um teste que a EXERCITA. Se você não
conseguir escrever esse teste, a dependência não entra na skill: sem teste, ela morre em
silêncio e degrada o resultado sem avisar ninguém.

O `scripts/preflight.py` continua existindo e é complementar: ele valida o `wrangler.toml`, o
`.dev.vars` e o projeto ANTES do deploy. O `checar-ferramentas.py` é antes de tudo; o
`preflight.py` é antes de publicar.

---

### 1. Onboarding e checklist

Ao concluir, execute `python3 ~/.claude/skills/criador-dash/scripts/gate-etapas.py --perfil dash --projeto ~/meu-dash registrar 1 --arquivo evidencias/etapa-1.json`.
Campos e evidências: `references/gate-etapas.md`. Saída diferente de zero bloqueia o avanço.
Nunca presuma que a pessoa leu o README. Explique em 3 frases:
- "Eu vou construir com você o seu dashboard, na sua conta Cloudflare, do jeito da sua operação."
- Não é um produto fechado de um nicho: adaptamos domínio, métricas e fonte a você.
- No fim, o dashboard fica publicado num domínio seu, e você é o dono do código e da infra.

Explique em uma frase cada palavra técnica antes de mandar comando (a pessoa pode nunca ter usado):
Cloudflare Pages = onde o dashboard fica hospedado (de graça). KV = banco chave-valor das configs.
wrangler = a linha de comando do Cloudflare, é por ela que a gente cria e publica.

Rode o preflight, que checa o ambiente de uma vez e diz o que falta:
```
python3 ~/.claude/skills/criador-dash/scripts/preflight.py --starter-kit ~/meu-dash
```
Checklist (um item por vez; se faltar algo, resolva antes de seguir):
- [ ] Conta no Cloudflare? (plano grátis cobre Pages + Functions + KV; D1 tem free tier). Senão: dash.cloudflare.com.
- [ ] Node 22 ou mais novo instalado? (`node -v`). O wrangler atual exige Node 22+; com uma versão mais
      velha (18, 20) ele nem roda os testes nem faz o deploy. Sem Node instalado, nada funciona.
- [ ] wrangler disponível? `npm i -g wrangler` (a versão atual, 4.x, é a que exige Node 22+ acima). Se
      `wrangler` não for achado depois de instalar, o bin global do npm não está no PATH (`npm prefix -g`
      mostra a pasta; adicione ao PATH, que é melhor do que apelar pra sudo). O `npm run dev` usa
      `npx wrangler`, então funciona mesmo sem global.
- [ ] Login: `wrangler login`. ATENÇÃO: um `CLOUDFLARE_API_TOKEN` exportado no shell SOBREPÕE o login e
      pode apontar pra outra conta (o preflight avisa); se indevido, `unset CLOUDFLARE_API_TOKEN`.
- [ ] Conta certa? `wrangler whoami` (mostra email e Account ID). Errada: `wrangler logout` e login de novo.

Antes de qualquer outro comando deste passo, crie a pasta do projeto (seção "Pastas"):
`cp -R ~/.claude/skills/criador-dash/starter-kit ~/meu-dash && cd ~/meu-dash`. É nela que
ficam `evidencias/` (dos gates), `.dev.vars` e o dashboard da pessoa.

Primeira vez da pessoa com isso? Antes de tocar na conta Cloudflare real, rode com ela o Quickstart
do README (`git clone` -> `npm test` -> criar `.dev.vars` -> `npm run dev` -> abrir
`http://localhost:8788/config.html`) pra ela ver um dashboard funcionando local, com dados dela, em
minutos. Isso separa "ambiente funciona" de "infra provisionada": se algo falhar depois, você já sabe
que não é o Node, o wrangler nem o wizard, é a parte de provisionamento real.

### 2. Descoberta da operação

Ao concluir, execute `python3 ~/.claude/skills/criador-dash/scripts/gate-etapas.py --perfil dash --projeto ~/meu-dash registrar 2 --arquivo evidencias/etapa-2.json`.
Campos e evidências: `references/gate-etapas.md`. Saída diferente de zero bloqueia o avanço.
- Que área medir: Marketing, Vendas, Suporte, ou mais de uma (um dashboard por área; junte num grupo com abas).
- Onde os dados vivem: planilha, CRM, Meta Ads, WhatsApp, sistema com API etc.
- O que ela precisa DECIDIR olhando o dashboard (isso define quais métricas importam).

### 2.5 DIREÇÃO DO PAINEL (antes de montar qualquer widget)

Ao concluir, execute `python3 ~/.claude/skills/criador-dash/scripts/gate-etapas.py --perfil dash --projeto ~/meu-dash registrar 2.5 --arquivo evidencias/etapa-2.5.json`.
Campos e evidências: `references/gate-etapas.md`. Saída diferente de zero bloqueia o avanço.

O painel nasce feio quando ninguém decidiu o que ele responde. Esta é a fase de concepção do
diretor de arte, e ela vem ANTES de escolher widget, cor ou layout.

Leia `references/direcao-de-arte.md` (norte: Linear, Vercel e Stripe) e feche por escrito, com
a pessoa, seis decisões. Junto com elas:

- `frontend-design` (obrigatória): direção visual do painel (tipografia, paleta, hierarquia)
  escrita como plano ANTES do código, a partir das seis decisões abaixo. Sem o plano escrito,
  não se monta tela.
- **pré-voo anti-slop**: a lista de tells de painel da Fase 3 de `references/direcao-de-arte.md`
  roda DUAS vezes, sobre o plano e de novo sobre a tela pronta. O que ela reprovar se corrige
  antes do deploy. Painel com cara de template (roxo genérico, card igual a card, número sem
  hierarquia) não passa. Conte os tells antes e depois: a contagem vai no `passe_de_gosto` da
  etapa 6.
- A `design-taste-frontend` NÃO é gate aqui: ela mesma se declara fora de escopo pra dashboard
  e presume React, Tailwind e imagens. Use só como leitura de apoio pra tipografia e hierarquia.

As seis decisões:

1. **Número herói**: se ela só pudesse ver UM número por dia, qual seria? Vira o
   `primaryMetric` do template, e o layout transforma isso no card maior, com sparkline.
2. **A pergunta do painel**: que decisão ela toma olhando isso? "Aumento a verba do Instagram?"
   é pergunta. "Acompanhar o marketing" não é, e painel sem pergunta vira lista de números.
3. **O que NÃO entra**: métrica que ninguém usa pra decidir rouba espaço da que importa.
4. **Accent da marca**: a cor real do negócio dela. O roxo padrão é só pra quem não tem marca.
5. **Densidade**: acompanhamento diário (denso) ou leitura semanal (menos widgets, mais respiro)?
6. **Tema**: claro, escuro ou os dois. Se os dois, os dois são conferidos no gate.

Com as respostas na mão, rode a skill **`frontend-design`**: ela fecha a direção estética.
Registre o uso (`uso-ferramentas.py registrar "skill frontend-design" ...`, ver 6.1).

**>>> GATE 2.5: as seis decisões estão escritas? Se NÃO, PARA AQUI. Montar widget sem direção
é como escrever código sem briefing: sai alguma coisa, e ninguém sabe se é a certa. <<<**

---

### 3. Escolher o modo de dados

Ao concluir, execute `python3 ~/.claude/skills/criador-dash/scripts/gate-etapas.py --perfil dash --projeto ~/meu-dash registrar 3 --arquivo evidencias/etapa-3.json`.
Campos e evidências: `references/gate-etapas.md`. Saída diferente de zero bloqueia o avanço.
Explique e deixe a pessoa escolher (detalhe na seção "Os dois modos de dados"):
- AO VIVO: lê a fonte na hora, só KV pra config, setup mínimo. Bom pra maioria.
- HISTÓRICO: Worker cron tira snapshots no D1; dá histórico de verdade e não depende da fonte no ar. Mais setup.

### 4. Provisionar a infra DELA

Ao concluir, execute `python3 ~/.claude/skills/criador-dash/scripts/gate-etapas.py --perfil dash --projeto ~/meu-dash registrar 4 --arquivo evidencias/etapa-4.json`.
Campos e evidências: `references/gate-etapas.md`. Saída diferente de zero bloqueia o avanço.
Pergunte qual conta Cloudflare usar e siga `references/infra.md` na ordem (o passo do wrangler.toml é
BLOQUEANTE: rode `python3 ~/.claude/skills/criador-dash/scripts/preflight.py --starter-kit ~/meu-dash` antes do deploy):
- KV `DASHBOARDS_KV` (sempre) e `DASHBOARD_CACHE` (opcional).
- Modo histórico: D1 + `db/schema.sql` + Worker cron (`workers/snapshot/`).
- Projeto Pages + domínio customizado.
- `ADMIN_TOKEN` (OBRIGATÓRIO): mutação é fail-closed, sem o token ninguém cria/apaga dashboard.

### 5. Montar o dashboard

Ao concluir, execute `python3 ~/.claude/skills/criador-dash/scripts/gate-etapas.py --perfil dash --projeto ~/meu-dash registrar 5 --arquivo evidencias/etapa-5.json`.
Campos e evidências: `references/gate-etapas.md`. Saída diferente de zero bloqueia o avanço.
- Escolha o domínio pronto (Marketing, Vendas, Suporte, Financeiro, Estoque) ou crie um novo (`references/extensao.md`).
- Conecte a fonte: planilha (gviz CSV), upload CSV, Meta Ads (token; card só no domínio Marketing) ou
  conector sob medida.
- **Meta Ads: a pessoa gera o token DELA.** Antes de pedir o token, leia `references/token-meta-ads.md`
  e conduza a pessoa por ele, um passo por vez, esperando ela confirmar cada um (app, usuário do sistema
  com só leitura, atribuir a conta, gerar token com validade Nunca e `ads_read` + `read_insights`, pegar o
  ID da conta). Nunca use token seu, do operador ou de outra conta: o dash é da pessoa. Se der erro,
  a tabela "Se der erro" do mesmo arquivo diz o que é cada mensagem da Meta.
- Mapeie colunas (auto-mapeamento pré-preenche), defina branding (cor), meta opcional e senha opcional.
- No modo ao vivo a fonte fica na config; no histórico ela alimenta o cron e o dashboard lê o D1.


**5.1 GATE DO PRIMEIRO RENDER (o diretor de arte durante a construção).**

Monte a faixa de KPI e o PRIMEIRO widget. Pare. Renderize. Olhe. Só então monte o resto.

```bash
node ~/.claude/skills/criador-dash/scripts/prova-dash.js "<URL-local-ou-publicada>" --out prova-parcial
```

É o único momento em que corrigir é barato: a faixa define densidade, escala e ritmo, e todos
os outros widgets copiam esse padrão. A tabela de conferência (hierarquia, grid, cor, números,
densidade, estado vazio) está em `references/direcao-de-arte.md`, Fase 2.

Os componentes já existem no starter-kit (`public/assets/js/widgets/`): card de KPI, tabela,
filtro e aba são HTML puro, testados. O 21st.dev é opcional e não encaixa direto (é React), então
serve no máximo de referência visual. A **`animate`** entra para microinteração DEPOIS que o layout
estiver resolvido: movimento antes disso mascara layout ruim. Registre o uso (6.1).

**>>> GATE 5.1: o primeiro render corresponde à direção do 2.5? Se NÃO, corrija AGORA, antes de
montar o resto. Replicar padrão errado é o jeito mais caro de errar. <<<**


### 6. Deploy e verificação

Ao concluir, execute `python3 ~/.claude/skills/criador-dash/scripts/gate-etapas.py --perfil dash --projeto ~/meu-dash registrar 6 --arquivo evidencias/etapa-6.json`.
Campos e evidências: `references/gate-etapas.md`. Saída diferente de zero bloqueia o avanço.
- Publique na conta DA PESSOA (`wrangler pages deploy public --project-name=<NOME>`).
- Modo histórico: deploy do Worker cron e força uma primeira captura (`references/infra.md`).
- **PASSE DE GOSTO (antes de dizer pronto).** Rode o pré-voo anti-slop de novo sobre o painel
  publicado, nos DOIS temas: a lista de tells de painel em `references/direcao-de-arte.md`, Fase 3
  (card tingido, barrinha colorida no topo do widget, gradiente atrás de número, ícone colorido
  por métrica, sombra difusa sem hairline, "Sem dados" como único estado vazio, rótulo em caixa
  alta espaçada, número em fonte mono esticada). A `high-end-visual-design` é opcional, para o
  acabamento; a `design-taste-frontend` fica como leitura de apoio (fora de escopo pra painel).
  Registre os usos (6.1).
- **GATE de tela (bloqueia a entrega).** Rode contra o dashboard PUBLICADO, não contra o local:
```
node ~/.claude/skills/criador-dash/scripts/prova-dash.js "<URL-DO-DASHBOARD>" [--senha <SENHA>]
```
  Ele abre no navegador de verdade, autentica se precisar, espera os dados chegarem e reprova se
  QUALQUER card de KPI estiver com `-`, `—`, vazio, `NaN`, erro ou "Não mapeada", ou se algum
  request voltar 4xx/5xx. A saída diz qual card falhou. Card "Não mapeada" se resolve mapeando a
  coluna no wizard ou ocultando a métrica na configuração (`hiddenMetrics`, passo 5); nunca
  mostrando "0" no lugar.
  Grava `prova/dash-desktop.png` e `prova/dash-mobile.png`. **Saída diferente de zero = não está
  pronto**, e nenhuma explicação substitui rodar de novo verde.

  Isto existe porque a suíte tem centenas de testes e NENHUM olhava o dashboard: teste de lógica não
  vê painel publicado abrindo vazio, com "—" em todo card ou 500 no conector. Quem descobria era o
  cliente.

- **Depois de verde, OLHE os dois PNG.** O script prova que há número na tela, não que o número está
  certo nem que a tela está boa. Cheque KPIs, funil, tendência, a cor de marca e os DOIS temas.

### 6.1 GATE DE USO: ferramenta viva nao se pula

```bash
python3 ~/.claude/skills/criador-dash/scripts/uso-ferramentas.py --projeto ~/meu-dash checar
```

**A regra, e ela nao tem excecao:** toda ferramenta que o Passo 0 mediu como RESPONDENDO
precisa aparecer no registro de uso, com evidencia. Ferramenta que nao respondeu nao e cobrada,
porque ali a degradacao ja foi declarada. Nao existe terceira opcao. **"A prova de tela eu pulei"
com o Playwright vivo REPROVA a entrega.** (O 21st.dev é opcional e nunca é cobrado aqui.)

**Por que este gate e diferente do 0.0-PRE:** o Passo 0 garante que a ferramenta RESPONDE. Este
garante que ela foi USADA. Sao buracos distintos, e tapar so o primeiro nao resolve nada: da
pra ter o Playwright verde no verificador e o painel sair sem nenhuma prova de tela do mesmo
jeito. O resultado e identico ao da ferramenta morta, so que agora sem nem a desculpa.

**A evidencia nao e a sua palavra.** Cada registro aponta um artefato que o script confere de
novo na hora do gate: arquivo que precisa existir e ter tamanho, ou trecho que precisa ser
achado no codigo. Registro cujo artefato sumiu vale como nao registrado (o PNG da prova que
voce apagou depois: o gate pega).

Registre conforme for usando, nao no fim de memoria:

Cada comando vai inteiro, sem variável de atalho: no zsh (o terminal padrão do Mac) um
atalho guardado numa variável (`U="python3 ..."`) e chamado depois quebra com
`no such file or directory`, porque o zsh não divide a variável em palavras.

```bash
# artefato no disco
python3 ~/.claude/skills/criador-dash/scripts/uso-ferramentas.py --projeto ~/meu-dash registrar Playwright --arquivo prova/dash-desktop.png --detalhe "prova de tela lida"
python3 ~/.claude/skills/criador-dash/scripts/uso-ferramentas.py --projeto ~/meu-dash registrar "skill frontend-design" --arquivo evidencias/plano-visual.md --detalhe "plano visual antes do código"
```

**Nao se aplica a esta pagina? DISPENSE, com motivo, e o motivo vai na entrega:**

```bash
python3 ~/.claude/skills/criador-dash/scripts/uso-ferramentas.py --projeto ~/meu-dash dispensar "skill animate" --motivo "este painel nao tem serie temporal: o widget de tendencia nao entra"
```

Dispensa exige motivo de verdade (o script recusa "nao usei") e sai marcada no relatorio e no
bloco de entrega. A diferenca entre dispensar e pular e essa: **dispensa e uma decisao assinada
que o dono le; pulo e uma decisao escondida que ele descobre pelo resultado, meses depois.**


**O caminho muda o que e cobrado.** O mesmo vale aqui, e cobrar as mesmas
ferramentas em todos seria o mesmo erro de cobrar direcao de arte pra corrigir o nome de uma coluna:

```bash
# CRIAR, CLONAR e MELHORAR: cobra tudo que estiver vivo
python3 ~/.claude/skills/criador-dash/scripts/uso-ferramentas.py --projeto ~/meu-dash checar --caminho criar

# EDITAR (mudanca pontual): cobra so a PROVA do ponto alterado
python3 ~/.claude/skills/criador-dash/scripts/uso-ferramentas.py --projeto ~/meu-dash checar --caminho editar
```

Exigir passe de gosto pra trocar um rotulo nao melhora nada, e gate impossivel
de passar honestamente empurra pra dispensar tudo, que e como um gate deixa de valer.
**A regra que continua valendo na edicao:** se a MUDANCA pede a ferramenta (o pedido e "poe um
video no hero"), ela volta a ser cobrada e voce registra o uso normalmente.

**>>> GATE 6.1: `uso-ferramentas.py checar` saiu com codigo 0? Se NAO, volte e USE o que
esta faltando. Nenhuma explicacao substitui rodar de novo verde. <<<**

---

### 7. Encerramento

Ao concluir, execute `python3 ~/.claude/skills/criador-dash/scripts/gate-etapas.py --perfil dash --projeto ~/meu-dash registrar 7 --arquivo evidencias/etapa-7.json`.
Campos e evidências: `references/gate-etapas.md`. Saída diferente de zero bloqueia o avanço.
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
- FINANCEIRO: entradas, saídas, saldo (entradas menos saídas) e margem (saldo sobre entradas).
- ESTOQUE: faturamento, itens vendidos, em estoque, produtos ativos e giro (itens vendidos sobre estoque).
- Outro (ex: RH, Logística)? Crie conforme a operação da pessoa: `references/extensao.md`.

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
cd ~/meu-dash
npm test                       # suite completa (TDD)
npm run dev                    # local com Functions + KV (npx wrangler pages dev public)
```
Para o fluxo completo local (criar dashboard pelo wizard ou curl), crie `~/meu-dash/.dev.vars` com
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
