# Dogfooding do bento no próprio repo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o repositório do bento consumir o próprio bento (hook stack-aware, limites, skills, agents, MCP) com sincronia por re-install (`npm run dogfood`), sem versionar artefatos derivados.

**Architecture:** Nova flag `--no-shim` no `install`/`update` preserva o shim versionado do repo, que aponta para `../lib/validate.mjs` (vivo) e já suporta `check-push` (veio com o trunk). Os scripts `dogfood`/`dogfood:setup` aplicam `install`/`update` com `--no-shim`; `.bento/`, `.opencode/`, `opencode.json` e `.codegraph/` ficam ignorados no git; `.bento.yaml` e a seção gerada do `AGENTS.md` são versionados.

**Tech Stack:** Node >= 18 puro, ESM, zero deps runtime, `node:test`, git, gh-stack (gh CLI).

## Global Constraints

- Node >= 18, ESM, zero deps runtime; testes com `node --test test/*.test.mjs`, herméticos (sem rede e sem `gh`).
- TDD obrigatório (node:test): teste que falha antes, implementação mínima depois.
- **Artefatos novos em inglês**: mensagens de CLI, docs, nomes de testes novos e mensagens de commit (regra do trunk a partir de 2026-09-17); este plano fica em PT-BR por ser histórico.
- Base = `origin/main` (`3f0c6eb` ou posterior; `main` local sincronizado). A stack-viva já está integrada ao trunk.
- `--no-shim` pula `mkdirSync(scripts)` e a escrita de `scripts/pr-split-verify.mjs`; nada mais muda no install.
- O shim versionado (`scripts/pr-split-verify.mjs`) já expõe `check`, `check-push` e `equivalence` — não alterar; só adicionar smoke test.
- Mudou flag/comportamento de `install`/`update`/`uninstall`? Atualizar `README.md` **e** `AGENT_INSTALL.md` juntos (regra do repo).
- Ignorados no git: `.bento/`, `.codegraph/`, `.opencode/`, `opencode.json`, `opencode.jsonc`. Versionados: `.bento.yaml` e a seção `## Bento (small-prs)` gerada no `AGENTS.md`.
- `.bento.yaml` do repo = padrão do template (400/10 + `artifacts_language: English`); docs contam no total global.
- Camadas de stack: branch `split/dogfood/<nn>-<nome>`; 1 task = 1 camada; `check` por camada antes de seguir; violação = parar e perguntar.

### Tabela do stack

| camada | branch | base | foco/arquivos previstos | aceite | título do PR |
| --- | --- | --- | --- | --- | --- |
| 01 | `split/dogfood/01-no-shim` | `origin/main` | `lib/install.mjs`, `bin/bento.mjs`, `test/install.test.mjs`, `test/cli.test.mjs`, `AGENTS.md`, `README.md`, `AGENT_INSTALL.md` | `update --no-shim` preserva shim existente; sem a flag, escreve o do bento | feat: add --no-shim flag to install/update |
| 02 | `split/dogfood/02-repo-shim-test` | camada 01 | `test/repo-shim.test.mjs` | smoke do shim do repo verde (usage com `check-push`; `check-push` sem refs) | test: cover the repo pr-split-verify shim |
| 03 | `split/dogfood/03-scripts-dogfood` | camada 02 | `package.json`, `.gitignore`, `README.md`, `AGENTS.md` | `npm run dogfood:setup`/`dogfood` existem; derivados ignorados | feat: add dogfood scripts and ignore derived artifacts |
| 04 | `split/dogfood/04-ativacao` | camada 03 | `.bento.yaml`, `AGENTS.md` (seção gerada) | `dogfood:setup` roda; hook ativo; `git status` limpo de derivados | feat: activate bento dogfooding in this repo |

## Ao iniciar

