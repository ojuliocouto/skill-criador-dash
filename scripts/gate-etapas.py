"""Bloqueia avanço sem artefatos de etapas anteriores ou após sua alteração.

Uso: node <dir-da-skill>/scripts/py.mjs gate-etapas.py --projeto DIR registrar ETAPA --arquivo JSON
     node <dir-da-skill>/scripts/py.mjs gate-etapas.py --projeto DIR checar ETAPA
O JSON contém campos obrigatórios e uma lista `arquivos` de evidências do projeto.
Valida presença, sequência e integridade. Julgamento de qualidade continua nas lentes.
"""
import argparse
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lancador  # noqa: E402  (comando com o caminho completo da skill)
import plataforma  # noqa: E402  (portabilidade Windows/macOS/Linux)

plataforma.texto_console()

PAGINAS = {
    "0": ("briefing", "inventario", "secoes"),
    "1": ("copy", "aprovacao"),
    "2": ("paleta", "fontes", "layouts", "assets"),
    "3": ("primeiro_bloco", "movimento"),
    "4": ("claims", "contato", "passe_de_gosto", "entrega", "pendencias"),
    "5": ("contexto", "medicao"),
}
DASH = {
    "1": ("ambiente",),
    "2": ("operacao", "inventario"),
    "2.5": ("numero_heroi", "pergunta", "exclusoes", "accent", "densidade", "tema"),
    "3": ("modo_dados",),
    "4": ("conta_confirmada", "infra"),
    "5": ("primeiro_render", "mapeamento"),
    "6": ("prova_publicada", "passe_de_gosto", "pendencias"),
    "7": ("contexto",),
}
REGISTRO = ".etapas-verificadas.json"
EXTENSOES_DE_VIDEO = (".webm", ".mp4")


def digest(p):
    if not p.is_file() or p.stat().st_size == 0:
        raise ValueError(f"Evidência ausente, vazia ou sem arquivo: {p.name}")
    return hashlib.sha256(p.read_bytes()).hexdigest()


def comeca_com_nao(valor):
    """'Não', 'NÃO', 'nao' no começo do campo: declaração de que a etapa NÃO aconteceu."""
    texto = unicodedata.normalize("NFKD", str(valor)).encode("ascii", "ignore").decode().strip().lower()
    return bool(re.match(r"nao\b", texto))


PLACEHOLDERS_DO_TOML = ("<SEU_KV_NAMESPACE_ID>", "<SEU_KV_CACHE_ID>", "<SEU_D1_ID>", "<NOME-DO-PROJETO>")


def conferir_conta_e_infra(projeto, doc):
    """D1 (complemento): a etapa 4 quer garantir DUAS coisas, e agora confere as duas em arquivo, não em texto livre.

    1. Conta Cloudflare da pessoa confirmada: um arquivo `*whoami*` nos `arquivos` com a saída do `wrangler whoami`
       (e-mail e Account ID de 32 hex, ou a tabela Account Name/Account ID). Texto inventado ou "not authenticated" não passa.
    2. Infra provisionada: o `wrangler.toml` do projeto com o id REAL do KV `DASHBOARDS_KV` (32 hex) e nenhum placeholder
       ativo. Linha comentada não conta.
    O gate lê formato; não prova que o arquivo veio mesmo do comando. Quem prova isso é o `uso-ferramentas` e o olhar de
    quem revisa. Mas o falsificador agora precisa fabricar um whoami e um toml coerentes, não escrever uma palavra."""
    arquivos = [str(a) for a in doc.get("arquivos", [])] if isinstance(doc.get("arquivos"), list) else []
    quem = [a for a in arquivos if "whoami" in Path(a).name.lower()]
    if not quem:
        raise ValueError("Etapa 4: liste em arquivos a saída do `wrangler whoami` (ex: evidencias/whoami.txt). "
                         "Conta confirmada é o que o comando mostrou, não uma frase.")
    saida = (projeto / quem[0]).read_text(encoding="utf-8", errors="replace") if (projeto / quem[0]).is_file() else ""
    if re.search(r"not authenticated|not logged in|wrangler login", saida, re.IGNORECASE) and not re.search(r"logged in with", saida, re.IGNORECASE):
        raise ValueError(f"Etapa 4: o whoami ({quem[0]}) mostra que a pessoa NÃO está logada. Rode `wrangler login` e refaça.")
    tem_email = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", saida)
    tem_conta = re.search(r"\b[0-9a-f]{32}\b", saida)
    if not (tem_email and tem_conta):
        raise ValueError(f"Etapa 4: {quem[0]} não parece a saída do `wrangler whoami` (faltam o e-mail da conta e o Account ID "
                         "de 32 caracteres). Cole a saída do comando, sem editar.")
    toml_rel = next((a for a in arquivos if Path(a).name == "wrangler.toml"), "wrangler.toml")
    toml = projeto / toml_rel
    if not toml.is_file():
        raise ValueError("Etapa 4: wrangler.toml do projeto não encontrado. A infra se prova pelo arquivo com o id real do KV.")
    ativo = "\n".join(l for l in toml.read_text(encoding="utf-8", errors="replace").splitlines() if not l.strip().startswith("#"))
    sobra = [ph for ph in PLACEHOLDERS_DO_TOML if ph in ativo]
    if sobra:
        raise ValueError(f"Etapa 4: wrangler.toml ainda tem placeholder ativo ({', '.join(sobra)}). Provisione o KV e cole o id.")
    if not re.search(r'binding\s*=\s*"DASHBOARDS_KV"\s*\n\s*id\s*=\s*"[0-9a-f]{32}"', ativo):
        raise ValueError('Etapa 4: wrangler.toml sem o binding DASHBOARDS_KV com id real de 32 caracteres (hex). '
                         "Crie com `wrangler kv namespace create DASHBOARDS_KV` e cole o id.")


