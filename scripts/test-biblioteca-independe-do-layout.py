#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A biblioteca não pode depender do layout padrão dos templates.

T9 do teste com aluno (02/10/2026): o aluno tirou o CTR do layout de Marketing (decisão da
dona) e o `npm test` caiu de 690 pra 688, com teste de BIBLIOTECA esperando CTR no layout.
O SKILL.md diz que peça quebrada não vira dashboard, e o aluno não sabia se revertia a
decisão ou editava o teste.

Regra: teste da biblioteca (test/*.test.js) usa fixture própria; só test/layout-padrao/
confere o layout que vem de fábrica. Este teste copia o starter-kit, MEXE no layout de todos
os templates (tira um KPI e troca o herói, como um aluno faria) e exige:
  1. a suíte da biblioteca continua 100% verde;
  2. a suíte do layout padrão percebe a mudança (senão ela não confere nada).

    python3 scripts/test-biblioteca-independe-do-layout.py
"""
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

RAIZ = pathlib.Path(__file__).resolve().parent.parent
STARTER = RAIZ / "starter-kit"

MUTACAO = """
// MUTACAO DO TESTE test-biblioteca-independe-do-layout.py: o aluno mexeu no layout.
{
  // Tira o 3o e o ultimo KPI (no Marketing: CTR e ROAS, como a dona do estudio pediu) e
  // troca o heroi por outro card que ficou na faixa.
  const kpis = template.layout.filter((i) => i.widget === 'kpi');
  const tirados = [kpis[2], kpis[kpis.length - 1]].filter(Boolean);
  for (const t of tirados) template.layout.splice(template.layout.indexOf(t), 1);
  const outro = kpis.find((k) => !tirados.includes(k) && k.props.metricKey !== template.primaryMetric);
  if (outro) template.primaryMetric = outro.props.metricKey;
  // E tira o ultimo widget que nao e KPI (a tabela, no Marketing).
  const naoKpi = template.layout.filter((i) => i.widget !== 'kpi');
  if (naoKpi.length > 1) template.layout.splice(template.layout.indexOf(naoKpi[naoKpi.length - 1]), 1);
}
"""


def rodar(cwd, padrao):
    r = subprocess.run(["node", "--test", padrao], cwd=cwd, capture_output=True, text=True, timeout=600)
    saida = r.stdout + r.stderr
    falhas = re.findall(r"^not ok \d+ - (.+)$", saida, re.MULTILINE)
    total = re.search(r"^# tests (\d+)", saida, re.MULTILINE)
    return r.returncode, falhas, int(total.group(1)) if total else 0


def main():
    with tempfile.TemporaryDirectory() as tmp:
        copia = pathlib.Path(tmp) / "starter-kit"
        shutil.copytree(STARTER, copia, ignore=shutil.ignore_patterns(".wrangler", "node_modules", ".dev.vars"))
        for tpl in (copia / "public/assets/js/templates").glob("*.js"):
            if tpl.name == "index.js":
                continue
            tpl.write_text(tpl.read_text(encoding="utf-8") + MUTACAO, encoding="utf-8")

        cod_bib, falhas_bib, n_bib = rodar(copia, "test/*.test.js")
        layout_dir = copia / "test" / "layout-padrao"
        tem_layout = layout_dir.is_dir() and any(layout_dir.glob("*.test.js"))
        cod_lay, falhas_lay, n_lay = rodar(copia, "test/layout-padrao/*.test.js") if tem_layout else (0, [], 0)

    erros = []
    if cod_bib != 0:
        erros.append(f"biblioteca quebrou com o layout mexido ({len(falhas_bib)} de {n_bib}):")
        erros += [f"    - {f}" for f in falhas_bib]
    if not tem_layout:
        erros.append("não existe test/layout-padrao/: o layout de fábrica não é conferido em lugar nenhum")
    elif cod_lay == 0:
        erros.append("test/layout-padrao/ não percebeu o layout mexido: ele não confere nada")

    print(f"  biblioteca: {n_bib} testes, {len(falhas_bib)} falhas com o layout mexido")
    print(f"  layout padrão: {n_lay} testes, {len(falhas_lay)} falhas com o layout mexido (esperado > 0)")
    if erros:
        print("\nFALHA")
        for e in erros:
            print("  " + e)
        return 1
    print("\nOK: personalizar o layout não derruba a biblioteca; só o teste do layout de fábrica acusa.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
