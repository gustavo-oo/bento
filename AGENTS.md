# AGENTS.md — bento

CLI que instala/atualiza/remove, num projeto consumidor, o fluxo opencode pessoal: skill `small-prs` (limites de PR + sessões/stack viva), skill `self-review` (gate de review interno com 2 agentes), plugin ponytail, 14 skills vendadas do superpowers com agents escopados (`flash`, `superpowers`, `orchestrator`, `implementer`, `explorer`, `verify`, `reviewer`, `browser`), MCP servers (codegraph, agent-browser), skill agent-browser/taste-skill, estilo de saída direto (skill `i-have-adhd` + `instructions` always-on) e hook pre-push stack-aware.

## Commands

```bash
npm test                            # todos os testes (node --test test/*.test.mjs)
node --test test/validate.test.mjs  # um arquivo só
node bin/bento.mjs check            # valida tamanho do diff main..HEAD
```

CI: `.github/workflows/ci.yml` roda `npm test` no Node 24 em PRs e push na `main` (GitHub Actions).

## CLI (bin/bento.mjs)

- `install` atua num projeto consumidor e exige `gh` (instala a extensão gh-stack) → exit 1 sem `gh`; `update` NÃO toca gh-stack.
- `install`/`update` copiam `lib/`, `bin/`, `templates/` para `.bento/` (+ `.bento/VERSION`), vendam as 14 skills do superpowers, criam os agents escopados (`flash`, `superpowers`, `orchestrator`, `implementer`, `explorer`, `verify`, `reviewer`, `browser`) em `.opencode/agents/` e o `default_agent` (só se ausente e o `flash` em disco for do bento), removem o plugin superpowers de instalações antigas e criam as skills do bento (`.opencode/skills/small-prs`, `self-review`, `taste-skill` e, salvo flag, `agent-browser`), o output style (`.opencode/skills/i-have-adhd`, `.opencode/instructions/i-have-adhd.md` e a chave `instructions` no `opencode.json`/`.jsonc`; pule com `--no-output-style`), o shim `scripts/pr-split-verify.mjs`, `.pr-limits.yaml` (só se ausente) e a seção `## Bento (small-prs)` no AGENTS.md.
- Flags de install/update: `--no-agents`, `--no-superpowers` (pula skills vendadas + agent superpowers; não mexe no plugin nem avança o snapshot `.bento/skills`), `--no-profile` (pula agents de perfil + `default_agent`), `--no-ponytail`, `--no-hooks`, `--no-codegraph`, `--no-agent-browser`, `--no-output-style`.
- Plugins e MCP vão para `opencode.json`/`opencode.jsonc`; só `install` instala os CLIs globais e roda `codegraph init` — `update` não instala CLIs nem re-indexa o codegraph.
- `--no-hooks` com hook de install anterior ativo emite aviso no stderr (o `core.hooksPath` permanece).
- `check [base]` usa merge-base (`base...HEAD`); `equivalence <base> <head> <camada…>` exige camadas em cadeia (cada uma descendente da anterior); `check-push` valida os refs de um push (base por ancestralidade entre eles).
- Exit codes: `0` ok, `1` violação/divergência, `2` uso inválido.

## Arquitetura

