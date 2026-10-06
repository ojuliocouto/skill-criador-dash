"""Provas pela CLI: pular etapa e alterar evidência precisam bloquear."""
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).with_name('gate-etapas.py')


class Etapas(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.pasta = pathlib.Path(self.temp.name)
        (self.pasta / 'briefing.txt').write_text('Documento de controle com informações confirmadas', encoding='utf-8')
        self.doc = {'briefing': dict.fromkeys(['nicho', 'local', 'publico', 'oferta', 'preco', 'acao'], 'Informado'), 'inventario': ['Fonte'], 'secoes': ['Hero'], 'arquivos': ['briefing.txt']}

    def rodar(self, *args):
        (self.pasta / 'etapa.json').write_text(json.dumps(self.doc), encoding='utf-8')
        r = subprocess.run([sys.executable, str(SCRIPT), '--projeto', str(self.pasta), *args], capture_output=True, text=True, encoding='utf-8', errors='replace')
        return r.returncode

    def test_positivo_e_releitura(self):
        self.assertEqual(self.rodar('registrar', '0', '--arquivo', 'etapa.json'), 0)
        self.assertEqual(self.rodar('checar', '0'), 0)

    def test_nao_pula_copy(self):
        self.assertEqual(self.rodar('registrar', '2', '--arquivo', 'etapa.json'), 1)

    def test_briefing_incompleto_reprova(self):
        del self.doc['briefing']['acao']
        self.assertEqual(self.rodar('registrar', '0', '--arquivo', 'etapa.json'), 1)

    def test_artefato_alterado_reprova(self):
        self.assertEqual(self.rodar('registrar', '0', '--arquivo', 'etapa.json'), 0)
        (self.pasta / 'briefing.txt').write_text('Conteúdo diferente', encoding='utf-8')
        self.assertEqual(self.rodar('checar', '0'), 1)

    def test_artefato_ausente_reprova(self):
        self.doc['arquivos'] = ['inexistente.txt']
        self.assertEqual(self.rodar('registrar', '0', '--arquivo', 'etapa.json'), 1)


class EtapasDash(unittest.TestCase):
    """T12 (teste com aluno, 02/10/2026): "Não" passava como prova nas etapas 4 e 6."""

    DOCS = {
        '1': {'ambiente': 'Node 22, npm test verde'},
        '2': {'operacao': 'Estúdio', 'inventario': '13 linhas'},
        '2.5': dict.fromkeys(['numero_heroi', 'pergunta', 'exclusoes', 'accent', 'densidade', 'tema'], 'Decidido'),
        '3': {'modo_dados': 'ao vivo'},
        '4': {'conta_confirmada': 'wrangler whoami: conta da pessoa', 'infra': 'KV criado'},
        '5': {'primeiro_render': 'conferido', 'mapeamento': 'Data, Investimento'},
    }

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.pasta = pathlib.Path(self.temp.name)
        (self.pasta / 'nota.txt').write_text('evidência real', encoding='utf-8')
        (self.pasta / 'dash-desktop.png').write_bytes(b'\x89PNG prova')
        (self.pasta / 'video-desktop.webm').write_bytes(b'\x1a\x45\xdf\xa3 video de prova')
        (self.pasta / 'video-mobile.webm').write_bytes(b'\x1a\x45\xdf\xa3 video de prova')

    def registrar(self, etapa, doc):
        arq = self.pasta / f'etapa-{etapa}.json'
        arq.write_text(json.dumps({'arquivos': ['nota.txt'], **doc}), encoding='utf-8')
        r = subprocess.run([sys.executable, str(SCRIPT), '--perfil', 'dash', '--projeto', str(self.pasta),
                            'registrar', etapa, '--arquivo', arq.name], capture_output=True, text=True, encoding='utf-8', errors='replace')
        return r.returncode

    def ate(self, ultima):
        for e in ['1', '2', '2.5', '3', '4', '5']:
            if e == ultima:
                return
            self.assertEqual(self.registrar(e, self.DOCS[e]), 0, f'etapa {e}')

    def test_etapa_4_nao_aceita_conta_nao_confirmada(self):
        self.ate('4')
        for valor in ('Não: aluno sem conta', 'NÃO confirmada', 'nao tem conta'):
            with self.subTest(valor=valor):
                self.assertEqual(self.registrar('4', {**self.DOCS['4'], 'conta_confirmada': valor}), 1)

    def etapa6(self, prova, arquivos):
        self.ate('6')
        self.assertEqual(self.registrar('5', self.DOCS['5']), 0)
        doc = {'prova_publicada': prova, 'pendencias': 'Nenhuma', 'arquivos': arquivos,
               'passe_de_gosto': {'antes': 3, 'depois': 0, 'inspecao': 'tells da Fase 3'}}
        arq = self.pasta / 'etapa-6.json'
        arq.write_text(json.dumps(doc), encoding='utf-8')
        r = subprocess.run([sys.executable, str(SCRIPT), '--perfil', 'dash', '--projeto', str(self.pasta),
                            'registrar', '6', '--arquivo', arq.name], capture_output=True, text=True, encoding='utf-8', errors='replace')
        return r.returncode

    URL = 'https://meu-dash.pages.dev/dashboard.html?id=x'
    VIDEOS = ['video-desktop.webm', 'video-mobile.webm']

    def test_etapa_6_nao_aceita_nao_publicada(self):
        self.assertEqual(self.etapa6('NÃO publicada: sem conta', ['dash-desktop.png', *self.VIDEOS]), 1)

    def test_etapa_6_exige_url_https(self):
        self.assertEqual(self.etapa6('http://localhost:8788/dashboard.html?id=x', ['dash-desktop.png', *self.VIDEOS]), 1)

    def test_etapa_6_exige_png_da_prova(self):
        self.assertEqual(self.etapa6(self.URL, ['nota.txt', *self.VIDEOS]), 1)

    def test_etapa_6_exige_o_video_de_prova(self):
        # A fatia 02 (3.6.0): etapa sem vídeo não registra, mesmo com URL e print.
        self.assertEqual(self.etapa6(self.URL, ['dash-desktop.png']), 1)

    def test_etapa_6_exige_video_do_desktop_e_do_celular(self):
        self.assertEqual(self.etapa6(self.URL, ['dash-desktop.png', 'video-desktop.webm']), 1)
        self.assertEqual(self.etapa6(self.URL, ['dash-desktop.png', 'video-mobile.webm']), 1)

    def test_etapa_6_nao_aceita_arquivo_qualquer_com_nome_de_video(self):
        # O nome certo com a extensão errada (um PNG renomeado, uma nota) não é vídeo.
        (self.pasta / 'video-desktop.png').write_bytes(b'\x89PNG')
        (self.pasta / 'video-mobile.txt').write_text('nota', encoding='utf-8')
        self.assertEqual(self.etapa6(self.URL, ['dash-desktop.png', 'video-desktop.png', 'video-mobile.txt']), 1)

    def test_etapa_6_aceita_mp4_alem_de_webm(self):
        (self.pasta / 'video-desktop.mp4').write_bytes(b'mp4 de prova')
        (self.pasta / 'video-mobile.mp4').write_bytes(b'mp4 de prova')
        self.assertEqual(self.etapa6(self.URL, ['dash-desktop.png', 'video-desktop.mp4', 'video-mobile.mp4']), 0)

    def test_etapa_6_positivo(self):
        self.assertEqual(self.etapa6(self.URL, ['dash-desktop.png', *self.VIDEOS]), 0)

    def test_etapa_6_mensagem_do_video_diz_o_comando(self):
        self.etapa6(self.URL, ['dash-desktop.png'])
        r = subprocess.run([sys.executable, str(SCRIPT), '--perfil', 'dash', '--projeto', str(self.pasta),
                            'registrar', '6', '--arquivo', 'etapa-6.json'], capture_output=True, text=True, encoding='utf-8', errors='replace')
        self.assertIn('gravar-video.js', r.stdout)


if __name__ == '__main__':
    unittest.main(verbosity=2)