- O controller já preparou: worktree `.worktrees/dogfood` na branch `split/dogfood/01-no-shim` (base `origin/main`), stack inicializado (`gh stack init split/dogfood/01-no-shim` → `main ← 01`), `main` local = `origin/main`, extensão `gh-stack` instalada, e o commit de prep com spec+plano nesta camada.
- No início de **cada task**: crie a camada sobre o topo e faça checkout: `gh stack add split/dogfood/<nn>-<nome>` (sem commit). A base da camada é o topo anterior (trunk na 01).
- Checkpoint por camada (Modo 1.5): `node scripts/pr-split-verify.mjs check <base-da-camada> HEAD` dentro do limite + `npm test` completo + self-review curto do diff. Violação = parar e perguntar.
- Gate Modo 4 (review por camada) antes do `gh stack submit`, no fim da sessão.

---

### Task 1: Flag `--no-shim` no install/update

**Files:**
- Modify: `lib/install.mjs` (assinatura ~linha 40; bloco do shim ~linhas 98-99)
- Modify: `bin/bento.mjs` (flags ~linha 34; chamadas nas linhas 42 e 88; usage ~linha 180)
- Modify: `test/install.test.mjs` (depois do teste `install: shim importa de ../.bento/lib/validate.mjs`, ~linha 93)
- Modify: `test/cli.test.mjs` (depois do teste `update: instala sem exigir gh`, ~linha 87)
- Modify: `AGENTS.md` (bullet `install/update flags`, linha ~19)
- Modify: `README.md` (linha do shim na tabela, ~linha 63)
- Modify: `AGENT_INSTALL.md` (tabela Skip/Flag, ~linhas 42-53)

**Interfaces:**
- Consumes: `install(projectRoot, opts)` existente; constante `SHIM` interna.
- Produces: opção `noShim: boolean` em `install`; flag `--no-shim` no CLI; docs (inglês) atualizadas.

- [ ] **Step 1: Escrever os testes que falham (install)**

Adicione em `test/install.test.mjs` logo depois do teste `install: shim importa de ../.bento/lib/validate.mjs`:

```js
test('install: noShim skips scripts/pr-split-verify.mjs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-'));
  install(dir, { noShim: true });
  assert.ok(!existsSync(join(dir, 'scripts', 'pr-split-verify.mjs')));
  assert.ok(existsSync(join(dir, '.bento', 'lib', 'validate.mjs')));
});

test('install: noShim preserves an existing shim', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  const sentinel = '#!/usr/bin/env node\nimport { runCheck } from "../lib/validate.mjs";\n';
  writeFileSync(join(dir, 'scripts', 'pr-split-verify.mjs'), sentinel);
  install(dir, { noShim: true });
  assert.equal(readFileSync(join(dir, 'scripts', 'pr-split-verify.mjs'), 'utf8'), sentinel);
});
```

- [ ] **Step 2: Rodar e ver que falha**

Run: `node --test test/install.test.mjs`
Expected: FAIL no primeiro teste novo — o shim é criado mesmo com `noShim: true` (opção ignorada).

- [ ] **Step 3: Implementar `noShim` em `lib/install.mjs`**

Troque a assinatura (linha ~40):

```js
export function install(projectRoot, { noAgents = false, noAgentBrowser = false, noHooks = false, noSuperpowers = false, noProfile = false, noCodegraph = false, noOutputStyle = false, noShim = false } = {}) {
```

E envolva o bloco do shim (hoje duas linhas entre `.opencode/commands` e `.bento.yaml`):

```js
  if (!noShim) {
    mkdirSync(join(projectRoot, 'scripts'), { recursive: true });
    writeFileSync(join(projectRoot, 'scripts', 'pr-split-verify.mjs'), SHIM);
  }
```

- [ ] **Step 4: Rodar os testes do install**

Run: `node --test test/install.test.mjs`
Expected: PASS (todos).

- [ ] **Step 5: Escrever o teste que falha (CLI)**

Adicione em `test/cli.test.mjs` logo depois do teste `update: instala sem exigir gh`:

