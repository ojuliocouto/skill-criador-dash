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
version: 3.7.2
author: Julio Couto
category: marketing-analytics
tags: [dashboard, marketing, vendas, suporte, financeiro, estoque, cloudflare-pages, functions, kv, d1, cron, workers, google-sheets, csv, meta-ads, guiado, no-code, roas, cpl, cpa, ticket-medio, giro]
---

# Criador Dash: Construtor Guiado de Dashboards

> Esta skill NÃO é um app que você entrega pronto: é um roteiro que VOCÊ (agente) conduz para
> construir, com a pessoa, o dashboard DELA, na conta Cloudflare DELA, a partir das peças testadas
> em `starter-kit/`. Placeholders ficam entre `<...>`. Nunca commite token, Account ID ou id real.

## Glossário (explique a palavra antes de mandar o comando)

Quem usa esta skill quase nunca viu estas palavras. Diga a frase de cada uma na primeira vez em
que ela aparecer:

- **Cloudflare Pages**: onde o dashboard fica hospedado, de graça. Abreviado como **Pages**.
- **wrangler**: a linha de comando do Cloudflare. É por ela que a gente cria e publica tudo.
- **KV**: um banco de dados simples, de chave e valor, onde ficam as configurações dos
  dashboards. "Namespace KV" é o nome de um desses bancos.
- **binding**: a ligação entre o código e um recurso do Cloudflare. É o nome (ex:
  `DASHBOARDS_KV`) pelo qual o código acha o banco KV, escrito no `wrangler.toml`.
- **secret**: uma variável guardada escondida no Cloudflare, que o código lê mas ninguém vê
  (ex: o `ADMIN_TOKEN`). Nunca vai no código nem no git.
- **D1**: o banco de dados SQL do Cloudflare. Só entra no modo histórico, pra guardar as fotos
  dos dados de cada dia.
- **Worker cron**: um programinha do Cloudflare que roda sozinho num horário marcado (ex: toda
  hora) e tira a foto dos dados pro D1. Só no modo histórico.
- **gviz CSV**: o jeito que o Google Sheets entrega uma planilha compartilhada como tabela. Com
  ele a pessoa só cola o link da planilha, sem login nem senha do Google.
- **fail-closed**: "na dúvida, bloqueia". Sem o `ADMIN_TOKEN` configurado, ninguém cria nem
  apaga dashboard, nem o dono. É de propósito: protege o painel de quem tem o link.

## Funciona em Windows, macOS e Linux

Esta skill roda nos três. Quem executa os comandos é você, o agente, então confira isto uma vez,
antes do Passo 0.

**1. Descubra o sistema.** Rode `node -p "process.platform"`: `win32` é Windows, `darwin` é macOS,
`linux` é Linux. Se o `node` nem existir, instale primeiro (tabela abaixo) e rode de novo.

**2. O que precisa estar instalado** (o Passo 0 confere e, se faltar, você conduz a instalação):

| | Windows | macOS | Linux (Debian/Ubuntu e Fedora) |
|---|---|---|---|
| **Node 22+** (traz o `npm`) | `winget install -e --id OpenJS.NodeJS.LTS` | `brew install node` ou o instalador em nodejs.org | instalador ou `nvm` (nodejs.org); os pacotes `apt install nodejs npm` e `dnf install nodejs` só servem se vierem na versão 22 ou maior |
| **Python 3.8+** | `winget install -e --id Python.Python.3.12` | `brew install python` ou o instalador em python.org | `sudo apt install python3` (Debian/Ubuntu), `sudo dnf install python3` (Fedora) |
| **Git e o Git Bash** | `winget install -e --id Git.Git` (traz o Git Bash) | já vem com as Ferramentas de Linha de Comando da Apple | `sudo apt install git` ou `sudo dnf install git` |

Sem `winget` (Windows antigo) ou sem `brew` (Mac): use os instaladores em nodejs.org, python.org e
git-scm.com. Depois de instalar qualquer coisa, abra um terminal NOVO, senão o PATH não atualiza.

**3. Windows: rode pelo Git Bash (ou pelo WSL).** Os comandos deste roteiro são de bash
(`cp -R`, `cd`, `curl` com aspas, `~/`). No PowerShell puro eles não funcionam como estão escritos.
Marque "Add python.exe to PATH" se instalar o Python pelo instalador gráfico.

**4. Python: use SEMPRE o lançador, nunca `python3` solto.** No Windows `python3`
quase nunca existe; no macOS e no Linux às vezes só existe ele. Por isso todo script desta skill roda assim:

```
node <dir-da-skill>/scripts/py.mjs <nome-do-script>.py <argumentos>
```

O `py.mjs` procura `python3`, depois `python`, depois `py -3`, confirma que é Python 3 de verdade e
liga o modo UTF-8 (sem ele o Windows quebra em palavra com acento). Para saber qual Python a
máquina tem: `node <dir-da-skill>/scripts/py.mjs --descobrir`. Se ele disser que não
achou, instale pela tabela acima e tente de novo.

**5. As diferenças que importam:**

- **Pasta com espaço ou acento** (`C:\Users\João Silva`): ponha o caminho entre aspas em todo comando.
- **Linux, Playwright:** se o Chromium abrir e fechar na hora, faltam bibliotecas do sistema. Rode
  `npx playwright install --with-deps chromium` (pede `sudo`).
- **Linux, `npm i -g`:** se der `EACCES` (sem permissão), não use `sudo npm`: rode
  `npm config set prefix ~/.npm-global` e ponha `~/.npm-global/bin` no PATH.
- **Variável de ambiente** (`CLOUDFLARE_API_TOKEN`): no Git Bash e no macOS/Linux é `unset NOME`;
  no PowerShell é `Remove-Item Env:NOME`.
- **Fim de linha do Windows (CRLF):** a suíte de testes dá o mesmo resultado com CRLF (conferido
  convertendo a cópia inteira), e a skill acompanha um `.gitattributes`. Nada a fazer.

## Pastas: onde fica cada coisa (defina antes do primeiro comando)

| Nome no roteiro | Caminho | O que é |
|---|---|---|
| `<dir-da-skill>` | a pasta onde está ESTE `SKILL.md` (você sabe qual é: a pasta de onde leu este arquivo; pode ser a pasta de skills de qualquer instalação do Claude Code, uma pasta com espaço ou acento, ou um clone do repositório) | o roteiro, os scripts e a biblioteca original. Só leitura: nunca trabalhe nem guarde dado de cliente aqui. |
| pasta do projeto | `~/meu-dash` | a CÓPIA do starter-kit que vira o dashboard da pessoa. Todo trabalho acontece aqui. |

