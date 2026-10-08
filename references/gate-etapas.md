# Evidências das etapas

O `gate-etapas.py` confere sequência, campos obrigatórios, arquivos presentes e SHA-256.
Não verifica sozinho se a copy é boa, se uma aprovação é autêntica ou se a imagem foi lida.
Essas responsabilidades continuam com o usuário e as lentes de auditoria.

Crie uma pasta `evidencias/` dentro da pasta do projeto. No dashboard, a pasta do projeto é a
cópia do starter-kit feita no passo 1 (`cp -R <dir-da-skill>/starter-kit ~/meu-dash`),
e todo caminho abaixo é relativo a `~/meu-dash`. Nunca use a pasta da skill
(`<dir-da-skill>`) para guardar dados de cliente. Cada etapa recebe um JSON próprio
e arquivos de evidência.
Use cópias estáveis dos documentos aprovados: modificar a evidência invalida a etapa.

Exemplo de `evidencias/etapa-0.json`, somente para demonstrar o formato:

```json
{
  "briefing": {
    "nicho": "Informação confirmada no briefing",
    "local": "Informação confirmada no briefing",
    "publico": "Informação confirmada no briefing",
    "oferta": "Informação confirmada no briefing",
    "preco": "Pendente: não publicar preço sem confirmação",
    "acao": "Destino confirmado no briefing"
  },
  "inventario": "Todas as fontes lidas, incluindo abas e linhas; colunas e preenchimento registrados",
  "secoes": ["Seções aprovadas no briefing"],
  "arquivos": ["evidencias/briefing-confirmado.md"]
}
```

Substitua os textos demonstrativos pelos dados efetivamente coletados. Um arquivo fictício
com o formato correto passa na validação estrutural, mas não comprova o trabalho.

Campos do perfil `paginas`, usado somente no fluxo CRIAR:

| Etapa | Campos obrigatórios |
|---|---|
| 0 | `briefing` com seis respostas, `inventario`, `secoes` |
| 1 | `copy`, `aprovacao` |
| 2 | `paleta`, `fontes`, `layouts`, `assets` |
| 3 | `primeiro_bloco`, `movimento` |
| 4 | `claims`, `contato`, `passe_de_gosto`, `entrega`, `pendencias` |
| 5 | `contexto`, `medicao` |

Campos do perfil `dash`:

| Etapa | Campos obrigatórios |
|---|---|
| 1 | `ambiente` |
| 2 | `operacao`, `inventario` |
| 2.5 | `numero_heroi`, `pergunta`, `exclusoes`, `accent`, `densidade`, `tema` |
| 3 | `modo_dados` |
| 4 | `conta_confirmada`, `infra` |
| 5 | `primeiro_render`, `mapeamento` |
| 6 | `prova_publicada`, `passe_de_gosto`, `pendencias` |
| 7 | `contexto` |

Todas as etapas também exigem `arquivos`: lista de arquivos não vazios dentro do projeto.
No perfil `dash`, "Não" não é prova: `conta_confirmada` começando com "Não" bloqueia a etapa 4, e
a etapa 6 só passa com a URL `https://` do dashboard publicado em `prova_publicada` e o PNG do
`prova-dash.js` (ex: `prova/dash-desktop.png`) e os vídeos de prova do desktop e do celular
(`prova/video-desktop.webm` e `prova/video-mobile.webm`, de `gravar-video.js`) em `arquivos`.

**Modo local (sem conta Cloudflare, 3.7.1).** As etapas de construção e prova (1, 2, 2.5, 3, 5) não precisam de
conta; só a publicação (4 e 6) precisa. Sem conta, a etapa 4 registra com `"modo": "local"` e
`"publicacao_pendente"` (o que fica por fazer); `conta_confirmada` pode dizer "Não". Aí a 5 e a 7 fecham, a 6
recusa (não existe publicação falsa) e cada passada imprime `MODO LOCAL ... NÃO publicado`. Sem o campo
`"modo": "local"`, "Não" em `conta_confirmada` continua bloqueando. A 7 em local exige `publicacao_pendente` também.
Refazer a etapa 4 sem o campo `modo` (conta de verdade) volta a exigir a 6.
Para `passe_de_gosto`, use `{"antes": 0, "depois": 0, "inspecao": "Itens efetivamente inspecionados"}`.
A contagem final precisa ser zero. Para campos sem pendência, escreva `"Nenhuma"`.
Para trabalho futuro, como métricas após tráfego, registre o plano e a limitação atual.
Não coloque tokens, senhas ou identificadores de conta em evidências destinadas ao Git.

