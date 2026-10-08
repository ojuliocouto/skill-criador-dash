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
                arquivo.write_text(texto, encoding='utf-8')
                problemas = []
                with contextlib.redirect_stdout(io.StringIO()):
                    pre.check_toml(arquivo, problemas, 'wrangler.toml', False)
                self.assertEqual(bool(problemas), bloqueia)

    def rodar_main(self, *flags):
        # T6: no passo 1 o aluno não tem KV nenhum; o placeholder do wrangler.toml é esperado.
        with tempfile.TemporaryDirectory() as pasta:
            (pathlib.Path(pasta) / 'wrangler.toml').write_text('name = "meu-dashboard"\nid = "<SEU_KV_NAMESPACE_ID>"\n', encoding='utf-8')
            (pathlib.Path(pasta) / '.dev.vars').write_text('ADMIN_TOKEN=teste\n', encoding='utf-8')
            saida = io.StringIO()
            with patch.object(pre, 'check_node', lambda problemas: None), \
                 patch.object(pre, 'check_wrangler', lambda problemas, avisos: None), \
                 patch.object(pre.sys, 'argv', ['preflight.py', '--starter-kit', pasta, *flags]), \
                 contextlib.redirect_stdout(saida):
                codigo = pre.main()
            return codigo, saida.getvalue()

    def test_passo_1_placeholder_do_toml_nao_bloqueia(self):
        codigo, saida = self.rodar_main()
        self.assertEqual(codigo, 0, saida)
        self.assertNotIn('[BLOQUEIO]', saida)
        self.assertIn('passo 4', saida)

    def test_antes_do_deploy_placeholder_bloqueia(self):
        codigo, saida = self.rodar_main('--antes-do-deploy')
        self.assertEqual(codigo, 1, saida)
        self.assertIn('[BLOQUEIO]', saida)


class PortaEPastaAusente(unittest.TestCase):
    """D2 e D4 (teste de ponta a ponta, 02/10/2026)."""

    def test_porta_ocupada_vira_aviso_com_porta_livre_sugerida(self):
        import socket
        ocupado = socket.socket()
        ocupado.bind(('127.0.0.1', 0))
        ocupado.listen(1)
        self.addCleanup(ocupado.close)
        porta = ocupado.getsockname()[1]
        avisos = []
        with contextlib.redirect_stdout(io.StringIO()) as saida:
            pre.check_porta(avisos, porta)
        self.assertEqual(len(avisos), 1)
        self.assertIn(str(porta), avisos[0])
        self.assertIn('--port', avisos[0])
        sugerida = avisos[0].split('--port')[1].split()[0].strip('.`"')
        self.assertNotEqual(str(porta), sugerida)
        self.assertIn('[aviso]', saida.getvalue())

    def test_porta_livre_nao_avisa(self):
        import socket
        s = socket.socket()
        s.bind(('127.0.0.1', 0))
        porta = s.getsockname()[1]
        s.close()
        avisos = []
        with contextlib.redirect_stdout(io.StringIO()):
            pre.check_porta(avisos, porta)
        self.assertEqual(avisos, [])

    def rodar_pasta_ausente(self, *flags):
        with tempfile.TemporaryDirectory() as base:
            ausente = pathlib.Path(base) / 'meu dash ainda não existe'
            saida = io.StringIO()
            with patch.object(pre, 'check_node', lambda problemas: None), \
                 patch.object(pre, 'check_wrangler', lambda problemas, avisos: None), \
                 patch.object(pre, 'check_porta', lambda avisos, porta=8788: None), \
                 patch.object(pre.sys, 'argv', ['preflight.py', '--starter-kit', str(ausente), *flags]), \
                 contextlib.redirect_stdout(saida):
                codigo = pre.main()
            return codigo, saida.getvalue(), ausente

    def test_passo_1_pasta_ausente_nao_assusta_e_diz_o_comando_que_cria(self):
        codigo, saida, ausente = self.rodar_pasta_ausente()
        self.assertEqual(codigo, 0, saida)
        self.assertNotIn('[BLOQUEIO]', saida)
        self.assertIn('ainda não existe', saida)
        self.assertIn('lancador.py', saida)
        self.assertIn('iniciar', saida)
        self.assertFalse(ausente.exists(), 'o preflight só lê, nunca cria pasta')

    def test_antes_do_deploy_pasta_ausente_bloqueia(self):
        codigo, saida, _ = self.rodar_pasta_ausente('--antes-do-deploy')
        self.assertEqual(codigo, 1, saida)
        self.assertIn('[BLOQUEIO]', saida)
        self.assertIn('iniciar', saida)


if __name__ == '__main__':
    unittest.main(verbosity=2)