```js
test('update --no-shim preserves an existing shim; without the flag it installs bento\'s', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  const sentinel = '#!/usr/bin/env node\nconsole.log("my shim");\n';
  writeFileSync(join(dir, 'scripts', 'pr-split-verify.mjs'), sentinel);
  const skipped = spawnSync(process.execPath, [BIN, 'update', '--no-shim'], { cwd: dir, encoding: 'utf8' });
  assert.equal(skipped.status, 0);
  assert.equal(readFileSync(join(dir, 'scripts', 'pr-split-verify.mjs'), 'utf8'), sentinel);
  const overwritten = spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(overwritten.status, 0);
  assert.ok(readFileSync(join(dir, 'scripts', 'pr-split-verify.mjs'), 'utf8').includes('../.bento/lib/validate.mjs'));
});
```

- [ ] **Step 6: Rodar e ver que falha**

Run: `node --test test/cli.test.mjs`
Expected: FAIL — `update --no-shim` sobrescreve o sentinela (flag ainda não existe no bin).

- [ ] **Step 7: Implementar a flag em `bin/bento.mjs`**

No bloco de flags de `run()`, adicione depois de `noOutputStyle`:

```js
  const noShim = args.includes('--no-shim');
```

Nas duas chamadas (`install` e `update`, linhas ~42 e ~88), inclua a opção:

```js
      const result = install(process.cwd(), { noAgents, noAgentBrowser, noHooks, noSuperpowers, noProfile, noCodegraph, noOutputStyle, noShim });
```

No texto de usage, troque o bloco de flags do install:

```
                    --no-hooks skips pre-push; --no-codegraph skips codegraph; --no-agent-browser skips agent-browser;
                    --no-output-style skips the i-have-adhd skill and the instructions entry (does not revoke a previous install; use uninstall to remove))
```

por:

```
                    --no-hooks skips pre-push; --no-shim skips the scripts/pr-split-verify.mjs shim;
                    --no-codegraph skips codegraph; --no-agent-browser skips agent-browser;
                    --no-output-style skips the i-have-adhd skill and the instructions entry (does not revoke a previous install; use uninstall to remove))
```

- [ ] **Step 8: Rodar os testes do CLI**

Run: `node --test test/cli.test.mjs`
Expected: PASS (todos).

- [ ] **Step 9: Documentar a flag (inglês, nos três arquivos)**

`AGENTS.md`, bullet `install/update flags` (linha ~19): acrescente `` `--no-shim` `` logo após `` `--no-hooks`, ``:

```markdown
- install/update flags: `--no-agents`, `--no-superpowers` (skips vendored skills + the superpowers agent; does not touch the plugin or advance the `.bento/skills` snapshot), `--no-profile` (skips profile agents + `default_agent`), `--no-ponytail`, `--no-hooks`, `--no-shim` (skips the `scripts/pr-split-verify.mjs` shim), `--no-codegraph`, `--no-agent-browser`, `--no-output-style`.
```

`README.md`, linha do shim na tabela (coluna de flag de `n/a` para `` `--no-shim` ``):

```markdown
| `scripts/pr-split-verify.mjs` shim | Shortcut for `check`, `check-push`, and `equivalence` at the project root | `--no-shim` |
```

`AGENT_INSTALL.md`, tabela Skip/Flag: adicione a linha depois de `| pre-push hook | `--no-hooks` |`:

```markdown
| the `scripts/pr-split-verify.mjs` shim | `--no-shim` |
```

- [ ] **Step 10: Suíte completa + commit**

Run: `npm test`
Expected: todos os testes PASS.

```bash
git add lib/install.mjs bin/bento.mjs test/install.test.mjs test/cli.test.mjs AGENTS.md README.md AGENT_INSTALL.md
git commit -m "feat: add --no-shim flag to install/update"
```

---

### Task 2: Smoke test do shim do repo

**Files:**
- Create: `test/repo-shim.test.mjs`

**Interfaces:**
- Consumes: `scripts/pr-split-verify.mjs` (já suporta `check-push`; mensagens em inglês: `PR(s) within limits.`).
- Produces: teste hermético que guarda o contrato do shim (o hook chama `check-push` nele).

- [ ] **Step 1: Criar o teste**

