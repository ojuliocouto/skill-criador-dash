#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Trava do Python 3.8: nenhum script da skill usa recurso que só existe do 3.9 em diante.

O SKILL.md, o README e o py.mjs prometem Python 3.8 ou mais novo. Na 3.7.4 o gate-etapas.py usava
Path.is_relative_to (só existe a partir do 3.9) e quebrava com AttributeError no Python 3.8.20,
em vez de dar a mensagem do gate. Este teste varre os .py da pasta scripts/ pela árvore de sintaxe
(ast) e reprova o que só roda no 3.9 em diante:

  1. métodos novos: Path.is_relative_to, Path.with_stem, str.removeprefix, str.removesuffix;
  2. módulos novos: zoneinfo, graphlib;
  3. functools.cache;
  4. tipo genérico embutido com colchete fora de anotação adiada (list[str], dict[str, int]...).

Como o teste se prova: primeiro roda o varredor em exemplos RUINS (têm que ser reprovados) e em
exemplos BONS (têm que passar), e só então varre os arquivos de verdade. O CI também roda os
testes .py com um Python 3.8 de verdade (job python-3-8 em .github/workflows/portabilidade.yml).

Uso:
    node <dir-da-skill>/scripts/py.mjs test-python-38.py
"""
import ast
import sys
import unittest
from pathlib import Path

AQUI = Path(__file__).resolve().parent

METODOS_39 = {"is_relative_to", "with_stem", "removeprefix", "removesuffix"}
MODULOS_39 = {"zoneinfo", "graphlib"}
GENERICOS = {"list", "dict", "tuple", "set", "frozenset", "type"}


def _tem_anotacao_adiada(arvore):
    for no in arvore.body:
        if isinstance(no, ast.ImportFrom) and no.module == "__future__":
            if any(a.name == "annotations" for a in no.names):
                return True
    return False


def _nos_de_anotacao(arvore):
    """Ids dos nós que estão dentro de uma anotação (argumento, retorno ou variável anotada)."""
    dentro = set()

    def marcar(no):
        if no is None:
            return
        for filho in ast.walk(no):
            dentro.add(id(filho))

    for no in ast.walk(arvore):
        if isinstance(no, (ast.FunctionDef, ast.AsyncFunctionDef)):
            marcar(no.returns)
            args = no.args
            todos = list(args.args) + list(args.kwonlyargs) + list(getattr(args, "posonlyargs", []))
            if args.vararg:
                todos.append(args.vararg)
            if args.kwarg:
                todos.append(args.kwarg)
            for a in todos:
                marcar(a.annotation)
        elif isinstance(no, ast.AnnAssign):
            marcar(no.annotation)
    return dentro


def problemas(codigo, nome="<texto>"):
    """Lista de 'linha: motivo' para cada recurso 3.9+ achado no código."""
    arvore = ast.parse(codigo, filename=nome)
    adiada = _tem_anotacao_adiada(arvore)
    em_anotacao = _nos_de_anotacao(arvore) if adiada else set()
    achados = []
    for no in ast.walk(arvore):
        if isinstance(no, ast.Attribute) and no.attr in METODOS_39:
            achados.append(f"{no.lineno}: .{no.attr}() só existe do Python 3.9 em diante")
        elif isinstance(no, ast.Attribute) and no.attr == "cache" and isinstance(no.value, ast.Name) and no.value.id == "functools":
            achados.append(f"{no.lineno}: functools.cache só existe do Python 3.9 em diante (use lru_cache(maxsize=None))")
        elif isinstance(no, ast.Import):
            for a in no.names:
                if a.name.split(".")[0] in MODULOS_39:
                    achados.append(f"{no.lineno}: o módulo {a.name} só existe do Python 3.9 em diante")
        elif isinstance(no, ast.ImportFrom):
            if (no.module or "").split(".")[0] in MODULOS_39:
                achados.append(f"{no.lineno}: o módulo {no.module} só existe do Python 3.9 em diante")
            if no.module == "functools" and any(a.name == "cache" for a in no.names):
                achados.append(f"{no.lineno}: functools.cache só existe do Python 3.9 em diante")
        elif isinstance(no, ast.Subscript) and isinstance(no.value, ast.Name) and no.value.id in GENERICOS:
            if id(no) in em_anotacao:
                continue
            achados.append(f"{no.lineno}: {no.value.id}[...] como tipo só roda do Python 3.9 em diante (use typing.List e afins)")
    return achados


RUINS = {
    "is_relative_to": "from pathlib import Path\nPath('a').is_relative_to(Path('.'))\n",
    "removeprefix": "x = 'abc'.removeprefix('a')\n",
    "zoneinfo": "import zoneinfo\n",
    "functools.cache": "import functools\n@functools.cache\ndef f():\n    return 1\n",
    "generico na assinatura": "def f(x: list[str]) -> dict[str, int]:\n    return {}\n",
    "generico em tempo de execucao": "from __future__ import annotations\nT = list[int]\n",
}
BONS = {
    "relative_to com try": "from pathlib import Path\ntry:\n    Path('a').relative_to(Path('.'))\nexcept ValueError:\n    pass\n",
    "typing.List": "from typing import List\ndef f(x: List[str]) -> None:\n    return None\n",
    "anotacao adiada": "from __future__ import annotations\ndef f(x: list[str]) -> dict[str, int]:\n    return {}\n",
    "lista indexada": "a = [1, 2]\nb = a[0]\n",
}


class TestVarredor(unittest.TestCase):
    def test_reprova_os_ruins(self):
        for nome, codigo in RUINS.items():
            with self.subTest(nome=nome):
                self.assertTrue(problemas(codigo), f"o varredor deixou passar: {nome}")

    def test_aprova_os_bons(self):
        for nome, codigo in BONS.items():
            with self.subTest(nome=nome):
                self.assertEqual(problemas(codigo), [], f"o varredor reprovou um exemplo bom: {nome}")


class TestScriptsDaSkill(unittest.TestCase):
    def test_nenhum_script_usa_recurso_do_39(self):
        arquivos = sorted(AQUI.glob("*.py"))
        self.assertTrue(arquivos, "não achei nenhum .py em scripts/")
        falhas = []
        for arq in arquivos:
            if arq.name == Path(__file__).name:
                continue
            for p in problemas(arq.read_text(encoding="utf-8"), arq.name):
                falhas.append(f"{arq.name}:{p}")
        self.assertEqual(falhas, [], "Recurso do Python 3.9+ num script que promete 3.8:\n  " + "\n  ".join(falhas))


if __name__ == "__main__":
    print(f"Python {sys.version_info[0]}.{sys.version_info[1]}")
    unittest.main(verbosity=1)
