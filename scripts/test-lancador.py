#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""D3 e D9 (teste de ponta a ponta, 02/10/2026): comando copiado do roteiro tem que funcionar de
qualquer pasta e de qualquer local de instalação.

  1. o lançador imprime o caminho completo, entre aspas quando tem espaço ou acento;
  2. a skill copiada para uma pasta com espaço e acento, rodada de OUTRA pasta, imprime comandos que EXECUTAM;
  3. nenhum texto da skill (SKILL.md, references, mensagens dos scripts) traz o caminho fixo
     de instalação nem comando que só funciona de dentro da pasta da skill.

    node <dir-da-skill>/scripts/py.mjs test-lancador.py
"""
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import lancador  # noqa: E402

FIXO = re.compile(r"~/\.claude/skills/criador-dash|\.claude/skills/criador-dash")
RELATIVO = re.compile(r"\bnode\s+(\.\./|\./)?scripts/|\bnode\s+\.\./scripts/")


def copiar_skill(destino):
    """Copia só o que o lançador precisa (scripts + um starter-kit mínimo), sem o resto pesado."""
    shutil.copytree(AQUI, destino / "scripts", ignore=shutil.ignore_patterns("__pycache__", "node_modules"))
    (destino / "starter-kit" / "public").mkdir(parents=True)
    (destino / "starter-kit" / "public" / "config.html").write_text("<html></html>", encoding="utf-8")
    (destino / "starter-kit" / ".wrangler").mkdir()
    (destino / "starter-kit" / ".wrangler" / "cache.json").write_text("{}", encoding="utf-8")
    (destino / "starter-kit" / ".dev.vars").write_text("ADMIN_TOKEN=segredo", encoding="utf-8")
    (destino / "starter-kit" / "wrangler.toml").write_text('name = "meu-dashboard"\n', encoding="utf-8")


class Quoting(unittest.TestCase):
    def test_caminho_simples_fica_sem_aspas(self):
        self.assertEqual(lancador.entre_aspas("/home/ana/skill/scripts"), "/home/ana/skill/scripts")

    def test_espaco_e_acento_vao_entre_aspas(self):
        self.assertEqual(lancador.entre_aspas("/home/ana silva/skill"), '"/home/ana silva/skill"')
        self.assertEqual(lancador.entre_aspas("C:/Users/João/skill"), '"C:/Users/João/skill"')
        self.assertTrue(lancador.entre_aspas("/pasta (nova)/x").startswith('"'))

    def test_comando_py_usa_o_py_mjs_e_script_js_vai_direto(self):
        self.assertRegex(lancador.comando("gate-etapas.py", "--perfil", "dash"), r"^node \S*py\.mjs\"? gate-etapas\.py --perfil dash$|^node .*py\.mjs\"? gate-etapas\.py --perfil dash$")
        self.assertIn("prova-dash.js", lancador.comando("prova-dash.js", "x"))
        self.assertNotIn("py.mjs", lancador.comando("prova-dash.js"))

    def test_script_inexistente_falha_alto(self):
        with self.assertRaises(FileNotFoundError):
            lancador.comando("nao-existe.py")


class DeOutraPasta(unittest.TestCase):
    """A skill instalada numa pasta com espaço e acento, rodada de uma terceira pasta."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        base = Path(self.tmp.name).resolve()
        self.skill = base / "minha instalação açaí" / "criador-dash"
        self.skill.mkdir(parents=True)
        copiar_skill(self.skill)
        self.cwd = base / "outra pasta"
        self.cwd.mkdir()

    def py(self, *args):
        return subprocess.run(["node", str(self.skill / "scripts" / "py.mjs"), "lancador.py", *args],
                              capture_output=True, text=True, encoding="utf-8", cwd=str(self.cwd))

    def test_imprime_caminho_completo_entre_aspas(self):
        r = self.py()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('"' + (self.skill / "scripts").as_posix() + "/py.mjs", r.stdout)
        self.assertNotIn("node scripts/", r.stdout)
        self.assertNotIn(".claude/skills", r.stdout)

    def test_o_comando_impresso_executa_de_qualquer_pasta(self):
        r = self.py("comando", "gate-etapas.py", "--help")
        self.assertEqual(r.returncode, 0, r.stderr)
        argv = shlex.split(r.stdout.strip())
        executa = subprocess.run(argv, capture_output=True, text=True, encoding="utf-8", cwd=str(self.cwd))
        self.assertEqual(executa.returncode, 0, executa.stdout + executa.stderr)
        self.assertIn("usage", executa.stdout.lower())

    def test_iniciar_cria_a_pasta_sem_segredo_nem_cache(self):
        destino = self.cwd / "meu dash"
        r = self.py("iniciar", str(destino))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue((destino / "public" / "config.html").is_file())
        self.assertTrue((destino / "wrangler.toml").is_file())
        self.assertFalse((destino / ".wrangler").exists(), "o cache do wrangler (Account ID) não vai na cópia")
        self.assertFalse((destino / ".dev.vars").exists(), "o .dev.vars não vai na cópia")
        self.assertIn("preflight.py", r.stdout, "depois de criar a pasta, o lançador diz o próximo comando")

    def test_iniciar_recusa_pasta_com_conteudo(self):
        destino = self.cwd / "ocupada"
        destino.mkdir()
        (destino / "arquivo.txt").write_text("x", encoding="utf-8")
        r = self.py("iniciar", str(destino))
        self.assertEqual(r.returncode, 1)
        self.assertTrue((destino / "arquivo.txt").is_file())


