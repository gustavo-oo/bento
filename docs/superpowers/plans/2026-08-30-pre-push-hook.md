# Pre-Push Hook no Bento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instalar um hook git `pre-push` no projeto consumidor via `bento install`/`update`/`uninstall` (flag `--no-hooks`), que roda `check` e aborta o push quando o diff `main...HEAD` excede `.pr-limits.yaml`.

**Architecture:** `core.hooksPath` aponta para `.bento/hooks`, onde vive o hook versionado `pre-push` (copiado de `templates/hooks/pre-push` com chmod 755). Novo `lib/hooks.mjs` (funções puras, git via `execFileSync`, cwd parametrizável) com `setupPrePushHook`/`removePrePushHook`; `lib/install.mjs` ganha `noHooks` e a cópia/chmod do hook; `bin/bento.mjs` orquestra (flag `--no-hooks`, logs, uninstall). Skip conservador: hooksPath de outro lugar ou hooks manuais em `.git/hooks` → aviso no stderr e não configura.

**Tech Stack:** Node >= 18 puro (node:test, node:assert/strict), zero deps runtime, git CLI local (testes com repos fake e remote bare local — sem rede).

## Global Constraints

- Node >= 18, zero dependências runtime (regra do repo).
- TDD obrigatório: teste falha antes da implementação (`node --test test/<arquivo>.test.mjs`).
- Testes não dependem de rede nem de `gh` instalado.
- Convenções de commit: conventional commits (feat:, fix:, docs:, refactor:, test:) em PT-BR.
- Mensagens, avisos e docs em PT-BR; avisos no stderr **não** falham install/update/uninstall.
- `uninstall` só remove o que reconhece como seu: `core.hooksPath` só é desconfigurado se o valor apontar para o bento (`.bento/hooks`, relativo ou absoluto).
- O hook é fail-fast pessoal (config local por clone); `git push --no-verify` burla — não é segurança.

---

### Task 1: `lib/hooks.mjs` — setup/remove com testes unitários

**Files:**
- Create: `lib/hooks.mjs`
- Test: `test/hooks.test.mjs` (novo, testes 1-8)

**Interfaces:**
- Consumes: nada (git CLI local apenas).
- Produces: `setupPrePushHook(cwd)` → `{ status: 'installed' }` | `{ status: 'skipped', reason: 'no-git' | 'hooks-path' | 'manual-hooks' }`; `removePrePushHook(cwd)` → `{ removed: true }` | `null`; const `HOOKS_DIR = '.bento/hooks'`. Consumidos pelas Tasks 3 e 4.

- [ ] **Step 1: Escrever os testes que falham**

