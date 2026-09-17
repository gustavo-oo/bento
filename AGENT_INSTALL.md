# Installing bento with an agent

You are a coding agent and you are going to install [bento](https://github.com/gustavo-oo/bento) into the current project. Follow the steps in order, do not skip any check, and talk to the human in their language.

## What bento is

A Node CLI (zero runtime dependencies) that installs, into a consumer project, a personal opencode workflow: the `small-prs` skill (PR size limits + layered splits), the `self-review` gate, 14 vendored superpowers skills, scoped agents, the `codegraph` and `agent-browser` MCP servers, the ponytail plugin, a direct output style (the `i-have-adhd` skill + always-on `instructions`), and a stack-aware pre-push hook.

The CLI always acts on the working directory (`process.cwd()`), never on the source repo. **Run every command from the root of the consumer project.**

## Step 0: get the code

The repo is public: no clone, no auth. If you are already reading this from a local clone of bento, use that directory. Otherwise, download the source tarball:

```bash
BENTO_SRC="${TMPDIR:-/tmp}/bento-src"
rm -rf "$BENTO_SRC"
mkdir -p "$BENTO_SRC"
curl -fsSL https://github.com/gustavo-oo/bento/archive/refs/heads/main.tar.gz | tar -xz -C "$BENTO_SRC" --strip-components=1
```

If `curl`/`tar` are unavailable, fall back to `git clone --depth 1 https://github.com/gustavo-oo/bento.git "$BENTO_SRC"`.

Keep the path in `BENTO_SRC` and do not edit anything inside it.

## Step 1: prerequisites (mandatory)

```bash
node --version   # must be >= 18
git --version
gh --version
gh auth status
```

- Node < 18: stop and ask the human to upgrade.
- `gh` missing or not logged in: stop, suggest `brew install gh` + `gh auth login`, and explain that `install` adds the `gh-stack` extension (without `gh` the CLI exits with code 1).

## Step 2: confirm with the human before running

Summarize in a few lines:

- **In the project**: creates/updates `.bento/` (lib, bin, skills, templates, `VERSION`), `.opencode/` (skills, agents, instructions), `scripts/pr-split-verify.mjs`, `.bento.yaml` (single config: PR limits + artifact language; created only if missing), the `## Bento (small-prs)` section in `AGENTS.md`, and keys in `opencode.json`/`opencode.jsonc` (ponytail plugin, MCPs, `default_agent`, and `instructions`).
- **Outside the project**: `npm install -g` for `@colbymchenry/codegraph` and `agent-browser`; the `gh-stack` extension; `git config core.hooksPath .bento/hooks` (local config per clone); `codegraph init` creates `.codegraph/`.

Then ask the human which language agents must use for generated artifacts (PR bodies, commit messages, docs, specs, and plans). Default: English. If `.bento.yaml` already exists, show the current `artifacts_language` and only ask if they want to change it.

If the human wants to skip something, use the matching flag:

| Skip | Flag |
| --- | --- |
| codegraph (global CLI, MCP, and `init`) | `--no-codegraph` |
| agent-browser (global CLI, MCP, and skill) | `--no-agent-browser` |
| vendored superpowers skills + the `superpowers` agent (does not touch the plugin) | `--no-superpowers` |
| bento agents + `default_agent` | `--no-profile` |
| ponytail plugin | `--no-ponytail` |
| pre-push hook | `--no-hooks` |
| `## Bento (small-prs)` section in `AGENTS.md` | `--no-agents` |
| output style (`i-have-adhd` + `instructions`) | `--no-output-style` |

## Step 3: install

From the root of the consumer project (not from inside `$BENTO_SRC`):

```bash
node "$BENTO_SRC/bin/bento.mjs" install --language "<chosen language>"
```

- Pass the answer to the language question as `--language "<value>"`. Omit the flag to keep the default (English) or the existing `.bento.yaml`. `--language` requires a value.
- Standard output lists every installed piece. Capture it for the report.
- Exit codes: `0` ok, `1` failure (e.g. `gh` unavailable), `2` invalid usage.
- Never run `cd "$BENTO_SRC" && node bin/bento.mjs install`: that would install bento into its own source repo.
- On failure, show stderr and the exit code to the human. Do not install piece by piece by hand: the CLI is the source of truth.

## Step 4: verify

```bash
set -e
test -f .bento/VERSION
test -f .opencode/skills/small-prs/SKILL.md
test -f .opencode/skills/self-review/SKILL.md
test -f .opencode/skills/taste-skill/SKILL.md
test -f .opencode/agents/flash.md
test -f .opencode/agents/reviewer.md
test -f scripts/pr-split-verify.mjs
test -f .bento.yaml
grep -q '^artifacts_language:' .bento.yaml
grep -q '^max_lines:' .bento.yaml
grep -q '^## Bento (small-prs)' AGENTS.md
test -x .bento/hooks/pre-push
test "$(git config core.hooksPath)" = ".bento/hooks"
grep -Eq 'ponytail' opencode.json 2>/dev/null || grep -Eq 'ponytail' opencode.jsonc
grep -Eq 'codegraph' opencode.json 2>/dev/null || grep -Eq 'codegraph' opencode.jsonc
grep -Eq 'agent-browser' opencode.json 2>/dev/null || grep -Eq 'agent-browser' opencode.jsonc
echo "verification ok"
```

Skip in this check whatever the human asked to skip with flags (for example, without `--no-output-style`, also confirm `.opencode/skills/i-have-adhd/` and `.opencode/instructions/i-have-adhd.md`; with `--no-profile`, `flash.md` and `reviewer.md` are absent). If something is missing, run `install` again and report what persists.

## Step 5: report

Suggested report format (in the human's language):

```text
bento installed (version <VERSION>)
- flags: none
- artifacts language: Portuguese (pt-BR)
- pre-push hook: active (core.hooksPath → .bento/hooks)
- next steps:
  - restart opencode to load the plugin, MCPs, and agents;
  - Tab switches between flash (default) and superpowers;
  - `node .bento/bin/bento.mjs check` validates the diff size (default main..HEAD).
```

## After installation

- **Update**: `node .bento/bin/bento.mjs update` preserves `.bento.yaml` and your edits to the agents (a legacy `.pr-limits.yaml` is merged into `.bento.yaml`); it does not touch `gh-stack`, reinstall global CLIs, or re-index codegraph.
- **Uninstall**: `node .bento/bin/bento.mjs uninstall`.
- Do not edit `.bento/` by hand: it is replaced on the next `update`.
