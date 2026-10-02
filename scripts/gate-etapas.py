"""Bloqueia avanço sem artefatos de etapas anteriores ou após sua alteração.

Uso: python3 scripts/gate-etapas.py --projeto DIR registrar ETAPA --arquivo JSON
     python3 scripts/gate-etapas.py --projeto DIR checar ETAPA
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


def digest(p):
    if not p.is_file() or p.stat().st_size == 0:
        raise ValueError(f"Evidência ausente, vazia ou sem arquivo: {p.name}")
    return hashlib.sha256(p.read_bytes()).hexdigest()


def comeca_com_nao(valor):
    """'Não', 'NÃO', 'nao' no começo do campo: declaração de que a etapa NÃO aconteceu."""
    texto = unicodedata.normalize("NFKD", str(valor)).encode("ascii", "ignore").decode().strip().lower()
    return bool(re.match(r"nao\b", texto))


def validar_dash(etapa, doc):
    """T12 (teste com aluno, 02/10/2026): "Não" passava como prova porque o gate só via campo
    preenchido. Conta não confirmada não fecha a etapa 4; painel não publicado não fecha a 6."""
    if etapa == "4" and comeca_com_nao(doc.get("conta_confirmada", "")):
        raise ValueError("Etapa 4: conta não confirmada. Sem a conta Cloudflare da pessoa (wrangler whoami) "
                         "não existe infra; volte a esta etapa quando ela confirmar.")
    if etapa == "6":
        prova = str(doc.get("prova_publicada", ""))
        if comeca_com_nao(prova) or not re.search(r"https://\S+", prova):
            raise ValueError("Etapa 6: prova_publicada precisa ter a URL https:// do dashboard publicado. "
                             "\"Não publicada\" ou endereço local não fecham a entrega.")
        arquivos = doc.get("arquivos") if isinstance(doc.get("arquivos"), list) else []
        if not any(str(a).lower().endswith(".png") for a in arquivos):
            raise ValueError("Etapa 6: liste em arquivos o PNG do prova-dash.js rodado contra a URL publicada "
                             "(ex: prova/dash-desktop.png).")


def validar(projeto, arquivo, etapa, campos, perfil):
    doc = json.loads(arquivo.read_text())
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
        validar_dash(etapa, doc)
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
        registro = json.loads(alvo.read_text()) if alvo.exists() else {}
        if not isinstance(registro, dict):
            raise ValueError("Registro de etapas inválido.")
        ordem = list(etapas)
        indice = ordem.index(args.etapa)
        conferir(projeto, registro, ordem[:indice + (args.comando == "checar")])
        if args.comando == "registrar":
            if args.arquivo is None:
                raise ValueError("Use --arquivo com o JSON da etapa concluída.")
            arquivo = (projeto / args.arquivo).resolve()
            if not arquivo.is_relative_to(projeto):
                raise ValueError("O JSON precisa estar dentro do projeto.")
            hashes = validar(projeto, arquivo, args.etapa, etapas[args.etapa], args.perfil)
            hashes[str(arquivo.relative_to(projeto))] = digest(arquivo)
            # Corrigir uma etapa invalida as seguintes; um resultado antigo não prova a versão nova.
            registro = {e: registro[e] for e in ordem[:indice]}
            registro[args.etapa] = {"hashes": hashes}
            alvo.write_text(json.dumps(registro, ensure_ascii=False, indent=2))
        print(f"PASSA: etapa {args.etapa}, sequência e integridade conferidas.")
        return 0
    except (OSError, ValueError, KeyError, TypeError) as e:
        print(f"BLOQUEIA: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
