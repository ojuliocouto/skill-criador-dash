# Direção de arte do painel

Referência para as três fases: decidir antes de montar, conferir durante, e o passe final antes
de publicar. O norte são as ferramentas que o dono citou: **Linear, Vercel e Stripe**.

Isto não é sobre "deixar bonito". É sobre o painel responder a pergunta de quem abriu ele em
menos de 3 segundos. Painel bonito que não responde é decoração; painel feio que responde ainda
serve. O objetivo é o que responde E parece ferramenta séria.

---

## O que Linear, Vercel e Stripe fazem que este painel precisa fazer

**1. Existe UM número herói.** Nunca seis números do mesmo tamanho. O olho pousa em um lugar,
e os outros são contexto. Sem hierarquia, quem abre o painel não sabe se está indo bem.
No dashboard: o `heroMetric` da config (seletor "Número herói" no wizard) define isso; sem ele,
vale o `primaryMetric` do template. O card herói sai maior, com sparkline.

**2. Densidade alta, sem aperto.** Painel de ferramenta mostra MUITO dado por tela, com
respiro suficiente para não sufocar. O erro comum na direção oposta: card gigante com um
número no meio e 200px de vazio em volta, que parece slide de apresentação, não ferramenta.
Regra prática: se o painel cabe numa tela e ainda sobra metade dela vazia, faltou dado ou
sobrou padding.

**3. Cor tem significado, não decoração.** Nessas ferramentas a cor aparece em: o dado em si
(a linha do gráfico, a barra), o estado (bom/ruim/neutro) e a ação (o botão primário). Não
aparece em: fundo de card, borda de destaque, faixa no topo do widget, ícone colorido em cada
métrica. **Card tingido é o tell de IA mais comum em dashboard**, e ainda some no tema escuro.

**4. Número tem algarismo tabular.** Coluna de números que dança quando o valor muda denuncia
amadorismo. Aqui o número usa a fonte do texto (Geist) com `font-variant-numeric: tabular-nums`:
todo algarismo tem a mesma largura e a coluna alinha. Não use fonte mono no número: no print real
de 02/10/2026 a Geist Mono deixou "R$ 95,17" esticado, com espaçamento quebrado.

**5. Divisão por hairline, não por sombra.** Superfície em camadas com borda de 1px e sombra
mínima tingida. Nada de card flutuando com sombra difusa, que é o visual de template genérico.

**6. Vazio é um estado desenhado, não um acidente.** Sem dado, sem período, sem permissão:
cada um tem um texto que diz o que aconteceu e o que fazer. "Sem dados" sozinho no meio de um
card é o pior estado possível, porque não distingue "não vendeu nada hoje" de "o conector
quebrou".

---

## Fase 1: CONCEPÇÃO (antes de montar, Passo 2.5)

Saída obrigatória, por escrito, antes de qualquer widget:

| Decisão | Pergunta que ela responde |
|---|---|
| **Número herói** | Se essa pessoa só pudesse ver UM número por dia, qual seria? Vira o `heroMetric` da config (wizard, passo Finalizar). |
| **A pergunta do painel** | Que decisão ela toma olhando isso? "Aumento a verba do Instagram?" é pergunta; "acompanhar marketing" não é. |
| **O que NÃO entra** | Métrica que ninguém usa para decidir é ruído que rouba espaço da que importa. Vira o `hiddenMetrics` da config. |
| **Accent da marca** | A cor real do negócio dela. O roxo padrão só fica se ela não tiver marca. |
| **Densidade** | Painel de acompanhamento diário (denso, muitos números) ou de leitura semanal (menos widgets, mais respiro)? |
| **Tema** | Claro, escuro, ou os dois. Se os dois, os dois precisam ser conferidos no gate. |

Rode a skill `frontend-design` com essas respostas na mão. Ela decide a direção; você não
começa a montar antes de ter isso escrito.

---

## Fase 2: CONSTRUÇÃO (durante, dentro do Passo 5)

**Monte a faixa de KPI e o primeiro widget. Pare. Olhe. Só então monte o resto.**

É o único momento em que corrigir é barato: a faixa define densidade, escala e ritmo, e os
outros widgets copiam esse padrão. Errar ali não custa um widget, custa o painel.

```bash
node <dir-da-skill>/scripts/prova-dash.js "<URL>" --out prova-parcial
```

Abra o PNG e confira contra o que foi decidido na Fase 1:

| Conferir | Reprova quando |
|---|---|
| Hierarquia | os números saíram todos do mesmo tamanho: o `heroMetric` não chegou no layout |
| Grid | sobrou buraco vazio ao lado de um widget, ou um card caiu sozinho numa segunda linha |
| Cor | apareceu cor fora do accent e dos estados (bom/ruim/neutro) |
| Números | algum valor quebrou em duas linhas, ou a coluna dança entre as linhas da tabela |
| Densidade | metade da tela vazia, ou dado espremido sem respiro |
| Vazio | algum widget mostra "Sem dados" sem dizer por quê |

Os componentes (card de KPI, tabela, filtro, aba) já vêm prontos e testados no starter-kit, em
HTML puro. O 21st.dev é opcional: o código dele é React + Tailwind e não encaixa direto aqui, então
serve no máximo de referência visual. Componente pronto sobra tempo para o que só você pode fazer,
que é a direção. A `animate` entra aqui, e só depois que o layout está resolvido: movimento antes
disso mascara layout ruim.

---

## Fase 3: PASSE FINAL (antes de publicar, Passo 6)

**O pré-voo anti-slop é esta lista**, e ela roda duas vezes: sobre o plano da `frontend-design`
(antes de montar) e sobre o painel publicado, nos dois temas (antes de entregar). Conte os tells
encontrados antes e depois; a contagem final precisa ser zero e vai no `passe_de_gosto` da etapa 6.
Os tells de painel:

- card com fundo tingido de accent, ou barrinha colorida no topo de cada widget
- gradiente decorativo atrás de número
- ícone colorido diferente por métrica (arco-íris de KPI)
- sombra difusa grande em card, sem hairline
- "Sem dados" como único estado vazio
- cor como enfeite em vez de significado
- rótulo de card ou de coluna em CAIXA ALTA espaçada (kicker): rótulo é frase em caixa normal
- número em fonte mono com espaçamento esticado ("R$ 95,17" largo demais): número usa a fonte
  do texto com `font-variant-numeric: tabular-nums`
- card com metade vazia (herói sem sparkline) ou card de KPI com "-", "0" falso ou "não mapeada"
- data em formato americano (mm/dd/yyyy): no Brasil é dd/mm/aaaa

Por que não a `design-taste-frontend` como gate: ela mesma diz que painel e tabela densa estão
fora do escopo dela e presume React, Tailwind, imagens reais e tema duplo obrigatório. Ela serve
como leitura de apoio pra tipografia e hierarquia, não como reprovação.

Depois do pré-voo, a `high-end-visual-design` (opcional) para o acabamento (hairline, espaçamento
óptico, alinhamento de números, peso de fonte).

**Nada disso substitui olhar o PNG.** Os testes e o gate automático já deixaram passar uma
regressão em que o card herói empurrou outro KPI para uma segunda linha com um bloco cinza
vazio do lado: 673 testes verdes, gate verde, e só o olho pegou.
