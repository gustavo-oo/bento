# Dogfooding do bento no próprio repo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o repositório do bento consumir o próprio bento (hook stack-aware, limites, skills, agents, MCP) com sincronia por re-install (`npm run dogfood`), sem versionar artefatos derivados.

**Architecture:** Nova flag `--no-shim` no `install`/`update` preserva o shim versionado do repo, que passa a apontar para `../lib/validate.mjs` (vivo) e a suportar `check-push`. Os scripts `dogfood`/`dogfood:setup` aplicam `install`/`update` com `--no-shim`; `.bento/`, `.opencode/`, `opencode.json` e `.codegraph/` ficam ignorados no git; `.pr-limits.yaml` e a seção gerada do `AGENTS.md` são versionados.

**Tech Stack:** Node >= 18 puro, ESM, zero deps runtime, `node:test`, git, gh-stack (gh CLI).

## Global Constraints

- Node >= 18, ESM, zero deps runtime; testes com `node --test test/*.test.mjs`, herméticos (sem rede e sem `gh`).
- TDD obrigatório: teste que falha antes, implementação mínima depois.
- Mensagens de CLI, docs e commits em PT-BR; conventional commits (`feat:`, `fix:`, `docs:`, `test:`).
- Dependência dura: base do stack = `feat/stack-viva` (hook stack-aware, `runCheckPush` em `lib/validate.mjs`, shim gerado com `check-push`). Se já merged, base = trunk.
- `--no-shim` pula `mkdirSync(scripts)` e a escrita de `scripts/pr-split-verify.mjs`; nada mais muda no install.
- Shim versionado do repo (`scripts/pr-split-verify.mjs`) importa de `../lib/validate.mjs` e expõe `check`, `check-push` e `equivalence`.
- Ignorados no git: `.bento/`, `.codegraph/`, `.opencode/`, `opencode.json`, `opencode.jsonc`.
- `.pr-limits.yaml` do repo = padrão do template (400/10); docs contam no total global.
- Camadas de stack: branch `split/dogfood/<nn>-<nome>`; 1 task = 1 camada; `check` por camada antes de seguir; violação = parar e perguntar.

### Tabela do stack

| camada | branch | base | foco/arquivos previstos | aceite | título do PR |
| --- | --- | --- | --- | --- | --- |
| 01 | `split/dogfood/01-no-shim` | trunk (ou `feat/stack-viva`) | `lib/install.mjs`, `bin/bento.mjs`, `test/install.test.mjs`, `test/cli.test.mjs`, `AGENTS.md`, `README.md` | `update --no-shim` preserva shim existente; sem a flag, escreve o do bento | feat: flag `--no-shim` no install/update |
| 02 | `split/dogfood/02-shim-vivo` | camada 01 | `scripts/pr-split-verify.mjs`, `test/repo-shim.test.mjs`, `README.md` | shim do repo responde `check-push`; smoke verde | feat: shim do repo com `check-push` |
| 03 | `split/dogfood/03-scripts-dogfood` | camada 02 | `package.json`, `.gitignore`, `README.md`, `AGENTS.md` | `npm run dogfood:setup`/`dogfood` existem; derivados ignorados | feat: scripts de dogfood e ignores do repo |
| 04 | `split/dogfood/04-ativacao` | camada 03 | `.pr-limits.yaml`, `AGENTS.md` (seção gerada) | `dogfood:setup` roda; hook ativo; `git status` limpo de derivados | feat: ativa o dogfood no repo |

## Ao iniciar

- Confirme a base: `git merge-base --is-ancestor feat/stack-viva main && echo merged || echo stack`. Se `stack`, a base do stack é o tip de `feat/stack-viva`; rode também a suíte inteira nela (`npm test` no checkout da stack).
- Trunk correto: `git remote set-head origin main` (origin/HEAD errado faz o stack mirar a branch errada).
- Docs da sessão: garanta que `docs/superpowers/specs/2026-09-17-dogfooding-design.md` e este plano (`docs/superpowers/plans/2026-09-17-dogfooding-s1.md`) estejam commitados na base do stack (ou na camada 01, se o trunk for protegido). Se não estiverem, copie-os do checkout onde foram escritos (`git checkout <checkout> -- <paths>`) e commite.
- Setup do stack: crie a camada 01 a partir da base e inicialize o stack:

```bash
git checkout -b split/dogfood/01-no-shim <base>
gh stack init split/dogfood/01-no-shim
```