**Todo comando deste roteiro funciona de qualquer pasta**, porque os scripts são chamados pelo caminho
completo: onde está escrito `<dir-da-skill>`, ponha o caminho real da pasta da skill. Se o caminho tiver
espaço ou acento (`C:/Users/João Silva/...`), ponha o caminho inteiro entre aspas duplas. Nenhum comando
depende de qual pasta está aberta no terminal. Não tem certeza do caminho? Rode, de qualquer pasta,

```
node <dir-da-skill>/scripts/py.mjs lancador.py --projeto ~/meu-dash
```

O `lancador.py` imprime todos os comandos do roteiro (checar ferramentas, preflight, gates, prova de tela, vídeo)
com o caminho completo já resolvido nesta máquina e entre aspas quando precisa. O `gate-etapas.py` faz o mesmo
quando manda rodar outro script. Copie dali em vez de remontar o caminho na mão.

A pasta do projeto nasce de um comando só, no passo 1. A pasta ainda não existe, então este comando vem ANTES
de qualquer outro que use `~/meu-dash`:

```bash
node <dir-da-skill>/scripts/py.mjs lancador.py iniciar ~/meu-dash
cd ~/meu-dash
```

O `iniciar` copia o `starter-kit` sem o cache do wrangler nem o `.dev.vars` (nada de conta ou segredo vai junto),
recusa pasta que já tem conteúdo e imprime o próximo comando. Faz o mesmo que
`cp -R <dir-da-skill>/starter-kit ~/meu-dash`, mas também funciona no Windows e com caminho de espaço ou acento.