- `lib/config.mjs` — parser de `.pr-limits.yaml` é regex puro (zero dep de YAML): suporta só `max_lines`, `max_files` e entradas `- glob:` + `max_lines:` indentado. Não adicione sintaxe nova sem atualizar parser + testes.
- `lib/diff.mjs` — numstat via `git diff` (`execFileSync` com cwd parametrizável; testes usam repo fake).
- `lib/opencode-config.mjs` — edita `opencode.json` E `opencode.jsonc` (roteia por extensão) preservando comentários; vírgulas/comentários têm testes dedicados; também gerencia a chave escalar `default_agent` (set condicional/remoção) e a entrada da chave `instructions` (`addInstructionsEntry`/`removeInstructionsEntry`).
- `lib/mcp-config.mjs` — mesma edição por texto para o bloco `mcp`, com o mesmo cuidado de comentários (remoção no jsonc é por índices; tem testes dedicados).
- `lib/stack.mjs` — resolve a base de cada branch de um push por ancestralidade entre os refs empurrados (base = ancestral mais próximo; sem stack → `main`); base do `check-push`, sem parsear `.git/gh-stack` nem depender de `gh`.
- `lib/tools.mjs` — instala/remove CLIs globais (`@colbymchenry/codegraph`, `agent-browser`); falhas geram aviso, não erro.
- `lib/validate.mjs` — `evaluate`/`runCheck`/`runCheckPush`/`runEquivalence`; `lib/install.mjs` — install/uninstall + `packageRoot()`/`version()`.
- `lib/hooks.mjs` — `setupPrePushHook`/`removePrePushHook`: config `core.hooksPath` → `.bento/hooks` (pula com aviso se já houver hooksPath de outro lugar ou hooks manuais no diretório comum de hooks, o que cobre linked worktrees); `templates/hooks/pre-push` é a fonte do hook instalado; valida os refs do stdin em uma chamada `check-push` (cada branch contra a base do seu stack), com fallback para o checkout atual quando rodado no terminal.
- `lib/vendored-skills.mjs` — `VENDORED_SKILLS` (14 do superpowers), cópia se ausente/idêntica, atualização substitui a árvore (remove arquivos que saíram da origem), preserva divergente (`sameTree`), remoção só se idêntica ao `.bento/skills/`.
- `lib/agents.mjs` — instala `templates/agents/*.md` só se ausente (marcador `/^#\s*bento:\s*agent\b/m` dentro do frontmatter), remove só o que tem o marcador.
- Este repositório É a fonte do que é instalado em consumidores: mudanças em `lib/`, `templates/` ou `skills/` propagam via `bento install`/`update`.
- `skills/<nome>/` (14) — venda do superpowers v6.1.1 (commit `d884ae04edebef577e82ff7c4e143debd0bbec99`, MIT). Atualização manual: re-copiar do commit novo, reaplicar os patches locais e atualizar este bullet. Patches locais: `brainstorming/scripts/stop-server.sh` (canonicaliza o diretório antes do `rm -rf`), `systematic-debugging/find-polluter.sh` (respeita `TEST_CMD`) e `writing-skills/render-graphs.cjs` (renomeado de `.js` para rodar em contexto ESM; a skill referencia o novo nome).
- `skills/taste-skill/SKILL.md` — venda do upstream https://github.com/Leonxlnx/taste-skill (commit `ccbc15639c97057cbfcf32ecebc38ef716e4bb37`, 24/08/2026, MIT). Atualização manual: re-copiar do commit novo e atualizar este bullet.
- `skills/i-have-adhd/SKILL.md` — venda do upstream https://github.com/ayghri/i-have-adhd (commit `b15d0be58f55b33972ba3e39709e0e5208ef30cb`, 16/09/2026, MIT). Atualização manual: re-copiar do commit novo e atualizar este bullet. `templates/instructions/i-have-adhd.md` — ruleset always-on (resumo do upstream + seção de artefatos humanos) instalado na chave `instructions`.
- `skills/agent-browser/SKILL.md` — stub que aponta para `agent-browser skills get core`; o conteúdo real vem do CLI instalado.
- `skills/self-review/SKILL.md` — gate de review interno (skill bento, não vendada): 2 revisores com mandatos complementares (`verify` regressão + `reviewer` adversarial), repro obrigatória para High/Medium, validação cruzada, ledger local em `.superpowers/self-review/`, teto de 3 rodadas de re-review.
- `templates/agents/` — fonte dos agents `flash`, `superpowers` (bootstrap adaptado, MIT), `orchestrator`, `implementer`, `explorer`, `verify`, `reviewer`, `browser`.
- `README.md` — porta de entrada para humanos (em inglês, banner em `assets/banner.svg`; o que vem na caixa, instalação com agente, agents e guardrails de PR); `AGENT_INSTALL.md` — roteiro passo a passo (em inglês) que um agente segue para instalar num consumidor (pré-requisitos, flags, verificação e relatório), alvo do prompt de instalação do README.

## Regras

- Node puro (>= 18), ESM, zero deps runtime.
- TDD obrigatório (node:test): teste antes da implementação.
- Testes não podem depender de rede nem de `gh` instalado.
- Mensagens de CLI e commits em PT-BR; `README.md` e `AGENT_INSTALL.md` em inglês; demais docs em PT-BR; conventional commits (feat:, fix:, docs:, refactor:, test:).
- Mudou flag/comportamento de `install`/`update`/`uninstall`? Atualize `README.md` e `AGENT_INSTALL.md` junto.
- Planos/specs em `docs/superpowers/plans/` e `docs/superpowers/specs/` com nome `YYYY-MM-DD-<assunto>.md`; planos de sessão usam `YYYY-MM-DD-<assunto>-s<N>.md`.
- `uninstall` só remove o que reconhece como seu (shim contendo `.bento/lib/validate.mjs`; seção `## Bento (small-prs)`); arquivos do usuário com nomes iguais são preservados.
