#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Teste do verificador de ferramentas.

Um verificador que nunca reprova nada e pior do que nenhum: passa confianca falsa. Foi
exatamente assim que o MCP do 21st.dev ficou meses morto sendo dado como presente, porque a
deteccao era "aparece na lista?" e ele aparecia. Este teste garante que o checador REPROVA
o que tem que reprovar.

Nao depende do ambiente: o unico caso que exigiria ferramenta instalada e pulado com aviso
quando ela nao esta la.

    node <dir-da-skill>/scripts/py.mjs test-checar-ferramentas.py
"""
import importlib.util
import pathlib
import sys

AQUI = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("chk", AQUI / "checar-ferramentas.py")
chk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chk)

falhas, pulados = [], []


def checa(nome, condicao, detalhe=""):
    print(f"  [{'ok  ' if condicao else 'FALHA'}] {nome}{(' -> ' + detalhe) if detalhe else ''}")
    if not condicao:
        falhas.append(nome)


est, _ = chk.estado_mcp("servidor-mcp-que-nao-existe-xyz")
checa("MCP inexistente nao pode ser 'conectado'", est != "conectado", est)

checa("skill inexistente nao pode existir", not chk.skill_existe("skill-que-nao-existe-xyz"))

# O instalador (`npx skills add ... -g`) grava na pasta de config do Claude, que pode vir de
# CLAUDE_CONFIG_DIR; sem `-g` ele grava em ./.claude/skills da pasta atual. O verificador tem
# que achar a skill nos dois lugares, senao o aluno fica com "critico faltando" pra sempre.
import os
import tempfile

with tempfile.TemporaryDirectory() as _tmp:
    _base = pathlib.Path(_tmp)
    (_base / "cfg" / "skills" / "skill-de-teste-cfg").mkdir(parents=True)
    (_base / "proj" / ".claude" / "skills" / "skill-de-teste-proj").mkdir(parents=True)
    _env_antes, _cwd_antes = os.environ.get("CLAUDE_CONFIG_DIR"), os.getcwd()
    try:
        os.environ["CLAUDE_CONFIG_DIR"] = str(_base / "cfg")
        checa("acha skill na pasta de CLAUDE_CONFIG_DIR", chk.skill_existe("skill-de-teste-cfg"))
        os.chdir(_base / "proj")
        checa("acha skill de projeto em ./.claude/skills", chk.skill_existe("skill-de-teste-proj"))
    finally:
        os.chdir(_cwd_antes)
        if _env_antes is None:
            os.environ.pop("CLAUDE_CONFIG_DIR", None)
        else:
            os.environ["CLAUDE_CONFIG_DIR"] = _env_antes

_fonte_chk = (AQUI / "checar-ferramentas.py").read_text(encoding="utf-8")
_linhas_add = [l for l in _fonte_chk.splitlines() if "skills add " in l]
checa("todo `skills add` instala global, sem pergunta e por copia (-g -y --copy)",
      bool(_linhas_add) and all("-g -y --copy" in l for l in _linhas_add),
      f"{sum('-g -y --copy' not in l for l in _linhas_add)} linha(s) sem as opcoes")

ok, _ = chk.roda("comando-que-nao-existe-xyz", timeout=5)
checa("binario ausente vira ok=False (nao excecao)", ok is False)

ok, saida = chk.roda([sys.executable, "-c", "import time; time.sleep(5)"], timeout=1)
checa("timeout vira ok=False, com a saida explicando", ok is False and "timeout" in saida.lower(), saida[:40])

# As quatro classificacoes: sao elas que separam "responde" de "esta configurado".
# Sem isso, "Needs authentication" (o estado real do 21st.dev morto) passa por conectado.
orig = chk.roda
for linha, esperado in [
    ("magic: npx -y @21st-dev/magic - ✔ Connected", "conectado"),
    ("magic: npx -y @21st-dev/magic - ✗ Needs authentication", "sem_auth"),
    ("magic: npx -y @21st-dev/magic - ✗ Failed to connect", "falhou"),
    ("magic: npx -y @21st-dev/magic - ⚠ Tools fetch failed", "tools_falharam"),
]:
    chk.roda = lambda *a, _l=linha, **k: (True, _l)
    got, _ = chk.estado_mcp("magic")
    checa(f"'{linha.split('- ')[1]}' classifica como {esperado}", got == esperado, got)
chk.roda = orig

# T1 (aluno, 02/10/2026): o 21st.dev e pago, React e Tailwind, e o starter-kit e HTML em
# string. Ele nunca pode BLOQUEAR o passo 0 de quem nao tem a chave.
orig_estado, orig_roda2 = chk.estado_mcp, chk.roda
chk.estado_mcp = lambda nome: ("sem_auth", f"{nome}: Needs authentication")
chk.roda = lambda *a, **k: (True, "v22.13.1")
linhas = {r: c for r, p, c, o, d, f in chk.checagens(pular_testes=True)}
chk.estado_mcp, chk.roda = orig_estado, orig_roda2
item_21st = next((k for k in linhas if "21st" in k), None)
checa("21st.dev aparece no relatorio", item_21st is not None)
checa("21st.dev e OPCIONAL: sem chave nao bloqueia o passo 0", item_21st is not None and linhas[item_21st] is False)
# T3: a design-taste-frontend se declara fora de escopo pra dashboard. Vira apoio opcional;
# a frontend-design (plano visual antes do codigo) e a obrigatoria.
checa("design-taste-frontend e apoio opcional", linhas.get("skill design-taste-frontend") is False)
checa("frontend-design e obrigatoria", linhas.get("skill frontend-design") is True)

# So faz sentido se a ferramenta estiver instalada: senao seria testar o ambiente, nao o checador.
est_magic, det = chk.estado_mcp("magic")
if est_magic == "ausente":
    pulados.append("magic nao esta configurado nesta maquina: pulei o caso positivo")
else:
    checa("MCP presente e classificado (nao 'ausente')", est_magic != "ausente", est_magic)

print()
for p in pulados:
    print("  pulado:", p)
if falhas:
    print(f"\n  {len(falhas)} caso(s) falharam. O verificador nao esta confiavel.\n")
    sys.exit(1)
print("\n  Verificador confiavel: reprova o que tem que reprovar.\n")