Daí em diante, todo comando roda de dentro de `~/meu-dash`, e todo caminho relativo do roteiro
(`evidencias/`, `prova/`, `projetos/`, `.dev.vars`, `public/`) é relativo a ela. Os scripts da
skill são chamados pelo caminho completo (`node <dir-da-skill>/scripts/py.mjs <script>.py ...`, ver a seção anterior).
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
node <dir-da-skill>/scripts/py.mjs checar-ferramentas.py
```

O verificador não pergunta se a ferramenta está instalada: ele MANDA cada uma fazer alguma
coisa e confere se voltou. Sai com código diferente de zero quando falta algo crítico.

**Por que existe:** ferramenta configurada mas morta cai em fallback silencioso, que não reclama:
a qualidade cai sem ninguém perceber e o sintoma só aparece no resultado, meses depois.

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
| **Node 22+** | o wrangler 4.x não roda em versão mais velha; com Node 18/20 nem os testes nem o deploy funcionam | Instale pela tabela da seção "Funciona em Windows, macOS e Linux" (Windows `winget install -e --id OpenJS.NodeJS.LTS`, macOS `brew install node`, Linux o instalador de nodejs.org ou `nvm`). Confira com `node -v`. |
| **wrangler** | publicar no Cloudflare (Pages, KV, D1) | `npm i -g wrangler`. Se o comando não for achado depois de instalar, o bin global do npm não está no PATH (`npm prefix -g` mostra a pasta). |
| **Login Cloudflare** | é a conta DA PESSOA que recebe o dashboard | `wrangler login`, depois `wrangler whoami` pra confirmar a conta. **Um `CLOUDFLARE_API_TOKEN` exportado no shell SOBREPÕE o login e pode publicar na conta errada:** o verificador denuncia; se for indevido, tire a variável (Git Bash, macOS e Linux: `unset CLOUDFLARE_API_TOKEN`; PowerShell: `Remove-Item Env:CLOUDFLARE_API_TOKEN`). |
| **Peças do starter-kit** | é a biblioteca testada de onde o dashboard é montado | o verificador roda o `npm test` sozinho. Peça quebrada (`npm run test:biblioteca` vermelho) não vira dashboard de ninguém: conserte antes. |
| **Playwright** | prova de tela: abre o dashboard publicado e confere que ele mostra número | `npm i -g playwright && npx playwright install chromium` (~265 MB; a versão leve é `--only-shell`, ~94 MB). No Linux, se o navegador não abrir: `npx playwright install --with-deps chromium`. |
| **magic (21st.dev), opcional** | inspiração de componente; nunca bloqueia o passo 0 | O código do componente é pago e vem em React + Tailwind, e o starter-kit é HTML montado em string: não encaixa direto. Aluno sem chave pula e segue. Quem já tem a chave pode usar só como referência visual. |
| **skill frontend-design** (obrigatória) | plano visual do painel antes do código (passo 2.5) | `npx -y skills add anthropics/skills --skill frontend-design --agent claude-code -g -y --copy` |
| **skill design-taste-frontend** (opcional, só leitura de apoio) | ela se declara fora de escopo pra dashboard; serve de apoio pra tipografia e hierarquia | `npx skills add Leonxlnx/taste-skill -g -y --copy` |
| **skills de acabamento (opcionais)** | acabamento e microinteração | `high-end-visual-design`, `animate` |

**Regra que nasceu daqui, e vale pra qualquer ferramenta que esta skill venha a usar:** toda
dependência nova entra no `checar-ferramentas.py` com um teste que a EXERCITA. Se você não
conseguir escrever esse teste, a dependência não entra na skill: sem teste, ela morre em
silêncio e degrada o resultado sem avisar ninguém.

O `scripts/preflight.py` continua existindo e é complementar: ele valida o ambiente no passo 1 e,
com `--antes-do-deploy`, o `wrangler.toml`, o `.dev.vars` e o projeto ANTES do deploy. O `checar-ferramentas.py` é antes de tudo; o
`preflight.py` é antes de publicar.

---

### 1. Onboarding e checklist

Ao concluir, execute `node <dir-da-skill>/scripts/py.mjs gate-etapas.py --perfil dash --projeto ~/meu-dash registrar 1 --arquivo evidencias/etapa-1.json`.
Campos e evidências: `references/gate-etapas.md`. Saída diferente de zero bloqueia o avanço.
Nunca presuma que a pessoa leu o README. Explique em 3 frases:
- "Eu vou construir com você o seu dashboard, na sua conta Cloudflare, do jeito da sua operação."
- Não é um produto fechado de um nicho: adaptamos domínio, métricas e fonte a você.
- No fim, o dashboard fica publicado num domínio seu, e você é o dono do código e da infra.

Explique em uma frase cada palavra técnica antes de mandar comando (a pessoa pode nunca ter usado):
as frases prontas estão no Glossário, no topo deste roteiro.

**Primeiro a pasta, depois o preflight.** A pasta do projeto ainda não existe (ela nasce aqui, ver a seção
"Pastas"), então o primeiro comando do passo é o que a cria. É nela que ficam `evidencias/` (dos gates),
`.dev.vars` e o dashboard da pessoa:
```
node <dir-da-skill>/scripts/py.mjs lancador.py iniciar ~/meu-dash
cd ~/meu-dash
```
Se já criou no Passo 0 por causa de alguma ferramenta, não repita: o `iniciar` recusa pasta com conteúdo.

Agora rode o preflight, que checa o ambiente de uma vez e diz o que falta:
```
node <dir-da-skill>/scripts/py.mjs preflight.py --starter-kit ~/meu-dash
```
(Se rodar o preflight antes de criar a pasta, ele não quebra: confere só o ambiente e imprime o comando que cria a pasta.)

**Os avisos que o preflight pode dar, e o que cada um significa** (explique à pessoa antes de ela ver):
- **`CLOUDFLARE_API_TOKEN exportado no shell`**: é uma chave de acesso guardada numa variável do terminal. Ela
  SOBREPÕE o `wrangler login` e pode apontar para outra conta que não a da pessoa (o deploy sairia na conta errada).
  Se a pessoa não a colocou ali de propósito, tire: `unset CLOUDFLARE_API_TOKEN` (Git Bash, macOS e Linux) ou
  `Remove-Item Env:CLOUDFLARE_API_TOKEN` (PowerShell), e confira com `wrangler whoami`. Se foi de propósito (token
  da conta certa), siga e registre isso na etapa 4.
- **`porta 8788 ocupada`**: a 8788 é a porta onde o `npm run dev` abre o dashboard no computador. Se outro programa
  já usa essa porta (um `npm run dev` antigo, outra ferramenta), o dev para com `Address already in use`. O aviso já
  diz a primeira porta livre; para descobrir outra a qualquer hora: `node <dir-da-skill>/scripts/py.mjs lancador.py porta-livre`.
  Não chute 8789 ou 8790: são as vizinhas que costumam estar ocupadas também.
- **placeholder no `wrangler.toml`**: veja logo abaixo.

Neste passo, o aviso de placeholder no `wrangler.toml` é esperado até o passo 4
(`<SEU_KV_NAMESPACE_ID>`): a pessoa ainda não criou KV nenhum. Ele não bloqueia agora; vira bloqueio só quando o
preflight roda com `--antes-do-deploy`, no passo 4.
Checklist (um item por vez; se faltar algo, resolva antes de seguir):
- [ ] Conta no Cloudflare? (plano grátis cobre Pages + Functions + KV; D1 tem free tier). Senão: dash.cloudflare.com.
      Ainda sem conta? Não trava: dá para construir e provar o dashboard inteiro no computador (modo local,
      veja o quadro dentro do passo 4). Só a publicação espera a conta.
- [ ] Node 22 ou mais novo instalado? (`node -v`). O wrangler atual exige Node 22+; com uma versão mais
      velha (18, 20) ele nem roda os testes nem faz o deploy. Sem Node instalado, nada funciona.
- [ ] wrangler disponível? `npm i -g wrangler` (a versão atual, 4.x, é a que exige Node 22+ acima). Se
      `wrangler` não for achado depois de instalar, o bin global do npm não está no PATH (`npm prefix -g`
      mostra a pasta; adicione ao PATH, que é melhor do que apelar pra sudo). O `npm run dev` usa
      `npx wrangler`, então funciona mesmo sem global.
- [ ] Login: `wrangler login`. ATENÇÃO: um `CLOUDFLARE_API_TOKEN` exportado no shell SOBREPÕE o login e
      pode apontar pra outra conta (o preflight avisa); se indevido, `unset CLOUDFLARE_API_TOKEN`.
- [ ] Conta certa? `wrangler whoami` (mostra email e Account ID). Errada: `wrangler logout` e login de novo.

#### Quickstart (primeira vez, só no seu computador)

Antes de tocar na conta Cloudflare real, rode isto com a pessoa, um passo por vez, pra ela ver um
dashboard funcionando no próprio computador em poucos minutos. Isso separa "ambiente funciona" de
"infra provisionada": se algo falhar depois, você já sabe que não é o Node, o wrangler nem o
wizard, é o provisionamento.

1. Crie a pasta do projeto e entre nela (se o passo 1 já criou, só entre nela):
   ```bash
   node <dir-da-skill>/scripts/py.mjs lancador.py iniciar ~/meu-dash
   cd ~/meu-dash
   ```
2. Confira o ambiente. Não existe `npm install` (o kit não tem dependência), então isto já prova
   que Node e npm funcionam. Tudo tem que sair verde:
   ```bash
   npm test
   ```
3. Crie o arquivo do token local. Criar dashboard é bloqueado até no seu computador (modelo
   fail-closed), então este passo não é opcional. Escolha qualquer valor, ele só vale aqui e o
   arquivo nunca vai pro git:
   ```bash
   echo "ADMIN_TOKEN=token-local-de-teste" > .dev.vars
   ```
4. Suba o servidor local. A porta padrão é a 8788; o preflight já avisou se ela está ocupada. Para ter
   certeza antes de subir, peça uma livre e use-a no lugar do 8788 em todos os endereços:
   ```bash
   node <dir-da-skill>/scripts/py.mjs lancador.py porta-livre
   npm run dev -- --port 8788
   ```
   (troque 8788 pelo número que o primeiro comando imprimiu, se for outro).
5. Abra `http://localhost:8788/config.html` no navegador e siga os 4 passos do wizard: escolha o
   domínio (Marketing), suba o arquivo de exemplo `examples/marketing-exemplo.csv` (ou a planilha
   da pessoa), confira as colunas, dê um nome e uma cor. Ao salvar, o wizard pede o token de
   administrador: cole o mesmo valor do `.dev.vars`.
6. Pronto: o primeiro dashboard está rodando local. O deploy na conta da pessoa vem no passo 4.

**Porta ocupada.** Se o `npm run dev` responder `Address already in use (127.0.0.1:8788)`, já tem
outro servidor usando a porta 8788 (talvez um `npm run dev` antigo aberto em outra janela). Não adivinhe outra:
rode `node <dir-da-skill>/scripts/py.mjs lancador.py porta-livre` (ele imprime a primeira livre, ex.: 8841) e
suba com `npm run dev -- --port 8841`, trocando 8788 por 8841 em todos os endereços
(`http://localhost:8841/config.html`). Não mate o processo da porta ocupada: pode ser de outra tarefa da pessoa.

### 2. Descoberta da operação

