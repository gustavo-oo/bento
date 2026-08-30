# bento

Catálogo pessoal do fluxo de opencode: skills, commands, scripts e configs — começando com `small-prs`, a skill de prevenção, validação e correção de PRs grandes.

## Instalação (no projeto consumidor)

```bash
node bin/bento.mjs install        # instala skill, scripts, .pr-limits.yaml, gh-stack, superpowers, ponytail, codegraph e agent-browser
node bin/bento.mjs update         # re-instala mantendo .pr-limits.yaml local
```

> Após publicar no npm, use `npx bento …` (o pacote ainda não está publicado).

Instala:
- `.opencode/skills/small-prs/SKILL.md` — skill opencode (prevenção/validação/correção)
- `.opencode/skills/agent-browser/SKILL.md` — skill opencode (stub do agent-browser)
- `scripts/pr-split-verify.mjs` — shim para `check` e `equivalence`
- `.bento/` — lib + bin + skills + templates (atualizáveis com `bento update`)
- `.pr-limits.yaml` — config (criada só se ausente; nunca sobrescrita)
- `superpowers` — plugin adicionado ao `opencode.json` (pule com `--no-superpowers`)
- `ponytail` — plugin adicionado ao `opencode.json` (pule com `--no-ponytail`)
- `codegraph` — CLI + MCP server no `opencode.json` (pule com `--no-codegraph`)
- `agent-browser` — CLI + MCP server no `opencode.json` + skill (pule com `--no-agent-browser`)
- seção `## Bento (small-prs)` no `AGENTS.md`
- extensão `gh-stack` do GitHub CLI

## Desinstalação

```bash
node bin/bento.mjs uninstall    # remove tudo (idempotente)
```

> Após publicar no npm, use `npx bento uninstall`.

Remove:
- `.bento/` — lib + bin + skills + templates
- `.opencode/skills/small-prs/` — skill opencode
- `scripts/pr-split-verify.mjs` — shim (só se for do bento; arquivo do usuário com o mesmo nome é preservado)
- `.pr-limits.yaml` — config
- entrada do plugin superpowers no `opencode.json` (arquivo removido se ficar vazio)
- entrada do plugin ponytail no `opencode.json` (arquivo removido se ficar vazio)
- entradas MCP (codegraph, agent-browser) no `opencode.json` (arquivo removido se ficar vazio)
- `.opencode/skills/agent-browser/` — skill opencode
- `.codegraph/` — index do codegraph
- CLIs globais `codegraph` e `agent-browser` (`npm uninstall -g`; aviso se falhar)
- seção `## Bento (small-prs)` no `AGENTS.md` (arquivo removido se ficar vazio)
- extensão `gh-stack` do GitHub CLI (aviso se `gh` indisponível; sem falha)

## Uso

```bash
bento check [base]                                  # valida o diff (default: main..HEAD)
bento equivalence <base> <head> <camada1> [camada2 …] # prova que as camadas somam o diff original
node scripts/pr-split-verify.mjs check              # idem (via shim instalado)
```

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
