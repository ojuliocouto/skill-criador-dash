# Skill: Criador de Dashboards de Lancamento

## Antes de tudo: o que isto E (e o que NAO E)

**Isto NAO e um dashboard pronto pra instalar e usar.**

Isto e uma **skill** (um manual/playbook) que um agente de IA como o Claude Code le
pra **saber COMO construir** um dashboard de lancamento do zero. E conhecimento, e a
receita detalhada, nao o prato pronto.

| O que voce recebe aqui | O que voce NAO recebe aqui |
|---|---|
| A metodologia completa de construcao (`SKILL.md`) | O codigo-fonte do dashboard (`dist/`, `functions/`) |
| Arquitetura, fluxo de dados, regras de cada integracao | Uma conta Cloudflare configurada |
| Checklist de deploy e de setup de cliente novo | Tokens/secrets das integracoes |
| Bugs conhecidos e como resolver | Um site no ar automaticamente |

Pensa assim: este repo te entrega o **mapa e o manual de instrucoes**, nao o **carro montado**.
Quem monta o carro seguindo o manual e voce (ou o agente, te guiando).

---

## Como funciona na pratica (passo a passo)

1. **Voce instala a skill** no seu Claude Code (veja abaixo).
2. **Voce pede ao agente** algo como: *"cria um dashboard de lancamento pra esse cliente, tipo lancamento pago, integrando Meta Ads e Hotmart"*.
3. **O agente le o `SKILL.md`** e passa a seguir essa metodologia: cria os arquivos, configura as Functions do Cloudflare, monta o funil, etc.
4. **Voce fornece os dados reais** quando o agente pedir: conta Cloudflare, tokens das integracoes, IDs de produto/campanha. (A skill diz EXATAMENTE quais sao e onde colocar.)
5. **O agente faz o deploy** seguindo o checklist da skill.

> Resumindo: a skill nao "roda sozinha". Ela faz o agente saber o caminho. O trabalho
> braçal (criar projeto, colar tokens, deploy) ainda acontece, mas guiado e sem voce
> ter que descobrir tudo na tentativa e erro.

---

## O que voce precisa ter pra montar um dashboard de verdade

Mesmo com a skill, pra ter um dashboard no ar voce vai precisar de:

- **Conta Cloudflare** (Pages + Workers + KV) — tem plano gratuito que ja serve
- **`wrangler`** instalado (`npm i -g wrangler`)
- **Tokens das integracoes que for usar**, por exemplo:
  - Meta Marketing API (`META_ACCESS_TOKEN`)
  - Hotmart (`HOTMART_BASIC_TOKEN`)
  - SendFlow, ManyChat, ActiveCampaign, Google Sheets (conforme o caso)
- **O codigo-fonte do dashboard** — este repo traz so a metodologia (`SKILL.md`).
  O agente consegue gerar o codigo seguindo a skill, ou voce parte de um projeto base seu.

---

## Como instalar a skill no Claude Code

```bash
git clone https://github.com/ojuliocouto/skill-criador-dash.git
mkdir -p ~/.claude/skills
cp -r skill-criador-dash ~/.claude/skills/criador-dash
```

Pronto. Na proxima vez que voce pedir um dashboard de lancamento, o Claude Code
reconhece a skill e passa a seguir a metodologia dela.

> Tambem da pra so **ler o `SKILL.md` como documentacao**, sem usar agente nenhum:
> e um guia completo de como esses dashboards sao construidos.

---

## O que tem dentro da skill (`SKILL.md`)

- Template de projeto (com placeholders pra voce preencher)
- 3 tipos de campanha: lancamento pago, gratuito e downsell
- Arquitetura de arquivos (`dist/` + `functions/`)
- Fluxo de dados: fetch paralelo, processamento, render do funil
- Padrao KV-first pro Hotmart (sync via cron, evita timeout do Worker)
- Regras corretas de contagem do SendFlow (como espelhar a "Visao Geral")
- Middleware de cache (KV, 5min TTL) com protecoes
- Checklist de deploy e de setup pra cliente novo
- Bugs conhecidos e suas solucoes

---

## Seguranca

- Esta versao e **generica e sanitizada**: nao tem nenhum token, Account ID ou dado de
  cliente real. Tudo que e sensivel aparece como placeholder (`<...>` ou em CAPS).
- **Nunca** commite tokens ou IDs reais. Os secrets vao no painel do Cloudflare Pages
  (Settings > Environment variables), nunca no codigo.

## Licenca

Uso educacional. Adapte livremente pros seus projetos.