Ao concluir, execute `node <dir-da-skill>/scripts/py.mjs gate-etapas.py --perfil dash --projeto ~/meu-dash registrar 2 --arquivo evidencias/etapa-2.json`.
Campos e evidências: `references/gate-etapas.md`. Saída diferente de zero bloqueia o avanço.
- Que área medir: Marketing, Vendas, Suporte, ou mais de uma (um dashboard por área; junte num grupo com abas).
- Onde os dados vivem: planilha, CRM, Meta Ads, WhatsApp, sistema com API etc.
- O que ela precisa DECIDIR olhando o dashboard (isso define quais métricas importam).

### 2.5 DIREÇÃO DO PAINEL (antes de montar qualquer widget)

Ao concluir, execute `node <dir-da-skill>/scripts/py.mjs gate-etapas.py --perfil dash --projeto ~/meu-dash registrar 2.5 --arquivo evidencias/etapa-2.5.json`.
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

1. **Número herói**: se ela só pudesse ver UM número por dia, qual seria? Entra no wizard, passo
   Finalizar, no seletor "Número herói", e fica gravado na config DESTE dashboard como
   `heroMetric` (ex: `"CPA"`). O layout transforma isso no card maior, com sparkline, inclusive
   quando o herói é derivado (CPA, ROAS: a série é a mesma conta feita dia a dia).
2. **A pergunta do painel**: que decisão ela toma olhando isso? "Aumento a verba do Instagram?"
   é pergunta. "Acompanhar o marketing" não é, e painel sem pergunta vira lista de números.
3. **O que NÃO entra**: métrica que ninguém usa pra decidir rouba espaço da que importa. Entra
   no wizard, passo Finalizar, em "Métricas que não entram", e fica na config como
   `hiddenMetrics` (ex: `["CTR"]`): some da faixa de números e do funil deste dashboard.
4. **Accent da marca**: a cor real do negócio dela. O roxo padrão é só pra quem não tem marca.
5. **Densidade**: acompanhamento diário (denso) ou leitura semanal (menos widgets, mais respiro)?
6. **Tema**: claro, escuro ou os dois. Se os dois, os dois são conferidos no gate.

Com as respostas na mão, rode a skill **`frontend-design`**: ela fecha a direção estética.
Registre o uso (`uso-ferramentas.py registrar "skill frontend-design" ...`, ver 6.1).

**>>> GATE 2.5: as seis decisões estão escritas? Se NÃO, PARA AQUI. Montar widget sem direção
é como escrever código sem briefing: sai alguma coisa, e ninguém sabe se é a certa. <<<**

---

### 3. Escolher o modo de dados

Ao concluir, execute `node <dir-da-skill>/scripts/py.mjs gate-etapas.py --perfil dash --projeto ~/meu-dash registrar 3 --arquivo evidencias/etapa-3.json`.
Campos e evidências: `references/gate-etapas.md`. Saída diferente de zero bloqueia o avanço.
Explique e deixe a pessoa escolher (detalhe na seção "Os dois modos de dados"):
- AO VIVO: lê a fonte na hora, só KV pra config, setup mínimo. Bom pra maioria.
- HISTÓRICO: Worker cron tira snapshots no D1; dá histórico de verdade e não depende da fonte no ar. Mais setup.

### 4. Provisionar a infra DELA

Ao concluir, execute `node <dir-da-skill>/scripts/py.mjs gate-etapas.py --perfil dash --projeto ~/meu-dash registrar 4 --arquivo evidencias/etapa-4.json`.
Campos e evidências: `references/gate-etapas.md`. Saída diferente de zero bloqueia o avanço.
Pergunte qual conta Cloudflare usar e siga `references/infra.md` na ordem (o passo do wrangler.toml é
BLOQUEANTE: rode `node <dir-da-skill>/scripts/py.mjs preflight.py --starter-kit ~/meu-dash --antes-do-deploy` antes do deploy):
- KV `DASHBOARDS_KV` (sempre) e `DASHBOARD_CACHE` (opcional).
- Modo histórico: D1 + `db/schema.sql` + Worker cron (`workers/snapshot/`).
- Projeto Pages + domínio customizado.
- `ADMIN_TOKEN` (OBRIGATÓRIO): mutação é fail-closed, sem o token ninguém cria/apaga dashboard.

#### Sem conta Cloudflare: o que fecha e o que espera

A pessoa pode querer ver o dashboard funcionando no computador antes de ter (ou de criar) a conta. Isso é
legítimo e não pode travar o roteiro. O gate separa as etapas em duas famílias:

| Família | Etapas | Precisa de conta? |
|---|---|---|
| Construção e prova em local | 1, 2, 2.5, 3, 5 (e o quickstart) | Não. O dash roda com `npm run dev`, o KV fica em disco, a prova de tela (`prova-dash.js`) aponta para `http://localhost:<porta>`. |
| Publicação | 4 e 6 | Sim. A 4 provisiona KV, Pages e `ADMIN_TOKEN` na conta DELA; a 6 só fecha com a URL `https://` publicada. |
| Encerramento | 7 | Fecha em local, mas declara que NÃO foi publicado. |

Sem conta, registre a etapa 4 assim (a pasta `evidencias/` e o resto seguem como em `references/gate-etapas.md`):

```json
{
  "modo": "local",
  "conta_confirmada": "Não: a pessoa ainda não tem conta Cloudflare",
  "infra": "local: wrangler pages dev com KV em disco; nada provisionado na Cloudflare",
  "publicacao_pendente": "Publicar quando a pessoa criar a conta: refazer a etapa 4 e fazer a 6",
  "arquivos": ["evidencias/decisao-local.md"]
}
```

Daí a etapa 5 (montar e provar em local) e a 7 (encerramento) registram normalmente, e o gate imprime
`MODO LOCAL ... NÃO publicado` a cada passada. A etapa 6 recusa: não existe publicação falsa, e `"Não"` em
`conta_confirmada` sem o `"modo": "local"` continua bloqueando a etapa 4. Quando a conta existir, refaça a etapa 4 de
verdade (sem o campo `modo`; isso invalida as seguintes), siga para o 5.1 de novo se mudou algo e faça a 6.
Na entrega ao dono, diga com todas as letras: "construído e provado em local, não publicado".

### 5. Montar o dashboard

Ao concluir, execute `node <dir-da-skill>/scripts/py.mjs gate-etapas.py --perfil dash --projeto ~/meu-dash registrar 5 --arquivo evidencias/etapa-5.json`.
Campos e evidências: `references/gate-etapas.md`. Saída diferente de zero bloqueia o avanço.
- Escolha o domínio pronto (Marketing, Vendas, Suporte, Financeiro, Estoque) ou crie um novo (`references/extensao.md`).
- Conecte a fonte: planilha (gviz CSV), upload CSV, Meta Ads (token; card só no domínio Marketing) ou
  conector sob medida.
