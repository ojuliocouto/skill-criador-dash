#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Texto que o aluno lê no terminal sai com acento.

T14 do teste com aluno (02/10/2026): "Pecas do starter-kit", "Pode comecar", "ha numero, nao
que ele esta certo". Varre as strings dos scripts (.py pela árvore ast; prova-dash.js pelos
literais fora de comentário) e reprova palavra sem acento. Docstring e comentário ficam de
fora: não aparecem pra ninguém. A lista de palavras é a mesma do teste do starter-kit.

    node <dir-da-skill>/scripts/py.mjs test-acentuacao.py
"""
import ast
import json
import pathlib
import re
import sys

for _fluxo in (sys.stdout, sys.stderr):  # console cp1252 ou ASCII não pode derrubar o teste num acento
    try:
        _fluxo.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError, OSError):
        pass

AQUI = pathlib.Path(__file__).resolve().parent
MAPA = json.loads((AQUI.parent / "starter-kit" / "test" / "fixtures" / "sem-acento.json").read_text(encoding="utf-8"))
RE = re.compile(r"(?<![\w-])(" + "|".join(re.escape(k) for k in sorted(MAPA, key=len, reverse=True)) + r")(?![\w-])",
                re.IGNORECASE)


def strings_python(fonte):
    """Textos de tela dos scripts .py, pela árvore do Python (ast). No Python 3.12 o tokenize separa o f-string em pedaços
    (FSTRING_START, FSTRING_MIDDLE...) e a conta por token deixa de valer; a árvore é a mesma em toda versão."""
    arvore = ast.parse(fonte)
    docstrings = set()
    for no in ast.walk(arvore):
        if isinstance(no, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and no.body:
            primeiro = no.body[0]
            if isinstance(primeiro, ast.Expr) and isinstance(primeiro.value, ast.Constant) and isinstance(primeiro.value.value, str):
                docstrings.add(id(primeiro.value))
        # string solta como statement (docstring de atributo, comentário em forma de texto): ninguém lê
        if isinstance(no, ast.Expr) and isinstance(no.value, ast.Constant) and isinstance(no.value.value, str):
            docstrings.add(id(no.value))
    achados = []
    for no in ast.walk(arvore):
        if isinstance(no, ast.Constant) and isinstance(no.value, str) and id(no) not in docstrings and re.search(r"\s", no.value):
            achados.append((no.lineno, no.value))
    return sorted(achados)


def strings_js(fonte):
    em_bloco = False
    for n, linha in enumerate(fonte.split("\n"), 1):
        t = linha.strip()
        if em_bloco:
            em_bloco = "*/" not in t
            continue
        if t.startswith("/*"):
            em_bloco = "*/" not in t
            continue
        if t.startswith("//") or t.startswith("*"):
            continue
        for m in re.finditer(r"'(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\"|`(?:[^`\\]|\\.)*`|//.*$", linha):
            if m.group(0).startswith("//"):
                break
            if re.search(r"\s", m.group(0)):
                yield n, m.group(0)


def strings_md(fonte):
    """Texto do roteiro que o agente lê em voz alta pro aluno. Fica de fora só o que é nome de
    arquivo ou chave: código entre crases, chave de JSON ("operacao":) e placeholder <...>."""
    for n, linha in enumerate(fonte.split("\n"), 1):
        t = re.sub(r"`[^`]*`", " ", linha)
        t = re.sub(r"\"[\w.]+\"\s*:", " ", t)
        t = re.sub(r"<[^>]*>", " ", t)
        yield n, t


def achados(caminho):
    fonte = caminho.read_text(encoding="utf-8")
    if caminho.suffix == ".py":
        gerador = strings_python(fonte)
    elif caminho.suffix == ".md":
        gerador = strings_md(fonte)
    else:
        gerador = strings_js(fonte)
    for n, texto in gerador:
        for m in RE.finditer(texto):
            yield f"{caminho.name}:{n} \"{m.group(1)}\" -> \"{MAPA[m.group(1).lower()]}\""


def main():
    alvos = [p for p in sorted(AQUI.glob("*.py")) if not p.name.startswith("test-")]
    alvos += [AQUI / "prova-dash.js", AQUI.parent / "SKILL.md"]
    alvos += sorted((AQUI.parent / "references").glob("*.md"))
    erros = [e for a in alvos for e in achados(a)]
    caso_do_aluno = list(RE.finditer("isto prova que ha numero, nao que ele esta certo"))
    if len(caso_do_aluno) != 3:
        print("FALHA: o detector não pegou o caso do aluno")
        return 1
    # O leitor de strings se prova em f-string e string comum, em qualquer versão do Python (a 3.12 separa o f-string em tokens).
    for amostra in ('x = f"voce nao {n} sabe"', 'x = "voce nao sabe"', 'x = ("voce "\n     f"nao {n}")'):
        if not any(RE.search(texto) for _, texto in strings_python(amostra)):
            print(f"FALHA: o leitor de strings não viu o texto sem acento em: {amostra!r}")
            return 1
    if list(strings_python('def f():\n    """voce nao docstring"""\n')):
        print("FALHA: docstring não pode contar como texto de tela")
        return 1
    if erros:
        print(f"FALHA: {len(erros)} palavra(s) sem acento em texto visível dos scripts:")
        for e in erros:
            print("  " + e)
        return 1
    print(f"OK: {len(alvos)} arquivos (scripts, SKILL.md e references) sem palavra sem acento em texto visível.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
