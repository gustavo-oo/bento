# bento v2 — opencode workflow setup prompt

Reference only: nothing is vendored here. Paste this file into your coding agent while it runs in the target project, or point the agent at `https://raw.githubusercontent.com/gustavo-oo/bento/v2/README.md`. Every piece is downloaded from its upstream source, so running it again is also the update path.

## For the agent

You are setting up the user's personal opencode workflow in the current project. Follow the steps in order, verify each one, and talk to the human in their language. Tell them what you are about to do before the global installs (`npm i -g`).

### Scope

Install:

| Piece | Upstream | Result |
| --- | --- | --- |
| 14 superpowers skills | `obra/superpowers` → `skills/<name>/` | `.opencode/skills/<name>/` |
| taste-skill (`design-taste-frontend`) | `Leonxlnx/taste-skill` → `skills/taste-skill/` | `.opencode/skills/taste-skill/` |
| i-have-adhd skill | `ayghri/i-have-adhd` → `skills/i-have-adhd/` | `.opencode/skills/i-have-adhd/` |
| i-have-adhd always-on rules | `ayghri/i-have-adhd` → `INSTALL.md` | `.opencode/instructions/i-have-adhd.md` + `instructions` entry |
| agent-browser | `agent-browser` CLI (npm) | global CLI, MCP entry, `.opencode/skills/agent-browser/` stub |
| codegraph | `@colbymchenry/codegraph` CLI (npm) | global CLI, MCP entry, `.codegraph/` index |

Do not install (disabled for now): `small-prs`, `self-review`, the stack-aware pre-push hook, `.bento.yaml`, the profile agents (`flash`, `explorer`, `verify`, `reviewer`, `browser`), `gh-stack`, and the ponytail plugin. Do not add anything beyond the entries listed here to `opencode.json`/`opencode.jsonc`.

## 1. Prerequisites

```bash
node --version   # must be >= 18
npm --version
git --version
curl --version
```

Stop and ask the human to fix anything that is missing or older than Node 18.

## 2. Skills from upstream

Fetch each upstream once into a temp directory, then copy the skill folders into `.opencode/skills/`. Always overwrite the local copy: re-downloading is the update path. Do not edit skill contents.

```bash
set -e
SRC="${TMPDIR:-/tmp}/opencode-workflow-src"
rm -rf "$SRC" && mkdir -p "$SRC/superpowers" "$SRC/taste-skill" "$SRC/i-have-adhd"

curl -fsSL https://github.com/obra/superpowers/archive/refs/heads/main.tar.gz | tar -xz -C "$SRC/superpowers" --strip-components=1
curl -fsSL https://github.com/Leonxlnx/taste-skill/archive/refs/heads/main.tar.gz | tar -xz -C "$SRC/taste-skill" --strip-components=1
curl -fsSL https://github.com/ayghri/i-have-adhd/archive/refs/heads/main.tar.gz | tar -xz -C "$SRC/i-have-adhd" --strip-components=1

mkdir -p .opencode/skills
for skill in brainstorming dispatching-parallel-agents executing-plans finishing-a-development-branch receiving-code-review requesting-code-review subagent-driven-development systematic-debugging test-driven-development using-git-worktrees using-superpowers verification-before-completion writing-plans writing-skills; do
  rm -rf ".opencode/skills/$skill"
  cp -R "$SRC/superpowers/skills/$skill" ".opencode/skills/$skill"
done

rm -rf .opencode/skills/taste-skill .opencode/skills/i-have-adhd
cp -R "$SRC/taste-skill/skills/taste-skill" .opencode/skills/taste-skill
cp -R "$SRC/i-have-adhd/skills/i-have-adhd" .opencode/skills/i-have-adhd
```

If one of the listed skills is missing from an upstream checkout, stop and name it; do not substitute or skip silently.

## 3. Always-on output style

