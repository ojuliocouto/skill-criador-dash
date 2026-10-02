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
        (self.pasta / 'briefing.txt').write_text('Documento de controle com informações confirmadas')
        self.doc = {'briefing': dict.fromkeys(['nicho', 'local', 'publico', 'oferta', 'preco', 'acao'], 'Informado'), 'inventario': ['Fonte'], 'secoes': ['Hero'], 'arquivos': ['briefing.txt']}

    def rodar(self, *args):
        (self.pasta / 'etapa.json').write_text(json.dumps(self.doc))
        r = subprocess.run([sys.executable, str(SCRIPT), '--projeto', str(self.pasta), *args], capture_output=True, text=True)
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
        (self.pasta / 'briefing.txt').write_text('Conteúdo diferente')
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
        (self.pasta / 'nota.txt').write_text('evidência real')
        (self.pasta / 'dash-desktop.png').write_bytes(b'\x89PNG prova')

    def registrar(self, etapa, doc):
        arq = self.pasta / f'etapa-{etapa}.json'
        arq.write_text(json.dumps({'arquivos': ['nota.txt'], **doc}))
        r = subprocess.run([sys.executable, str(SCRIPT), '--perfil', 'dash', '--projeto', str(self.pasta),
                            'registrar', etapa, '--arquivo', arq.name], capture_output=True, text=True)
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
        arq.write_text(json.dumps(doc))
        r = subprocess.run([sys.executable, str(SCRIPT), '--perfil', 'dash', '--projeto', str(self.pasta),
                            'registrar', '6', '--arquivo', arq.name], capture_output=True, text=True)
        return r.returncode

    def test_etapa_6_nao_aceita_nao_publicada(self):
        self.assertEqual(self.etapa6('NÃO publicada: sem conta', ['dash-desktop.png']), 1)

    def test_etapa_6_exige_url_https(self):
        self.assertEqual(self.etapa6('http://localhost:8788/dashboard.html?id=x', ['dash-desktop.png']), 1)

    def test_etapa_6_exige_png_da_prova(self):
        self.assertEqual(self.etapa6('https://meu-dash.pages.dev/dashboard.html?id=x', ['nota.txt']), 1)

    def test_etapa_6_positivo(self):
        self.assertEqual(self.etapa6('https://meu-dash.pages.dev/dashboard.html?id=x', ['dash-desktop.png']), 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
