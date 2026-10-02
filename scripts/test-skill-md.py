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
GATE_ETAPAS = (RAIZ / "references" / "gate-etapas.md").read_text(encoding="utf-8")


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

    def test_t3_anti_slop_e_a_lista_de_tells_e_a_taste_so_apoia(self):
        # A design-taste-frontend se declara fora de escopo pra dashboard ("Not dashboards").
        for linha in linhas_com(SKILL, r"design-taste-frontend"):
            with self.subTest(linha=linha[:80]):
                self.assertRegex(linha.lower(), r"apoio|fora de escopo|opcional",
                                 "a design-taste-frontend só pode aparecer como leitura de apoio")
        self.assertTrue("pré-voo anti-slop" in SKILL, "falta " + "pré-voo anti-slop")
        self.assertTrue("tells" in SKILL, "falta " + "tells")
        self.assertTrue(re.search(r"`frontend-design`[^\n]*obrigat", SKILL), "frontend-design precisa constar como obrigatória")
        self.assertTrue("pré-voo anti-slop" in ARTE, "falta " + "pré-voo anti-slop")

    def test_t5_pasta_do_projeto_e_explicita(self):
        # "<dir>", "<dir-da-skill>" e "projeto do aluno" nunca eram definidos, e o Quickstart
        # mandava trabalhar dentro da pasta da skill.
        self.assertTrue("cp -R ~/.claude/skills/criador-dash/starter-kit ~/meu-dash" in SKILL,
                        "falta o passo de copiar o starter-kit pra pasta do aluno")
        sobra = sorted(set(re.findall(r"<dir[^>]*>", SKILL)))
        self.assertFalse(sobra, f"placeholder de pasta sem definição: {sobra}")
        self.assertFalse(re.search(r"cd starter-kit\b", SKILL), "SKILL.md ainda manda trabalhar dentro da pasta da skill")
        for etapa in ("1", "2", "2.5", "3", "4", "5", "6", "7"):
            with self.subTest(etapa=etapa):
                self.assertTrue(f"evidencias/etapa-{etapa}.json" in GATE_ETAPAS,
                                f"gate-etapas.md sem exemplo da etapa {etapa} do perfil dash")
        self.assertFalse(re.search(r"<dir[^>]*>", GATE_ETAPAS), "gate-etapas.md com placeholder de pasta")

    def test_t6_preflight_do_passo_1_nao_assusta_e_o_do_deploy_bloqueia(self):
        # Passo 1 gritava BLOQUEIO por placeholder do wrangler.toml, que só vale no passo 4.
        self.assertTrue(re.search(r"preflight\.py --starter-kit ~/meu-dash --antes-do-deploy", SKILL),
                        "o passo 4 precisa rodar o preflight com --antes-do-deploy")
        self.assertTrue(re.search(r"esperado[^\n]*passo 4", SKILL),
                        "o passo 1 precisa dizer que o aviso do wrangler.toml é esperado até o passo 4")

    def test_t7_decisoes_do_2_5_entram_pela_config(self):
        # O wizard não deixava escolher herói nem tirar métrica; o aluno editou o template.
        self.assertTrue("heroMetric" in SKILL and "hiddenMetrics" in SKILL,
                        "o SKILL.md precisa dizer onde o herói e as ocultas entram")
        self.assertFalse("Monte a faixa de KPI e o PRIMEIRO widget" in SKILL,
                         "o wizard cria o painel inteiro; o 5.1 precisa dizer crie, renderize, compare")


if __name__ == "__main__":
    unittest.main(verbosity=2)
