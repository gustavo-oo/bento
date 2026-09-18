<p align="center">
  <img src="assets/banner.svg" alt="bentō (弁当): the opencode workflow, in a box" width="100%">
</p>

# bento v2 — opencode workflow setup prompt

Reference only: nothing is vendored here. Paste this file into your coding agent while it runs in the target project, or point the agent at `https://raw.githubusercontent.com/gustavo-oo/bento/v2/README.md`. Every piece is installed by following its upstream's own instructions, so running this again is also the update path.

## For the agent

Set up the user's personal opencode workflow in the current project. For each piece below: open the upstream link, follow its installation instructions for opencode exactly as written, and use its own verification steps. Do not cherry-pick files, do not copy content from this repository, and do not invent steps the upstream does not document. Talk to the human in their language and announce the global installs before running them.

### Install

| Piece | Upstream |
| --- | --- |
| superpowers | https://github.com/obra/superpowers — opencode route: fetch and follow https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/.opencode/INSTALL.md |
| taste-skill | https://github.com/Leonxlnx/taste-skill — install the `design-taste-frontend` skill as the repo documents |
| i-have-adhd | https://github.com/ayghri/i-have-adhd — follow the opencode section of `INSTALL.md`, including the always-on mode |
| agent-browser | https://github.com/vercel-labs/agent-browser — follow the repo's installation instructions |
| codegraph | https://github.com/colbymchenry/codegraph — follow the repo's installation instructions |

Integration: when an upstream documents an MCP server or a config key, wire it into this project's `opencode.json`/`opencode.jsonc` exactly as documented, preserving comments and existing entries.

### Do not install (disabled for now)

`small-prs`, `self-review`, the stack-aware pre-push hook, `.bento.yaml`, the profile agents (`flash`, `explorer`, `verify`, `reviewer`, `browser`), `gh-stack`, and the ponytail plugin.

### Prerequisites

Node >= 18, npm, git, and curl. Stop and ask the human to fix anything missing or older.

### Report

Report each upstream and what it installed, the config files touched, anything skipped or failed, and that opencode must be restarted to load the new pieces.
