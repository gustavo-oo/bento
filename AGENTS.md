# AGENTS.md — bento

CLI que instala/atualiza/remove, num projeto consumidor, o fluxo opencode pessoal: skill `small-prs` (limites de PR + split), plugins (superpowers, ponytail), MCP servers (codegraph, agent-browser), skills vendadas (agent-browser, taste-skill) e hook pre-push.

## Commands

```bash
npm test                            # todos os testes (node --test test/*.test.mjs)
node --test test/validate.test.mjs  # um arquivo só
node bin/bento.mjs check            # valida tamanho do diff main..HEAD
```

## CLI (bin/bento.mjs)

- `install` atua num projeto consumidor e exige `gh` (instala a extensão gh-stack) → exit 1 sem `gh`; `update` NÃO toca gh-stack.
- `install`/`update` copiam `lib/`, `bin/`, `skills/`, `templates/` para `.bento/` (+ `.bento/VERSION`), criam `.opencode/skills/small-prs`, `.opencode/skills/taste-skill` e (salvo flag) `agent-browser`, o shim `scripts/pr-split-verify.mjs`, `.pr-limits.yaml` (só se ausente) e a seção `## Bento (small-prs)` no AGENTS.md.
- Flags de install/update: `--no-agents`, `--no-superpowers`, `--no-ponytail`, `--no-hooks`, `--no-codegraph`, `--no-agent-browser`.
- Plugins e MCP vão para `opencode.json`/`opencode.jsonc`; só `install` instala os CLIs globais e roda `codegraph init` — `update` não instala CLIs nem re-indexa o codegraph.
- `--no-hooks` com hook de install anterior ativo emite aviso no stderr (o `core.hooksPath` permanece).
- `check [base]` usa merge-base (`base...HEAD`); `equivalence <base> <head> <camada…>` exige camadas em cadeia (cada uma descendente da anterior).
- Exit codes: `0` ok, `1` violação/divergência, `2` uso inválido.

## Arquitetura

- `lib/config.mjs` — parser de `.pr-limits.yaml` é regex puro (zero dep de YAML): suporta só `max_lines`, `max_files` e entradas `- glob:` + `max_lines:` indentado. Não adicione sintaxe nova sem atualizar parser + testes.
- `lib/diff.mjs` — numstat via `git diff` (`execFileSync` com cwd parametrizável; testes usam repo fake).
- `lib/opencode-config.mjs` — edita `opencode.json` E `opencode.jsonc` (roteia por extensão) preservando comentários; vírgulas/comentários têm testes dedicados.
- `lib/mcp-config.mjs` — mesma edição por texto para o bloco `mcp`, com o mesmo cuidado de comentários (remoção no jsonc é por índices; tem testes dedicados).
- `lib/tools.mjs` — instala/remove CLIs globais (`@colbymchenry/codegraph`, `agent-browser`); falhas geram aviso, não erro.
- `lib/validate.mjs` — `evaluate`/`runCheck`/`runEquivalence`; `lib/install.mjs` — install/uninstall + `packageRoot()`/`version()`.
- `lib/hooks.mjs` — `setupPrePushHook`/`removePrePushHook`: config `core.hooksPath` → `.bento/hooks` (pula com aviso se já houver hooksPath de outro lugar ou hooks manuais em `.git/hooks`); `templates/hooks/pre-push` é a fonte do hook instalado.
- Este repositório É a fonte do que é instalado em consumidores: mudanças em `lib/`, `templates/` ou `skills/` propagam via `bento install`/`update`.
- `skills/taste-skill/SKILL.md` — venda do upstream https://github.com/Leonxlnx/taste-skill (commit `ccbc15639c97057cbfcf32ecebc38ef716e4bb37`, 24/08/2026, MIT). Atualização manual: re-copiar do commit novo e atualizar este bullet.
- `skills/agent-browser/SKILL.md` — stub que aponta para `agent-browser skills get core`; o conteúdo real vem do CLI instalado.

## Regras

- Node puro (>= 18), ESM, zero deps runtime.
- TDD obrigatório (node:test): teste antes da implementação.
- Testes não podem depender de rede nem de `gh` instalado.
- Mensagens de CLI, docs e commits em PT-BR; conventional commits (feat:, fix:, docs:, refactor:, test:).
- Planos/specs em `docs/superpowers/plans/` e `docs/superpowers/specs/` com nome `YYYY-MM-DD-<assunto>.md`.
- `uninstall` só remove o que reconhece como seu (shim contendo `.bento/lib/validate.mjs`; seção `## Bento (small-prs)`); arquivos do usuário com nomes iguais são preservados.