Criar `test/hooks.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupPrePushHook, removePrePushHook } from '../lib/hooks.mjs';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function localHooksPath(cwd) {
  try {
    return execFileSync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'bento-hooks-'));
  git(['init', '-b', 'main'], dir);
  git(['config', 'user.email', 't@test'], dir);
  git(['config', 'user.name', 't'], dir);
  return dir;
}

test('setup: instala core.hooksPath num repo git', () => {
  const dir = makeRepo();
  const r = setupPrePushHook(dir);
  assert.equal(r.status, 'installed');
  assert.equal(localHooksPath(dir), '.bento/hooks');
});

test('setup: idempotente', () => {
  const dir = makeRepo();
  setupPrePushHook(dir);
  const r = setupPrePushHook(dir);
  assert.equal(r.status, 'installed');
  assert.equal(localHooksPath(dir), '.bento/hooks');
});

test('setup: hooksPath existente de outro lugar → skip hooks-path', (t) => {
  const dir = makeRepo();
  git(['config', '--local', 'core.hooksPath', '.husky'], dir);
  const mock = t.mock.method(console, 'error', () => {});
  const r = setupPrePushHook(dir);
  assert.equal(r.status, 'skipped');
  assert.equal(r.reason, 'hooks-path');
  assert.equal(localHooksPath(dir), '.husky');
  assert.equal(mock.mock.callCount(), 1);
});

test('setup: hooksPath já aponta para o bento (./.bento/hooks/) → installed', () => {
  const dir = makeRepo();
  git(['config', '--local', 'core.hooksPath', './.bento/hooks/'], dir);
  const r = setupPrePushHook(dir);
  assert.equal(r.status, 'installed');
  assert.equal(localHooksPath(dir), './.bento/hooks/');
});

test('setup: hook manual não-sample em .git/hooks → skip manual-hooks', (t) => {
  const dir = makeRepo();
  mkdirSync(join(dir, '.git', 'hooks'), { recursive: true });
  writeFileSync(join(dir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\n');
  const mock = t.mock.method(console, 'error', () => {});
  const r = setupPrePushHook(dir);
  assert.equal(r.status, 'skipped');
  assert.equal(r.reason, 'manual-hooks');
  assert.equal(localHooksPath(dir), null);
  assert.equal(mock.mock.callCount(), 1);
});

test('setup: só hooks .sample → installed', () => {
  const dir = makeRepo();
  mkdirSync(join(dir, '.git', 'hooks'), { recursive: true });
  writeFileSync(join(dir, '.git', 'hooks', 'pre-commit.sample'), '#!/bin/sh\n');
  const r = setupPrePushHook(dir);
  assert.equal(r.status, 'installed');
  assert.equal(localHooksPath(dir), '.bento/hooks');
});

test('setup: não-repo → skip no-git', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-hooks-'));
  const mock = t.mock.method(console, 'error', () => {});
  const r = setupPrePushHook(dir);
  assert.equal(r.status, 'skipped');
  assert.equal(r.reason, 'no-git');
  assert.equal(mock.mock.callCount(), 1);
});

test('remove: desconfigura quando aponta para o bento', () => {
  const dir = makeRepo();
  setupPrePushHook(dir);
  const r = removePrePushHook(dir);
  assert.deepEqual(r, { removed: true });
  assert.equal(localHooksPath(dir), null);
});

test('remove: não mexe em hooksPath de outro', () => {
  const dir = makeRepo();
  git(['config', '--local', 'core.hooksPath', '.husky'], dir);
  assert.equal(removePrePushHook(dir), null);
  assert.equal(localHooksPath(dir), '.husky');
});

test('remove: sem repo → null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-hooks-'));
  assert.equal(removePrePushHook(dir), null);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `node --test test/hooks.test.mjs`
Expected: FAIL — `Cannot find module '../lib/hooks.mjs'` (10 testes).

- [ ] **Step 3: Implementar `lib/hooks.mjs`**

Conteúdo completo do arquivo:

```js
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';

export const HOOKS_DIR = '.bento/hooks';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function hooksPathPointsToBento(cwd, value) {
  const v = String(value).trim();
  if (v === '') return false;
  if (v.startsWith('/') || /^[A-Za-z]:[\\/]/.test(v)) {
    return resolve(v) === resolve(cwd, HOOKS_DIR);
  }
  return normalize(v) === normalize(HOOKS_DIR);
}

export function setupPrePushHook(cwd) {
  let gitDir;
  try {
    gitDir = git(['rev-parse', '--git-dir'], cwd).trim();
  } catch {
    console.error('aviso: pre-push pulado — diretório não é um repositório git.');
    return { status: 'skipped', reason: 'no-git' };
  }
  let current = '';
  try {
    current = git(['config', '--get', 'core.hooksPath'], cwd).trim();
  } catch {
    current = '';
  }
  if (current !== '' && !hooksPathPointsToBento(cwd, current)) {
    console.error(`aviso: pre-push pulado — core.hooksPath já aponta para "${current}" (husky/lefthook?).`);
    return { status: 'skipped', reason: 'hooks-path' };
  }
  const hooksDir = resolve(cwd, gitDir, 'hooks');
  if (existsSync(hooksDir)) {
    const manual = readdirSync(hooksDir).filter((f) => !f.endsWith('.sample') && !f.startsWith('README'));
    if (manual.length > 0) {
      console.error(`aviso: pre-push pulado — hooks manuais em ${gitDir}/hooks (${manual.join(', ')}); core.hooksPath os desativaria.`);
      return { status: 'skipped', reason: 'manual-hooks' };
    }
  }
  git(['config', '--local', 'core.hooksPath', HOOKS_DIR], cwd);
  return { status: 'installed' };
}

