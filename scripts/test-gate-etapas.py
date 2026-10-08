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


WHOAMI = (' ⛅️ wrangler 4.1.0\n\nGetting User settings...\n👋 You are logged in with an OAuth Token, associated with the email ana@exemplo.com.\n'
          '┌──────────────────┬──────────────────────────────────┐\n│ Account Name     │ Account ID                       │\n'
          '├──────────────────┼──────────────────────────────────┤\n│ Conta da Ana     │ 0123456789abcdef0123456789abcdef │\n└──────────────────┴──────────────────────────────────┘\n')
TOML = 'name = "clinica-lume"\npages_build_output_dir = "public"\n[[kv_namespaces]]\nbinding = "DASHBOARDS_KV"\nid = "0123456789abcdef0123456789abcdef"\n'


class EtapasDash(unittest.TestCase):
    """T12 (teste com aluno, 02/10/2026): "Não" passava como prova nas etapas 4 e 6."""

    DOCS = {
        '1': {'ambiente': 'Node 22, npm test verde'},
        '2': {'operacao': 'Estúdio', 'inventario': '13 linhas'},
        '2.5': dict.fromkeys(['numero_heroi', 'pergunta', 'exclusoes', 'accent', 'densidade', 'tema'], 'Decidido'),
        '3': {'modo_dados': 'ao vivo'},
        '4': {'conta_confirmada': 'wrangler whoami: conta da pessoa', 'infra': 'KV criado',
              'arquivos': ['whoami.txt', 'wrangler.toml']},
        '5': {'primeiro_render': 'conferido', 'mapeamento': 'Data, Investimento'},
    }

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.pasta = pathlib.Path(self.temp.name)
        (self.pasta / 'nota.txt').write_text('evidência real', encoding='utf-8')
        (self.pasta / 'whoami.txt').write_text(WHOAMI, encoding='utf-8')
        (self.pasta / 'wrangler.toml').write_text(TOML, encoding='utf-8')
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


