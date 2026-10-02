#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Trava do roteiro: o que o aluno iniciante leu no SKILL.md e travou não pode voltar.

Cada teste nasce de uma travada real do teste com aluno de 02/10/2026
(relatórios em sandbox-aluno-dash-20261002/relatorios/RELATORIO-dash.md).

    python3 scripts/test-skill-md.py
"""
import pathlib
import re
import unittest

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SKILL = (RAIZ / "SKILL.md").read_text(encoding="utf-8")
ARTE = (RAIZ / "references" / "direcao-de-arte.md").read_text(encoding="utf-8")
README = (RAIZ / "README.md").read_text(encoding="utf-8")


def linhas_com(texto, padrao):
    return [l for l in texto.splitlines() if re.search(padrao, l, re.IGNORECASE)]


class Roteiro(unittest.TestCase):
    def test_t1_21st_e_opcional_e_nao_e_instrucao(self):
        # O SKILL.md mandava montar card, tabela e filtro com o 21st.dev, que é pago e React.
        self.assertFalse("Use a **`magic` (21st.dev)**" in SKILL, "SKILL.md ainda manda usar o 21st.dev")
        self.assertFalse("Use a `magic` (21st.dev) para os componentes" in ARTE, "direcao-de-arte.md ainda manda usar o 21st.dev")
        for linha in linhas_com(SKILL, r"21st"):
            if "Por que isso existe" in linha or "MORTO" in linha or "construtor-paginas" in linha:
                continue
            with self.subTest(linha=linha[:80]):
                self.assertRegex(linha.lower(), r"opcional|react|morto|nunca|pulei",
                                 "toda menção ao 21st.dev precisa dizer que é opcional")

    def test_t2_comando_sem_variavel_que_o_zsh_nao_quebra(self):
        # zsh não divide $U em palavras: "no such file or directory: python3 ... --projeto ."
        self.assertFalse(re.search(r"^\s*U=", SKILL, re.MULTILINE), "SKILL.md ainda define U=")
        self.assertFalse(re.search(r"\$U\b", SKILL), "SKILL.md ainda usa $U")


if __name__ == "__main__":
    unittest.main(verbosity=2)
