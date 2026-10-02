#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Texto que o aluno lê no terminal sai com acento.

T14 do teste com aluno (02/10/2026): "Pecas do starter-kit", "Pode comecar", "ha numero, nao
que ele esta certo". Varre as strings dos scripts (.py pelo tokenize; prova-dash.js pelos
literais fora de comentário) e reprova palavra sem acento. Docstring e comentário ficam de
fora: não aparecem pra ninguém. A lista de palavras é a mesma do teste do starter-kit.

    python3 scripts/test-acentuacao.py
"""
import io
import json
import pathlib
import re
import sys
import tokenize

AQUI = pathlib.Path(__file__).resolve().parent
MAPA = json.loads((AQUI.parent / "starter-kit" / "test" / "fixtures" / "sem-acento.json").read_text(encoding="utf-8"))
RE = re.compile(r"(?<![\w-])(" + "|".join(re.escape(k) for k in sorted(MAPA, key=len, reverse=True)) + r")(?![\w-])",
                re.IGNORECASE)


def strings_python(fonte):
    toks = list(tokenize.generate_tokens(io.StringIO(fonte).readline))
    for i, t in enumerate(toks):
        if t.type != tokenize.STRING:
            continue
        # Docstring: string sozinha num statement. Dentro de parênteses as quebras são NL (não
        # NEWLINE), então string de mensagem quebrada em várias linhas não passa por docstring.
        j = i - 1
        while j >= 0 and toks[j].type in (tokenize.NL, tokenize.COMMENT):
            j -= 1
        anterior = toks[j].type if j >= 0 else tokenize.NEWLINE
        seguinte = toks[i + 1].type if i + 1 < len(toks) else tokenize.NEWLINE
        if anterior in (tokenize.NEWLINE, tokenize.INDENT, tokenize.DEDENT, tokenize.ENCODING) and seguinte in (tokenize.NEWLINE, tokenize.ENDMARKER):
            continue
        texto = t.string
        if re.match(r"[A-Za-z]*[fF]", texto):
            # {expressão} de f-string não é texto; só o que estiver entre aspas lá dentro é.
            texto = re.sub(r"\{([^{}]*)\}",
                           lambda m: " " + " ".join(a or b for a, b in re.findall(r"'([^']*)'|\"([^\"]*)\"", m.group(1))) + " ",
                           texto)
        if re.search(r"\s", texto):
            yield t.start[0], texto


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
    if erros:
        print(f"FALHA: {len(erros)} palavra(s) sem acento em texto visível dos scripts:")
        for e in erros:
            print("  " + e)
        return 1
    print(f"OK: {len(alvos)} arquivos (scripts, SKILL.md e references) sem palavra sem acento em texto visível.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
