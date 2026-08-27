# Bento — Design

Data: 2026-08-27
Status: Aprovado (brainstorming)

## Contexto e problema

PRs grandes gerados por IA são difíceis de revisar e produzem mais erros em software construído com IA. A pesquisa do ecossistema mostrou:

- **Prevenção** (planejar antes) é bem servida: GitHub Stacked PRs (`gh-stack`, oficial, GA, com skill de agente), Graphite, git-spice.
- **Split retroativo** (dividir um PR grande já existente) **não tem ferramenta consolidada** — apenas protótipos (DiffEnder/pr-splitter, 3 stars) e skills manuais (NVIDIA `mcore-split-pr`, stacklok `split-pr`) sem verificação objetiva de equivalência.
- Técnica central documentada: limites de ~400 linhas por PR, 1 slice = 1 acceptance criterion, testes junto do código, separar refactor de feature, verificar que a soma dos diffs divididos == diff original.

**Objetivo:** criar `bento`, um repo guarda-chuva do fluxo pessoal de opencode (skills, commands, scripts, configs), começando com a skill `small-prs` que fecha o ciclo **prevenção → validação → correção**, instalável via CLI próprio.

## Decisões-chave

| Decisão | Escolha |
|---|---|
| Local | `/Users/gustavo/Projects/bento` (fora do repo pescaria-japonesa) |
| Forma | Repo guarda-chuva + pacote npm `bento`, CLI `bento` |
| Escopo do agente | Somente opencode (por enquanto) |
| Instalação | Por projeto (`.opencode/`, `scripts/`, `.pr-limits.yaml`); idempotente, não destrutiva |
| Validação | Dirigida pelo agente (sem hook git, sem CI) |
| Limiar | Configurável por repo (`.pr-limits.yaml`), defaults 400 linhas / 10 arquivos |
| Correção | Bloquear + oferecer split automático retroativo, com aprovação humana |
| Entrega dos PRs | Stacked PRs em cadeia via `gh-stack` (instalado pelo CLI) |
| Dependências | Node puro, zero deps runtime |
| Testes | `node:test` no repo + dogfood no pescaria-japonesa |

## Componentes

```
bento/
├── skills/small-prs/SKILL.md          # prevenção / validação / correção
├── commands/                          # comandos opencode futuros (vazio por ora)
├── scripts/
│   ├── pr-split-verify.mjs            # CLI check | equivalence
│   └── pr-split-lib.mjs               # métricas, parse de config, git ops
├── templates/pr-limits.yaml           # config default
├── bin/bento.mjs                      # CLI: install | update | check | equivalence
├── test/                              # node:test (lib, equivalence, install)
├── README.md                          # uso + integração opencode/superpowers
└── AGENTS.md                          # convenções do próprio repo
```

### CLI `bento`

```
bento install [--no-agents]
  ├─ skills/*        → .opencode/skills/
  ├─ commands/*      → .opencode/commands/
  ├─ scripts/*       → scripts/
  ├─ pr-limits.yaml  → .pr-limits.yaml (somente se ausente)
  ├─ gh-stack        → gh extension install github/gh-stack (se ausente)
  └─ seção AGENTS.md → apêndice (omitir com --no-agents)
bento update            # re-instala skills/scripts/commands, preserva config local
bento check [base]      # passthrough: métricas do diff vs .pr-limits.yaml
bento equivalence <base> <head> <camada…>  # passthrough: prova equivalência
```

- Idempotente: rodar duas vezes não muda nada.
- Não destrutivo: nunca sobrescreve `.pr-limits.yaml` nem customizações locais.
- Skills futuras entram em `skills/<nome>/` e o CLI instala o catálogo inteiro.

### Skill `small-prs` (SKILL.md)

**Modo 1 — Prevenção** (integra ao fluxo superpowers `writing-plans`):
- Cada task do plano = 1 slice PR-sized (default ≤400 linhas / 10 arquivos).
- Regras: 1 acceptance criterion por slice; testes viajam com o código; refactor separado de feature; dependências entre PRs declaradas no plano; migração junto do código que ela serve.

