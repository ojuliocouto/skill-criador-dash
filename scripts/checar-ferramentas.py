#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Checagem de ferramentas do criador-dash: testa se RESPONDE, nao se esta instalada.

Existe porque em 26/08/2026 descobrimos, na skill irma (construtor-paginas), que o MCP do
21st.dev estava configurado e MORTO havia tempo indeterminado ("Not authenticated: your API key
is missing or was reset"). A skill mandava "usar componentes do 21st.dev OU fazer a mao", o MCP
nunca respondia, caia no "a mao" TODA VEZ, e ninguem viu, porque fallback silencioso nao reclama.
O sintoma chegou pelo RESULTADO ("o design nao ta interessante"), meses depois.

O criador-dash estava PIOR: nao mencionava nenhuma ferramenta visual e nao tinha prova de tela.
654 testes passando, e nenhum olhava o dashboard.

A licao: "esta instalada" e "aparece na lista" NAO sao verificacao. Verificacao e mandar a
ferramenta fazer alguma coisa e conferir se voltou.

Uso:
    node scripts/py.mjs checar-ferramentas.py                # tabela + saida != 0 se faltar critico
    node scripts/py.mjs checar-ferramentas.py --json         # para consumo por agente
    node scripts/py.mjs checar-ferramentas.py --sem-testes   # pula `npm test` (mais rapido)
"""
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import plataforma  # noqa: E402  (portabilidade Windows/macOS/Linux)

plataforma.texto_console()

RAIZ = Path(__file__).resolve().parent.parent
STARTER = RAIZ / "starter-kit"


def roda(cmd, timeout=25, cwd=None):
    """Executa e devolve (ok, saida). Nunca levanta: timeout e binario ausente viram ok=False.

    Sem shell e em UTF-8 (ver plataforma.roda), igual no Windows, no macOS e no Linux.
    """
    return plataforma.roda(cmd, timeout=timeout, cwd=cwd)


def estado_mcp(nome):
    """Le `claude mcp list` e classifica UM servidor.

    Distingue os quatro estados que importam, porque so o primeiro serve:
      conectado       -> responde
      sem_auth        -> configurado, mas a chave morreu ou nunca existiu
      falhou          -> nao conecta
      tools_falharam  -> conecta mas nao entrega as tools
    """
    ok, saida = roda("claude mcp list", timeout=45)
    if not ok and not saida:
        return "indeterminado", "não consegui rodar `claude mcp list`"
    for linha in saida.splitlines():
        if not linha.strip().startswith(nome):
            continue
        baixo = linha.lower()
        if "needs authentication" in baixo:
            return "sem_auth", linha.strip()
        if "failed to connect" in baixo:
            return "falhou", linha.strip()
        if "tools fetch failed" in baixo or "timed out" in baixo:
            return "tools_falharam", linha.strip()
        if "connected" in baixo:
            return "conectado", linha.strip()
    return "ausente", f"'{nome}' não aparece em `claude mcp list`"


def pastas_de_skills():
    """Onde o Claude Code procura skill: a pasta de config (que pode vir de CLAUDE_CONFIG_DIR),
    as pastas globais conhecidas e a pasta do projeto atual (./.claude/skills)."""
    bases = []
    cfg = os.environ.get("CLAUDE_CONFIG_DIR")
    if cfg:
        bases.append(Path(cfg) / "skills")
    for base in ("~/.claude/skills", "~/.agents/skills", "~/.claude-hubx/skills"):
        bases.append(Path(os.path.expanduser(base)))
    bases.append(Path.cwd() / ".claude" / "skills")
    return bases


def skill_existe(nome):
    return any((base / nome).exists() for base in pastas_de_skills())


def versao_node():
    """Devolve (major, texto). wrangler 4.x exige Node 22+; com 18/20 nao roda nem testa."""
    ok, saida = roda("node -v", timeout=10)
    if not ok:
        return None, saida
    m = re.search(r"v(\d+)", saida)
    return (int(m.group(1)) if m else None), saida.strip()


def checagens(pular_testes=False):
    """Cada item: (rotulo, papel, critico, ok, detalhe, como_resolver)."""
    major, txt = versao_node()
    yield ("Node 22+", "wrangler 4.x não roda em versão mais velha", True,
           major is not None and major >= 22, txt,
           "instale o Node 22 ou mais novo: " + (plataforma.como_instalar("node") or "https://nodejs.org"))

    ok, saida = roda("npx --no-install wrangler --version", timeout=60, cwd=STARTER)
    if not ok:
        ok, saida = roda("wrangler --version", timeout=60)
    yield ("wrangler", "publicar no Cloudflare (Pages, KV, D1)", True, ok,
           saida.splitlines()[-1][:110] if saida else "", "npm i -g wrangler")

    # Login: NAO e critico aqui (a pessoa loga na hora do deploy), mas avisa cedo,
    # e principalmente denuncia o CLOUDFLARE_API_TOKEN que sequestra a conta errada.
    ok, saida = roda("npx --no-install wrangler whoami", timeout=60, cwd=STARTER)
    conta = next((l.strip() for l in saida.splitlines() if "@" in l or "Account" in l), "")
    detalhe = conta[:110]
    if os.environ.get("CLOUDFLARE_API_TOKEN"):
        detalhe = "CLOUDFLARE_API_TOKEN exportado no shell SOBREPOE o login. " + detalhe
    yield ("Login Cloudflare", "conta onde o dashboard vai ser publicado", False,
           ok and "not authenticated" not in saida.lower(), detalhe,
           "wrangler login (e tire o CLOUDFLARE_API_TOKEN do shell se ele for de outra conta: "
           + plataforma.remover_variavel_dica("CLOUDFLARE_API_TOKEN") + ")")

    if not pular_testes:
        ok, saida = roda("npm test", timeout=300, cwd=STARTER)
        n = re.search(r"# pass (\d+)", saida)
        yield ("Peças do starter-kit", "a biblioteca testada de onde o dash é montado", True, ok,
               f"{n.group(1)} testes passando" if (ok and n) else saida.splitlines()[-1][:110] if saida else "",
               "cd starter-kit && npm test (peça quebrada não vira dashboard de ninguém)")

    # O prova-dash.js acha o Playwright global sozinho, pela pasta do `npm root -g` (T10):
    # nada de caminho fixo da maquina do dono.
    ok, saida = roda(["node", str(RAIZ / "scripts" / "prova-dash.js"), "--check"])
    yield ("Playwright", "prova de tela: o dash publicado abre e mostra número", True, ok,
           saida.splitlines()[0][:110] if saida else "",
           "npm i -g playwright && npx playwright install chromium"
           + ("  (no Linux, se o Chromium abrir e fechar na hora: npx playwright install --with-deps chromium, pede sudo)"
              if plataforma.sistema() == "linux" else ""))

    # O servidor do 21st.dev ja teve DOIS nomes: "magic" (stdio, via npx) e "21st" (HTTP).
    # Procurar so pelo antigo reprova um servidor conectado com o nome novo, que foi
    # exatamente o falso negativo de 27/08/2026. Basta UM dos dois responder.
    # ESCOPO IMPORTA: sem `--scope user` o servidor fica preso ao projeto do diretorio
    # atual e SOME quando o cwd muda (a pasta da skill tem git proprio, entao e outro
    # projeto). Sempre `--scope user`.
    # OPCIONAL (02/10/2026, teste com aluno): o 21st.dev cobra pelo codigo do componente e
    # entrega React + Tailwind, enquanto o starter-kit e HTML montado em string. Ele nunca
    # bloqueia o passo 0: aluno sem chave segue normalmente.
    for _n in ("21st", "magic"):
        est, det = estado_mcp(_n)
        if est == "conectado":
            break
    yield ("21st ou magic (21st.dev)", "opcional: inspiração de componente (é React, não encaixa direto no starter-kit HTML)", False,
           est == "conectado", f"{est}: {det[:110]}",
           'chave em https://21st.dev/mcp, depois: claude mcp add magic --scope user '
           '-e API_KEY=<CHAVE> -- npx -y @21st-dev/magic@latest '
           '(a chave vai por ENV, NÃO pela flag --api-key; e o nome vem ANTES do -e)')

    # O comando vai LITERAL: quem cai aqui esta com a ferramenta faltando e precisa copiar
    # e colar. Placeholder do tipo "<fonte>" nao instala nada, so parece que instrui.
    TASTE = "npx skills add Leonxlnx/taste-skill -g -y --copy"
    # T3 (02/10/2026): a design-taste-frontend se declara fora de escopo pra dashboard. Vira
    # leitura de apoio opcional; o pre-voo anti-slop e a lista de tells em direcao-de-arte.md.
    # A frontend-design (plano visual antes do codigo, passo 2.5) e a obrigatoria.
    for s, papel, critico, fix in [
        ("design-taste-frontend", "opcional: leitura de apoio pra tipografia e hierarquia", False, TASTE),
        ("frontend-design", "plano visual do painel antes do código (passo 2.5)", True,
         "npx -y skills add anthropics/skills --skill frontend-design --agent claude-code -g -y --copy"),
        ("high-end-visual-design", "acabamento premium do painel", False, TASTE),
        ("animate", "microinteracao (hover, entrada de card, transicao de filtro)", False,
         "npx -y skills add https://github.com/delphi-ai/animate-skill --agent claude-code -g -y --copy"),
    ]:
        yield (f"skill {s}", papel, critico, skill_existe(s), "", fix)


def main():
    pular = "--sem-testes" in sys.argv
    linhas = [dict(ferramenta=r, papel=p, critico=c, ok=bool(o), detalhe=d, como_resolver=f)
              for r, p, c, o, d, f in checagens(pular_testes=pular)]

    if "--json" in sys.argv:
        print(json.dumps(linhas, ensure_ascii=False, indent=2))
    else:
        larg = max(len(l["ferramenta"]) for l in linhas) + 2
        print("\nFERRAMENTAS DO CRIADOR-DASH\n" + "=" * 74)
        for l in linhas:
            marca = "OK  " if l["ok"] else ("FALTA" if l["critico"] else "aviso")
            print(f"  [{marca:5}] {l['ferramenta']:<{larg}} {l['papel']}")
            if not l["ok"]:
                if l["detalhe"]:
                    print(f"            {l['detalhe']}")
                print(f"            RESOLVER: {l['como_resolver']}")
        quebrados = [l for l in linhas if not l["ok"]]
        criticos = [l for l in quebrados if l["critico"]]
        print("=" * 74)
        if criticos:
            print(f"  {len(criticos)} ferramenta(s) CRITICA(s) sem responder.")
            print("  Resolva ANTES do Passo 1. Sem elas o dashboard nasce pela rota degradada")
            print("  e ninguém percebe, porque o fallback não reclama: o sintoma chega semanas")
            print("  depois, como 'o painel ficou feio'.\n")
        elif quebrados:
            print(f"  Tudo crítico responde. {len(quebrados)} opcional(is) degradado(s):")
            print("  siga e DECLARE a degradação na entrega.\n")
        else:
            print("  Tudo respondendo. Pode começar o Passo 1.\n")

    return 1 if any(not l["ok"] and l["critico"] for l in linhas) else 0


if __name__ == "__main__":
    sys.exit(main())