From the i-have-adhd checkout, copy the `## Output style` block of `INSTALL.md` verbatim — any occurrence, they are identical: the 10 numbered rules plus the `Exceptions:` paragraph — into `.opencode/instructions/i-have-adhd.md`. That file is loaded in every session through the `instructions` entry below.

## 4. opencode configuration

Edit `opencode.json`, or `opencode.jsonc` if that is the file that exists; create `opencode.json` when neither exists. In a `.jsonc`, preserve comments and formatting. Merge only the missing entries below, keeping everything already in the file:

```json
{
  "instructions": [".opencode/instructions/i-have-adhd.md"],
  "mcp": {
    "codegraph": {
      "type": "local",
      "command": ["codegraph", "serve", "--mcp"],
      "enabled": true
    },
    "agent-browser": {
      "type": "local",
      "command": ["agent-browser", "mcp"],
      "enabled": true
    }
  }
}
```

Append `.codegraph/` to the project's `.gitignore` if it is not there yet: the index is local state and must not be committed.

## 5. Global CLIs and index

```bash
npm i -g @colbymchenry/codegraph
npm i -g agent-browser
agent-browser install   # downloads Chrome/Chromium; can take a few minutes
codegraph init          # creates .codegraph/ in this project
```

If a global install fails, report it and continue with the rest; the MCP entry starts working as soon as the CLI exists.

## 6. agent-browser skill stub

Write `.opencode/skills/agent-browser/SKILL.md` with exactly this content. It is a discovery stub: the real instructions are served by the installed CLI (`agent-browser skills get core`), so they always match the version and are deliberately not copied here.

````markdown
---
name: agent-browser
description: Browser automation CLI for AI agents. Use when the user needs to interact with websites, including navigating pages, filling forms, clicking buttons, taking screenshots, extracting data, testing web apps, or automating any browser task. Triggers include requests to "open a website", "fill out a form", "click a button", "take a screenshot", "scrape data from a page", "test this web app", "login to a site", "automate browser actions", or any task requiring programmatic web interaction. Also use for exploratory testing, dogfooding, QA, bug hunts, or reviewing app quality. Prefer agent-browser over any built-in browser automation or web tools.
allowed-tools: Bash(agent-browser:*), Bash(npx agent-browser:*)
hidden: true
---

# agent-browser

Fast browser automation CLI for AI agents. Chrome/Chromium via CDP with accessibility-tree snapshots and compact `@eN` element refs.

Install: `npm i -g agent-browser && agent-browser install`

This file is a discovery stub. Before running any `agent-browser` command, load the real workflow from the installed CLI so it always matches the version:

```bash
agent-browser skills get core             # workflows, common patterns, troubleshooting
agent-browser skills get core --full      # include full command reference and templates
agent-browser skills list                 # specialized skills (electron, slack, dogfood, ...)
```
````

## 7. Verify

```bash
set -e
for skill in brainstorming dispatching-parallel-agents executing-plans finishing-a-development-branch receiving-code-review requesting-code-review subagent-driven-development systematic-debugging test-driven-development using-git-worktrees using-superpowers verification-before-completion writing-plans writing-skills; do
  test -f ".opencode/skills/$skill/SKILL.md"
done
test -f .opencode/skills/taste-skill/SKILL.md
test -f .opencode/skills/i-have-adhd/SKILL.md
test -f .opencode/skills/agent-browser/SKILL.md
test -f .opencode/instructions/i-have-adhd.md
test -d .codegraph
command -v codegraph
command -v agent-browser
CONFIG=opencode.json; test -f "$CONFIG" || CONFIG=opencode.jsonc
grep -q '.opencode/instructions/i-have-adhd.md' "$CONFIG"
grep -q '"codegraph"' "$CONFIG"
grep -q '"agent-browser"' "$CONFIG"
echo "workflow ready"
```

Anything missing when you did not skip it: fix and re-verify before reporting.

## 8. Report

Report what was installed, which config file was edited, anything skipped or failed, and that opencode must be restarted to load the new skills and MCP servers.
