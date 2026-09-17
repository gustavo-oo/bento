# AGENTS.md: bento

CLI that installs/updates/removes, in a consumer project, the personal opencode workflow: the `small-prs` skill (PR limits + sessions/live stack), the `self-review` skill (internal review gate with 2 agents), the ponytail plugin, 14 vendored superpowers skills with scoped agents (`flash`, `superpowers`, `orchestrator`, `implementer`, `explorer`, `verify`, `reviewer`, `browser`), MCP servers (codegraph, agent-browser), the agent-browser/taste-skill skills, the direct output style (`i-have-adhd` skill + always-on `instructions`), and a stack-aware pre-push hook.

## Commands

```bash
npm test                            # all tests (node --test test/*.test.mjs)
node --test test/validate.test.mjs  # a single file
node bin/bento.mjs check            # validates diff size main..HEAD
```

CI: `.github/workflows/ci.yml` runs `npm test` on Node 24 for PRs and pushes to `main` (GitHub Actions).

## CLI (bin/bento.mjs)

- `install` targets a consumer project and requires `gh` (installs the gh-stack extension) → exit 1 without `gh`; `update` does NOT touch gh-stack.
- `install`/`update` copy `lib/`, `bin/`, `templates/` into `.bento/` (+ `.bento/VERSION`), vendor the 14 superpowers skills, create the scoped agents (`flash`, `superpowers`, `orchestrator`, `implementer`, `explorer`, `verify`, `reviewer`, `browser`) in `.opencode/agents/` and the `default_agent` (only if absent and the on-disk `flash` is from bento), remove the superpowers plugin from older installs, and create bento's skills (`.opencode/skills/small-prs`, `self-review`, `taste-skill`, and, unless flagged, `agent-browser`), the output style (`.opencode/skills/i-have-adhd`, `.opencode/instructions/i-have-adhd.md`, and the `instructions` key in `opencode.json`/`.jsonc`; skip with `--no-output-style`), the `scripts/pr-split-verify.mjs` shim, `.bento.yaml` (single config: PR limits + artifact language; only if absent, and a legacy `.pr-limits.yaml` is merged into it and removed), and the `## Bento (small-prs)` section in AGENTS.md.
- install/update flags: `--no-agents`, `--no-superpowers` (skips vendored skills + the superpowers agent; does not touch the plugin or advance the `.bento/skills` snapshot), `--no-profile` (skips profile agents + `default_agent`), `--no-ponytail`, `--no-hooks`, `--no-codegraph`, `--no-agent-browser`, `--no-output-style`, and `--language "<value>"` (artifact language in `.bento.yaml`; on `install` a TTY prompts for it when the file is missing; `update` never prompts).
- Plugins and MCP go to `opencode.json`/`opencode.jsonc`; only `install` installs the global CLIs and runs `codegraph init`; `update` does not install CLIs or re-index codegraph.
- `--no-hooks` with a previous install's hook active prints a warning to stderr (the `core.hooksPath` stays).
- `check [base]` uses merge-base (`base...HEAD`); `equivalence <base> <head> <layer…>` requires layers in a chain (each one a descendant of the previous); `check-push` validates a push's refs (base by ancestry among them).
- Exit codes: `0` ok, `1` violation/divergence, `2` invalid usage.

## Architecture

