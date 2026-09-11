# Evidências das etapas

O `gate-etapas.py` confere sequência, campos obrigatórios, arquivos presentes e SHA-256.
Não verifica sozinho se a copy é boa, se uma aprovação é autêntica ou se a imagem foi lida.
Essas responsabilidades continuam com o usuário e as lentes de auditoria.

Crie uma pasta `evidencias/` dentro do projeto do aluno. Nunca use a pasta da skill para
guardar dados de cliente. Cada etapa recebe um JSON próprio e arquivos de evidência.
Use cópias estáveis dos documentos aprovados: modificar a evidência invalida a etapa.

Exemplo de `evidencias/etapa-0.json`, somente para demonstrar o formato:

```json
{
  "briefing": {
    "nicho": "Informação confirmada no briefing",
    "local": "Informação confirmada no briefing",
    "publico": "Informação confirmada no briefing",
    "oferta": "Informação confirmada no briefing",
    "preco": "Pendente: não publicar preço sem confirmação",
    "acao": "Destino confirmado no briefing"
  },
  "inventario": "Todas as fontes lidas, incluindo abas e linhas; colunas e preenchimento registrados",
  "secoes": ["Seções aprovadas no briefing"],
  "arquivos": ["evidencias/briefing-confirmado.md"]
}
```

Substitua os textos demonstrativos pelos dados efetivamente coletados. Um arquivo fictício
com o formato correto passa na validação estrutural, mas não comprova o trabalho.

Campos do perfil `paginas`, usado somente no fluxo CRIAR:

| Etapa | Campos obrigatórios |
|---|---|
| 0 | `briefing` com seis respostas, `inventario`, `secoes` |
| 1 | `copy`, `aprovacao` |
| 2 | `paleta`, `fontes`, `layouts`, `assets` |
| 3 | `primeiro_bloco`, `movimento` |
| 4 | `claims`, `contato`, `passe_de_gosto`, `entrega`, `pendencias` |
| 5 | `contexto`, `medicao` |

Campos do perfil `dash`:

| Etapa | Campos obrigatórios |
|---|---|
| 1 | `ambiente` |
| 2 | `operacao`, `inventario` |
| 2.5 | `numero_heroi`, `pergunta`, `exclusoes`, `accent`, `densidade`, `tema` |
| 3 | `modo_dados` |
| 4 | `conta_confirmada`, `infra` |
| 5 | `primeiro_render`, `mapeamento` |
| 6 | `prova_publicada`, `passe_de_gosto`, `pendencias` |
| 7 | `contexto` |

Todas as etapas também exigem `arquivos`: lista de arquivos não vazios dentro do projeto.
Para `passe_de_gosto`, use `{"antes": 0, "depois": 0, "inspecao": "Itens efetivamente inspecionados"}`.
A contagem final precisa ser zero. Para campos sem pendência, escreva `"Nenhuma"`.
Para trabalho futuro, como métricas após tráfego, registre o plano e a limitação atual.
Não coloque tokens, senhas ou identificadores de conta em evidências destinadas ao Git.

```bash
python3 <dir-da-skill>/scripts/gate-etapas.py --projeto <dir-do-projeto> registrar 0 --arquivo evidencias/etapa-0.json
python3 <dir-da-skill>/scripts/gate-etapas.py --projeto <dir-do-projeto> checar 0
```

No dashboard, acrescente `--perfil dash` e comece pela etapa 1. O gate de ferramentas
continua anterior ao registro. Registrar novamente uma etapa invalida as seguintes.
Antes de entregar, confira a etapa 4 em páginas e a etapa 6 no dashboard.