def modo_local(doc):
    """3.7.1 (D1): a etapa 4 declara `"modo": "local"` quando a pessoa ainda não tem conta Cloudflare."""
    return isinstance(doc, dict) and doc.get("modo") == "local"


SINAIS_MEDIDOS = ("tinta_de_accent", "barrinha_no_topo", "gradiente_atras_de_numero", "icone_por_metrica", "sombra_sem_hairline",
                  "sem_dados_sem_motivo", "caixa_alta_espacada", "numero_em_mono_esticado", "card_com_metade_vazia", "data_formato_americano")
ITENS_DE_GOSTO = ("cor_como_enfeite", "olhado_claro", "olhado_escuro")


def _sem_query(url):
    return re.sub(r"[?#].*$", "", str(url)).rstrip("/")


def conferir_video_com_numero(projeto, arquivos):
    """3.7.2: vídeo gravado só com o esqueleto de carregamento já foi aceito como prova. O gravar-video.js conta, em cada
    quadro, os indicadores com número de verdade na tela e guarda em video-info.json; o gate exige pelo menos um quadro com
    número no desktop e no celular."""
    nomes = [str(a) for a in arquivos]
    info_rel = next((a for a in nomes if Path(a).name == "video-info.json"), None)
    if not info_rel:
        raise ValueError("Etapa 6: liste em arquivos o video-info.json que o gravar-video.js grava (ele diz em quantos quadros há número de verdade).")
    try:
        info = json.loads((projeto / info_rel).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise ValueError(f"Etapa 6: não consegui ler {info_rel} ({e}).")
    perfis = info.get("perfis") if isinstance(info, dict) and isinstance(info.get("perfis"), dict) else {}
    for perfil in ("desktop", "mobile"):
        total = perfis.get(perfil, {}).get("totalQuadrosComNumero") if isinstance(perfis.get(perfil), dict) else None
        if type(total) is not int:
            raise ValueError(f"Etapa 6: {info_rel} não diz em quantos quadros do {perfil} há número. Grave de novo com o gravar-video.js desta versão.")
        if total < 1:
            raise ValueError(f"Etapa 6: nenhum quadro do vídeo do {perfil} tem número na tela (só esqueleto de carregamento): a prova não vale. "
                             "Espere o dash carregar e grave de novo.")


def conferir_passe_de_gosto(projeto, doc):
    """D13: o passe de gosto da etapa 6 deixou de ser autodeclarado.

    1. O que dá para MEDIR (10 sinais da lista de tells) vem do arquivo que `scripts/passe-de-gosto.js` grava, rodado contra
       o painel PUBLICADO, nos dois temas e nos dois perfis. O gate lê o arquivo: sinal medido na tela com `depois: 0`
       declarado é recusado, e a mensagem diz qual sinal e quantos.
    2. O que é gosto (cor como enfeite, o painel inteiro olhado em cada tema) não se mede: o registro traz cada item com o
       print que foi olhado e o que se viu. O gate confere que o print existe, está nas evidências e que o claro e o
       escuro são imagens diferentes. Não prova que o olho olhou; prova que não dá para declarar zero sem os itens."""
    passe = doc.get("passe_de_gosto")
    arquivos = [str(a) for a in doc.get("arquivos", [])] if isinstance(doc.get("arquivos"), list) else []
    norm = lambda a: str(Path(a))  # noqa: E731
    medido_rel = passe.get("medido") if isinstance(passe, dict) else None
    if not medido_rel or norm(medido_rel) not in [norm(a) for a in arquivos]:
        raise ValueError("Etapa 6: o passe de gosto precisa do arquivo medido (`medido`, também em arquivos). Rode: "
                         f"{lancador.comando('passe-de-gosto.js', chr(34) + '<URL-DO-DASHBOARD>' + chr(34), '--out', 'evidencias')}")
    try:
        medido = json.loads((projeto / medido_rel).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise ValueError(f"Etapa 6: não consegui ler {medido_rel} como JSON ({e}).")
    if not isinstance(medido, dict) or medido.get("versao") != 1 or not isinstance(medido.get("sinais"), dict):
        raise ValueError(f"Etapa 6: {medido_rel} não é a saída do passe-de-gosto.js (versão 1, com os sinais).")
    faltam = [k for k in SINAIS_MEDIDOS if not isinstance(medido["sinais"].get(k), dict) or type(medido["sinais"][k].get("achados")) is not int]
    if faltam:
        raise ValueError(f"Etapa 6: a medição do passe de gosto não cobre estes sinais da lista: {', '.join(faltam)}. Rode o passe-de-gosto.js de novo.")
    soma = sum(medido["sinais"][k]["achados"] for k in SINAIS_MEDIDOS)
    if medido.get("total") != soma:
        raise ValueError(f"Etapa 6: o total de {medido_rel} ({medido.get('total')}) não bate com a soma dos sinais ({soma}). O arquivo foi editado; rode o passe-de-gosto.js de novo.")
    prova = re.search(r"https?://\S+", str(doc.get("prova_publicada", "")))
    if prova and _sem_query(medido.get("url", "")) != _sem_query(prova.group(0)):
        raise ValueError(f"Etapa 6: a medição é de outro painel ({medido.get('url')}), não do publicado ({_sem_query(prova.group(0))}).")
    passes = medido.get("passes") if isinstance(medido.get("passes"), list) else []
    temas = {x.get("tema") for x in passes if isinstance(x, dict)}
    perfis = {x.get("perfil") for x in passes if isinstance(x, dict)}
    for obrigatorio, achados in (("claro", temas), ("escuro", temas), ("desktop", perfis), ("mobile", perfis)):
        if obrigatorio not in achados:
            raise ValueError(f"Etapa 6: a medição do passe de gosto não cobre o tema/perfil {obrigatorio}. Rode o passe-de-gosto.js completo.")
    achou = [(k, medido["sinais"][k]["achados"]) for k in SINAIS_MEDIDOS if medido["sinais"][k]["achados"] > 0]
    if achou:
        lista = "; ".join(f"{k} ({n})" for k, n in achou)
        raise ValueError(f"Etapa 6: o passe de gosto MEDIU {soma} sinal(is) da lista de tells na tela: {lista}. "
                         "Corrija o painel e rode o passe-de-gosto.js de novo; `depois: 0` não se declara com isso na tela.")
    itens = passe.get("itens") if isinstance(passe.get("itens"), dict) else {}
    vistos = {}
    for chave in ITENS_DE_GOSTO:
        item = itens.get(chave)
        if not isinstance(item, dict) or not str(item.get("visto", "")).strip() or not str(item.get("print", "")).strip():
            raise ValueError(f"Etapa 6: passe_de_gosto.itens.{chave} precisa de `print` (a imagem olhada) e `visto` (o que se viu). "
                             "Item de gosto não se mede: declarar zero sem olhar não passa.")
        alvo = (projeto / item["print"]).resolve()
        if not alvo.is_file() or alvo.stat().st_size == 0 or not alvo.is_relative_to(projeto) or norm(item["print"]) not in [norm(a) for a in arquivos]:
            raise ValueError(f"Etapa 6: o print de passe_de_gosto.itens.{chave} ({item['print']}) não existe ou não está em arquivos.")
        vistos[chave] = hashlib.sha256(alvo.read_bytes()).hexdigest()
    if vistos["olhado_claro"] == vistos["olhado_escuro"]:
        raise ValueError("Etapa 6: o print do tema claro e o do escuro são a mesma imagem. Olhe os dois temas (o passe-de-gosto.js grava passe-claro-desktop.png e passe-escuro-desktop.png).")


def validar_dash(etapa, doc, local=False, projeto=None):
    """T12 (teste com aluno, 02/10/2026): "Não" passava como prova porque o gate só via campo
    preenchido. Conta não confirmada não fecha a etapa 4; painel não publicado não fecha a 6.

    3.7.1 (D1): sem conta o aluno honesto parava na etapa 4 e não podia nem registrar o dash em local.
    Agora a etapa 4 aceita `"modo": "local"` (com `publicacao_pendente` dizendo o que fica por fazer):
    as etapas 5 e 7 fecham com o dash em local; a 6 (publicação) continua exigindo a conta de verdade.
    "Não" sem declarar o modo local segue bloqueando."""
    if etapa == "4" and "modo" in doc:
        if doc["modo"] != "local":
            raise ValueError('Etapa 4: o único modo aceito é "local" (sem conta Cloudflare ainda). '
                             'Com conta, tire o campo modo e confirme a conta de verdade.')
        if not str(doc.get("publicacao_pendente", "")).strip():
            raise ValueError("Etapa 4 em modo local: preencha publicacao_pendente com o que fica por fazer "
                             "quando a pessoa tiver a conta (provisionar a infra e publicar). Entrega local não é entrega publicada.")
    elif etapa == "4":
        if comeca_com_nao(doc.get("conta_confirmada", "")):
            raise ValueError("Etapa 4: conta não confirmada. Sem a conta Cloudflare da pessoa (wrangler whoami) "
                             'não existe infra. Para construir e provar o dash em local mesmo assim, registre a etapa 4 '
                             'com "modo": "local" e "publicacao_pendente"; para publicar, volte aqui quando ela confirmar.')
        if projeto is not None:
            conferir_conta_e_infra(projeto, doc)
    if etapa == "7" and local and not str(doc.get("publicacao_pendente", "")).strip():
        raise ValueError("Etapa 7 em modo local: preencha publicacao_pendente com o que falta para publicar. "
                         "O encerramento não pode esconder que o dash não foi publicado.")
    if etapa == "6":
        prova = str(doc.get("prova_publicada", ""))
        if comeca_com_nao(prova) or not re.search(r"https://\S+", prova):
            raise ValueError("Etapa 6: prova_publicada precisa ter a URL https:// do dashboard publicado. "
                             "\"Não publicada\" ou endereço local não fecham a entrega.")
        arquivos = doc.get("arquivos") if isinstance(doc.get("arquivos"), list) else []
        # Os PNG do passe de gosto (passe-<tema>-<perfil>.png) não substituem o print da prova de tela.
        if not any(str(a).lower().endswith(".png") and not Path(str(a)).name.lower().startswith("passe-") for a in arquivos):
            raise ValueError("Etapa 6: liste em arquivos o PNG do prova-dash.js rodado contra a URL publicada "
                             "(ex: prova/dash-desktop.png).")
        # 3.6.0: o movimento não se julga em imagem parada. A entrega traz o vídeo de prova do desktop e do
        # celular (gravar-video.js grava video-desktop.webm e video-mobile.webm), junto dos prints.
        nomes = [Path(str(a)).name.lower() for a in arquivos]
        for perfil in ("desktop", "mobile"):
            if not any(perfil in n and n.endswith(EXTENSOES_DE_VIDEO) for n in nomes):
                raise ValueError(f"Etapa 6: falta o vídeo de prova do {perfil}. Grave com: "
                                 f"{lancador.comando('gravar-video.js', chr(34) + '<URL-DO-DASHBOARD>' + chr(34), '--saida', 'prova')} "
                                 f"(gera prova/video-desktop.webm e prova/video-mobile.webm), e liste os dois em arquivos.")
        if projeto is not None:
            conferir_video_com_numero(projeto, arquivos)
            conferir_passe_de_gosto(projeto, doc)


def validar(projeto, arquivo, etapa, campos, perfil, local=False):
    doc = json.loads(arquivo.read_text(encoding="utf-8"))
    if not isinstance(doc, dict):
        raise ValueError("A evidência da etapa precisa ser um objeto JSON.")
    for campo in campos:
        if campo not in doc or doc[campo] in (None, "", [], {}):
            raise ValueError(f"Etapa {etapa}: falta {campo}")
    if perfil == "paginas" and etapa == "0":
        for campo in ("nicho", "local", "publico", "oferta", "preco", "acao"):
            if not isinstance(doc["briefing"], dict) or not doc["briefing"].get(campo):
                raise ValueError(f"Briefing incompleto: {campo}. Fato ausente deve constar como pendente, nunca inventado.")
    if perfil == "dash":
        validar_dash(etapa, doc, local, projeto)
    if "passe_de_gosto" in campos:
        passe = doc["passe_de_gosto"]
        if not isinstance(passe, dict) or type(passe.get("antes")) is not int or passe["antes"] < 0 or type(passe.get("depois")) is not int or passe["depois"] != 0 or not passe.get("inspecao"):
            raise ValueError("Passe de gosto exige contagem antes, depois igual a zero e inspeção descrita.")
    arquivos = doc.get("arquivos")
    if not isinstance(arquivos, list) or not arquivos:
        raise ValueError("Liste em arquivos as evidências reais desta etapa.")
    hashes = {}
    for nome in arquivos:
        p = (projeto / nome).resolve()
        if not p.is_relative_to(projeto) or p == arquivo or p.name == REGISTRO:
            raise ValueError("A evidência precisa estar dentro do projeto e não pode ser o próprio registro.")
        hashes[str(p.relative_to(projeto))] = digest(p)
    return hashes


def esta_em_local(registro):
    """True quando a etapa 4 foi registrada em modo local (sem conta Cloudflare)."""
    item = registro.get("4")
    return isinstance(item, dict) and item.get("local") is True


def exigidas(ordem, ate, local):
    """Etapas que precisam estar registradas para chegar em `ate` (índice exclusivo). Em modo local a 6
    (publicação) não existe: o dash não foi publicado, e dizer isso é o que a etapa 7 registra."""
    return [e for e in ordem[:ate] if not (local and e == "6")]


def conferir(projeto, registro, etapas):
    for etapa in etapas:
        item = registro.get(etapa)
        if not isinstance(item, dict):
            raise ValueError(f"Etapa {etapa} não registrada. Conclua e registre antes de avançar.")
        for nome, esperado in item["hashes"].items():
            if digest(projeto / nome) != esperado:
                raise ValueError(f"Etapa {etapa}: evidência mudou ({nome}). Revalide esta etapa e as seguintes.")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--projeto", type=Path, required=True)
    ap.add_argument("--perfil", choices=["paginas", "dash"], default="paginas")
    ap.add_argument("comando", choices=["registrar", "checar"])
    ap.add_argument("etapa")
    ap.add_argument("--arquivo", type=Path)
    args = ap.parse_args()
    projeto = args.projeto.resolve()
    etapas = PAGINAS if args.perfil == "paginas" else DASH
    try:
        if args.etapa not in etapas:
            raise ValueError("Etapa desconhecida para este perfil.")
        alvo = projeto / REGISTRO
        registro = json.loads(alvo.read_text(encoding="utf-8")) if alvo.exists() else {}
        if not isinstance(registro, dict):
            raise ValueError("Registro de etapas inválido.")
        ordem = list(etapas)
        indice = ordem.index(args.etapa)
        local = args.perfil == "dash" and esta_em_local(registro)
        if args.perfil == "dash" and args.etapa == "6" and local:
            raise ValueError("Etapa 6: publicar exige a conta Cloudflare da pessoa, e a etapa 4 está registrada em modo "
                             "local (sem conta). Quando ela tiver a conta, refaça a etapa 4 de verdade "
                             "(conta_confirmada e infra reais, sem o campo modo) e só então registre a 6.")
        conferir(projeto, registro, exigidas(ordem, indice + (args.comando == "checar"), local))
        if args.comando == "registrar":
            if args.arquivo is None:
                raise ValueError("Use --arquivo com o JSON da etapa concluída.")
            arquivo = (projeto / args.arquivo).resolve()
            if not arquivo.is_relative_to(projeto):
                raise ValueError("O JSON precisa estar dentro do projeto.")
            hashes = validar(projeto, arquivo, args.etapa, etapas[args.etapa], args.perfil, local)
            hashes[str(arquivo.relative_to(projeto))] = digest(arquivo)
            # Corrigir uma etapa invalida as seguintes; um resultado antigo não prova a versão nova.
            registro = {e: registro[e] for e in ordem[:indice] if e in registro}
            registro[args.etapa] = {"hashes": hashes}
            if args.perfil == "dash" and args.etapa == "4" and modo_local(json.loads(arquivo.read_text(encoding="utf-8"))):
                registro["4"]["local"] = True
                local = True
            elif args.etapa == "4":
                local = False
            alvo.write_text(json.dumps(registro, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"PASSA: etapa {args.etapa}, sequência e integridade conferidas.")
        if local and int(float(args.etapa) * 2) >= 8:  # etapa 4 em diante
            print("MODO LOCAL: o dash foi construído e provado em local, sem conta Cloudflare. NÃO publicado. "
                  "A publicação (etapas 4 de verdade e 6) fica pendente até a pessoa ter a conta; declare isso na entrega.")
        return 0
    except (OSError, ValueError, KeyError, TypeError) as e:
        print(f"BLOQUEIA: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
