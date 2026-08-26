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
    python3 scripts/checar-ferramentas.py                # tabela + saida != 0 se faltar critico
    python3 scripts/checar-ferramentas.py --json         # para consumo por agente
    python3 scripts/checar-ferramentas.py --sem-testes   # pula `npm test` (mais rapido)
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
STARTER = RAIZ / "starter-kit"


def roda(cmd, timeout=25, cwd=None):
    """Executa e devolve (ok, saida). Nunca levanta: timeout e binario ausente viram ok=False."""
    try:
        p = subprocess.run(cmd, shell=True, capture_output=True, text=True,
                           timeout=timeout, cwd=str(cwd) if cwd else None)
        return p.returncode == 0, (p.stdout + p.stderr).strip()
    except subprocess.TimeoutExpired:
        return False, f"timeout depois de {timeout}s"
    except Exception as e:  # binario ausente, permissao, etc
        return False, repr(e)


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
        return "indeterminado", "nao consegui rodar `claude mcp list`"
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
    return "ausente", f"'{nome}' nao aparece em `claude mcp list`"


def skill_existe(nome):
    for base in ("~/.claude/skills", "~/.agents/skills", "~/.claude-hubx/skills"):
        if (Path(os.path.expanduser(base)) / nome).exists():
            return True
    return False


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
    yield ("Node 22+", "wrangler 4.x nao roda em versao mais velha", True,
           major is not None and major >= 22, txt,
           "instale o Node 22 ou mais novo (nvm install 22 / brew install node)")

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
           "wrangler login (e `unset CLOUDFLARE_API_TOKEN` se o token do shell for de outra conta)")

    if not pular_testes:
        ok, saida = roda("npm test", timeout=300, cwd=STARTER)
        n = re.search(r"# pass (\d+)", saida)
        yield ("Pecas do starter-kit", "a biblioteca testada de onde o dash e montado", True, ok,
               f"{n.group(1)} testes passando" if (ok and n) else saida.splitlines()[-1][:110] if saida else "",
               "cd starter-kit && npm ci && npm test (peca quebrada nao vira dashboard de ninguem)")

    ok, saida = roda(
        f'NODE_PATH="$HOME/.npm-global/lib/node_modules" node "{RAIZ}/scripts/prova-dash.js" --check')
    yield ("Playwright", "prova de tela: o dash publicado abre e mostra numero", True, ok,
           saida.splitlines()[0][:110] if saida else "",
           "npm i -g playwright && npx playwright install chromium")

    est, det = estado_mcp("magic")
    yield ("magic (21st.dev)", "componentes de UI reais no lugar de card feito a mao", True,
           est == "conectado", f"{est}: {det[:110]}",
           'chave em https://21st.dev/mcp, depois: claude mcp add magic --scope user '
           '-e API_KEY=<CHAVE> -- npx -y @21st-dev/magic@latest '
           '(a chave vai por ENV, NAO pela flag --api-key; e o nome vem ANTES do -e)')

    for s, papel, critico in [
        ("design-taste-frontend", "gate anti-slop antes de publicar", True),
        ("frontend-design", "direcao estetica antes de montar as telas", False),
        ("high-end-visual-design", "acabamento premium do painel", False),
        ("animate", "microinteracao (hover, entrada de card, transicao de filtro)", False),
    ]:
        yield (f"skill {s}", papel, critico, skill_existe(s), "", f"npx skills add <fonte>/{s}")


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
            print("  e ninguem percebe, porque o fallback nao reclama: o sintoma chega semanas")
            print("  depois, como 'o painel ficou feio'.\n")
        elif quebrados:
            print(f"  Tudo critico responde. {len(quebrados)} opcional(is) degradado(s):")
            print("  siga e DECLARE a degradacao na entrega.\n")
        else:
            print("  Tudo respondendo. Pode comecar o Passo 1.\n")

    return 1 if any(not l["ok"] and l["critico"] for l in linhas) else 0


if __name__ == "__main__":
    sys.exit(main())