- **Meta Ads: a pessoa gera o token DELA.** Antes de pedir o token, leia `references/token-meta-ads.md`
  e conduza a pessoa por ele, um passo por vez, esperando ela confirmar cada um (app, usuário do sistema
  com só leitura, atribuir a conta, gerar token com validade Nunca e `ads_read` + `read_insights`, pegar o
  ID da conta). Nunca use token seu, do operador ou de outra conta: o dash é da pessoa. Se der erro,
  a tabela "Se der erro" do mesmo arquivo diz o que é cada mensagem da Meta.
- Mapeie colunas (auto-mapeamento pré-preenche), defina branding (cor), o número herói e as métricas
  que não entram (as decisões 1 e 3 do 2.5), meta opcional e senha opcional.
- No modo ao vivo a fonte fica na config; no histórico ela alimenta o cron e o dashboard lê o D1.


**5.1 GATE DO PRIMEIRO RENDER (o diretor de arte durante a construção).**

Crie o dashboard pelo wizard (ele monta o painel inteiro de uma vez), renderize e compare com as
seis decisões do 2.5 antes de qualquer outra coisa.

**Personalizar NÃO é editar o template.** O herói e as métricas que não entram vão na config do
dashboard (`heroMetric` e `hiddenMetrics`, pelo wizard ou no JSON do POST). O arquivo
`public/assets/js/templates/<dominio>.js` é a biblioteca, compartilhada por todo dashboard daquele
domínio: editar ele à mão muda o painel de todo mundo e quebra os testes do layout padrão.
Pra corrigir na hora, clique em "Reconfigurar", ajuste no passo Finalizar e salve.

**Os testes têm duas partes, e personalizar não derruba nenhuma.** `npm test` roda as duas:
- `npm run test:biblioteca` (`test/*.test.js`): conectores, métricas, widgets, wizard. Usa fixtures
  próprias e não depende do layout de fábrica. Ficou vermelho? É peça quebrada: conserte antes.
- `npm run test:layout` (`test/layout-padrao/`): confere só o layout de fábrica de cada domínio.
  Como a personalização da pessoa mora na config (`heroMetric`, `hiddenMetrics`), ela não toca
  nesse teste. Ele só acusa se alguém editar `templates/<dominio>.js` à mão; aí é decisão de
  mudar o padrão pra todo mundo, e o teste do layout é atualizado junto, de propósito.

```bash
node <dir-da-skill>/scripts/prova-dash.js "<URL-local-ou-publicada>" --out prova-parcial
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

Ao concluir, execute `node <dir-da-skill>/scripts/py.mjs gate-etapas.py --perfil dash --projeto ~/meu-dash registrar 6 --arquivo evidencias/etapa-6.json`.
Campos e evidências: `references/gate-etapas.md`. Saída diferente de zero bloqueia o avanço.
- Publique na conta DA PESSOA (`wrangler pages deploy public --project-name=<NOME>`).
- O gate da etapa 6 só fecha com a URL `https://` publicada em `prova_publicada` e o PNG do
  `prova-dash.js` em `arquivos`. "Não publicada" ou `http://localhost` não passam: sem deploy
  na conta da pessoa, a entrega não está pronta (e o gate da etapa 4 já barra "Não" em
  `conta_confirmada`).
- Modo histórico: deploy do Worker cron e força uma primeira captura (`references/infra.md`).
- **PASSE DE GOSTO (antes de dizer pronto), medido.** Rode, contra o painel PUBLICADO:
```
node <dir-da-skill>/scripts/passe-de-gosto.js "<URL-DO-DASHBOARD>" --out evidencias [--senha <SENHA>]
```
  Ele mede no navegador os 10 sinais da lista abaixo que dá para medir (cada aba, claro e escuro, desktop e celular), grava
  `evidencias/passe-de-gosto-medido.json` e os prints `passe-<tema>-<perfil>.png`, e sai com 1 se mediu algum. O gate da
  etapa 6 lê o arquivo: declarar `depois: 0` com sinal medido na tela é recusado. O que é gosto (cor como enfeite, o painel
  inteiro olhado em cada tema) o script não finge medir: olhe os prints e registre cada item com o print e o que viu
  (`references/gate-etapas.md`). Depois rode o pré-voo anti-slop de novo sobre o painel
  publicado, nos DOIS temas: a lista de tells de painel em `references/direcao-de-arte.md`, Fase 3
  (card tingido, barrinha colorida no topo do widget, gradiente atrás de número, ícone colorido
  por métrica, sombra difusa sem hairline, "Sem dados" como único estado vazio, rótulo em caixa
  alta espaçada, número em fonte mono esticada). A `high-end-visual-design` é opcional, para o
  acabamento; a `design-taste-frontend` fica como leitura de apoio (fora de escopo pra painel).
  Registre os usos (6.1).
- **GATE de tela (bloqueia a entrega).** Rode contra o dashboard PUBLICADO, não contra o local:
```
node <dir-da-skill>/scripts/prova-dash.js "<URL-DO-DASHBOARD>" [--senha <SENHA>]
```
  Ele abre no navegador de verdade, autentica se precisar, espera os dados chegarem e reprova se
  QUALQUER card de KPI estiver com hífen, travessão, vazio, `NaN`, erro ou "Não mapeada", ou se algum
  request voltar 4xx/5xx. A saída diz qual card falhou. Card "Não mapeada" se resolve mapeando a
  coluna no wizard ou ocultando a métrica na configuração (`hiddenMetrics`, passo 5); nunca
  mostrando "0" no lugar.
  Grava `prova/dash-desktop.png` e `prova/dash-mobile.png`. **Saída diferente de zero = não está
  pronto**, e nenhuma explicação substitui rodar de novo verde.

  Isto existe porque a suíte tem centenas de testes e NENHUM olhava o dashboard: teste de lógica não
  vê painel publicado abrindo vazio, com um traço em todo card ou 500 no conector. Quem descobria era o
  cliente.

- **Depois de verde, OLHE os dois PNG.** O script prova que há número na tela, não que o número está
  certo nem que a tela está boa. Cheque KPIs, funil, tendência, a cor de marca e os DOIS temas.

- **VÍDEO DE PROVA (bloqueia o registro da etapa 6).** Movimento não se julga em imagem parada. Toda
  entrega traz um vídeo de 10 a 15 s do painel publicado (abrir, trocar de aba, filtrar), no desktop
  (1440x900) e no celular (390x844):