- No início de **cada task**, crie a camada sobre o topo (sem commit): `gh stack add split/dogfood/<nn>-<nome>`. O `gh stack add` já faz o checkout da branch; a base da camada é o topo anterior (trunk na 01).
- Antes de seguir para a próxima task: `node scripts/pr-split-verify.mjs check <base-da-camada> HEAD` dentro do limite + `npm test` completo + self-review do diff (Modo 1.5).

---

### Task 1: Flag `--no-shim` no install/update

**Files:**
- Modify: `lib/install.mjs` (assinatura do `install` + bloco do shim)
- Modify: `bin/bento.mjs` (parse da flag, 2 chamadas de `install`, usage)
- Modify: `test/install.test.mjs` (2 testes novos)
- Modify: `test/cli.test.mjs` (1 teste novo)
- Modify: `AGENTS.md` (bullet de flags)
- Modify: `README.md` (linha do shim)

**Interfaces:**
- Consumes: `install(projectRoot, opts)` existente; `SHIM` (constante interna).
- Produces: opção `noShim: boolean` em `install`; flag `--no-shim` no CLI. Nada mais depende disso (as tasks seguintes usam a flag via scripts npm).

- [ ] **Step 1: Escrever os testes que falham (install)**

Adicione ao final do bloco de testes de shim em `test/install.test.mjs` (depois de `install: shim importa de ../.bento/lib/validate.mjs`):

```js
test('install: noShim não cria scripts/pr-split-verify.mjs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-'));
  install(dir, { noShim: true });
  assert.ok(!existsSync(join(dir, 'scripts', 'pr-split-verify.mjs')));
  assert.ok(existsSync(join(dir, '.bento', 'lib', 'validate.mjs')));
});

test('install: noShim preserva shim existente', () => {
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

Troque a assinatura:

```js
export function install(projectRoot, { noAgents = false, noAgentBrowser = false, noHooks = false, noSuperpowers = false, noProfile = false, noCodegraph = false, noShim = false } = {}) {
```

E envolva o bloco do shim (hoje duas linhas soltas entre `.opencode/commands` e `.pr-limits.yaml`):

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

Adicione em `test/cli.test.mjs` (depois do teste `update: instala sem exigir gh`):

```js
test('update --no-shim preserva o shim existente; sem a flag, instala o do bento', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  const sentinel = '#!/usr/bin/env node\nconsole.log("meu shim");\n';
  writeFileSync(join(dir, 'scripts', 'pr-split-verify.mjs'), sentinel);
  const skip = spawnSync(process.execPath, [BIN, 'update', '--no-shim'], { cwd: dir, encoding: 'utf8' });
  assert.equal(skip.status, 0);
  assert.equal(readFileSync(join(dir, 'scripts', 'pr-split-verify.mjs'), 'utf8'), sentinel);
  const overwrite = spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(overwrite.status, 0);
  assert.ok(readFileSync(join(dir, 'scripts', 'pr-split-verify.mjs'), 'utf8').includes('../.bento/lib/validate.mjs'));
});
```

- [ ] **Step 6: Rodar e ver que falha**

Run: `node --test test/cli.test.mjs`
Expected: FAIL — `update --no-shim` sobrescreve o sentinela (flag ainda não existe no bin).

- [ ] **Step 7: Implementar a flag em `bin/bento.mjs`**

No bloco de flags de `run()`, adicione depois de `noAgentBrowser`:

```js
  const noShim = args.includes('--no-shim');
```

Nas duas chamadas (`install` e `update`), inclua a opção:

```js
      const result = install(process.cwd(), { noAgents, noAgentBrowser, noHooks, noSuperpowers, noProfile, noCodegraph, noShim });
```

No texto de usage, troque:

```
                    --no-hooks pula o pre-push; --no-codegraph pula codegraph; --no-agent-browser pula agent-browser)
```

por:

```
                    --no-hooks pula o pre-push; --no-shim não escreve o shim scripts/pr-split-verify.mjs;
                    --no-codegraph pula codegraph; --no-agent-browser pula agent-browser)