Crie `test/repo-shim.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHIM = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'pr-split-verify.mjs');

test('repo shim: no args prints usage with check-push and exits 2', () => {
  const r = spawnSync(process.execPath, [SHIM], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.ok(r.stderr.includes('check-push'));
});

test('repo shim: check-push with no refs exits 0 using the defaults', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-repo-shim-'));
  const r = spawnSync(process.execPath, [SHIM, 'check-push'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('PR(s) within limits.'));
  assert.ok(!r.stderr.includes('OVERSIZED PR'));
});
```

- [ ] **Step 2: Rodar**

Run: `node --test test/repo-shim.test.mjs`
Expected: PASS — o shim veio pronto do trunk, então não há RED legítimo (teste de caracterização; registre isso no report do implementer).

- [ ] **Step 3: Suíte completa + commit**

Run: `npm test`
Expected: todos os testes PASS.

```bash
git add test/repo-shim.test.mjs
git commit -m "test: cover the repo pr-split-verify shim"
```

---

### Task 3: Scripts de dogfood e ignores

**Files:**
- Modify: `package.json` (scripts)
- Modify: `.gitignore`
- Modify: `README.md` (seção nova, em inglês)
- Modify: `AGENTS.md` (Commands + Architecture, em inglês)

**Interfaces:**
- Consumes: flag `--no-shim` (Task 1) e o shim vivo (`scripts/pr-split-verify.mjs`, `../lib/validate.mjs`).
- Produces: `npm run dogfood:setup` / `npm run dogfood`; lista de ignores do dogfood.

- [ ] **Step 1: Adicionar os scripts npm**

`package.json`, bloco `scripts`:

```json
  "scripts": {
    "test": "node --test test/*.test.mjs",
    "dogfood:setup": "node bin/bento.mjs install --no-shim",
    "dogfood": "node bin/bento.mjs update --no-shim"
  }
```

- [ ] **Step 2: Atualizar o `.gitignore`**

```gitignore
node_modules/
.worktrees/
.bento/
.codegraph/
.opencode/
opencode.json
opencode.jsonc
```

- [ ] **Step 3: Documentar no README (inglês)**

Adicione ao final do `README.md`, depois da seção `## 🛠 Development`:

```markdown
## 🍱 Dogfooding (this repository)

This repo consumes bento itself. Derived artifacts (`.bento/`, `.opencode/`, `opencode.json`, `.codegraph/`) are git-ignored.

```bash
npm run dogfood:setup   # once per clone: full install (global CLIs, gh-stack, hook, codegraph index)
npm run dogfood         # after changing lib/, templates/, skills/, or agents
```

- The committed `scripts/pr-split-verify.mjs` shim points at `../lib/validate.mjs` (live); the npm scripts pass `--no-shim` so it is never overwritten.
- In fresh worktrees, run `npm run dogfood` inside the worktree to create `.bento/hooks` there; otherwise that worktree's pushes skip the hook.
- The hook checks every pushed branch against its stack base; keep local `main` in sync with `origin/main`.
- `bento uninstall` in this repo removes tracked files (`.bento.yaml` and the `## Bento` section of `AGENTS.md`); the live `scripts/pr-split-verify.mjs` shim stays (it does not contain the `.bento/lib` marker). Recover removed files with `git restore`.
```

- [ ] **Step 4: Documentar no AGENTS.md (inglês)**

Na seção `## Commands`, acrescente às linhas de comando:

```bash
npm run dogfood:setup               # dogfood in this repo: full install (once per clone)
npm run dogfood                     # dogfood: re-applies source changes (update)
```

Na seção `## Architecture`, adicione o bullet (junto do bullet "This repo IS the source…"):

```markdown
- Dogfooding: this repo consumes bento via `npm run dogfood:setup`/`npm run dogfood` (`--no-shim`); `.bento/`, `.opencode/`, `opencode.json`, and `.codegraph/` are git-ignored; the committed `scripts/pr-split-verify.mjs` shim points at `../lib/validate.mjs` (live).
```

- [ ] **Step 5: Verificar scripts e suíte**