```
node <dir-da-skill>/scripts/gravar-video.js "<URL-DO-DASHBOARD>" --saida prova [--senha <SENHA>]
```
  Usa a gravação nativa do Playwright (o mesmo navegador de teste do `prova-dash.js`): sem ffmpeg seu e
  sem ferramenta só de Mac, e a pasta de saída pode ter espaço e acento. O roteiro é
  `scripts/roteiro-padrao.json` (abrir, esperar, trocar dois atalhos de período, clicar nas abas passando o mouse
  no gráfico, escolher no filtro, rolar): serve ao painel de fábrica sem editar nada, e o que não existir no
  seu painel (atalhos, abas, gráfico, filtro) é pulado.
  O roteiro padrão mostra, nesta ordem e tudo opcional: dois atalhos de período (roleta e gráfico que se
  transforma), a aba Evolução com o mouse no gráfico, a aba Dados com a tabela ordenada duas vezes e o filtro.
  **Dois roteiros oficiais** (3.7.1): `--roteiro padrao` (o de sempre, serve a toda entrega) e `--roteiro efeitos`
  (meta batida, gráfico que responde e o filtro Personalizado com datas digitadas; a ação `cruzar_meta` procura o
  par de atalhos que leva a meta de não batida a batida e, se o painel não tem meta ou nenhum par cruza, pula e diz
  por quê). Use o padrão para a prova de entrega e o de efeitos quando a pessoa quiser ver o movimento. O cartão que
  vira a tela só existe saindo da lista de painéis: grave a lista com um roteiro próprio.
  Roteiro próprio: `--roteiro meu-roteiro.json` (ações em `scripts/video/roteiro.cjs`, incluindo `digitar` para
  preencher campo). Grava
  `prova/video-desktop.webm` e `prova/video-mobile.webm` (WebM, cerca de 1 MB cada) e, porque quem revisa
  lê imagem e não vídeo, uma PRANCHA de 6 quadros tirados durante o mesmo roteiro:
  `prova/prancha-desktop.png`, `prova/prancha-mobile.png` e os PNG soltos em `prova/quadros/`.
  **Leia as duas pranchas** (há número no painel? a aba trocou? o filtro mudou os números?). Os primeiros
  segundos do vídeo podem estar em branco enquanto a página carrega: é o carregamento, não defeito.
  O gravador espera o NÚMERO de verdade (até 45 s; o esqueleto de carregamento não conta), conta em cada quadro os indicadores com
  dígito visíveis e guarda isso no `video-info.json`; sem número em nenhum quadro, ele sai com código diferente de zero ("a gravação não vale") e o
  gate da etapa 6 lê o mesmo arquivo. Grave sempre depois de o dash carregar (logo após um deploy a primeira carga pode demorar).
  Liste os dois vídeos em `arquivos` da etapa 6: **sem eles o `gate-etapas.py` recusa o registro.**

### 6.1 GATE DE USO: ferramenta viva não se pula

```bash
node <dir-da-skill>/scripts/py.mjs uso-ferramentas.py --projeto ~/meu-dash checar
```

**A regra, e ela não tem exceção:** toda ferramenta que o Passo 0 mediu como RESPONDENDO
precisa aparecer no registro de uso, com evidência. Ferramenta que não respondeu não é cobrada,
porque ali a degradação já foi declarada. Não existe terceira opção. **"A prova de tela eu pulei"
com o Playwright vivo REPROVA a entrega.** (O 21st.dev é opcional e nunca é cobrado aqui.)

**Por que este gate é diferente do Passo 0:** o Passo 0 garante que a ferramenta RESPONDE. Este
garante que ela foi USADA. São buracos distintos, e tapar só o primeiro não resolve nada: dá
pra ter o Playwright verde no verificador e o painel sair sem nenhuma prova de tela do mesmo
jeito. O resultado é idêntico ao da ferramenta morta, só que agora sem nem a desculpa.

**A evidência não é a sua palavra.** Cada registro aponta um artefato que o script confere de
novo na hora do gate: arquivo que precisa existir e ter tamanho, ou trecho que precisa ser
achado no código. Registro cujo artefato sumiu vale como não registrado (o PNG da prova que
você apagou depois: o gate pega).

Registre conforme for usando, não no fim de memória.

Cada comando vai inteiro, sem variável de atalho: no zsh (o terminal padrão do Mac) um
atalho guardado numa variável (`U="node ... py.mjs ..."`) e chamado depois quebra com
`no such file or directory`, porque o zsh não divide a variável em palavras.

```bash
# artefato no disco
node <dir-da-skill>/scripts/py.mjs uso-ferramentas.py --projeto ~/meu-dash registrar Playwright --arquivo prova/dash-desktop.png --detalhe "prova de tela lida"
node <dir-da-skill>/scripts/py.mjs uso-ferramentas.py --projeto ~/meu-dash registrar "skill frontend-design" --arquivo evidencias/plano-visual.md --detalhe "plano visual antes do código"
```

**Não se aplica a este painel? DISPENSE, com motivo, e o motivo vai na entrega:**

```bash
node <dir-da-skill>/scripts/py.mjs uso-ferramentas.py --projeto ~/meu-dash dispensar "skill animate" --motivo "este painel não tem série temporal: o widget de tendência não entra"
```

Dispensa exige motivo de verdade (o script recusa "não usei") e sai marcada no relatório e no
bloco de entrega. A diferença entre dispensar e pular é essa: **dispensa é uma decisão assinada
que o dono lê; pulo é uma decisão escondida que ele descobre pelo resultado, meses depois.**

**O caminho muda o que é cobrado.** Cobrar as mesmas ferramentas em todo caminho seria o mesmo
erro de cobrar direção de arte pra corrigir o nome de uma coluna:

```bash
# CRIAR, CLONAR e MELHORAR: cobra tudo que estiver vivo
node <dir-da-skill>/scripts/py.mjs uso-ferramentas.py --projeto ~/meu-dash checar --caminho criar

# EDITAR (mudança pontual): cobra só a PROVA do ponto alterado
node <dir-da-skill>/scripts/py.mjs uso-ferramentas.py --projeto ~/meu-dash checar --caminho editar
```