```

- [ ] **Step 8: Rodar os testes do CLI**

Run: `node --test test/cli.test.mjs`
Expected: PASS (todos).

- [ ] **Step 9: Documentar a flag**

`AGENTS.md` (bullet `Flags de install/update:`): acrescente `` `--no-shim` `` logo após `` `--no-hooks`, `` — o bullet fica:

```markdown
- Flags de install/update: `--no-agents`, `--no-superpowers` (pula skills vendadas + agent superpowers; não mexe no plugin nem avança o snapshot `.bento/skills`), `--no-profile` (pula agents de perfil + `default_agent`), `--no-ponytail`, `--no-hooks`, `--no-shim` (não escreve o shim scripts/pr-split-verify.mjs), `--no-codegraph`, `--no-agent-browser`.
```

`README.md` (seção `Instala:`): troque a linha do shim por:

```markdown
- `scripts/pr-split-verify.mjs` — shim para `check` e `equivalence` (pule com `--no-shim`)
```

- [ ] **Step 10: Suíte completa + commit**

Run: `npm test`
Expected: todos os testes PASS.

```bash
git add lib/install.mjs bin/bento.mjs test/install.test.mjs test/cli.test.mjs AGENTS.md README.md
git commit -m "feat: flag --no-shim no install/update"
```

---

### Task 2: Shim do repo com `check-push`

**Files:**
- Create: `test/repo-shim.test.mjs`
- Modify: `scripts/pr-split-verify.mjs`
- Modify: `README.md` (linha do shim)

**Interfaces:**
- Consumes: `runCheckPush({ refs, cwd })` de `../lib/validate.mjs` (entregue pela stack-viva); formato `refs = [{ branch, sha }, …]`.
- Produces: shim versionado com subcomandos `check`, `check-push`, `equivalence` — é o que o hook `.bento/hooks/pre-push` chama no push.

- [ ] **Step 1: Escrever o teste que falha**

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

test('shim do repo: sem args mostra uso com check-push e sai 2', () => {
  const r = spawnSync(process.execPath, [SHIM], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.ok(r.stderr.includes('check-push'));
});

test('shim do repo: check-push em cwd limpo sai 0 com os defaults', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-repo-shim-'));
  const r = spawnSync(process.execPath, [SHIM, 'check-push'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('PR(s) dentro dos limites.'));
  assert.ok(!r.stderr.includes('PR GRANDE'));
});
```

- [ ] **Step 2: Rodar e ver que falha**

Run: `node --test test/repo-shim.test.mjs`
Expected: FAIL — o usage atual não cita `check-push` e o subcomando é desconhecido (exit 2).

- [ ] **Step 3: Implementar o subcomando no shim**

Substitua o conteúdo de `scripts/pr-split-verify.mjs` por:

```js
#!/usr/bin/env node
import { runCheck, runCheckPush, runEquivalence } from '../lib/validate.mjs';

const [, , cmd, ...args] = process.argv;
if (cmd === 'check') {
  process.exitCode = runCheck({ base: args[0] ?? 'main', head: args[1] ?? 'HEAD', cwd: process.cwd() });
} else if (cmd === 'check-push') {
  const refs = [];
  for (let i = 0; i + 1 < args.length; i += 2) refs.push({ branch: args[i], sha: args[i + 1] });
  process.exitCode = runCheckPush({ refs, cwd: process.cwd() });
} else if (cmd === 'equivalence') {
  process.exitCode = runEquivalence({ base: args[0], head: args[1], layers: args.slice(2), cwd: process.cwd() });
} else {
  console.error('uso: pr-split-verify check [base] | check-push <branch> <sha> ... | equivalence <base> <head> <camada1> [camada2 ...]');
  process.exitCode = 2;
}
```

- [ ] **Step 4: Rodar o teste e a suíte**

Run: `node --test test/repo-shim.test.mjs && npm test`
Expected: PASS em ambos.

- [ ] **Step 5: Atualizar o README**

Na seção `Instala:`, troque a linha do shim por:

```markdown
- `scripts/pr-split-verify.mjs` — shim para `check`, `check-push` e `equivalence` (pule com `--no-shim`)
```

- [ ] **Step 6: Commit**

```bash
git add scripts/pr-split-verify.mjs test/repo-shim.test.mjs README.md
git commit -m "feat: shim do repo com check-push"
```

---

### Task 3: Scripts de dogfood e ignores

**Files:**
- Modify: `package.json` (scripts)
- Modify: `.gitignore`
- Modify: `README.md` (seção nova)
- Modify: `AGENTS.md` (Commands + Arquitetura)

**Interfaces:**
- Consumes: flag `--no-shim` (Task 1) e shim vivo (Task 2).
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

- [ ] **Step 3: Documentar no README**

Adicione ao final do `README.md`, depois da seção `## Desenvolvimento`:

```markdown
## Dogfooding (este repositório)

O próprio repo consome o bento. Artefatos derivados (`.bento/`, `.opencode/`, `opencode.json`, `.codegraph/`) ficam fora do git.

```bash
npm run dogfood:setup   # uma vez por clone: install completo (CLIs globais, gh-stack, hook, codegraph init)
npm run dogfood         # após mudar lib/, templates/, skills/ ou agents
```

- O shim `scripts/pr-split-verify.mjs` é versionado e aponta para `../lib/validate.mjs` (vivo); os scripts usam `--no-shim` para nunca sobrescrevê-lo.
- Em worktrees novos, rode `npm run dogfood` no worktree para criar `.bento/hooks` ali (senão o push sai sem o hook).
- O hook valida cada branch contra a base do seu stack; mantenha `main` local sincronizado com `origin/main`.
- `bento uninstall` neste repo remove arquivos rastreados (`.pr-limits.yaml`, seção `## Bento` do `AGENTS.md`); recupere com `git restore`.
```

- [ ] **Step 4: Documentar no AGENTS.md**

Na seção `## Commands`, acrescente às linhas de comando:

```bash
npm run dogfood:setup               # dogfood no próprio repo: install completo (uma vez)
npm run dogfood                     # dogfood: re-aplica mudanças da fonte (update)
```

Na seção `## Arquitetura`, adicione o bullet (junto do bullet "Este repositório É a fonte…"):

```markdown
- Dogfooding: o repo consome o bento via `npm run dogfood:setup`/`npm run dogfood` (`--no-shim`); `.bento/`, `.opencode/`, `opencode.json` e `.codegraph/` são ignorados; o shim `scripts/pr-split-verify.mjs` versionado aponta para `../lib/validate.mjs` (vivo).
```

- [ ] **Step 5: Verificar scripts e suíte**

Run: `npm run` (lista os dois scripts) e `npm test`
Expected: `dogfood` e `dogfood:setup` listados; suíte PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore README.md AGENTS.md
git commit -m "feat: scripts de dogfood e ignores do repo"
```

---

### Task 4: Ativação do dogfood

**Files:**
- Create: `.pr-limits.yaml` (gerado pelo install)
- Modify: `AGENTS.md` (seção `## Bento (small-prs)` gerada)

**Interfaces:**
- Consumes: `npm run dogfood:setup` (Task 3) e o hook stack-aware (stack-viva).
- Produces: hook ativo no checkout (`core.hooksPath = .bento/hooks`), limites versionados, seção gerada commitada.

- [ ] **Step 1: Rodar o dogfood**

Run: `npm run dogfood:setup`
Expected: instala CLIs globais (codegraph, agent-browser + Chrome), gh-stack, cria `.bento/`, `.opencode/`, `opencode.json`, `.codegraph/`, `.pr-limits.yaml`, ativa `core.hooksPath`. Requer rede e `gh`; pode demorar (Chrome/index).

- [ ] **Step 2: Verificar a instalação**

Run: `git config core.hooksPath && test -f .bento/VERSION && echo ok`
Expected: `.bento/hooks` e `ok`.

Run: `git status --short`
Expected: apenas `.pr-limits.yaml` (novo) e `AGENTS.md` (modificado); nenhum `.bento/`, `.opencode/`, `opencode.json` ou `.codegraph/` (ignorados).

- [ ] **Step 3: Smoke do shim e do hook**

Run: `node scripts/pr-split-verify.mjs check main HEAD`
Expected: relatório do diff e `PR dentro dos limites.` (ou a camada atual com a base certa; use a base da pilha se `main` não for a base).

Run (hook com dois refs da pilha):

```bash
printf 'refs/heads/split/dogfood/02-shim-vivo %s refs/heads/split/dogfood/02-shim-vivo %s\nrefs/heads/split/dogfood/01-no-shim %s refs/heads/split/dogfood/01-no-shim %s\n' \
  "$(git rev-parse split/dogfood/02-shim-vivo)" "$(git rev-parse split/dogfood/02-shim-vivo)" \
  "$(git rev-parse split/dogfood/01-no-shim)" "$(git rev-parse split/dogfood/01-no-shim)" \
  | .bento/hooks/pre-push
```

Expected: `[01-no-shim] diff main...` e `[02-shim-vivo] diff 01-no-shim...` dentro dos limites; exit 0.

- [ ] **Step 4: Commit da ativação**

```bash
git add .pr-limits.yaml AGENTS.md
git commit -m "feat: ativa o dogfood no repo"
```

---

## Self-review do plano

- **Cobertura da spec:** `--no-shim` → Task 1; shim vivo com `check-push` → Task 2; scripts/ignores/docs → Task 3; ativação com `.pr-limits.yaml` + seção gerada → Task 4. Dependência da stack-viva registrada em Global Constraints e "Ao iniciar".
- **Sem placeholders:** todos os steps têm código/comandos/saídas esperadas; nenhum "TBD".
- **Consistência de tipos:** `noShim` (install) e `--no-shim` (CLI); `refs = [{ branch, sha }]` no shim e em `runCheckPush`; nomes de branch/arquivos conferem com a tabela do stack e as tasks.
