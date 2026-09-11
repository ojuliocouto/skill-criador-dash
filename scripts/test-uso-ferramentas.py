"""Regressões do gate: estado real e artefato, sem depender de MCP externo."""
import argparse
import contextlib
import importlib.util
import io
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

BASE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("uso", BASE / "uso-ferramentas.py")
uso = importlib.util.module_from_spec(spec)
spec.loader.exec_module(uso)


class GateUso(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.projeto = pathlib.Path(self.temp.name)
        (self.projeto / "prova.png").write_bytes(b"artefato de teste")

    def checar(self, estados, registros):
        uso.salvar(self.projeto, registros)
        with patch.object(uso, "estado_das_ferramentas", return_value=(estados, None)), contextlib.redirect_stdout(io.StringIO()):
            return uso.cmd_checar(argparse.Namespace(projeto=self.projeto, caminho="criar"))

    def registro(self):
        return {"evidencia": {"tipo": "arquivo", "valor": "prova.png"}}

    def test_positivo_com_artefatos(self):
        self.assertEqual(self.checar({"magic": True, "Playwright": True},
                                    {"magic": self.registro(), "Playwright": self.registro()}), 0)

    def test_negativo_sem_uso(self):
        self.assertEqual(self.checar({"magic": True}, {}), 1)

    def test_alias_nao_pode_sumir_da_cobranca(self):
        for nome in ("21st", "21st ou magic (21st.dev)"):
            with self.subTest(nome=nome):
                self.assertEqual(self.checar({nome: True, "Playwright": True},
                                            {"Playwright": self.registro()}), 1)

    def test_pasta_nao_e_artefato(self):
        self.assertFalse(uso.evidencia_vale({"tipo": "arquivo", "valor": "."}, self.projeto)[0])

    def test_declaracao_nao_e_prova(self):
        self.assertFalse(uso.evidencia_vale({"tipo": "declarado", "valor": "usei"}, self.projeto)[0])

    def test_artefato_removido_reprova(self):
        (self.projeto / "prova.png").unlink()
        self.assertEqual(self.checar({"Playwright": True}, {"Playwright": self.registro()}), 1)

    def test_trecho_vazio_reprova(self):
        self.assertFalse(uso.evidencia_vale({"tipo": "codigo", "valor": "", "em": str(self.projeto)}, self.projeto)[0])

    def test_critico_morto_nao_desaparece(self):
        retorno = argparse.Namespace(returncode=1, stdout=json.dumps([
            {"ferramenta": "Playwright", "ok": True, "critico": True},
            {"ferramenta": "21st", "ok": False, "critico": True}]))
        with patch.object(uso.subprocess, "run", return_value=retorno):
            estados, erro = uso.estado_das_ferramentas()
        self.assertIsNone(estados)
        self.assertTrue(erro)


if __name__ == "__main__":
    unittest.main(verbosity=2)
