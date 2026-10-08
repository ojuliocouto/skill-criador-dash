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
        if not any(str(a).lower().endswith(".png") for a in arquivos):
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