- `lib/config.mjs`: parses the single `.bento.yaml` (PR limits + `artifacts_language`) with a pure regex parser (zero YAML deps): it supports only `max_lines`, `max_files`, `artifacts_language`, and indented `- glob:` + `max_lines:` entries; `loadLimits` falls back to a legacy `.pr-limits.yaml` when `.bento.yaml` is absent. Do not add new syntax without updating the parser + tests.
- `lib/diff.mjs`: numstat via `git diff` (`execFileSync` with a configurable cwd; tests use a fake repo).
- `lib/opencode-config.mjs`: edits `opencode.json` AND `opencode.jsonc` (routed by extension) preserving comments; commas/comments have dedicated tests; also manages the scalar `default_agent` key (conditional set/removal) and the `instructions` key entry (`addInstructionsEntry`/`removeInstructionsEntry`).
- `lib/mcp-config.mjs`: same text-based editing for the `mcp` block, with the same comment care (jsonc removal is by index; dedicated tests).
- `lib/stack.mjs`: resolves each push branch's base by ancestry among the pushed refs (base = nearest ancestor; no stack → `main`); it backs `check-push` without parsing `.git/gh-stack` or depending on `gh`.
- `lib/tools.mjs`: installs/removes global CLIs (`@colbymchenry/codegraph`, `agent-browser`); failures warn instead of erroring.
- `lib/validate.mjs`: `evaluate`/`runCheck`/`runCheckPush`/`runEquivalence`; `lib/install.mjs`: install/uninstall + `packageRoot()`/`version()`.
- `lib/hooks.mjs`: `setupPrePushHook`/`removePrePushHook`: configures `core.hooksPath` → `.bento/hooks` (skips with a warning if another hooksPath exists or if there are manual hooks in the common hooks dir, which covers linked worktrees); `templates/hooks/pre-push` is the source of the installed hook; it validates stdin refs in one `check-push` call (each branch against its stack base), with a fallback to the current checkout when run from a terminal.
- `lib/vendored-skills.mjs`: `VENDORED_SKILLS` (14 from superpowers), copies when absent/identical, updates by replacing the tree (removes files that left the origin), preserves diverged copies (`sameTree`), removes only if identical to `.bento/skills/`.
- `lib/agents.mjs`: installs `templates/agents/*.md` only if absent (marker `/^#\s*bento:\s*agent\b/m` inside the frontmatter), removes only files with the marker.
- This repo IS the source of everything installed into consumers: changes to `lib/`, `templates/`, or `skills/` reach them via `bento install`/`update`.
- `skills/<name>/` (14): vendored from superpowers v6.1.1 (commit `d884ae04edebef577e82ff7c4e143debd0bbec99`, MIT). Manual update: re-copy from the new commit, re-apply the local patches, and update this bullet. Local patches: `brainstorming/scripts/stop-server.sh` (canonicalizes the directory before `rm -rf`), `systematic-debugging/find-polluter.sh` (honors `TEST_CMD`), and `writing-skills/render-graphs.cjs` (renamed from `.js` to run under ESM; the skill references the new name).
- `skills/taste-skill/SKILL.md`: vendored from https://github.com/Leonxlnx/taste-skill (commit `ccbc15639c97057cbfcf32ecebc38ef716e4bb37`, 2026-08-24, MIT). Manual update: re-copy from the new commit and update this bullet.
- `skills/i-have-adhd/SKILL.md`: vendored from https://github.com/ayghri/i-have-adhd (commit `b15d0be58f55b33972ba3e39709e0e5208ef30cb`, 2026-09-16, MIT). Manual update: re-copy from the new commit and update this bullet. `templates/instructions/i-have-adhd.md`: always-on ruleset (upstream summary + a human-artifacts section) installed through the `instructions` key.
- `skills/agent-browser/SKILL.md`: stub pointing at `agent-browser skills get core`; the real content comes from the installed CLI.
- `skills/self-review/SKILL.md`: internal review gate (bento skill, not vendored): 2 reviewers with complementary mandates (`verify` regression + `reviewer` adversarial), mandatory repro for High/Medium, cross-validation, local ledger in `.superpowers/self-review/`, cap of 3 re-review rounds.
- `templates/agents/`: source of the `flash`, `superpowers` (adapted bootstrap, MIT), `orchestrator`, `implementer`, `explorer`, `verify`, `reviewer`, and `browser` agents.
- `templates/bento.yaml`: the single consumer config installed as `.bento.yaml` (PR limits + artifact language); created only if absent, an explicit `install({ artifactsLanguage })` updates the language line, and a legacy `.pr-limits.yaml` is merged in; the CLI prompts on a TTY during `install` when the file is missing. The installed `## Bento` section points agents to it for PR bodies, commits, docs, specs, and plans.
- `README.md`: human entry point (English, banner in `assets/banner.svg`; what's in the box, install with an agent, agents, PR guardrails); `AGENT_INSTALL.md`: step-by-step playbook (English) that an agent follows to install into a consumer (prerequisites, flags, verification, and report), the target of the README install prompt.

## Rules

- Pure Node (>= 18), ESM, zero runtime deps.
- TDD mandatory (node:test): test before implementation.
- Tests must not depend on the network or an installed `gh`.
- Everything in English: CLI messages, docs, and commit messages; conventional commits (feat:, fix:, docs:, refactor:, test:). Historical plans/specs written before 2026-09-17 stay in PT-BR.
- Changed a flag or behavior of `install`/`update`/`uninstall`? Update `README.md` and `AGENT_INSTALL.md` together.
- Plans/specs in `docs/superpowers/plans/` and `docs/superpowers/specs/` named `YYYY-MM-DD-<subject>.md`; session plans use `YYYY-MM-DD-<subject>-s<N>.md`.
- `uninstall` only removes what it recognizes as its own (shim containing `.bento/lib/validate.mjs`; `## Bento (small-prs)` section); user files with the same names are preserved.
