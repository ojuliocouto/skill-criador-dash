#!/usr/bin/env python3
"""Preflight do criador-dash: checa o ambiente e o wrangler.toml antes do deploy.

Automatiza o checklist do SKILL.md (passo 1) e o passo BLOQUEANTE do provisionamento
(nenhum placeholder pode sobrar no wrangler.toml antes do deploy; se sobrar, o deploy
passa mas a API responde 500 "Binding DASHBOARDS_KV nao configurado" em runtime).

Uso:
  python3 scripts/preflight.py --starter-kit starter-kit
  python3 scripts/preflight.py --starter-kit starter-kit --history   # inclui checks do modo historico
  python3 scripts/preflight.py --starter-kit starter-kit --run-tests # roda a suite npm test no final

Sai com codigo 0 se tudo ok, 1 se houver bloqueio. Nao muda nada: so le e reporta.
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

PLACEHOLDERS = ["<SEU_KV_NAMESPACE_ID>", "<SEU_KV_CACHE_ID>", "<SEU_D1_ID>", "<NOME-DO-PROJETO>"]
DEFAULT_PROJECT_NAME = "meu-dashboard"

OK = "[ok]"
AVISO = "[aviso]"
BLOQUEIO = "[BLOQUEIO]"


def run(cmd: list) -> str:
    """Roda um comando e devolve stdout (vazio se falhar)."""
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        return (out.stdout or "").strip()
    except (OSError, subprocess.TimeoutExpired):
        return ""


def check_node(problemas: list) -> None:
    node = shutil.which("node")
    if not node:
        problemas.append("Node nao encontrado. Instale em nodejs.org (sem Node nao roda wrangler nem os testes).")
        print(f"{BLOQUEIO} Node: nao encontrado")
        return
    versao = run(["node", "-v"])
    print(f"{OK} Node: {versao}")


def check_wrangler(problemas: list, avisos: list) -> None:
    wrangler = shutil.which("wrangler")
    if wrangler:
        versao = run(["wrangler", "--version"])
        print(f"{OK} wrangler global: {versao or 'instalado'}")
    elif shutil.which("npx"):
        avisos.append("wrangler nao esta global; os comandos vao usar 'npx wrangler' (mais lento na 1a vez).")
        print(f"{AVISO} wrangler: nao esta global, mas npx existe (npm run dev funciona via npx)")
    else:
        problemas.append("Nem wrangler nem npx encontrados. Instale Node/npm e rode: npm i -g wrangler")
        print(f"{BLOQUEIO} wrangler: nao encontrado (nem npx)")


def check_api_token(avisos: list) -> None:
    if os.environ.get("CLOUDFLARE_API_TOKEN"):
        avisos.append(
            "CLOUDFLARE_API_TOKEN esta exportado no ambiente: ele SOBREPOE o 'wrangler login' e pode "
            "apontar pra outra conta. Confira com 'wrangler whoami'; se for indevido, rode "
            "'unset CLOUDFLARE_API_TOKEN' na mesma sessao antes de deployar."
        )
        print(f"{AVISO} CLOUDFLARE_API_TOKEN exportado no shell (pode apontar pra conta errada)")
    else:
        print(f"{OK} CLOUDFLARE_API_TOKEN: nao exportado (deploy usa o OAuth do wrangler login)")


def check_toml(path: Path, problemas: list, nome: str, exigir_projeto: bool) -> None:
    if not path.exists():
        problemas.append(f"{nome} nao encontrado em {path}. Rode a partir da raiz do repo (--starter-kit).")
        print(f"{BLOQUEIO} {nome}: nao encontrado ({path})")
        return
    texto = path.read_text(encoding="utf-8", errors="replace")
    # So linhas ATIVAS bloqueiam: placeholder em linha comentada (ex: o bloco D1
    # opcional comentado no toml da raiz) e instrucao, nao configuracao pendente.
    ativos = [l for l in texto.splitlines() if not l.strip().startswith("#")]
    texto_ativo = "\n".join(ativos)
    sobrando = [p for p in PLACEHOLDERS if p in texto_ativo]
    if exigir_projeto and re.search(rf'^name\s*=\s*"{DEFAULT_PROJECT_NAME}"', texto_ativo, re.MULTILINE):
        sobrando.append(f'name = "{DEFAULT_PROJECT_NAME}" (troque pelo nome real do projeto Pages)')
    if sobrando:
        problemas.append(
            f"{nome} ainda tem placeholder: {', '.join(sobrando)}. "
            "Se deployar assim, o deploy passa mas a API responde 500 'Binding DASHBOARDS_KV nao configurado'."
        )
        print(f"{BLOQUEIO} {nome}: placeholders pendentes -> {', '.join(sobrando)}")
    else:
        print(f"{OK} {nome}: sem placeholders ativos")


def check_dev_vars(starter: Path, avisos: list) -> None:
    dev_vars = starter / ".dev.vars"
    if dev_vars.exists():
        if "ADMIN_TOKEN" in dev_vars.read_text(encoding="utf-8", errors="replace"):
            print(f"{OK} .dev.vars: existe com ADMIN_TOKEN (fluxo completo funciona no npm run dev)")
        else:
            avisos.append(".dev.vars existe mas nao define ADMIN_TOKEN: criar dashboard local vai dar 403.")
            print(f"{AVISO} .dev.vars: existe mas sem ADMIN_TOKEN")
    else:
        avisos.append(
            "Sem starter-kit/.dev.vars: no dev local, criar dashboard da 403 (fail-closed). "
            "Crie o arquivo com ADMIN_TOKEN=<valor-de-dev> pra testar o fluxo completo."
        )
        print(f"{AVISO} .dev.vars: nao existe (mutacao local ficara bloqueada)")


def run_tests(starter: Path, problemas: list) -> None:
    print("\nRodando a suite (npm test)...")
    try:
        out = subprocess.run(["npm", "test"], cwd=starter, capture_output=True, text=True, timeout=600)
        resumo = [l for l in (out.stdout + out.stderr).splitlines() if re.match(r"^. (tests|pass|fail) ", l)]
        for l in resumo:
            print("  " + l.strip())
        if out.returncode != 0:
            problemas.append("npm test falhou. Nao deploye com a suite vermelha; rode 'npm test' e leia o erro.")
            print(f"{BLOQUEIO} suite de testes: FALHOU")
        else:
            print(f"{OK} suite de testes: verde")
    except (OSError, subprocess.TimeoutExpired) as e:
        problemas.append(f"Nao consegui rodar npm test: {e}")
        print(f"{BLOQUEIO} npm test: nao rodou ({e})")


def main() -> int:
    parser = argparse.ArgumentParser(description="Preflight do criador-dash: ambiente + wrangler.toml antes do deploy.")
    parser.add_argument("--starter-kit", default="starter-kit", help="caminho da pasta starter-kit (padrao: starter-kit)")
    parser.add_argument("--history", action="store_true", help="inclui as checagens do modo historico (worker de snapshot)")
    parser.add_argument("--run-tests", action="store_true", help="roda npm test no final")
    args = parser.parse_args()

    starter = Path(args.starter_kit).resolve()
    problemas: list = []
    avisos: list = []

    print(f"Preflight criador-dash em {starter}\n")
    check_node(problemas)
    check_wrangler(problemas, avisos)
    check_api_token(avisos)
    check_toml(starter / "wrangler.toml", problemas, "wrangler.toml", exigir_projeto=True)
    if args.history:
        check_toml(starter / "workers" / "snapshot" / "wrangler.toml", problemas,
                   "workers/snapshot/wrangler.toml", exigir_projeto=False)
    check_dev_vars(starter, avisos)
    if args.run_tests:
        run_tests(starter, problemas)

    print()
    if avisos:
        print("Avisos (nao bloqueiam, mas leia):")
        for a in avisos:
            print(f"  - {a}")
    if problemas:
        print("\nBLOQUEIOS (resolva antes de deployar):")
        for p in problemas:
            print(f"  - {p}")
        return 1
    print("Tudo pronto: pode seguir pro deploy (references/infra.md, passo 3).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
