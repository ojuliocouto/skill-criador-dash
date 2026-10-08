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
    node <dir-da-skill>/scripts/py.mjs uso-ferramentas.py registrar <ferramenta> --arquivo <path> [--detalhe "..."]
    node <dir-da-skill>/scripts/py.mjs uso-ferramentas.py registrar <ferramenta> --no-codigo "<trecho>" --em <dir>
    node <dir-da-skill>/scripts/py.mjs uso-ferramentas.py registrar <ferramenta> --detalhe "..." --sem-artefato
    node <dir-da-skill>/scripts/py.mjs uso-ferramentas.py checar [--projeto <dir>]
"""
import argparse
import datetime
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import plataforma  # noqa: E402  (portabilidade Windows/macOS/Linux)

plataforma.texto_console()

RAIZ = Path(__file__).resolve().parent.parent
REGISTRO = ".ferramentas-usadas.json"

# Ferramentas que, ESTANDO VIVAS, precisam ter sido usadas. A chave casa com o rotulo do
# checar-ferramentas.py; o valor explica o que se espera ver na pagina.
# O 21st.dev (magic) saiu daqui em 02/10/2026: e opcional e React, nao encaixa no starter-kit
# HTML, entao cobrar o uso so empurraria toda entrega pra uma dispensa de fachada. A
# design-taste-frontend saiu pelo mesmo motivo: ela se declara fora de escopo pra dashboard.
COBRADAS = {
    "Playwright": "prova de tela do dashboard publicado (PNG desktop e mobile)",
    "skill frontend-design": "direcao estetica do painel decidida antes de montar",
    "skill high-end-visual-design": "passe de acabamento premium",
    "skill animate": "microinteracao (hover de card, entrada, transicao de filtro)",
}


# Escopo por CAMINHO. A skill roteia o trabalho em caminhos diferentes, e cobrar as mesmas
# ferramentas em todos e o mesmo erro de cobrar ffmpeg numa pagina sem video: gate impossivel
# de passar honestamente empurra pra dispensar tudo, e ai ele nao vale nada.
#
#   completo -> trabalho que produz ou refaz a peca inteira: cobra TUDO que estiver vivo.
#   edicao   -> mudanca pontual (trocar texto, cor, preco, arrumar mobile). Cobra so a PROVA
#               do ponto alterado. Exigir b-roll pra trocar um botao nao melhora nada.
#
# Regra que continua valendo na edicao: se a mudanca PEDE uma ferramenta (o pedido e "poe um
# video no hero"), ela volta a ser cobrada, e voce registra o uso normalmente.
CAMINHOS = {
    "criar": "completo",
    "clonar": "completo",
    "clonar-elevar": "completo",
    "variante": "completo",
    "melhorar": "completo",
    "editar": "edicao",
}
COBRADAS_EDICAO = {"Playwright"}


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


def _trecho_no_codigo(valor, base):
    """True se `valor` (texto fixo) aparece em algum arquivo de texto sob `base`."""
    alvo = str(valor).encode("utf-8")
    base = Path(base)
    arquivos = [base] if base.is_file() else (p for p in base.rglob("*") if p.is_file())
    for arq in arquivos:
        if arq.name == REGISTRO:
            continue
        try:
            dados = arq.read_bytes()
        except OSError:
            continue
        if b"\0" in dados[:8192]:
            continue  # binario
        if alvo in dados:
            return True
    return False


def evidencia_vale(ev, projeto):
    """Confere a evidencia DE NOVO, agora. Registro cujo artefato sumiu nao conta.

    Devolve (ok, motivo)."""
    if not isinstance(ev, dict):
        return False, "registro sem evidencia"
    tipo = ev.get("tipo")
    valor = ev.get("valor", "")
    if tipo in ("arquivo", "codigo") and not str(valor).strip():
        return False, "evidência vazia"
    if tipo == "arquivo":
        alvo = Path(valor)
        if not alvo.is_absolute():
            alvo = Path(projeto) / valor
        if not alvo.exists():
            return False, f"o arquivo apontado sumiu: {valor}"
        if not alvo.is_file():
            return False, "a evidência precisa ser um arquivo, não uma pasta"
        if alvo.stat().st_size == 0:
            return False, f"arquivo vazio: {valor}"
        return True, f"arquivo presente ({valor})"
    if tipo == "codigo":
        base = Path(ev.get("em") or projeto)
        if not base.exists():
            return False, f"pasta de busca não existe: {base}"
        # Busca em Python puro (o `grep` nao existe no Windows): recursiva, texto fixo,
        # sem depender de extensao nem de encoding, e pulando arquivo binario (como o grep -I).
        # O proprio registro fica FORA da busca: sem isso o gate se AUTO-VALIDA, porque o trecho
        # procurado tambem esta gravado dentro do .ferramentas-usadas.json. Pego em teste:
        # apaguei o componente do codigo e o gate continuou dizendo "usada".
        if not _trecho_no_codigo(valor, base):
            return False, f"o trecho registrado não está mais no código: {valor[:60]!r}"
        return True, f"trecho encontrado no código ({valor[:40]!r})"
    if tipo == "declarado":
        # Ultimo recurso, para ferramenta que nao deixa artefato no disco. Nao e prova,
        # e declaracao assinada: aparece no relatorio como tal, para o dono cobrar.
        return False, "declaração sem artefato não comprova uso; registre a evidência ou dispense com motivo"
    return False, f"tipo de evidencia desconhecido: {tipo}"


def estado_das_ferramentas():
    """Roda o gate de entrada e devolve {rotulo: ok}. Sem ele nao da pra saber o que cobrar."""
    checador = RAIZ / "scripts" / "checar-ferramentas.py"
    if not checador.exists():
        return None, f"não achei {checador}"
    try:
        r = subprocess.run([sys.executable, str(checador), "--json"],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=600)
        linhas = json.loads(r.stdout)
        if r.returncode != 0 or any(l.get("critico") and not l.get("ok") for l in linhas):
            return None, "gate de entrada reprovado; resolva as ferramentas críticas antes da entrega"
        return {l["ferramenta"]: bool(l["ok"]) for l in linhas}, None
    except (subprocess.TimeoutExpired, json.JSONDecodeError, KeyError, OSError) as e:
        return None, f"não consegui ler o estado das ferramentas: {e!r}"


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
        print(f"ERRO: a evidencia não confere AGORA, então não registro: {motivo}", file=sys.stderr)
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
        print("ERRO: dispensa exige motivo de verdade (>= 15 caracteres), não 'não usei'.",
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
        print("Sem saber quais ferramentas estavam vivas, não dá pra cobrar uso. Resolva isso")
        print("antes de entregar: um gate que não consegue medir não aprova por omissão.\n")
        return 1

    # O verificador usa nomes diferentes para o mesmo MCP; nenhum pode escapar da cobrança.
    aliases = ("magic", "magic (21st.dev)", "21st", "21st ou magic (21st.dev)", "21st ou magic")
    estados["magic"] = any(estados.get(n) for n in aliases)
    for nome in aliases:
        if nome in dados and "magic" not in dados:
            dados["magic"] = dados[nome]

    modo = CAMINHOS.get(getattr(args, "caminho", "criar"), "completo")
    cobraveis = COBRADAS if modo == "completo" else {
        f: p for f, p in COBRADAS.items() if f in COBRADAS_EDICAO}
    vivas = {f: papel for f, papel in cobraveis.items() if estados.get(f)}
    faltando, ok_list, dispensadas = [], [], []
    for f, papel in sorted(vivas.items()):
        reg = dados.get(f)
        if not reg:
            faltando.append((f, papel, "não aparece no registro de uso"))
            continue
        if reg.get("dispensada") and len(str(reg.get("motivo", "")).strip()) >= 15:
            dispensadas.append((f, reg.get("motivo", "")))
            continue
        ok, motivo = evidencia_vale(reg.get("evidencia"), projeto)
        if ok:
            ok_list.append((f, motivo, reg.get("detalhe", "")))
        else:
            faltando.append((f, papel, motivo))

    mortas = [f for f in COBRADAS if f in estados and not estados[f]]

    print("\nGATE DE USO DAS FERRAMENTAS\n" + "=" * 74)
    print(f"  caminho: {getattr(args, 'caminho', 'criar')} "
          f"({'cobra tudo que estiver vivo' if modo == 'completo' else 'edição pontual: cobra só a prova'})")
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
        print(f"  [n/a  ] {f}: não respondeu no gate de entrada, uso não cobrado")
    print("=" * 74)

    if faltando:
        print(f"  {len(faltando)} ferramenta(s) estavam VIVAS e não foram usadas.")
        print("  Isto REPROVA a entrega. Ferramenta viva não se pula: ou ela entra no")
        print("  resultado, ou o resultado sai pior sem ninguém saber, que foi o defeito")
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
        print("  de entrega: dispensa que o dono não lê é pulo com papel passado.")
        for f, motivo in dispensadas:
            print(f"    - {f}: {motivo}")
    if declaradas:
        print(f"  ATENÇÃO: {len(declaradas)} entraram como DECLARADAS (sem artefato): {', '.join(declaradas)}")
    print()
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--projeto", default=os.getcwd(), help="pasta do projeto (default: cwd)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("registrar", help="registra o uso de uma ferramenta, com evidencia")
    r.add_argument("ferramenta")
    r.add_argument("--arquivo", help="artefato produzido (PNG, mp4, arquivo gerado)")
    r.add_argument("--no-codigo", help="trecho que deve ser encontrado no código")
    r.add_argument("--em", help="pasta onde procurar o trecho (default: projeto)")
    r.add_argument("--detalhe", help="o que foi feito com a ferramenta")
    r.add_argument("--sem-artefato", action="store_true",
                   help="último recurso: declara sem prova (aparece marcado no relatorio)")
    r.set_defaults(func=cmd_registrar)

    d = sub.add_parser("dispensar", help="dispensa uma ferramenta COM MOTIVO (aparece na entrega)")
    d.add_argument("ferramenta")
    d.add_argument("--motivo", required=True, help="por que ela não se aplica a esta página")
    d.set_defaults(func=cmd_dispensar)

    c = sub.add_parser("checar", help="reprova se ferramenta viva não foi usada")
    c.add_argument("--caminho", default="criar", choices=sorted(CAMINHOS),
                   help="criar/clonar/melhorar cobram tudo; editar cobra só a prova do ponto alterado")
    c.set_defaults(func=cmd_checar)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
