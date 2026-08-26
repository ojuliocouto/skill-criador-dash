#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gate de USO: ferramenta que estava viva TEM que ter sido usada.

Existe porque o gate de entrada (checar-ferramentas.py) resolve um problema e nao resolve o
outro. Ele garante que a ferramenta RESPONDE. Nao garante que ela foi USADA. Da pra ter o
21st.dev conectado e o painel sair 100% feito a mao do mesmo jeito, e a entrega vem com um
"ah, o 21st.dev eu pulei". Foi exatamente essa frase que o dono proibiu.

A REGRA (a unica que fecha o buraco): toda ferramenta que o gate de entrada mediu como
RESPONDENDO precisa aparecer aqui com evidencia. Ferramenta que nao respondeu nao e cobrada,
porque ai a degradacao e legitima e ja foi declarada. Nao existe terceira opcao: viva e nao
usada = entrega reprovada.

Evidencia nao e a palavra do agente. Cada registro aponta para um ARTEFATO que este script
confere de novo, agora: arquivo que precisa existir e ter tamanho, ou trecho que precisa ser
encontrado no codigo. Registro cuja evidencia sumiu vale como nao registrado.

Uso:
    python3 scripts/uso-ferramentas.py registrar <ferramenta> --arquivo <path> [--detalhe "..."]
    python3 scripts/uso-ferramentas.py registrar <ferramenta> --no-codigo "<trecho>" --em <dir>
    python3 scripts/uso-ferramentas.py registrar <ferramenta> --detalhe "..." --sem-artefato
    python3 scripts/uso-ferramentas.py checar [--projeto <dir>]
