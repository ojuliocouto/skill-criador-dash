"""Preflight precisa reprovar versões antigas e placeholders ativos."""
import contextlib
import importlib.util
import io
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('pre', pathlib.Path(__file__).with_name('preflight.py'))
pre = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pre)


class Preflight(unittest.TestCase):
    def test_versao_antiga_reprova(self):
        problemas = []
        with patch.object(pre.shutil, 'which', return_value='/node'), patch.object(pre, 'run', return_value='v18.20.0'), contextlib.redirect_stdout(io.StringIO()):
            pre.check_node(problemas)
        self.assertTrue(problemas)

    def test_versao_atual_passa(self):
        problemas = []
        with patch.object(pre.shutil, 'which', return_value='/node'), patch.object(pre, 'run', return_value='v22.13.1'), contextlib.redirect_stdout(io.StringIO()):
            pre.check_node(problemas)
        self.assertFalse(problemas)

    def test_placeholder_ativo_reprova_comentario_nao(self):
        with tempfile.TemporaryDirectory() as pasta:
            arquivo = pathlib.Path(pasta) / 'wrangler.toml'
            for texto, bloqueia in [('id = "<SEU_KV_NAMESPACE_ID>"', True), ('# id = "<SEU_KV_NAMESPACE_ID>"\nname = "controle"', False)]:
                arquivo.write_text(texto)
                problemas = []
                with contextlib.redirect_stdout(io.StringIO()):
                    pre.check_toml(arquivo, problemas, 'wrangler.toml', False)
                self.assertEqual(bool(problemas), bloqueia)


if __name__ == '__main__':
    unittest.main(verbosity=2)
