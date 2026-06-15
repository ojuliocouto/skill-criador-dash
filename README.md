# Skill: Criador de Dashboards de Lancamento

Skill (Claude Code / agentes) para **criar, manter e replicar dashboards de marketing de lancamento** sobre Cloudflare Pages + Workers, integrando Meta Ads, Hotmart, SendFlow, ManyChat, ActiveCampaign e Google Sheets.

Esta e a versao **generica e didatica**: nao contem nenhum token, Account ID ou dado de cliente real. Todos os valores sensiveis aparecem como placeholders (`<...>` ou em CAPS) pra voce preencher com os dados do seu projeto.

## O que esta skill cobre

- Arquitetura completa de arquivos (`dist/` + `functions/`)
- 3 tipos de campanha: lancamento pago, lancamento gratuito e downsell
- Fluxo de dados (fetch paralelo, processamento, render do funil)
- Padrao KV-first pra Hotmart (sync via cron, evita timeout do Worker)
- Regras corretas de contagem do SendFlow (espelhar a "Visao Geral")
- Middleware de cache (KV, 5min TTL) com protecoes
- Checklist de deploy e de setup pra cliente novo
- Bugs conhecidos e suas solucoes

## Como instalar (Claude Code)

Copie a pasta pra dentro das suas skills:

```bash
git clone https://github.com/ojuliocouto/skill-criador-dash.git
cp -r skill-criador-dash ~/.claude/skills/criador-dash
```

Depois e so pedir ao agente pra "criar um dashboard de lancamento" que a skill entra em acao.

## Como usar a doc

O conteudo principal esta em [`SKILL.md`](./SKILL.md). Comece pelo bloco **TEMPLATE DE PROJETO**, preencha os placeholders com os dados do seu Cloudflare/integracoes, e siga o **Checklist pra NOVO CLIENTE** no fim do arquivo.

## Importante (seguranca)

- Nunca commite tokens, Account IDs ou IDs de KV reais. Use sempre Secrets do Cloudflare Pages.
- Os Secrets vao no painel Pages (Settings > Environment variables), nunca no codigo.

## Licenca

Uso educacional. Adapte livremente pros seus projetos.
