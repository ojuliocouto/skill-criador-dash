#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""3.9.1 (teste de aluno de 25/10/2026): os CSVs de exemplo terminavam em 04/10 e, com "Hoje" e
"7 dias" contando do calendário, o painel do aluno abria vazio e o vídeo de prova perdia o quadro com
número. Na CÓPIA do starter-kit (lancador.py iniciar), as datas dos exemplos andam juntas até HOJE (3.9.2;
na 3.9.1 era ontem, e "Hoje" abria vazio na aula). A cópia ainda passa nos testes que leem os exemplos.
O repositório não muda: os testes que fixaram o relógio em 04/10 continuam valendo.

    node <dir-da-skill>/scripts/py.mjs test-exemplos-ate-ontem.py
"""
import csv
import datetime as dt
import io
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
KIT = RAIZ / "starter-kit"
sys.path.insert(0, str(AQUI))
import exemplos_ate_ontem as ex  # noqa: E402

HOJE = dt.date(2026, 10, 26)


def datas(texto):
    linhas = list(csv.reader(io.StringIO(texto)))
    i = linhas[0].index("Data")
    return [ex.ler_data(l[i]) for l in linhas[1:] if l]


class Deslocar(unittest.TestCase):
    def test_iso_termina_hoje_e_mantem_os_intervalos(self):
        texto = "Data,Canal,Valor\n2026-08-06,A,\"1.137,48\"\n2026-08-07,A,2\n2026-10-04,B,3\n"
        novo = ex.deslocar_texto(texto, HOJE)
        d = datas(novo)
        self.assertEqual(max(d), HOJE)
        self.assertEqual(d[1] - d[0], dt.timedelta(days=1))
        self.assertEqual(d[2] - d[0], dt.timedelta(days=59))
        self.assertIn('"1.137,48"', novo, "o resto da linha fica byte a byte igual")
        self.assertTrue(novo.splitlines()[1].startswith("2026-08-28,"), "ISO continua ISO")

    def test_formato_brasileiro_continua_brasileiro(self):
        texto = "Data,Produto\n06/07/2026,X\n11/07/2026,Y\n"
        novo = ex.deslocar_texto(texto, HOJE)
        self.assertEqual(novo.splitlines()[2], "26/10/2026,Y")
        self.assertEqual(novo.splitlines()[1], "21/10/2026,X")

    def test_ja_atualizado_nao_muda(self):
        texto = "Data,X\n2026-10-26,1\n"
        self.assertEqual(ex.deslocar_texto(texto, HOJE), texto)

    def test_arquivo_sem_coluna_data_fica_intacto(self):
        texto = "Produto,Valor\nA,1\n"
        self.assertEqual(ex.deslocar_texto(texto, HOJE), texto)

    def test_os_seis_exemplos_do_kit_terminam_hoje_e_nao_perdem_linha(self):
        for arq in sorted((KIT / "examples").glob("*.csv")):
            original = arq.read_text(encoding="utf-8")
            novo = ex.deslocar_texto(original, HOJE)
            self.assertEqual(max(datas(novo)), HOJE, arq.name)
            self.assertEqual(len(original.splitlines()), len(novo.splitlines()), arq.name)
            self.assertEqual(len(set(datas(original))), len(set(datas(novo))), arq.name)


class NaCopia(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_iniciar_entrega_os_exemplos_e_os_modelos_ate_hoje_e_o_kit_nao_muda(self):
        antes = (KIT / "examples" / "marketing-60d.csv").read_bytes()
        r = subprocess.run([sys.executable, str(AQUI / "lancador.py"), "iniciar", str(self.tmp / "meu-dash"), "--hoje", HOJE.isoformat()],
                           capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        for pasta in ("examples", "public/modelos"):
            for arq in (self.tmp / "meu-dash" / pasta).glob("*.csv"):
                self.assertEqual(max(datas(arq.read_text(encoding="utf-8"))), HOJE, f"{pasta}/{arq.name}")
        self.assertEqual((KIT / "examples" / "marketing-60d.csv").read_bytes(), antes, "o starter-kit da skill não muda")
        self.assertIn("hoje", r.stdout.lower(), "o lançador diz que os exemplos foram trazidos até hoje")
        # 3.9.2: o roteiro manda o aluno rodar npm test na cópia; os testes que leem os exemplos
        # não podem depender da data original (na 3.9.1 deram 2 falhas ao vivo).
        kit = self.tmp / "meu-dash"
        t = subprocess.run(["node", "--test", "test/dados-exemplo.test.js", "test/modelos.test.js",
                            "test/kpi-funil-coluna-nao-mapeada.test.js"], cwd=kit, capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(t.returncode, 0, "npm test da cópia ficou vermelho:\n" + t.stdout[-3000:] + t.stderr[-2000:])

    def test_comando_exemplos_atualiza_um_projeto_ja_criado(self):
        proj = self.tmp / "proj"
        (proj / "examples").mkdir(parents=True)
        (proj / "examples" / "x.csv").write_text("Data,V\n2026-10-01,1\n2026-10-02,2\n", encoding="utf-8")
        r = subprocess.run([sys.executable, str(AQUI / "lancador.py"), "exemplos", str(proj), "--hoje", HOJE.isoformat()],
                           capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual((proj / "examples" / "x.csv").read_text(encoding="utf-8"), "Data,V\n2026-10-25,1\n2026-10-26,2\n")


if __name__ == "__main__":
    unittest.main(verbosity=2)