class Etapa4ConfereDeVerdade(unittest.TestCase):
    """D1, complemento: o gate da etapa 4 só olhava se o texto começava com "Não"; qualquer outro texto passava.
    Agora ele confere o que a etapa quer garantir: conta Cloudflare confirmada (saída do wrangler whoami)
    e infra provisionada (wrangler.toml do projeto com o id real do KV, sem placeholder)."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.pasta = pathlib.Path(self.temp.name)
        (self.pasta / 'nota.txt').write_text('evidência real', encoding='utf-8')
        (self.pasta / 'whoami.txt').write_text(WHOAMI, encoding='utf-8')
        (self.pasta / 'wrangler.toml').write_text(TOML, encoding='utf-8')
        for e in ['1', '2', '2.5', '3']:
            self.assertEqual(self.reg(e, EtapasDash.DOCS[e])[0], 0)

    def reg(self, etapa, doc):
        arq = self.pasta / f'etapa-{etapa}.json'
        arq.write_text(json.dumps({'arquivos': ['nota.txt'], **doc}), encoding='utf-8')
        r = subprocess.run([sys.executable, str(SCRIPT), '--perfil', 'dash', '--projeto', str(self.pasta),
                            'registrar', etapa, '--arquivo', arq.name], capture_output=True, text=True, encoding='utf-8', errors='replace')
        return r.returncode, r.stdout

    def quatro(self, **troca):
        return self.reg('4', {**EtapasDash.DOCS['4'], **troca})

    def test_evidencia_real_passa(self):
        self.assertEqual(self.quatro()[0], 0)

    def test_mutante_texto_qualquer_sem_whoami_barra(self):
        # "SIMULADA..." passava; sem o arquivo do whoami não passa mais.
        codigo, saida = self.quatro(conta_confirmada='SIMULADA: conta da pessoa', arquivos=['nota.txt', 'wrangler.toml'])
        self.assertEqual(codigo, 1, saida)
        self.assertIn('whoami', saida)

    def test_mutante_whoami_com_texto_inventado_barra(self):
        (self.pasta / 'whoami.txt').write_text('SIMULADA: conta da pessoa confirmada', encoding='utf-8')
        codigo, saida = self.quatro()
        self.assertEqual(codigo, 1, saida)
        self.assertIn('whoami', saida)

    def test_mutante_whoami_deslogado_barra(self):
        (self.pasta / 'whoami.txt').write_text('Getting User settings...\nYou are not authenticated. Please run `wrangler login`.\n', encoding='utf-8')
        self.assertEqual(self.quatro()[0], 1)

    def test_mutante_wrangler_toml_com_placeholder_barra(self):
        (self.pasta / 'wrangler.toml').write_text(TOML.replace('0123456789abcdef0123456789abcdef', '<SEU_KV_NAMESPACE_ID>'), encoding='utf-8')
        codigo, saida = self.quatro()
        self.assertEqual(codigo, 1, saida)
        self.assertIn('wrangler.toml', saida)

    def test_mutante_wrangler_toml_sem_kv_barra(self):
        (self.pasta / 'wrangler.toml').write_text('name = "clinica-lume"\npages_build_output_dir = "public"\n', encoding='utf-8')
        self.assertEqual(self.quatro()[0], 1)

    def test_mutante_wrangler_toml_ausente_barra(self):
        (self.pasta / 'wrangler.toml').unlink()
        self.assertEqual(self.quatro(arquivos=['whoami.txt'])[0], 1)

    def test_mutante_placeholder_so_em_comentario_nao_barra(self):
        (self.pasta / 'wrangler.toml').write_text(TOML + '# id = "<SEU_D1_ID>"\n', encoding='utf-8')
        self.assertEqual(self.quatro()[0], 0)

    def test_evidencia_alterada_depois_barra_na_checagem(self):
        self.assertEqual(self.quatro()[0], 0)
        (self.pasta / 'whoami.txt').write_text(WHOAMI.replace('Conta da Ana', 'Outra conta'), encoding='utf-8')
        r = subprocess.run([sys.executable, str(SCRIPT), '--perfil', 'dash', '--projeto', str(self.pasta), 'checar', '4'],
                           capture_output=True, text=True, encoding='utf-8', errors='replace')
        self.assertEqual(r.returncode, 1)


class ModoLocalSemConta(unittest.TestCase):
    """D1 (teste de ponta a ponta, 02/10/2026): sem conta Cloudflare o gate travava as etapas 5, 6 e 7.
    Construir e provar em local fecha sozinho; publicar continua exigindo a conta, sem publicação falsa."""

    LOCAL = {'modo': 'local', 'conta_confirmada': 'Não: a pessoa ainda não tem conta Cloudflare',
             'infra': 'local: wrangler pages dev com KV em disco; nada provisionado na Cloudflare',
             'publicacao_pendente': 'Publicar depois que a pessoa criar a conta (etapas 4 e 6)'}

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.pasta = pathlib.Path(self.temp.name)
        (self.pasta / 'nota.txt').write_text('evidência real', encoding='utf-8')
        (self.pasta / 'whoami.txt').write_text(WHOAMI, encoding='utf-8')
        (self.pasta / 'wrangler.toml').write_text(TOML, encoding='utf-8')
        (self.pasta / 'dash-desktop.png').write_bytes(b'\x89PNG prova')
        (self.pasta / 'video-desktop.webm').write_bytes(b'\x1a\x45\xdf\xa3 video')
        (self.pasta / 'video-mobile.webm').write_bytes(b'\x1a\x45\xdf\xa3 video')

    def gate(self, comando, etapa, doc=None):
        argv = [sys.executable, str(SCRIPT), '--perfil', 'dash', '--projeto', str(self.pasta), comando, etapa]
        if doc is not None:
            arq = self.pasta / f'etapa-{etapa}.json'
            arq.write_text(json.dumps({'arquivos': ['nota.txt'], **doc}), encoding='utf-8')
            argv += ['--arquivo', arq.name]
        r = subprocess.run(argv, capture_output=True, text=True, encoding='utf-8', errors='replace')
        return r.returncode, r.stdout

    def ate_a_4_local(self):
        for e in ['1', '2', '2.5', '3']:
            self.assertEqual(self.gate('registrar', e, EtapasDash.DOCS[e])[0], 0, e)
        return self.gate('registrar', '4', self.LOCAL)

    def test_etapa_4_local_registra_e_a_5_segue(self):
        self.assertEqual(self.ate_a_4_local()[0], 0)
        self.assertEqual(self.gate('registrar', '5', EtapasDash.DOCS['5'])[0], 0, 'a etapa 5 (montar e provar em local) tem que fechar sem conta')

    def test_etapa_4_sem_modo_local_continua_barrando_nao(self):
        # Não afrouxou: "Não" sozinho, sem declarar o modo local, segue bloqueando.
        for e in ['1', '2', '2.5', '3']:
            self.gate('registrar', e, EtapasDash.DOCS[e])
        sem_modo = {k: v for k, v in self.LOCAL.items() if k != 'modo'}
        codigo, saida = self.gate('registrar', '4', sem_modo)
        self.assertEqual(codigo, 1, saida)
        self.assertIn('conta não confirmada', saida)

    def test_modo_local_exige_dizer_o_que_fica_pendente(self):
        for e in ['1', '2', '2.5', '3']:
            self.gate('registrar', e, EtapasDash.DOCS[e])
        sem_pendencia = {k: v for k, v in self.LOCAL.items() if k != 'publicacao_pendente'}
        self.assertEqual(self.gate('registrar', '4', sem_pendencia)[0], 1)

    def test_modo_diferente_de_local_e_recusado(self):
        for e in ['1', '2', '2.5', '3']:
            self.gate('registrar', e, EtapasDash.DOCS[e])
        self.assertEqual(self.gate('registrar', '4', {**self.LOCAL, 'modo': 'simulado'})[0], 1)

    def test_etapa_6_recusa_publicar_quando_a_4_foi_local(self):
        self.ate_a_4_local()
        self.gate('registrar', '5', EtapasDash.DOCS['5'])
        doc6 = {'prova_publicada': 'https://meu-dash.pages.dev/dashboard.html?id=x', 'pendencias': 'Nenhuma',
                'passe_de_gosto': {'antes': 3, 'depois': 0, 'inspecao': 'tells'},
                'arquivos': ['dash-desktop.png', 'video-desktop.webm', 'video-mobile.webm']}
        codigo, saida = self.gate('registrar', '6', doc6)
        self.assertEqual(codigo, 1, saida)
        self.assertIn('conta', saida.lower())
        self.assertIn('etapa 4', saida.lower())

    def test_etapa_7_fecha_em_local_dizendo_que_nao_foi_publicado(self):
        self.ate_a_4_local()
        self.gate('registrar', '5', EtapasDash.DOCS['5'])
        codigo, saida = self.gate('registrar', '7', {'contexto': 'projetos/x.md salvo', 'publicacao_pendente': 'Publicar quando houver conta'})
        self.assertEqual(codigo, 0, saida)
        self.assertIn('local', saida.lower())
        self.assertIn('não publicad', saida.lower())

    def test_etapa_7_em_local_exige_a_pendencia(self):
        self.ate_a_4_local()
        self.gate('registrar', '5', EtapasDash.DOCS['5'])
        self.assertEqual(self.gate('registrar', '7', {'contexto': 'projetos/x.md salvo'})[0], 1)

    def test_etapa_7_sem_a_6_continua_barrada_quando_a_4_nao_foi_local(self):
        for e in ['1', '2', '2.5', '3', '4', '5']:
            self.gate('registrar', e, EtapasDash.DOCS[e])
        codigo, saida = self.gate('registrar', '7', {'contexto': 'x', 'publicacao_pendente': 'x'})
        self.assertEqual(codigo, 1, saida)
        self.assertIn('Etapa 6 não registrada', saida)

    def test_checar_mostra_que_o_dash_esta_em_local(self):
        self.ate_a_4_local()
        codigo, saida = self.gate('checar', '4')
        self.assertEqual(codigo, 0, saida)
        self.assertIn('local', saida.lower())

    def test_refazer_a_4_com_conta_real_tira_o_modo_local(self):
        self.ate_a_4_local()
        self.assertEqual(self.gate('registrar', '4', EtapasDash.DOCS['4'])[0], 0)
        self.gate('registrar', '5', EtapasDash.DOCS['5'])
        codigo, saida = self.gate('registrar', '7', {'contexto': 'x', 'publicacao_pendente': 'x'})
        self.assertEqual(codigo, 1, 'com conta real a etapa 6 volta a ser obrigatória')


if __name__ == '__main__':
    unittest.main(verbosity=2)