"""
import argparse
import datetime
import json
import os
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
REGISTRO = ".ferramentas-usadas.json"

# Ferramentas que, ESTANDO VIVAS, precisam ter sido usadas. A chave casa com o rotulo do
# checar-ferramentas.py; o valor explica o que se espera ver na pagina.
COBRADAS = {
    "magic (21st.dev)": "componente de UI vindo do 21st.dev (nao card feito a mao)",
    "Playwright": "prova de tela do dashboard publicado (PNG desktop e mobile)",
    "skill design-taste-frontend": "gate anti-slop rodado sobre o painel antes de publicar",
    "skill frontend-design": "direcao estetica do painel decidida antes de montar",
    "skill high-end-visual-design": "passe de acabamento premium",
    "skill animate": "microinteracao (hover de card, entrada, transicao de filtro)",
}


def caminho_registro(projeto):
    return Path(projeto) / REGISTRO


def carregar(projeto):
    p = caminho_registro(projeto)
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def salvar(projeto, dados):
    caminho_registro(projeto).write_text(
        json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")


def evidencia_vale(ev, projeto):
    """Confere a evidencia DE NOVO, agora. Registro cujo artefato sumiu nao conta.

    Devolve (ok, motivo)."""
    if not isinstance(ev, dict):
        return False, "registro sem evidencia"
    tipo = ev.get("tipo")
    valor = ev.get("valor", "")
    if tipo == "arquivo":
        alvo = Path(valor)
        if not alvo.is_absolute():
            alvo = Path(projeto) / valor
        if not alvo.exists():
            return False, f"o arquivo apontado sumiu: {valor}"
        if alvo.is_file() and alvo.stat().st_size == 0:
            return False, f"arquivo vazio: {valor}"
        return True, f"arquivo presente ({valor})"
    if tipo == "codigo":
        base = Path(ev.get("em") or projeto)
        if not base.exists():
            return False, f"pasta de busca nao existe: {base}"
        # grep -r: nao depende de extensao nem de encoding do arquivo.
        # --exclude do proprio registro: sem isso o gate se AUTO-VALIDA, porque o trecho
        # procurado tambem esta gravado dentro do .ferramentas-usadas.json. Pego em teste:
        # apaguei o componente do codigo e o gate continuou dizendo "usada".
        r = subprocess.run(["grep", "-rqIF", f"--exclude={REGISTRO}", "--", valor, str(base)],
                           capture_output=True, text=True)
        if r.returncode != 0:
            return False, f"o trecho registrado nao esta mais no codigo: {valor[:60]!r}"
        return True, f"trecho encontrado no codigo ({valor[:40]!r})"
    if tipo == "declarado":
        # Ultimo recurso, para ferramenta que nao deixa artefato no disco. Nao e prova,
        # e declaracao assinada: aparece no relatorio como tal, para o dono cobrar.
        return True, "DECLARADO sem artefato (nao verificavel por este script)"
    return False, f"tipo de evidencia desconhecido: {tipo}"


def estado_das_ferramentas():
    """Roda o gate de entrada e devolve {rotulo: ok}. Sem ele nao da pra saber o que cobrar."""
    checador = RAIZ / "scripts" / "checar-ferramentas.py"
    if not checador.exists():
        return None, f"nao achei {checador}"
    try:
        r = subprocess.run([sys.executable, str(checador), "--json"],
                           capture_output=True, text=True, timeout=600)
        linhas = json.loads(r.stdout)
        return {l["ferramenta"]: bool(l["ok"]) for l in linhas}, None
    except (subprocess.TimeoutExpired, json.JSONDecodeError, KeyError, OSError) as e:
        return None, f"nao consegui ler o estado das ferramentas: {e!r}"


def cmd_registrar(args):
    projeto = args.projeto
    dados = carregar(projeto)
    if args.arquivo:
        ev = {"tipo": "arquivo", "valor": args.arquivo}
    elif args.no_codigo:
        ev = {"tipo": "codigo", "valor": args.no_codigo, "em": args.em or projeto}
    elif args.sem_artefato:
        ev = {"tipo": "declarado", "valor": args.detalhe or ""}
    else:
        print("ERRO: escolha --arquivo, --no-codigo ou --sem-artefato", file=sys.stderr)
        return 2
    ok, motivo = evidencia_vale(ev, projeto)
    if not ok:
        print(f"ERRO: a evidencia nao confere AGORA, entao nao registro: {motivo}", file=sys.stderr)
        return 1
    dados[args.ferramenta] = {
        "quando": datetime.datetime.now().isoformat(timespec="seconds"),
        "detalhe": args.detalhe or "",
        "evidencia": ev,
    }
    salvar(projeto, dados)
    print(f"registrado: {args.ferramenta} -> {motivo}")
    return 0


def cmd_dispensar(args):
    """Dispensa uma ferramenta com motivo. NAO e pular: e uma decisao assinada, que sai no
    relatorio e no bloco de entrega para o dono cobrar. Pular calado continua reprovando."""
    if not args.motivo or len(args.motivo.strip()) < 15:
        print("ERRO: dispensa exige motivo de verdade (>= 15 caracteres), nao 'nao usei'.",
              file=sys.stderr)
        return 2
    dados = carregar(args.projeto)
    dados[args.ferramenta] = {
        "quando": datetime.datetime.now().isoformat(timespec="seconds"),
        "dispensada": True,
        "motivo": args.motivo.strip(),
    }
    salvar(args.projeto, dados)
    print(f"dispensada: {args.ferramenta} (motivo vai no relatorio e na entrega)")
    return 0

def cmd_checar(args):
    projeto = args.projeto
    dados = carregar(projeto)
    estados, erro = estado_das_ferramentas()
    if estados is None:
        print(f"\nGATE DE USO INDETERMINADO: {erro}")
        print("Sem saber quais ferramentas estavam vivas, nao da pra cobrar uso. Resolva isso")
        print("antes de entregar: um gate que nao consegue medir nao aprova por omissao.\n")
        return 1

    vivas = {f: papel for f, papel in COBRADAS.items() if estados.get(f)}
    faltando, ok_list, dispensadas = [], [], []
    for f, papel in sorted(vivas.items()):
        reg = dados.get(f)
        if not reg:
            faltando.append((f, papel, "nao aparece no registro de uso"))
            continue
        if reg.get("dispensada"):
            dispensadas.append((f, reg.get("motivo", "")))
            continue
        ok, motivo = evidencia_vale(reg.get("evidencia"), projeto)
        if ok:
            ok_list.append((f, motivo, reg.get("detalhe", "")))
        else:
            faltando.append((f, papel, motivo))

    mortas = [f for f in COBRADAS if f in estados and not estados[f]]

    print("\nGATE DE USO DAS FERRAMENTAS\n" + "=" * 74)
    for f, motivo, detalhe in ok_list:
        print(f"  [USADA] {f}")
        print(f"          {detalhe or '(sem detalhe)'}  |  {motivo}")
    for f, papel, motivo in faltando:
        print(f"  [FALTA] {f}: {papel}")
        print(f"          {motivo}")
    for f, motivo in dispensadas:
        print(f"  [DISPENSADA] {f}")
        print(f"          motivo: {motivo}")
    for f in mortas:
        print(f"  [n/a  ] {f}: nao respondeu no gate de entrada, uso nao cobrado")
    print("=" * 74)

    if faltando:
        print(f"  {len(faltando)} ferramenta(s) estavam VIVAS e nao foram usadas.")
        print("  Isto REPROVA a entrega. Ferramenta viva nao se pula: ou ela entra no")
        print("  resultado, ou o resultado sai pior sem ninguem saber, que foi o defeito")
        print("  que este gate existe pra impedir.\n")
        return 1
    if not vivas:
        print("  Nenhuma ferramenta cobravel estava viva. Gate vazio: confira o gate de entrada.\n")
        return 1
    declaradas = [f for f, _, _ in ok_list
                  if dados[f]["evidencia"].get("tipo") == "declarado"]
    print(f"  {len(ok_list)} de {len(vivas)} ferramentas vivas usadas com evidencia.")
    if dispensadas:
        print(f"  {len(dispensadas)} DISPENSADA(S) com motivo. Copie estas linhas para o bloco")
        print("  de entrega: dispensa que o dono nao le e pulo com papel passado.")
        for f, motivo in dispensadas:
            print(f"    - {f}: {motivo}")
    if declaradas:
        print(f"  ATENCAO: {len(declaradas)} entraram como DECLARADAS (sem artefato): {', '.join(declaradas)}")
    print()
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--projeto", default=os.getcwd(), help="pasta do projeto (default: cwd)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("registrar", help="registra o uso de uma ferramenta, com evidencia")
    r.add_argument("ferramenta")
    r.add_argument("--arquivo", help="artefato produzido (PNG, mp4, arquivo gerado)")
    r.add_argument("--no-codigo", help="trecho que deve ser encontrado no codigo")
    r.add_argument("--em", help="pasta onde procurar o trecho (default: projeto)")
    r.add_argument("--detalhe", help="o que foi feito com a ferramenta")
    r.add_argument("--sem-artefato", action="store_true",
                   help="ultimo recurso: declara sem prova (aparece marcado no relatorio)")
    r.set_defaults(func=cmd_registrar)

    d = sub.add_parser("dispensar", help="dispensa uma ferramenta COM MOTIVO (aparece na entrega)")
    d.add_argument("ferramenta")
    d.add_argument("--motivo", required=True, help="por que ela nao se aplica a esta pagina")
    d.set_defaults(func=cmd_dispensar)

    c = sub.add_parser("checar", help="reprova se ferramenta viva nao foi usada")
    c.set_defaults(func=cmd_checar)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