**Modo 2 — Validação** (antes de abrir PR, no fluxo `finishing-a-development-branch`):
- Rodar `bento check`. Se exceder o limite → **bloquear** (não abrir PR), mostrar relatório (linhas/arquivos por grupo) e oferecer split.

**Modo 3 — Correção** (split retroativo, após aprovação humana):
1. Backup: branch de salvaguarda apontando para a branch original.
2. Analisar o diff e agrupar hunks por coerência: mesmo módulo, imports/dependências, testes junto, refactor ≠ feature, CODEOWNERS se existir. Arquivo ambíguo → perguntar ao usuário.
3. Montar plano de split (N camadas em cadeia, ordem de dependência, títulos/descrições) e esperar aprovação.
4. Executar: `gs init camada1 … gs add camadaN`; aplicar diffs por grupo (`git diff -- <paths> | git apply`); um commit limpo por camada (não rejogar histórico).
5. Se a camada B usa símbolo renomeado na A, colocar shim/alias retrocompatível na A.
6. Verificar equivalência: `bento equivalence` (soma dos diffs == diff original, byte-idêntico).
7. Rodar lint + build + test por camada.
8. `gs push` + `gs submit` → PRs em cadeia (drafts até checks verdes).
9. Se o agente não for o autor do PR original, creditar o autor original nos novos PRs. Nunca force-push na branch original antes da aprovação final.

### Script `pr-split-verify` / lib

- `check <base> <head>`: coleta numstat do diff, lê `.pr-limits.yaml`, aplica overrides por glob, imprime relatório, exit 1 se acima do limite.
- `equivalence <base> <head> <camada1> <camada2> …`: compara diff(base..head) com a soma encadeada dos diffs (base..camadaN); exit 0 se idêntico; senão relatório de divergência (caminhos faltantes/extra). Requer branches locais; roda antes de qualquer push.
- YAML: parse mínimo próprio (chaves simples + globs).

### Config `.pr-limits.yaml`

```yaml
max_lines: 400
max_files: 10
overrides:
  - glob: "supabase/migrations/**"
    max_lines: 200
  - glob: "src/lib/**"
    max_lines: 250
```

## Tratamento de erros

| Situação | Comportamento |
|---|---|
| `.pr-limits.yaml` ausente | usa defaults (400/10) |
| `gh-stack` não instalado | aborta com instrução de instalação |
| equivalence falha | aborta split, restaura branch original, reporta divergência |
| lint/build/test falham numa camada | para, aponta a camada, oferece corrigir ou abortar |
| arquivo ambíguo no agrupamento | pergunta ao usuário em vez de chutar |
| base/head inválidos | erro claro com uso |

## Testes

**Repo `bento` (node:test, zero deps):**
- `pr-split-lib`: parse do yaml (defaults/overrides), métricas do diff (numstat), glob matching.
- `equivalence`: fixture de repo git temporário (commits + branches de camadas) → comparação byte-idêntica.
- CLI `install`: dry-run em fixture (arquivos copiados, `.pr-limits.yaml` preservado, idempotência).
- gh-stack: smoke test com skip se `gh` ausente.

**Validação final (dogfood no pescaria-japonesa):**
1. Remover openspec: deletar `.opencode/commands/opsx-*.md`, limpar refs no `.opencode/opencode.jsonc`, verificar dependências/artefatos `openspec`, atualizar AGENTS.md. Critério: grep `opsx|openspec` zerado.
2. `bento install` no projeto.
3. Provar o fluxo: `bento check` num diff grande real + um split com verificação de equivalência.

## Fora de escopo (YAGNI)

- Suporte multi-agente (só opencode por enquanto).
- Hook git / CI de validação (validação só no agente).
- Publicação no npm (fica para a implementação, se desejado).
- Mecânica de stacking customizada (usa `gh-stack` oficial).

## Critérios de sucesso

1. `bento install` funciona no pescaria-japonesa sem quebrar nada existente.
2. `bento check` detecta diff acima do limite e `bento equivalence` prova equivalência num split real.
3. Openspec removido do pescaria-japonesa (grep zerado).
4. Suite de testes do `bento` verde (`npm test`).