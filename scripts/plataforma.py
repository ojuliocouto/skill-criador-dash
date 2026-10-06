# -*- coding: utf-8 -*-
"""Peças de portabilidade (Windows, macOS, Linux) usadas pelos scripts desta skill.

Uma responsabilidade: esconder as diferenças de sistema pra que o resto do código não saiba
em que máquina está. Nada aqui muda regra de negócio.

  sistema()          -> "windows", "macos" ou "linux"
  achar(nome)        -> caminho completo do programa ou None (acha npm.cmd no Windows)
  roda(cmd, ...)     -> (ok, saida) sem shell, em UTF-8, nunca levanta
  texto_console()    -> faz o print aceitar acento em console cp1252 (sem UnicodeEncodeError)
  como_instalar(x)   -> instrução curta por sistema pra instalar node, python, etc.
"""
import os
import shlex
import shutil
import subprocess
import sys


def sistema():
    if sys.platform.startswith("win"):
        return "windows"
    if sys.platform == "darwin":
        return "macos"
    return "linux"


def texto_console():
    """stdout e stderr em UTF-8 (ou, se o console não aguentar, troca o caractere por '?').

    O Python do Windows imprime em cp1252 quando a saída vai pra console ou pipe, e um
    símbolo fora dessa tabela derruba o script com UnicodeEncodeError. O errors=replace
    garante que no pior caso sai '?', nunca um erro.
    """
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError, OSError):
            pass  # fluxo trocado por teste (StringIO) ou fechado


def achar(nome):
    """shutil.which respeita PATHEXT: no Windows 'npm' vira npm.cmd, 'npx' vira npx.cmd."""
    return shutil.which(nome)


def _como_lista(cmd):
    if isinstance(cmd, (list, tuple)):
        return list(cmd)
    return shlex.split(cmd, posix=(sistema() != "windows"))


def roda(cmd, timeout=25, cwd=None):
    """Executa e devolve (ok, saida). Nunca levanta: timeout e binário ausente viram ok=False.

    Sem shell: o comando vira lista e o primeiro item é resolvido por shutil.which, o que
    funciona igual no cmd, no PowerShell, no Git Bash e no Linux/macOS.
    """
    try:
        argv = _como_lista(cmd)
        achado = achar(argv[0])
        if not achado:
            return False, f"programa não encontrado: {argv[0]}"
        argv[0] = achado
        p = subprocess.run(argv, capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=timeout, cwd=str(cwd) if cwd else None)
        return p.returncode == 0, ((p.stdout or "") + (p.stderr or "")).strip()
    except subprocess.TimeoutExpired:
        return False, f"timeout depois de {timeout}s"
    except Exception as e:  # permissão, caminho inválido etc
        return False, repr(e)


def python_deste_processo():
    """O Python que está rodando agora. Use isto, nunca a palavra 'python3', pra chamar outro .py."""
    return sys.executable or "python"


_INSTALAR = {
    "node": {
        "windows": "winget install -e --id OpenJS.NodeJS.LTS  (ou instalador em https://nodejs.org)",
        "macos": "brew install node  (ou instalador em https://nodejs.org)",
        "linux": "Debian/Ubuntu: sudo apt install nodejs npm (confira se vem 22+; senão use https://nodejs.org ou nvm)  |  Fedora: sudo dnf install nodejs",
    },
    "python": {
        "windows": "winget install -e --id Python.Python.3.12  (ou https://www.python.org/downloads/)",
        "macos": "brew install python  (ou https://www.python.org/downloads/macos/)",
        "linux": "Debian/Ubuntu: sudo apt install python3  |  Fedora: sudo dnf install python3",
    },
}


def como_instalar(ferramenta):
    """Texto de uma linha com o jeito de instalar `ferramenta` NESTE sistema (e só nele)."""
    por_sistema = _INSTALAR.get(ferramenta, {})
    return por_sistema.get(sistema(), "")


def todos_os_caminhos_de_instalar(ferramenta):
    """Os três sistemas, pra mensagens que o professor lê sem saber a máquina do aluno."""
    return dict(_INSTALAR.get(ferramenta, {}))


def remover_variavel_dica(nome):
    """Como tirar uma variável de ambiente da sessão atual, por sistema."""
    if sistema() == "windows":
        return f"no PowerShell: Remove-Item Env:{nome}  |  no Git Bash: unset {nome}"
    return f"unset {nome}"
