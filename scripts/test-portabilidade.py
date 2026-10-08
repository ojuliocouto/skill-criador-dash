#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Trava de portabilidade (Windows, macOS, Linux): o que quebra no sistema do aluno não volta.

Esta skill é usada ao vivo por alunos em Windows, macOS e Linux. Cada regra abaixo é uma coisa
que já quebrou ou quebraria numa dessas máquinas. O teste varre a skill inteira e reprova se
voltar a aparecer:

  1. comando só de Mac (brew, pbcopy, sips, osascript, launchctl, open, stat -f, sed -i '',
     date -v, /Applications, ~/Library, /opt/homebrew) fora de um trecho marcado como macOS;
  2. /tmp fixo (no Windows não existe; use tempfile ou os.tmpdir);
  3. open(), read_text(), write_text() de TEXTO sem encoding= (o Python do Windows usa cp1252);
     subprocess com text=True sem encoding=;
  4. `python3` ou `pip3` solto (no Windows muitas vezes não existe; a convenção é
     `node .../scripts/py.mjs <script>.py`, que acha o Python da máquina);
  5. shell=True, bash -c, sh -c, pkill, lsof, grep/sed/awk/cat/ls/rm/cp/mv/kill/open/chmod
     chamados como programa por subprocess, execSync com string.

Como o teste se prova: ele primeiro roda o varredor em exemplos RUINS plantados (têm que ser
reprovados) e em exemplos BONS (têm que passar), e só então varre os arquivos de verdade.

Uso:
    node <dir-da-skill>/scripts/py.mjs test-portabilidade.py
