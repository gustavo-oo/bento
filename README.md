# bento

Catálogo pessoal do fluxo de opencode: skills, commands, scripts e configs — começando com `small-prs`, a skill de prevenção, validação e correção de PRs grandes.

## Instalação (no projeto consumidor)

```bash
node bin/bento.mjs install        # instala skill, scripts, .pr-limits.yaml e gh-stack
node bin/bento.mjs update         # re-instala mantendo .pr-limits.yaml local
```

> Após publicar no npm, use `npx bento …` (o pacote ainda não está publicado).

Instala:
- `.opencode/skills/small-prs/SKILL.md` — skill opencode (prevenção/validação/correção)
- `scripts/pr-split-verify.mjs` — shim para `check` e `equivalence`
- `.bento/` — lib + bin + skills + templates (atualizáveis com `bento update`)
- `.pr-limits.yaml` — config (criada só se ausente; nunca sobrescrita)
- seção `## Bento (small-prs)` no `AGENTS.md`
- extensão `gh-stack` do GitHub CLI

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
3. **Correção** — com aprovação: split em camadas coerentes, equivalência verificada, entrega em cadeia via `gs push`/`gs submit`.

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