Exigir passe de gosto pra trocar um rótulo não melhora nada, e gate impossível de passar
honestamente empurra pra dispensar tudo, que é como um gate deixa de valer.
**A regra que continua valendo na edição:** se a MUDANÇA pede a ferramenta (o pedido é "põe um
gráfico de tendência"), ela volta a ser cobrada e você registra o uso normalmente.

**>>> GATE 6.1: `uso-ferramentas.py checar` saiu com código 0? Se NÃO, volte e USE o que
está faltando. Nenhuma explicação substitui rodar de novo verde. <<<**

---

### 7. Encerramento

Ao concluir, execute `node <dir-da-skill>/scripts/py.mjs gate-etapas.py --perfil dash --projeto ~/meu-dash registrar 7 --arquivo evidencias/etapa-7.json`.
Campos e evidências: `references/gate-etapas.md`. Saída diferente de zero bloqueia o avanço.
Salve o contexto do projeto da pessoa em `~/meu-dash/projetos/YYYYMMDD-descricao.md` (crie a
pasta com `mkdir -p ~/meu-dash/projetos`). Ela fica de fora do git pelo `~/meu-dash/.gitignore`,
que veio junto na cópia do starter-kit, de propósito: é contexto privado do cliente. Conteúdo: projeto Pages,
domínio, modo de dados, fontes, decisões. Nunca coloque token, Account ID ou id real: use placeholders.

## A caixa de peças (biblioteca provada em `starter-kit/`)

Código real e testado (500+ testes verdes, TDD; `npm test` mostra a contagem atual). Você compõe a
partir daqui. Arquitetura em 3 camadas desacopladas (contratos completos em `starter-kit/ARCHITECTURE.md`):
1. CONECTORES: buscam dados de uma fonte e devolvem um `DataSet` (schema comum tabular). Não sabem de métricas.
2. WIDGETS: blocos visuais puros (KPI, série temporal, funil, tabela, ranking, `resumo` e `meta`). Recebem dados já calculados.
   - `resumo`: tabela agrupada por dimensão (ex. canal) ou por período (dia, semana, mês) com linha de
     TOTAL. Cada linha e o total são recalculados pelo motor de métricas, nunca soma nem média de taxa.
   - `meta`: calculadora de meta. A pessoa digita a meta de conversões e vê investimento, leads e
     receita necessários, pelas médias do período filtrado.
3. TEMPLATES DE DOMÍNIO: slots semânticos, métricas e layout de widgets de cada domínio. O template
   pode declarar `tabs: [{ id, label, layout }]` para dividir o painel em abas (a aba ativa vai pro
   hash da URL e sobrevive ao filtro); sem `tabs`, vale o `layout` plano.

```
Fonte -> Conector -> DataSet (schema comum) -> Template -> Widgets -> Render
```

Conectores prontos: Google Sheets via gviz CSV (carro-chefe: a pessoa só cola o link compartilhado,
sem OAuth), upload de CSV (fallback universal), Meta Ads (Graph API, token só no servidor), D1 (modo
histórico) e sob medida (Contrato 2) pra qualquer outra fonte.

Domínios prontos (métricas e layout por domínio):
- MARKETING: investimento, impressões, cliques, leads, conversões, receita; derivadas CTR, CPC, CPL, CPA, ROAS.
  Já sai em 5 abas: Visão geral (indicadores, resultado por canal com total, calculadora de meta),
  Canais, Evolução (resultado por semana e gráficos por dia), Funil (taxa de passagem por canal) e Dados.
- VENDAS: negócios, vendas ganhas, faturamento (só das ganhas; sem coluna de status, todas contam),
  ticket médio, taxa de conversão.
- SUPORTE: atendimentos, resolvidos, taxa de resolução, tempo de resposta (média), CSAT (média).
- FINANCEIRO: entradas, saídas, saldo (entradas menos saídas) e margem (saldo sobre entradas).
- ESTOQUE: faturamento, itens vendidos, em estoque, produtos ativos e giro (itens vendidos sobre estoque).
- Outro (ex: RH, Logística)? Crie conforme a operação da pessoa: `references/extensao.md`.

Recursos inclusos (detalhes e código em `references/recursos.md`): tendência por período nos KPIs,
meta vs realizado, grid 2D no desktop (`col` 3..8), filtros client-side por período e dimensão,
dashboard-grupo com abas (`kind:'group'`), tema claro/escuro, estética de ferramenta premium
(Geist self-hosted, número com algarismo tabular, rótulo em caixa normal, painel hairline, sem gradiente) e preview de link OpenGraph por dashboard.
Segurança (fail-closed, senha PBKDF2, validação de fonte no POST): `references/seguranca.md`.

O assistente de criação (`/config`) é guiado em quatro perguntas, em palavra comum:
1. "O que você quer acompanhar?": cada área lista os números e as abas ou blocos que o painel traz
   (lidos do template). A chave de administrador é pedida aqui, antes de a pessoa preencher qualquer
   coisa (`POST /api/admin-check` confere sem mutar nada, com limite de tentativas por IP).
2. "Onde estão os seus números?": uma origem por vez (planilha do Google, CSV ou Meta Ads), as colunas
   que a planilha precisa ter, planilha modelo pra baixar (`public/modelos/`) e, depois de conectar, o
   número de linhas, o período detectado e as 3 primeiras linhas.
3. "Confira as colunas": placar ("Encontramos 8 de 8"), exemplos de valor por coluna, o que o painel
   deixa de mostrar sem um dado opcional, e "Trocar nome" (grava em `config.labels`, ex.:
   `{"conversoes":"Alunas novas"}`; o nome novo aparece nos indicadores, tabelas, funil e calculadora).
4. "Deixe com a sua cara": nome, logotipo enviado do computador (reduzido no navegador e guardado como
   `data:image` em `config.logo`), cor por amostra ou livre, número em destaque e meta, com PRÉVIA AO VIVO
   do painel de verdade ao lado. O resto fica em "Mais opções". No fim, tela com o link pra copiar.

Movimento: tokens de duração e curva no `main.css`, lógica em `lib/movimento.js`. Só `transform` e
`opacity`, entrada escalonada na primeira carga e na troca de aba (não a cada filtro), e tudo no estado
final de imediato com `prefers-reduced-motion`. O valor final do número está no DOM desde o início.

Os 7 efeitos de movimento (3.7.0; CSS em `public/assets/css/efeitos.css`, um módulo por efeito em
`public/assets/js/lib/`). Todos desligam com `prefers-reduced-motion` e o valor final do número está sempre
no DOM:
1. **Cartão que vira a tela** (`cartao-vira-tela.js`, `cobertura-boot.js`): na lista, a linha do painel cresce na cor dele até cobrir a tela, o nome aparece, a página troca e a capa da mesma cor sobe quando o painel desenha.
2. **Gráfico que responde** (`grafico-responde.js`): régua, ponto e etiqueta (dia, data, valor) deslizam de um dia ao outro sob o mouse ou o toque.
3. **Período em um clique** (`periodo-atalhos.js`): Hoje, 7 dias, 30 dias, Este mês, Tudo e Personalizado, com a pílula deslizando ao escolhido.
4. **Números de roleta** (`numero-roleta.js`): só o dígito que mudou rola, numa janela de uma linha por casa; separadores ficam parados.
5. **Gráfico que se transforma** (`grafico-transforma.js`): a linha vai do desenho antigo ao novo e as barras de meta, ranking e funil crescem ou encolhem.
6. **Meta batida** (`meta-batida.js`; a meta tem período, ver abaixo): uma vez por cruzamento de 100%, em cerca de 1,9 s, o cartão acende na cor da marca, uma faixa de luz o atravessa, um clarão corre pela barra, o número pulsa e o selo "Meta batida" entra. Não repete a cada redesenho.
7. **Tabela que reordena** (`tabela-ordena.js`): vale para TODAS as tabelas do painel (por canal, por semana, dados linha a linha). Clique no cabeçalho ordena (crescente, decrescente, original) e as linhas deslizam; a linha de total das tabelas por canal e por semana fica fixa no fim e não entra na ordenação; a ordem escolhida sobrevive a filtro, troca de período e Atualizar até novo clique ou troca de aba. No celular as tabelas viram um cartão por linha (nunca uma tabela virada de lado) e a ordem se escolhe no seletor "Ordenar por".
Faixa de duração deles: nenhum passa de 2,4 s e a troca de período inteira termina em até 1,0 s
(`test/efeitos-duracao.test.js`). Os tetos de 120 a 700 ms seguem valendo para o resto do painel.
A medida no navegador (pixels do cartão na meta batida, dígitos por casa na roleta, ordem da tabela)
está em `node <dir-da-skill>/scripts/test-efeitos-no-navegador.cjs`.

**A meta tem período (3.7.1).** `config.goal = { metricKey, value, periodo }`, com `periodo` em `mensal` (padrão no assistente),
`semanal`, `periodo` (vale para o período escolhido, qualquer tamanho) ou `total`. Com meta mensal, o painel compara com a meta de
cada mês do período na tela e escreve contra o quê: "96% da meta de 3 meses" (período que começa no dia 1: cada mês tocado vale a
meta inteira), "84% da meta do mês" (mês em andamento) ou "da meta proporcional (91 em 7 dias)" (período que não começa no dia 1: a
meta é rateada pelos dias de cada mês). Selo e marco só valem para meta de verdade batida: mês cheio do calendário, mês em curso já acima da meta inteira ("Este mês" a 110%), meta de período ou total. Em comparação proporcional que passou de 100% o texto diz "acima do ritmo" e o selo não aparece (é ritmo, não meta batida). O selo e o marco "Meta batida" só valem em comparação justa (meses ou semanas inteiros, mês em
andamento, período, total); em comparação proporcional o percentual aparece sem o selo. Meta de custo (CPA, CPL) não escala com o
período. **Compatibilidade:** config sem `periodo` (painel já publicado) continua comparando com o período filtrado, como sempre; o
assistente reaberto num painel assim mostra "Como estava" e só muda quando a pessoa escolhe. O servidor recusa `periodo` inválido (400).

**Faixa de indicadores sem cartão meio vazio (3.7.1).** Com o número em destaque largo (tem série no tempo), os cartões vizinhos
ganham um minigráfico de tendência do período (o mesmo traço fino do destaque, em cor de texto secundária, sem eixo) com a variação
"vs. início" ao lado; o traço se desenha na abertura e se transforma junto na troca de período, e com movimento reduzido nada anima.
Indicador sem série no tempo (taxa sem dado diário) fica sem minigráfico, com a altura do conteúdo. No celular a faixa tem 2 colunas;
se o minigráfico não couber (cartão com menos de 120 px), só ele some. A barra do topo fica opaca assim que a página sai do topo.

Presença (o que faz o painel não parecer modelo pronto; CSS em `public/assets/css/presenca.css`):
- FUNDO VIVO na cor da marca (`config.accent` e `accent2`): manchas e curvas de gráfico derivando devagar
  atrás do conteúdo, nos dois modos. Cartões seguem sólidos. `config.fundoAnimado: false` deixa parado.
- SAUDAÇÃO DE ABERTURA: tela cheia com o logotipo e "Olá, <nome>", depois uma cortina na cor da marca
  revela o painel e o conteúdo entra em sequência. Uma vez por sessão do navegador, clique ou tecla pula.
  `config.saudacao` diz quem é cumprimentado (sem ele, o nome do painel); `config.saudacaoLigada: false` desliga.
- CARREGAMENTO: esqueleto no formato do painel e barra de progresso no lugar de "Carregando...", botão
  Atualizar com "Atualizado há X" e estado de erro com "Tentar de novo".
- MODO PELA MARCA: `config.tema` (`claro`, `escuro` ou `auto`), escolhido no assistente com as duas
  amostras lado a lado e uma sugestão calculada pelo logotipo e pela cor. O servidor já entrega o
  `data-theme` no HTML, então o modo errado não pisca. O visitante pode alternar; a escolha dele vale só
  pra ele e só praquele painel. A troca de modo abre em círculo a partir do botão.
- ATENÇÃO ao conferir depois de gravar: o KV da Cloudflare leva alguns segundos pra espalhar uma gravação.
  Ler ou tirar print logo depois do POST pode pegar a config anterior (medido em 05/10/2026: o painel
  abriu no modo antigo por causa disso). Releia a config e só então tire o print.
- Print de conferência do painel só depois de 3 s: antes disso a abertura está no meio e o número ainda
  está contando.

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
atenção: csv usa `data`, sheets usa `url`, meta usa `meta:{token,account}`; `heroMetric` e
`hiddenMetrics` são opcionais):
```
curl -X POST "$BASE/api/dashboards" -H "content-type: application/json" -H "x-admin-token: $ADMIN" \
  -d '{"name":"Meu Marketing","domain":"marketing","accent":"#0ea5e9",
       "source":{"type":"csv","data":"Data,Canal,Investimento\n01/07/2026,Instagram,\"1.250,00\""},
       "colMap":{"data":"Data","canal":"Canal","investimento":"Investimento"}}'
```
A config entra SEMPRE por esse POST. Nunca grave a config direto no KV (`wrangler kv key put`): isso
pula a validação do `colMap` e a trava do `ADMIN_TOKEN`, e o painel publica "Coluna não mapeada" ou
número errado com cara de certo (aconteceu no teste de 04/10/2026: 4 de 5 indicadores sem dado).

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
2. Salve o contexto do projeto da pessoa em `~/meu-dash/projetos/YYYYMMDD-descricao.md` (fica de
   fora do git pelo `~/meu-dash/.gitignore`; crie com `mkdir -p ~/meu-dash/projetos`). Nunca
   coloque token, Account ID ou id de KV/D1 real: use placeholders.
3. Antes de distribuir/publicar o repo, apague o cache local `rm -rf starter-kit/.wrangler` (fica
   gitignored, mas guarda Account ID e dados de dev em cache; não deve ir junto num zip/cópia).