export function removePrePushHook(cwd) {
  let current = '';
  try {
    current = git(['config', '--get', 'core.hooksPath'], cwd).trim();
  } catch {
    return null;
  }
  if (current === '' || !hooksPathPointsToBento(cwd, current)) return null;
  git(['config', '--local', '--unset', 'core.hooksPath'], cwd);
  return { removed: true };
}
```

- [ ] **Step 4: Rodar para ver passar**

Run: `node --test test/hooks.test.mjs`
Expected: PASS — 10 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/hooks.mjs test/hooks.test.mjs
git commit -m "feat: setup/remove do pre-push hook (core.hooksPath → .bento/hooks)"
```

---

### Task 2: Template do hook + cópia/chmod no install (`noHooks`)

**Files:**
- Create: `templates/hooks/pre-push`
- Modify: `lib/install.mjs` (import linha 1, assinatura, bloco de cópia)
- Test: `test/install.test.mjs` (import + 2 testes novos)

**Interfaces:**
- Consumes: nada de Tasks anteriores.
- Produces: `install(projectRoot, { noAgents = false, noHooks = false } = {})` — copia `.bento/hooks/pre-push` executável (mode 755) a menos que `noHooks`; consumido pela Task 4. Arquivo `templates/hooks/pre-push` (fonte do hook) consumido pela Task 3 (integração).

- [ ] **Step 1: Escrever os testes que falham**

Em `test/install.test.mjs`, adicionar `statSync` ao import da linha 4:

```js
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs';
```

Adicionar no fim do arquivo:

