# bento

CLI do fluxo opencode pessoal: instala e mantém, num projeto consumidor, a skill `small-prs` (limites de tamanho de PR + split em camadas), os plugins superpowers e ponytail, os MCP servers codegraph e agent-browser, as skills agent-browser e taste-skill e um hook pre-push.

## Instalação (no projeto consumidor)

```bash
node bin/bento.mjs install        # instala tudo; exige o GitHub CLI (gh)
node bin/bento.mjs update         # re-instala mantendo .pr-limits.yaml local
```

> Após publicar no npm, use `npx bento …` (o pacote ainda não está publicado).

`install` exige `gh` (instala a extensão gh-stack) e sai com 1 sem ele. `update` não toca em gh-stack, não instala CLIs globais e não re-indexa o codegraph. Depois de instalado, `node .bento/bin/bento.mjs update` também funciona.

Instala:
- `.opencode/skills/small-prs/SKILL.md` — skill opencode (prevenção/validação/correção)
- `.opencode/skills/taste-skill/SKILL.md` — skill opencode de design anti-slop (design-taste-frontend)
- `.opencode/skills/agent-browser/SKILL.md` — stub da skill agent-browser (pule com `--no-agent-browser`)
- `scripts/pr-split-verify.mjs` — shim para `check` e `equivalence`
- `.bento/` — lib + bin + skills + templates + `VERSION` (atualizáveis com `bento update`)
- `.pr-limits.yaml` — config (criada só se ausente; nunca sobrescrita)
- `.bento/hooks/pre-push` + `core.hooksPath` — hook que bloqueia push com diff acima dos limites (pule com `--no-hooks`; config local por clone; `git push --no-verify` burla — conveniência, não segurança)
- `superpowers` — plugin adicionado ao `opencode.json`/`.jsonc` (pule com `--no-superpowers`)
- `ponytail` — plugin adicionado ao `opencode.json`/`.jsonc` (pule com `--no-ponytail`)
- `codegraph` — CLI global `@colbymchenry/codegraph`, MCP server (`codegraph serve --mcp`) e `codegraph init` (pule com `--no-codegraph`)
- `agent-browser` — CLI global + Chrome, MCP server (`agent-browser mcp`) e skill (pule com `--no-agent-browser`)
- seção `## Bento (small-prs)` no `AGENTS.md` (pule com `--no-agents`)
- extensão `gh-stack` do GitHub CLI

## Desinstalação

```bash
node bin/bento.mjs uninstall    # remove tudo (idempotente)
```

> Após publicar no npm, use `npx bento uninstall`.

Remove:
- `.bento/` — lib + bin + skills + templates
- `.opencode/skills/small-prs/` — skill opencode
- `.opencode/skills/taste-skill/` — skill opencode de design
- `.opencode/skills/agent-browser/` — skill opencode
- `scripts/pr-split-verify.mjs` — shim (só se for do bento; arquivo do usuário com o mesmo nome é preservado)
- `.pr-limits.yaml` — config
- `core.hooksPath` apontando para `.bento/hooks` (só se for do bento)
- entradas do plugin superpowers e ponytail no `opencode.json`/`.jsonc` (arquivo removido se ficar vazio)
- entradas MCP (codegraph, agent-browser) no `opencode.json`/`.jsonc` (arquivo removido se ficar vazio)
- `.codegraph/` — index do codegraph
- CLIs globais `codegraph` e `agent-browser` (`npm uninstall -g`; aviso se falhar)
- seção `## Bento (small-prs)` no `AGENTS.md` (arquivo removido se ficar vazio)
- extensão `gh-stack` do GitHub CLI (aviso se `gh` indisponível; sem falha)

## Uso

```bash
bento check [base]                                     # valida o diff (default: main..HEAD)
bento equivalence <base> <head> <camada1> [camada2 …]  # prova que as camadas somam o diff original
node scripts/pr-split-verify.mjs check                 # idem (via shim instalado)
```

O pre-push roda `check` (base `main`) automaticamente a cada `git push`; acima do limite o push é abortado.

Exit codes: `0` ok, `1` violação/divergência, `2` uso inválido.

## Fluxo small-prs

1. **Prevenção** — ao planejar (superpowers:writing-plans), 1 task = 1 slice de PR (testes junto, refactor ≠ feature, ≤400 linhas/10 arquivos).
2. **Validação** — antes de abrir PR, rode `check`; acima do limite o PR é bloqueado.
3. **Correção** — com aprovação: split em camadas coerentes, equivalência verificada, entrega em cadeia via `gh stack push`/`gh stack submit` (alias `gs` disponível via `gh stack alias`, opcional).

## Config `.pr-limits.yaml`

```yaml
max_lines: 400
max_files: 10
overrides:
  - glob: "supabase/migrations/**"
    max_lines: 200
```

## Desenvolvimento

```bash
npm test    # node --test test/*.test.mjs
```

Node >= 18, zero dependências runtime.
