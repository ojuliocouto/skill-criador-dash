# -*- coding: utf-8 -*-
"""Traz as datas dos CSVs de exemplo até ONTEM, na cópia do starter-kit do aluno (3.9.1).

Por que na cópia e não na leitura: o CSV que o aluno sobe vai inteiro para o KV do painel, e o painel
não sabe mais que ele veio de um exemplo. Deslocar datas na leitura mexeria em dado de verdade (ou
dependeria de uma marca frágil no arquivo). Na cópia é uma vez só, determinístico, testável, e o
repositório da skill não muda (os testes que fixaram o relógio em 04/10 seguem valendo).

Regra: todas as datas da coluna "Data" andam o MESMO número de dias, até a maior virar ontem.
Intervalos, ordem, formato (ISO ou dd/mm/aaaa) e o resto de cada linha ficam iguais, byte a byte.

    node <dir-da-skill>/scripts/py.mjs lancador.py exemplos <pasta-do-projeto>   # atualiza de novo num outro dia
"""
import csv
import datetime as dt
import io
import re
from pathlib import Path

ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
BR = re.compile(r"^(\d{2})/(\d{2})/(\d{4})$")
PASTAS = ("examples", "public/modelos")


def ler_data(valor):
    v = (valor or "").strip()
    m = ISO.match(v)
    if m:
        return dt.date(int(m[1]), int(m[2]), int(m[3]))
    m = BR.match(v)
    if m:
        return dt.date(int(m[3]), int(m[2]), int(m[1]))
    return None


def _escrever(data, modelo):
    return data.isoformat() if ISO.match(modelo.strip()) else data.strftime("%d/%m/%Y")


def deslocar_texto(texto, hoje):
    """Devolve o CSV com as datas da coluna Data deslocadas até ontem (relativo a `hoje`)."""
    linhas = texto.splitlines(keepends=True)
    if not linhas:
        return texto
    cab = next(csv.reader(io.StringIO(linhas[0])), [])
    if "Data" not in cab:
        return texto
    col = cab.index("Data")
    corpo = [(i, next(csv.reader(io.StringIO(l)), [])) for i, l in enumerate(linhas) if i > 0 and l.strip()]
    achadas = [ler_data(c[col]) for _, c in corpo if len(c) > col]
    achadas = [d for d in achadas if d]
    if not achadas:
        return texto
    passo = (hoje - dt.timedelta(days=1)) - max(achadas)
    if passo.days == 0:
        return texto
    for i, campos in corpo:
        if len(campos) <= col:
            continue
        d = ler_data(campos[col])
        if not d:
            continue
        novo = _escrever(d + passo, campos[col])
        linha = linhas[i]
        if col == 0:
            # Data é a primeira coluna nos exemplos do kit: troca só o começo da linha.
            linhas[i] = novo + linha[len(campos[0]):]
        else:
            campos[col] = novo
            buf = io.StringIO()
            csv.writer(buf, lineterminator="").writerow(campos)
            fim = linha[len(linha.rstrip("\r\n")):]
            linhas[i] = buf.getvalue() + fim
    return "".join(linhas)


def atualizar_pasta(projeto, hoje=None):
    """Desloca os CSVs de examples/ e public/modelos/ do projeto. Devolve os arquivos alterados."""
    hoje = hoje or dt.date.today()
    mudados = []
    for pasta in PASTAS:
        for arq in sorted((Path(projeto) / pasta).glob("*.csv")):
            with open(arq, encoding="utf-8", newline="") as f:  # newline="": guarda o \r\n de quem tiver
                original = f.read()
            novo = deslocar_texto(original, hoje)
            if novo != original:
                with open(arq, "w", encoding="utf-8", newline="") as f:
                    f.write(novo)
                mudados.append(arq)
    return mudados