```js
test('install: copia hook pre-push executável em .bento/hooks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-'));
  install(dir, {});
  const hookPath = join(dir, '.bento', 'hooks', 'pre-push');
  assert.ok(existsSync(hookPath));
  assert.notEqual(statSync(hookPath).mode & 0o111, 0);
  assert.ok(readFileSync(hookPath, 'utf8').includes('pr-split-verify.mjs check'));
});

test('install: noHooks não copia o hook', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-'));
  install(dir, { noHooks: true });
  assert.ok(!existsSync(join(dir, '.bento', 'hooks', 'pre-push')));
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `node --test test/install.test.mjs`
Expected: FAIL — `.bento/hooks/pre-push` não existe (2 testes novos falham).

- [ ] **Step 3: Criar o template e implementar no `lib/install.mjs`**

Criar `templates/hooks/pre-push`:

```sh
#!/bin/sh
# gerado pelo bento (templates/hooks/pre-push) — não edite; re-criado no update.
set -e
root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$root" || exit 0
git rev-parse --verify --quiet main >/dev/null 2>&1 || exit 0
[ -f scripts/pr-split-verify.mjs ] || exit 0
node scripts/pr-split-verify.mjs check
```

Em `lib/install.mjs`, linha 1 passa a:

```js
import { appendFileSync, chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
```

A assinatura (linha 34) passa a:

```js
export function install(projectRoot, { noAgents = false, noHooks = false } = {}) {
```

Após a escrita do `VERSION` (linha 43), adicionar:

```js
  if (!noHooks) {
    const hooksDir = join(dotBento, 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    const hookPath = join(hooksDir, 'pre-push');
    copyFileSync(join(PKG_ROOT, 'templates', 'hooks', 'pre-push'), hookPath);
    chmodSync(hookPath, 0o755);
  }
```

- [ ] **Step 4: Rodar para ver passar**

Run: `node --test test/install.test.mjs`
Expected: PASS — suíte completa de install (10 testes).

- [ ] **Step 5: Commit**

```bash
git add templates/hooks/pre-push lib/install.mjs test/install.test.mjs
git commit -m "feat: install copia hook pre-push executável (--no-hooks pula)"
```

---

### Task 3: Teste integrado — hook real bloqueia push

**Files:**
- Test: `test/hooks.test.mjs` (3 testes novos no fim)

**Interfaces:**
- Consumes: `setupPrePushHook` (Task 1), `install()` (Task 2), shim `scripts/pr-split-verify.mjs` (gerado pelo install).
- Produces: prova de que o hook bloqueia/passa no push real (nenhuma API nova).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar no fim de `test/hooks.test.mjs` (precisa de `install` importado — adicionar `import { install } from '../lib/install.mjs';` ao import, e `spawnSync` já está importado):

```js
function makeRemote() {
  const remote = mkdtempSync(join(tmpdir(), 'bento-hooks-remote-'));
  git(['init', '--bare', remote], remote);
  return remote;
}

test('hook real: push acima do limite é bloqueado', () => {
  const dir = makeRepo();
  const remote = makeRemote();
  git(['remote', 'add', 'origin', remote], dir);
  writeFileSync(join(dir, 'f.txt'), 'v1\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'base'], dir);
  git(['checkout', '-b', 'feat'], dir);
  writeFileSync(join(dir, '.pr-limits.yaml'), 'max_lines: 2\nmax_files: 10\n');
  writeFileSync(join(dir, 'f.txt'), 'v1\nv2\nv3\nv4\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'big'], dir);
  install(dir, {});
  setupPrePushHook(dir);
  const r = spawnSync('git', ['push', '-u', 'origin', 'feat'], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes('PR GRANDE'));
});

test('hook real: push dentro dos limites passa', () => {
  const dir = makeRepo();
  const remote = makeRemote();
  git(['remote', 'add', 'origin', remote], dir);
  writeFileSync(join(dir, 'f.txt'), 'v1\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'base'], dir);
  git(['checkout', '-b', 'feat'], dir);
  writeFileSync(join(dir, '.pr-limits.yaml'), 'max_lines: 10\nmax_files: 10\n');
  writeFileSync(join(dir, 'f.txt'), 'v1\nv2\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'small'], dir);
  install(dir, {});
  setupPrePushHook(dir);
  const r = spawnSync('git', ['push', '-u', 'origin', 'feat'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
});

test('hook real: sem main local → push não bloqueado', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-hooks-'));
  git(['init', '-b', 'feat'], dir);
  git(['config', 'user.email', 't@test'], dir);
  git(['config', 'user.name', 't'], dir);
  const remote = makeRemote();
  git(['remote', 'add', 'origin', remote], dir);
  writeFileSync(join(dir, 'f.txt'), 'v1\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'first'], dir);
  install(dir, {});
  setupPrePushHook(dir);
  const r = spawnSync('git', ['push', '-u', 'origin', 'feat'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `node --test test/hooks.test.mjs`
Expected: FAIL — o hook ainda não é copiado pelo install (o push acima do limite passa) — 3 testes novos falham.

- [ ] **Step 3: Rodar para ver passar**

Run: `node --test test/hooks.test.mjs`
Expected: PASS — 13 testes (10 da Task 1 + 3 integrados).

- [ ] **Step 4: Commit**

```bash
git add test/hooks.test.mjs
git commit -m "test: hook pre-push bloqueia push acima do limite (repo fake + remote bare)"
```

---

### Task 4: CLI — flag `--no-hooks` e wiring

**Files:**
- Modify: `bin/bento.mjs`
- Test: `test/cli.test.mjs` (3 testes novos)

**Interfaces:**
- Consumes: `setupPrePushHook`/`removePrePushHook` (Task 1), `install` com `noHooks` (Task 2).
- Produces: comportamento CLI — `install`/`update` configuram o pre-push (pulado com `--no-hooks` e em conflitos, com aviso no stderr); `uninstall` desconfigura; help atualizado.

- [ ] **Step 1: Escrever os testes que falham**

Em `test/cli.test.mjs`, adicionar no fim (usa o helper `makeRepo()` já existente):

```js
test('update: configura core.hooksPath em repo git', () => {
  const dir = makeRepo();
  const r = spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('pre-push'));
  const hp = execFileSync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: dir, encoding: 'utf8' }).trim();
  assert.equal(hp, '.bento/hooks');
});

test('update --no-hooks: não configura hooksPath nem copia hook', () => {
  const dir = makeRepo();
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-hooks'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!r.stdout.includes('pre-push'));
  assert.ok(!existsSync(join(dir, '.bento', 'hooks', 'pre-push')));
  const hp = spawnSync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: dir, encoding: 'utf8' });
  assert.equal(hp.status, 1);
});

test('uninstall: remove core.hooksPath do bento', () => {
  const dir = makeRepo();
  const upd = spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(upd.status, 0);
  const r = spawnSync(process.execPath, [BIN, 'uninstall'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('pre-push'));
  const hp = spawnSync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: dir, encoding: 'utf8' });
  assert.equal(hp.status, 1);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `node --test test/cli.test.mjs`
Expected: FAIL — `update` ainda não configura hooksPath nem imprime `pre-push` (3 testes novos falham).

- [ ] **Step 3: Implementar no `bin/bento.mjs`**

Import (linha 4) passa a:

```js
import { setupPrePushHook, removePrePushHook } from '../lib/hooks.mjs';
```

Em `run()` (após a linha 23):

```js
  const noHooks = args.includes('--no-hooks');
```

No case `install`, a chamada (linha 31) passa a:

```js
      const result = install(process.cwd(), { noAgents, noHooks });
```

E após o log do `lib` (linha 34), adicionar:

```js
      if (!noHooks) {
        const h = setupPrePushHook(process.cwd());
        if (h.status === 'installed') console.log('  pre-push → core.hooksPath (.bento/hooks)');
      }
```

No case `update`, a chamada (linha 46) passa a:

```js
      install(process.cwd(), { noAgents, noHooks });
```

E logo após, adicionar:

```js
      if (!noHooks) {
        const h = setupPrePushHook(process.cwd());
        if (h.status === 'installed') console.log('  pre-push → core.hooksPath (.bento/hooks)');
      }
```

No case `uninstall`, após `const { removed } = uninstall(process.cwd());` (linha 65), adicionar:

```js
      const h = removePrePushHook(process.cwd());
```

E na montagem da lista (após `if (pt) all.push(...)`):

```js
      if (h) all.push('pre-push (core.hooksPath)');
```

No help (case default), o texto passa a:

```js
      console.error(`uso: bento install|update|uninstall|check|equivalence
  install          instala skill, scripts, config, hook pre-push, gh-stack, superpowers e ponytail
                   (--no-agents pula AGENTS.md; --no-superpowers pula superpowers; --no-ponytail pula ponytail; --no-hooks pula o pre-push)
  update           re-instala mantendo .pr-limits.yaml (não toca gh-stack)
  uninstall        remove tudo do bento (gh-stack, .bento, skill, shim, config, pre-push, superpowers, ponytail, seção AGENTS.md)
  check [base]     valida tamanho do diff (head = HEAD, base default = main)
  equivalence <base> <head> <camada1> [camada2 ...]
`);
```

- [ ] **Step 4: Rodar para ver passar**

Run: `npm test`
Expected: PASS — suíte completa (hooks, install, cli, opencode-config, validate, diff, config, smoke).

- [ ] **Step 5: Commit**

```bash
git add bin/bento.mjs test/cli.test.mjs
git commit -m "feat: pre-push no install/update/uninstall (--no-hooks)"
```

---

### Task 5: README e AGENTS.md

**Files:**
- Modify: `README.md`, `AGENTS.md` (seção Arquitetura)

**Interfaces:**
- Consumes: nada.
- Produces: docs atualizadas (nenhuma API).

- [ ] **Step 1: Atualizar README**

Linha 8 passa a:

```md
node bin/bento.mjs install        # instala skill, scripts, .pr-limits.yaml, pre-push, gh-stack, superpowers e ponytail
```

Após a linha 17 (`- .pr-limits.yaml — config (criada só se ausente; nunca sobrescrita)`), adicionar:

```md
- `.bento/hooks/pre-push` + `core.hooksPath` — hook que bloqueia push com diff acima dos limites (pule com `--no-hooks`; config local por clone; `git push --no-verify` burla — conveniência, não segurança)
```

Após a linha 30 (`- .pr-limits.yaml — config`), adicionar:

```md
- `core.hooksPath` apontando para `.bento/hooks` (só se for do bento)
```

Na seção Uso, após o bloco de comandos (linha 48), adicionar:

```md
O pre-push roda `check` (base `main`) automaticamente a cada `git push`; acima do limite o push é abortado.
```

- [ ] **Step 2: Atualizar AGENTS.md**

Na seção `## Arquitetura`, após a linha sobre `lib/validate.mjs`:

```md
- `lib/hooks.mjs` — `setupPrePushHook`/`removePrePushHook`: config `core.hooksPath` → `.bento/hooks` (pula com aviso se já houver hooksPath de outro lugar ou hooks manuais em `.git/hooks`); `templates/hooks/pre-push` é a fonte do hook instalado.
```

> Nota: se `AGENTS.md` tiver alterações não commitadas não relacionadas (estado atual do repo), edite o arquivo mas **não** o inclua no commit desta task — deixe para o usuário revisar junto com as dele. Commitar só o README.

- [ ] **Step 3: Verificar**

Run: `npm test`
Expected: PASS (nenhum teste cobre docs; verificação de regressão).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: pre-push no install/uninstall do bento"
```