"""
import ast
import re
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PASTAS_FORA = {"node_modules", ".git", "vendor", "__pycache__", ".pytest_cache", "descartados"}
EXTENSOES = {".md", ".py", ".mjs", ".js", ".cjs", ".json", ".toml", ".txt", ".html", ".css", ".csv"}
# Arquivos que existem justamente pra lidar com as diferenças de sistema, ou que citam as regras.
ISENTOS = {"py.mjs", "plataforma.py", "test-portabilidade.py"}

MARCA_MAC = re.compile(r"macOS|\bMac\b|darwin")
JANELA = 3  # a marca vale pra própria linha e as 3 anteriores (ex.: "No macOS:" e depois o bloco)

PADROES_MAC = [
    (re.compile(r"\bbrew (install|upgrade|update|tap|services|--prefix)\b"), "brew"),
    (re.compile(r"\bpbcopy\b|\bpbpaste\b"), "pbcopy/pbpaste"),
    (re.compile(r"\bsips\b(?= -|\s+--)"), "sips"),
    (re.compile(r"\bosascript\b"), "osascript"),
    (re.compile(r"\blaunchctl\b"), "launchctl"),
    (re.compile(r"\bstat -f\b"), "stat -f"),
    (re.compile(r"\bsed -i\s*(''|\"\")"), "sed -i ''"),
    (re.compile(r"\bdate -v\b"), "date -v"),
    (re.compile(r"/Applications/"), "/Applications"),
    (re.compile(r"~/Library|/Users/[^/\s]+/Library"), "~/Library"),
    (re.compile(r"/opt/homebrew|/usr/local/Cellar"), "/opt/homebrew"),
    (re.compile(r"(^|[`;&|(]\s*|\$\(\s*)open (-[a-zA-Z]|https?://|\.|~|\"|')"), "open"),
]
PAD_TMP = re.compile(r"(?<![\w.~-])/tmp\b")
PAD_PY3 = re.compile(r"\b(python3|pip3)\b")
# python3 pode aparecer quando a própria linha explica o que NÃO fazer ou como instalar.
PY3_PERMITIDO = re.compile(r"\bapt\b|\bdnf\b|\bbrew\b|[Nn]unca|solto|não existe|procura|winget|python\.org")
PAD_SHELL = [
    (re.compile(r"shell\s*=\s*True"), "shell=True"),
    (re.compile(r"\b(bash|sh|zsh) -c\b"), "bash -c / sh -c"),
    (re.compile(r"\b(pkill|lsof|killall)\b"), "pkill/lsof/killall"),
    (re.compile(r"""(subprocess\.\w+|spawnSync|spawn|execFileSync|execFile)\(\s*\[?\s*["'](grep|sed|awk|cat|ls|rm|cp|mv|kill|open|chmod|find|tar|which)["']"""),
     "programa de Unix chamado por subprocesso"),
    (re.compile(r"""\bexecSync\(\s*[`"']"""), "execSync com string"),
]


def _eh_comentario(nome, linha):
    s = linha.lstrip()
    if nome.endswith(".py"):
        return s.startswith("#")
    if nome.endswith((".js", ".mjs", ".cjs")):
        return s.startswith(("//", "*", "/*"))
    return False


def _tem_marca_mac(linhas, i):
    return any(MARCA_MAC.search(l) for l in linhas[max(0, i - JANELA): i + 1])


def _checar_open_python(nome, texto):
    achados = []
    try:
        arvore = ast.parse(texto)
    except SyntaxError as e:
        return [f"{nome}:{e.lineno}: não consegui ler o Python ({e.msg})"]
    for no in ast.walk(arvore):
        if not isinstance(no, ast.Call):
            continue
        f = no.func
        nome_f = f.id if isinstance(f, ast.Name) else (f.attr if isinstance(f, ast.Attribute) else "")
        kws = {k.arg: k.value for k in no.keywords if k.arg}
        tem_kwargs_soltos = any(k.arg is None for k in no.keywords)
        if tem_kwargs_soltos:
            continue
        if nome_f == "open" and isinstance(f, ast.Name):
            modo = no.args[1] if len(no.args) > 1 else kws.get("mode")
            binario = isinstance(modo, ast.Constant) and isinstance(modo.value, str) and "b" in modo.value
            if not binario and "encoding" not in kws and len(no.args) < 4:
                achados.append(f"{nome}:{no.lineno}: open() de texto sem encoding=")
        elif nome_f in ("read_text", "write_text") and isinstance(f, ast.Attribute):
            if "encoding" not in kws and len(no.args) < (1 if nome_f == "read_text" else 2):
                achados.append(f"{nome}:{no.lineno}: {nome_f}() sem encoding=")
        elif nome_f in ("run", "check_output", "Popen", "check_call") and isinstance(f, ast.Attribute):
            txt = kws.get("text") or kws.get("universal_newlines")
            if isinstance(txt, ast.Constant) and txt.value is True and "encoding" not in kws:
                achados.append(f"{nome}:{no.lineno}: subprocess com text=True sem encoding=")
    return achados


def varrer_texto(nome, texto):
    """Devolve a lista de problemas de portabilidade de UM arquivo. Vazia = passou."""
    achados = []
    linhas = texto.splitlines()
    ehcodigo = nome.endswith((".py", ".js", ".mjs", ".cjs"))
    for i, linha in enumerate(linhas):
        if i == 0 and linha.startswith("#!"):
            continue  # shebang: o Windows ignora, o Unix usa
        if ehcodigo and _eh_comentario(nome, linha):
            continue
        pos = f"{nome}:{i + 1}"
        if not _tem_marca_mac(linhas, i):
            for rx, rotulo in PADROES_MAC:
                if rx.search(linha):
                    achados.append(f"{pos}: comando só de Mac ({rotulo}) fora de trecho marcado como macOS")
        if PAD_TMP.search(linha) and not _tem_marca_mac(linhas, i):
            achados.append(f"{pos}: /tmp fixo (use tempfile ou os.tmpdir)")
        if PAD_PY3.search(linha) and not PY3_PERMITIDO.search(linha):
            achados.append(f"{pos}: python3/pip3 solto (use: node .../scripts/py.mjs <script>.py)")
        for rx, rotulo in PAD_SHELL:
            if rx.search(linha):
                achados.append(f"{pos}: {rotulo}")
    if nome.endswith(".py"):
        achados += _checar_open_python(nome, texto)
    return achados


def arquivos_da_skill():
    for p in sorted(RAIZ.rglob("*")):
        if not p.is_file() or p.suffix.lower() not in EXTENSOES or p.name in ISENTOS:
            continue
        rel = p.relative_to(RAIZ)
        if any(parte in PASTAS_FORA for parte in rel.parts):
            continue
        yield p, rel.as_posix()


RUINS = {
    "mac-brew.md": "Instale com:\n\n```bash\nbrew install node\n```\n",
    "mac-pbcopy.py": "import subprocess\nsubprocess.run(['pbcopy'])\n",
    "mac-open.md": "Abra a página:\n\n```bash\nopen http://localhost:8787\n```\n",
    "mac-sedi.md": "```bash\nsed -i '' 's/a/b/' arq\n```\n",
    "tmp.py": "ARQ = '/tmp/saida.json'\n",
    "tmp.md": "Salve em /tmp/relatorio.txt e leia.\n",
    "open-sem-encoding.py": "with open('a.txt') as f:\n    f.read()\n",
    "open-w-sem-encoding.py": "f = open('a.txt', 'w')\n",
    "read-text.py": "from pathlib import Path\nPath('a').read_text()\n",
    "write-text.py": "from pathlib import Path\nPath('a').write_text('x')\n",
    "text-true.py": "import subprocess\nsubprocess.run(['a'], capture_output=True, text=True)\n",
    "python3.md": "Rode `python3 scripts/x.py`.\n",
    "pip3.md": "```bash\npip3 install requests\n```\n",
    "shell-true.py": "import subprocess\nsubprocess.run('ls | wc -l', shell=True)\n",
    "lsof.py": "import subprocess\nsubprocess.run(['lsof', '-i', ':8787'])\n",
    "grep.py": "import subprocess\nsubprocess.run(['grep', '-r', 'x', '.'])\n",
    "pkill.md": "```bash\npkill -f wrangler\n```\n",
    "exec.mjs": "import { execSync } from 'node:child_process';\nexecSync('ls -la');\n",
}
BONS = {
    "mac-marcado.md": "No macOS:\n\n```bash\nbrew install node\n```\n",
    "mac-linha.md": "| macOS | `brew install node` |\n",
    "tmp-ok.py": "import tempfile\nd = tempfile.mkdtemp()\n",
    "open-ok.py": "with open('a.txt', encoding='utf-8') as f:\n    f.read()\nopen('b.bin', 'rb')\n",
    "read-ok.py": "from pathlib import Path\nPath('a').read_text(encoding='utf-8')\nPath('a').write_text('x', encoding='utf-8')\n",
    "run-ok.py": "import subprocess\nsubprocess.run(['a'], capture_output=True, text=True, encoding='utf-8')\nsubprocess.run(['a'], capture_output=True)\n",
    "py-launcher.md": "```bash\nnode ~/.claude/skills/x/scripts/py.mjs gate.py --a\n```\n",
    "py3-explica.md": "Nunca escreva `python3` solto.\nDebian/Ubuntu: `sudo apt install python3`\n",
    "shebang.py": "#!/usr/bin/env python3\nprint('oi')\n",
    "comentario.py": "# brew install x e /tmp e open('a')\nx = 1\n",
    "open-url.md": "Abra https://exemplo.com no navegador.\nAbra o arquivo com o app.\n",
    "spawn-ok.mjs": "import { spawnSync } from 'node:child_process';\nspawnSync(process.execPath, ['a.js']);\n",
}


class VarredorSeProva(unittest.TestCase):
    def test_exemplos_ruins_sao_reprovados(self):
        for nome, texto in RUINS.items():
            with self.subTest(nome):
                self.assertTrue(varrer_texto(nome, texto), f"o varredor NÃO pegou o exemplo ruim {nome}")

    def test_exemplos_bons_passam(self):
        for nome, texto in BONS.items():
            with self.subTest(nome):
                self.assertEqual(varrer_texto(nome, texto), [], f"falso positivo em {nome}")


class SkillReal(unittest.TestCase):
    def test_nenhum_arquivo_da_skill_tem_problema_de_portabilidade(self):
        achados = []
        n = 0
        for p, rel in arquivos_da_skill():
            n += 1
            try:
                texto = p.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            achados += varrer_texto(rel, texto)
        self.assertGreater(n, 20, "o varredor quase não achou arquivo: o caminho da skill está certo?")
        self.assertEqual(achados, [], "\n" + "\n".join(achados[:60]) + (f"\n... e mais {len(achados) - 60}" if len(achados) > 60 else ""))

    def test_launcher_e_helper_existem(self):
        self.assertTrue((RAIZ / "scripts" / "py.mjs").is_file())
        self.assertTrue((RAIZ / "scripts" / "plataforma.py").is_file())

    def test_skill_md_tem_a_secao_de_sistemas(self):
        skill = (RAIZ / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("## Funciona em Windows, macOS e Linux", skill)
        for termo in ("py.mjs", "Git Bash", "winget", "apt install", "dnf install"):
            self.assertIn(termo, skill, f"a seção de sistemas precisa citar {termo}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