Run: `npm run` (lista os dois scripts) e `npm test`
Expected: `dogfood` e `dogfood:setup` listados; suíte PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore README.md AGENTS.md
git commit -m "feat: add dogfood scripts and ignore derived artifacts"
```

---

### Task 4: Ativação do dogfood

**Files:**
- Create: `.bento.yaml` (gerado pelo install)
- Modify: `AGENTS.md` (seção `## Bento (small-prs)` gerada)

**Interfaces:**
- Consumes: `npm run dogfood:setup` (Task 3) e o hook stack-aware (trunk).
- Produces: hook ativo no checkout (`core.hooksPath = .bento/hooks`), configs e seção gerada versionadas.

- [ ] **Step 1: Rodar o dogfood**

Run: `npm run dogfood:setup`
Expected: instala CLIs globais (codegraph, agent-browser + Chrome), garante gh-stack, cria `.bento/`, `.opencode/`, `opencode.json`, `.codegraph/`, `.bento.yaml`, ativa `core.hooksPath`. Requer rede e `gh`; pode demorar (Chrome/index).

- [ ] **Step 2: Verificar a instalação**

Run: `git config core.hooksPath && test -f .bento/VERSION && echo ok`
Expected: `.bento/hooks` e `ok`.

Run: `git status --short`
Expected: apenas `.bento.yaml` (novo) e `AGENTS.md` (modificado); nenhum `.bento/`, `.opencode/`, `opencode.json` ou `.codegraph/` (ignorados).

- [ ] **Step 3: Smoke do shim e do hook**

Run (base = camada anterior): `node scripts/pr-split-verify.mjs check split/dogfood/03-scripts-dogfood split/dogfood/04-ativacao`
Expected: `PR within limits.` — o agregado da pilha contra o trunk acusa OVERSIZED por design (12+ arquivos); a validação é por camada.

Run (hook com todos os refs da pilha):

```bash
printf 'refs/heads/split/dogfood/04-ativacao %s refs/heads/split/dogfood/04-ativacao %s\nrefs/heads/split/dogfood/03-scripts-dogfood %s refs/heads/split/dogfood/03-scripts-dogfood %s\nrefs/heads/split/dogfood/02-repo-shim-test %s refs/heads/split/dogfood/02-repo-shim-test %s\nrefs/heads/split/dogfood/01-no-shim %s refs/heads/split/dogfood/01-no-shim %s\n' \
  "$(git rev-parse split/dogfood/04-ativacao)" "$(git rev-parse split/dogfood/04-ativacao)" \
  "$(git rev-parse split/dogfood/03-scripts-dogfood)" "$(git rev-parse split/dogfood/03-scripts-dogfood)" \
  "$(git rev-parse split/dogfood/02-repo-shim-test)" "$(git rev-parse split/dogfood/02-repo-shim-test)" \
  "$(git rev-parse split/dogfood/01-no-shim)" "$(git rev-parse split/dogfood/01-no-shim)" \
  | .bento/hooks/pre-push
```

Expected: `[04-ativacao] diff 03-scripts-dogfood...`, `[03-scripts-dogfood] diff 02-repo-shim-test...`, `[02-repo-shim-test] diff 01-no-shim...`, `[01-no-shim] diff main...`, todas dentro dos limites; exit 0.

- [ ] **Step 4: Commit da ativação**

```bash
git add .bento.yaml AGENTS.md
git commit -m "feat: activate bento dogfooding in this repo"
```

---

## Self-review do plano

- **Cobertura da spec (com adendo):** `--no-shim` → Task 1; smoke do shim vivo → Task 2 (a implementação já veio com o trunk); scripts/ignores/docs → Task 3; ativação com `.bento.yaml` + seção gerada → Task 4. Base `origin/main` e regra de inglês registradas em Global Constraints.
- **Sem placeholders:** todos os steps têm código, comandos e saídas esperadas; o único teste sem RED é o smoke da Task 2 (caracterização explícita).
- **Consistência de tipos:** `noShim` (install) e `--no-shim` (CLI); `refs = [{ branch, sha }]` montado no shim; nomes de branch/arquivos conferem com a tabela do stack e as tasks; mensagens do `validate` conferidas no trunk (`PR within limits.` / `PR(s) within limits.`).
