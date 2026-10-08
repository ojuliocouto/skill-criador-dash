# -*- coding: utf-8 -*-
"""Imprime o comando pronto, com o caminho COMPLETO da skill resolvido em tempo de execução.

Quem roda um script da skill está na pasta do projeto, não na da skill; um comando com caminho
relativo (`node scripts/...`) ou com o caminho de instalação fixo (`~/.claude/skills/...`) quebra
quando a skill foi instalada em outra pasta (ex.: `.claude-hubx`, uma pasta com espaço ou acento).
Aqui o caminho sai de onde este arquivo está, e vai entre aspas duplas quando tem espaço ou acento
(funcionam em bash, zsh, cmd e PowerShell). Barras normais (`as_posix`): o Node entende também no Windows.

Uso (de qualquer pasta; <dir-da-skill> é a pasta onde está o SKILL.md):

    node <dir-da-skill>/scripts/py.mjs lancador.py                          # todos os comandos do roteiro, prontos
    node <dir-da-skill>/scripts/py.mjs lancador.py --projeto ~/meu-dash     # idem, com a pasta do projeto
    node <dir-da-skill>/scripts/py.mjs lancador.py iniciar ~/meu-dash       # cria a pasta do projeto (cópia do starter-kit)
    node <dir-da-skill>/scripts/py.mjs lancador.py porta-livre              # porta livre para o npm run dev (a 8788 costuma estar ocupada)
    node <dir-da-skill>/scripts/py.mjs lancador.py comando prova-dash.js "<URL>" --out prova-parcial
"""
import argparse
import shutil
import socket
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
KIT = RAIZ / "starter-kit"
# Nunca vão junto na cópia: cache do wrangler guarda Account ID, e .dev.vars é segredo local.
NAO_COPIAR = (".wrangler", "node_modules", ".dev.vars", ".git")
CARACTERES_DE_SHELL = set(" ()&;|<>$`'!#*?[]{}")

try:  # console do Windows em cp1252 não aceita acento
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError, OSError):
    pass


def entre_aspas(texto):
    """Aspas duplas quando o texto tem espaço, acento ou caractere que o shell interpreta."""
    precisa = texto.isascii() is False or any(c in CARACTERES_DE_SHELL for c in texto)
    return f'"{texto}"' if precisa else texto


def caminho(p):
    return entre_aspas(Path(p).as_posix())


def comando(script, *args):
    """`node <py.mjs> script args` para .py; `node <script> args` para .js/.mjs/.cjs."""
    alvo = AQUI / script
    if not alvo.is_file():
        raise FileNotFoundError(f"script da skill inexistente: {script}")
    base = f"node {caminho(AQUI / 'py.mjs')} {script}" if script.endswith(".py") else f"node {caminho(alvo)}"
    return " ".join([base, *args])


def comando_de_copia(destino):
    return f"cp -R {caminho(KIT)} {caminho(destino)}"


def comandos_do_roteiro(projeto="~/meu-dash"):
    proj = caminho(Path(projeto).expanduser().resolve()) if projeto else "<pasta-do-projeto>"
    return [
        ("Passo 0: ferramentas", comando("checar-ferramentas.py")),
        ("Passo 1: criar a pasta do projeto", comando("lancador.py", "iniciar", proj)),
        ("Passo 1: preflight do ambiente", comando("preflight.py", "--starter-kit", proj)),
        ("Passo 4: preflight antes do deploy", comando("preflight.py", "--starter-kit", proj, "--antes-do-deploy")),
        ("Gate de etapa (troque N e o JSON)", comando("gate-etapas.py", "--perfil", "dash", "--projeto", proj, "registrar", "N", "--arquivo", "evidencias/etapa-N.json")),
        ("Passo 5: prova parcial (local ou publicado)", comando("prova-dash.js", '"<URL>"', "--out", "prova-parcial")),
        ("Passo 6: prova de tela publicada", comando("prova-dash.js", '"<URL>"')),
        ("Passo 6: vídeo de prova", comando("gravar-video.js", '"<URL>"', "--saida", "prova")),
        ("Passo 6.1: gate de uso", comando("uso-ferramentas.py", "--projeto", proj, "checar")),
    ]


def iniciar(destino):
    """Copia o starter-kit para `destino` (que não pode existir com conteúdo). Devolve a pasta criada."""
    dest = Path(destino).expanduser().resolve()
    if dest.exists() and any(dest.iterdir()):
        raise FileExistsError(f"a pasta {dest} já existe e não está vazia; escolha outro nome ou use a que já tem o projeto.")
    shutil.copytree(KIT, dest, ignore=shutil.ignore_patterns(*NAO_COPIAR), dirs_exist_ok=True)
    return dest


def porta_ocupada(porta):
    """True se algo já escuta nesta porta (só com socket: funciona igual em Windows, macOS e Linux)."""
    with socket.socket() as s:
        s.settimeout(0.3)
        if s.connect_ex(("127.0.0.1", porta)) == 0:
            return True
    with socket.socket() as s:
        try:
            s.bind(("127.0.0.1", porta))
        except OSError:
            return True
    return False


def porta_livre(inicio=8788, fim=None):
    """Primeira porta livre a partir de `inicio`. As vizinhas (8789, 8790...) costumam estar em uso."""
    fim = fim or min(inicio + 300, 65535)
    for porta in range(inicio, fim + 1):
        if not porta_ocupada(porta):
            return porta
    raise OSError(f"nenhuma porta livre entre {inicio} e {fim}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--projeto", default=None, help="pasta do projeto (padrão: ~/meu-dash)")
    sub = ap.add_subparsers(dest="cmd")
    p_ini = sub.add_parser("iniciar", help="cria a pasta do projeto copiando o starter-kit")
    p_ini.add_argument("pasta")
    p_porta = sub.add_parser("porta-livre", help="imprime a primeira porta livre a partir de 8788 (para o npm run dev)")
    p_porta.add_argument("--a-partir-de", type=int, default=8788)
    p_cmd = sub.add_parser("comando", help="imprime o comando de UM script com o caminho completo")
    p_cmd.add_argument("script")
    p_cmd.add_argument("args", nargs=argparse.REMAINDER)
    a = ap.parse_args(argv)
    try:
        if a.cmd == "iniciar":
            dest = iniciar(a.pasta)
            print(f"Pasta do projeto criada: {dest}")
            print("Daí em diante, todo comando roda de dentro dela. Próximo comando:")
            print("  " + comando("preflight.py", "--starter-kit", caminho(dest)))
            return 0
        if a.cmd == "porta-livre":
            print(porta_livre(a.a_partir_de))
            return 0
        if a.cmd == "comando":
            print(comando(a.script, *a.args))
            return 0
        print(f"Skill em: {RAIZ.as_posix()}")
        print("Comandos prontos (copie e cole, de qualquer pasta):\n")
        for titulo, cmd in comandos_do_roteiro(a.projeto or "~/meu-dash"):
            print(f"# {titulo}\n{cmd}\n")
        return 0
    except (OSError, FileNotFoundError) as e:
        print(f"ERRO: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