class PortaLivre(unittest.TestCase):
    def test_pula_porta_ocupada(self):
        import socket
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        s.listen(1)
        self.addCleanup(s.close)
        ocupada = s.getsockname()[1]
        achada = lancador.porta_livre(ocupada)
        self.assertNotEqual(achada, ocupada)
        self.assertGreater(achada, ocupada)

    def test_cli_imprime_so_o_numero(self):
        r = subprocess.run([sys.executable, str(AQUI / "lancador.py"), "porta-livre"], capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertRegex(r.stdout.strip(), r"^\d{4,5}$")


def arquivos_de_texto_da_skill():
    for pasta in (RAIZ, RAIZ / "references", AQUI):
        for p in sorted(pasta.glob("*")):
            if p.is_file() and p.suffix in (".md", ".py", ".js", ".mjs", ".cjs"):
                yield p


class NenhumTextoComCaminhoQueQuebra(unittest.TestCase):
    ISENTOS = {"README.md", "lancador.py", "test-lancador.py", "test-skill-md.py", "test-portabilidade.py"}

    def varrer(self, nome, texto):
        achados = []
        for i, linha in enumerate(texto.splitlines(), 1):
            if FIXO.search(linha):
                achados.append(f"{nome}:{i}: caminho fixo de instalação")
            if RELATIVO.search(linha):
                achados.append(f"{nome}:{i}: comando relativo que só funciona dentro da pasta da skill")
        return achados

    def test_o_varredor_se_prova(self):
        self.assertTrue(self.varrer("x.md", "node ~/.claude/skills/criador-dash/scripts/py.mjs a.py"))
        self.assertTrue(self.varrer("x.md", "node scripts/prova-dash.js url"))
        self.assertTrue(self.varrer("x.md", "node ../scripts/py.mjs preflight.py"))
        self.assertEqual(self.varrer("x.md", "node <dir-da-skill>/scripts/py.mjs a.py"), [])
        self.assertEqual(self.varrer("x.md", "node \"C:/curso automação/skill/scripts/py.mjs\" a.py"), [])

    def test_skill_references_e_scripts_sem_caminho_que_quebra(self):
        achados = []
        for p in arquivos_de_texto_da_skill():
            if p.name in self.ISENTOS:
                continue
            achados += self.varrer(p.relative_to(RAIZ).as_posix(), p.read_text(encoding="utf-8"))
        self.assertEqual(achados, [], "\n" + "\n".join(achados[:40]))

    def test_readme_so_cita_a_pasta_de_instalacao_ao_ensinar_a_instalar(self):
        achados = []
        for i, linha in enumerate((RAIZ / "README.md").read_text(encoding="utf-8").splitlines(), 1):
            if FIXO.search(linha) and not re.search(r"git clone|install|instal|folder|pasta", linha, re.IGNORECASE):
                achados.append(f"README.md:{i}")
            if RELATIVO.search(linha) and "skill root" not in linha and "raiz da skill" not in linha:
                achados.append(f"README.md:{i}: comando relativo sem dizer de onde")
        self.assertEqual(achados, [])

    def test_skill_md_define_a_pasta_da_skill(self):
        skill = (RAIZ / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("<dir-da-skill>", skill)
        self.assertRegex(skill, r"`<dir-da-skill>`[^\n]*(pasta|onde)")
        self.assertIn("lancador.py", skill, "o SKILL.md precisa apontar o lançador que imprime os comandos prontos")


if __name__ == "__main__":
    unittest.main(verbosity=2)
