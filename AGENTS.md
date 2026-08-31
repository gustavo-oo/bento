# AGENTS.md — bento

Catálogo pessoal do fluxo opencode: skills, commands, scripts e configs.

## Commands

```bash
npm test                          # todos os testes (node --test test/*.test.mjs)
node --test test/validate.test.mjs  # um arquivo só
node bin/bento.mjs check          # valida tamanho do diff main..HEAD
```

## CLI (bin/bento.mjs)

- `install|update|uninstall` atuam num projeto consumidor: copiam `lib/`, `bin/`, `skills/`, `templates/` para `.bento/`, criam a skill em `.opencode/skills/small-prs`, o shim `scripts/pr-split-verify.mjs`, `.pr-limits.yaml` (só se ausente) e a seção `## Bento (small-prs)` no AGENTS.md.
- `install` exige `gh` (instala a extensão gh-stack) → exit 1 sem `gh`; `update` NÃO toca gh-stack.
- Flags de install/update: `--no-agents`, `--no-superpowers`, `--no-ponytail`.
- `check [base]` usa merge-base (`base...HEAD`); `equivalence <base> <head> <camada…>` exige camadas em cadeia (cada uma descendente da anterior).
- Exit codes: `0` ok, `1` violação/divergência, `2` uso inválido.

## Arquitetura

- `lib/config.mjs` — parser de `.pr-limits.yaml` é regex puro (zero dep de YAML): suporta só `max_lines`, `max_files` e entradas `- glob:` + `max_lines:` indentado. Não adicione sintaxe nova sem atualizar parser + testes.
- `lib/diff.mjs` — numstat via `git diff` (`execFileSync` com cwd parametrizável; testes usam repo fake).
- `lib/opencode-config.mjs` — edita `opencode.json` E `opencode.jsonc` (roteia por extensão) preservando comentários; vírgulas/comentários têm testes dedicados.
- `lib/validate.mjs` — `evaluate`/`runCheck`/`runEquivalence`; `lib/install.mjs` — install/uninstall + `packageRoot()`/`version()`.
- Este repositório É a fonte do que é instalado em consumidores: mudanças em `lib/`, `templates/` ou `skills/` propagam via `bento install`/`update`.
- `skills/taste-skill/SKILL.md` — venda do upstream https://github.com/Leonxlnx/taste-skill (commit `ccbc15639c97057cbfcf32ecebc38ef716e4bb37`, 24/08/2026, MIT). Atualização manual: re-copiar do commit novo e atualizar este bullet.

## Regras

- Node puro (>= 18), ESM, zero deps runtime.
- TDD obrigatório (node:test): teste antes da implementação.
- Testes não podem depender de rede nem de `gh` instalado.
- Mensagens de CLI, docs e commits em PT-BR; conventional commits (feat:, fix:, docs:, refactor:, test:).
- Planos/specs em `docs/superpowers/plans/` e `docs/superpowers/specs/` com nome `YYYY-MM-DD-<assunto>.md`.
- `uninstall` só remove o que reconhece como seu (shim contendo `.bento/lib/validate.mjs`; seção `## Bento (small-prs)`); arquivos do usuário com nomes iguais são preservados.