```bash
node <dir-da-skill>/scripts/py.mjs gate-etapas.py --projeto ~/meu-dash registrar 0 --arquivo evidencias/etapa-0.json
node <dir-da-skill>/scripts/py.mjs gate-etapas.py --projeto ~/meu-dash checar 0
```

No dashboard, acrescente `--perfil dash` e comece pela etapa 1. O gate de ferramentas
continua anterior ao registro. Registrar novamente uma etapa invalida as seguintes.
Antes de entregar, confira a etapa 4 em páginas e a etapa 6 no dashboard.

## Exemplos do perfil `dash`, um por etapa

Todos vivem em `~/meu-dash/evidencias/`. Os textos são demonstrativos: troque pelo que foi
feito de verdade. `arquivos` aponta arquivos reais e não vazios dentro de `~/meu-dash`.

`evidencias/etapa-1.json` (`ambiente` é um texto curto com o que foi conferido e onde):

```json
{
  "ambiente": "Node v22.13.1, wrangler 4.x via npx, npm test 100% verde em ~/meu-dash, npm run dev abriu http://localhost:8788/config.html",
  "arquivos": ["evidencias/npm-test.txt"]
}
```

`evidencias/etapa-2.json`:

```json
{
  "operacao": "Estúdio de pilates, anuncia no Instagram, Google e TikTok; quer saber de onde vem aluna nova mais barata",
  "inventario": "marketing.csv: 1 aba, 13 linhas, 8 colunas, todas 100% preenchidas, datas de 01/07 a 05/07/2026",
  "arquivos": ["evidencias/inventario.md"]
}
```

`evidencias/etapa-2.5.json`:

```json
{
  "numero_heroi": "CPA",
  "pergunta": "Qual canal traz aluna nova mais barato?",
  "exclusoes": ["CTR"],
  "accent": "#5E7D5A",
  "densidade": "leitura semanal",
  "tema": "claro e escuro",
  "arquivos": ["evidencias/plano-visual.md"]
}
```

`evidencias/etapa-3.json`:

```json
{
  "modo_dados": "ao vivo (CSV); histórico não se aplica a CSV estático",
  "arquivos": ["evidencias/decisao-modo.md"]
}
```

`evidencias/etapa-4.json` (`conta_confirmada` traz a conta que o `wrangler whoami` mostrou):

```json
{
  "conta_confirmada": "wrangler whoami: conta <EMAIL-DA-PESSOA>, confirmada com ela",
  "infra": "KV DASHBOARDS_KV criado, wrangler.toml sem placeholder, ADMIN_TOKEN como secret",
  "arquivos": ["evidencias/whoami.txt", "wrangler.toml"]
}
```

`evidencias/etapa-5.json`:

```json
{
  "primeiro_render": "faixa de KPI com CPA herói e sparkline, conferida contra o 2.5",
  "mapeamento": {"data": "Data", "canal": "Canal", "investimento": "Investimento", "conversoes": "Conversões"},
  "arquivos": ["prova-parcial/dash-desktop.png"]
}
```

`evidencias/etapa-6.json` (`prova_publicada` precisa ter a URL `https://` do dashboard publicado, e
`arquivos` precisa ter o PNG do `prova-dash.js` rodado contra essa URL e os dois vídeos do
`gravar-video.js`, `prova/video-desktop.webm` e `prova/video-mobile.webm`; sem os vídeos o registro é recusado):

```json
{
  "prova_publicada": "https://<NOME-DO-PROJETO>.pages.dev/dashboard.html?id=<ID>",
  "passe_de_gosto": {"antes": 4, "depois": 0, "inspecao": "tells de painel da Fase 3, nos dois temas"},
  "pendencias": "Nenhuma",
  "arquivos": ["prova/dash-desktop.png", "prova/dash-mobile.png", "prova/video-desktop.webm", "prova/video-mobile.webm", "prova/prancha-desktop.png", "prova/prancha-mobile.png"]
}
```

`evidencias/etapa-7.json`:

```json
{
  "contexto": "projetos/20261002-dash-estudio-pilates.md salvo, sem token nem id real",
  "arquivos": ["projetos/20261002-dash-estudio-pilates.md"]
}
```
