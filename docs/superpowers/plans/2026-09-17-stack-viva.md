# Stack viva no ciclo de desenvolvimento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o `check`/small-prs agir durante a execução (sessões → camadas de stack) em vez de só no fim, com hook pre-push stack-aware, agents `orchestrator`/`implementer` (teto de 2 níveis) e skill reescrita para o Modo 1.5.

**Architecture:** `lib/stack.mjs` resolve a base de cada branch por ancestralidade entre os refs de um mesmo push (sem `gh`, sem parsear `.git/gh-stack`); `runCheckPush` em `lib/validate.mjs` valida cada camada; o shim ganha `check-push` e o hook pre-push passa todos os refs numa chamada. Agents novos/revisados entram pelo mecanismo existente do `lib/agents.mjs`. Cada task do plano é um slice de PR (camada) — na execução com o fluxo novo elas viram `split/stack-viva/<nn>-<nome>`.

**Tech Stack:** Node >= 18 puro (ESM, zero deps runtime), `node:test`, git CLI, gh-stack (só na execução do fluxo, nunca nos testes).

## Global Constraints

- Node >= 18, ESM, zero dependências runtime.
- TDD obrigatório (node:test); testes sem rede e sem `gh` (repos git fake + bare local).
- Mensagens de CLI, docs e commits em PT-BR; conventional commits (`feat:`, `fix:`, `docs:`, `test:`).
- Texto do hook/shim/agents/skill: PT-BR.
- `check` manual e `equivalence` não mudam de semântica; `scripts/pr-split-verify.mjs` precisa continuar importando de `../.bento/lib/validate.mjs` (o uninstall detecta o shim por essa string).
- Limites default: <=400 linhas e <=10 arquivos por PR (`.pr-limits.yaml`).
- Plano da feature: `docs/superpowers/plans/2026-09-17-stack-viva.md`; spec: `docs/superpowers/specs/2026-09-17-stack-viva-design.md`.

---

### Task 1: `lib/stack.mjs` — resolver bases do stack

**Files:**
- Create: `lib/stack.mjs`
- Test: `test/stack.test.mjs`

**Interfaces:**
- Consumes: `runGit(args, cwd)` de `lib/diff.mjs` (já exportado).
- Produces: `resolveStackBases(cwd, refs) → Map<string, string>` — `refs` é `[{ branch, sha }]`; devolve `branch → base` (nome de branch ou `'main'`). Também exporta `isAncestor(cwd, ancestor, descendant) → boolean`.

- [ ] **Step 1: Write the failing test**

Create `test/stack.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveStackBases } from '../lib/stack.mjs';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'bento-stack-'));
  git(['init', '-b', 'main'], dir);
  git(['config', 'user.email', 't@test'], dir);
  git(['config', 'user.name', 't'], dir);
  return dir;
}

function commit(cwd, file, content, message) {
  writeFileSync(join(cwd, file), content);
  git(['add', file], cwd);
  git(['commit', '-m', message], cwd);
  return git(['rev-parse', 'HEAD'], cwd).trim();
}

function lines(n) {
  return Array.from({ length: n }, (_, i) => `l${i}\n`).join('');
}

function makeStack(cwd, { limits = null, layerLines = 1 } = {}) {
  commit(cwd, 'base.txt', 'v1\n', 'base');
  if (limits) commit(cwd, '.pr-limits.yaml', limits, 'limits');
  git(['checkout', '-b', 'L1'], cwd);
  const l1 = commit(cwd, 'l1.txt', lines(layerLines), 'l1');
  git(['checkout', '-b', 'L2'], cwd);
  const l2 = commit(cwd, 'l2.txt', lines(layerLines), 'l2');
  git(['checkout', '-b', 'L3'], cwd);
  const l3 = commit(cwd, 'l3.txt', lines(layerLines), 'l3');
  return { l1, l2, l3 };
}

test('resolveStackBases: cadeia resolve cada camada para a de baixo', () => {
  const dir = makeRepo();
  const { l1, l2, l3 } = makeStack(dir);
  const bases = resolveStackBases(dir, [
    { branch: 'L1', sha: l1 },
    { branch: 'L2', sha: l2 },
    { branch: 'L3', sha: l3 },
  ]);
  assert.equal(bases.get('L1'), 'main');
  assert.equal(bases.get('L2'), 'L1');
  assert.equal(bases.get('L3'), 'L2');
});

test('resolveStackBases: branch sem ancestral no conjunto cai em main', () => {
  const dir = makeRepo();
  commit(dir, 'base.txt', 'v1\n', 'base');
  git(['checkout', '-b', 'solo'], dir);
  const solo = commit(dir, 'solo.txt', 'x\n', 'solo');
  const bases = resolveStackBases(dir, [{ branch: 'solo', sha: solo }]);
  assert.equal(bases.get('solo'), 'main');
});

test('resolveStackBases: ordem dos argumentos não altera a resolução', () => {
  const dir = makeRepo();
  const { l1, l2, l3 } = makeStack(dir);
  const bases = resolveStackBases(dir, [
    { branch: 'L3', sha: l3 },
    { branch: 'L1', sha: l1 },
    { branch: 'L2', sha: l2 },
  ]);
  assert.equal(bases.get('L1'), 'main');
  assert.equal(bases.get('L2'), 'L1');
  assert.equal(bases.get('L3'), 'L2');
});

test('resolveStackBases: ancestral mais próximo vence quando a do meio não está no push', () => {
  const dir = makeRepo();
  const { l1, l3 } = makeStack(dir);
  const bases = resolveStackBases(dir, [
    { branch: 'L1', sha: l1 },
    { branch: 'L3', sha: l3 },
  ]);
  assert.equal(bases.get('L1'), 'main');
  assert.equal(bases.get('L3'), 'L1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/stack.test.mjs`
Expected: FAIL — `Cannot find module '.../lib/stack.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/stack.mjs`:

```js
import { runGit } from './diff.mjs';

export function isAncestor(cwd, ancestor, descendant) {
  try {
    runGit(['merge-base', '--is-ancestor', ancestor, descendant], cwd);
    return true;
  } catch {
    return false;
  }
}

export function resolveStackBases(cwd, refs) {
  const bases = new Map();
  for (const ref of refs) {
    let base = 'main';
    let closest = Infinity;
    for (const candidate of refs) {
      if (candidate.branch === ref.branch) continue;
      if (!isAncestor(cwd, candidate.sha, ref.sha)) continue;
      const distance = Number(runGit(['rev-list', '--count', `${candidate.sha}..${ref.sha}`], cwd).trim());
      if (distance < closest) {
        closest = distance;
        base = candidate.branch;
      }
    }
    bases.set(ref.branch, base);
  }
  return bases;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/stack.test.mjs`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/stack.mjs test/stack.test.mjs
git commit -m "feat: resolve bases de stack por ancestralidade (lib/stack.mjs)"
```

---

### Task 2: `check-push` em `validate` + shim

**Files:**
- Modify: `lib/validate.mjs`
- Modify: `lib/install.mjs` (constante `SHIM`, linhas 22-34)
- Modify: `test/stack.test.mjs` (append)
- Modify: `test/install.test.mjs` (append)

**Interfaces:**
- Consumes: `resolveStackBases` (Task 1); `loadLimits`/`evaluate` e `getDiffStats`/`summarize` (existentes).
- Produces: `runCheckPush({ refs, cwd }) → 0 | 1`, onde `refs = [{ branch, sha }]`; imprime uma linha por branch e `PR GRANDE (<branch>):` no stderr em violação. O shim ganha `check-push <branch> <sha> ...`; o hook (Task 3) chama esse subcomando.

- [ ] **Step 1: Write the failing tests**

Append to `test/stack.test.mjs` (adicione o import de `runCheckPush` na primeira linha de imports: `import { runCheckPush } from '../lib/validate.mjs';`):

```js
test('runCheckPush: camadas dentro do limite, somadas acima do teto, passam', (t) => {
  const dir = makeRepo();
  const { l1, l2, l3 } = makeStack(dir, { limits: 'max_lines: 6\nmax_files: 10\n', layerLines: 3 });
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const code = runCheckPush({
    refs: [
      { branch: 'L1', sha: l1 },
      { branch: 'L2', sha: l2 },
      { branch: 'L3', sha: l3 },
    ],
    cwd: dir,
  });
  assert.equal(code, 0);
});

test('runCheckPush: camada acima do limite bloqueia e reporta a camada', (t) => {
  const dir = makeRepo();
  commit(dir, 'base.txt', 'v1\n', 'base');
  commit(dir, '.pr-limits.yaml', 'max_lines: 6\nmax_files: 10\n', 'limits');
  git(['checkout', '-b', 'L1'], dir);
  const l1 = commit(dir, 'l1.txt', lines(3), 'l1');
  git(['checkout', '-b', 'L2'], dir);
  const l2 = commit(dir, 'l2.txt', lines(8), 'l2');
  git(['checkout', '-b', 'L3'], dir);
  const l3 = commit(dir, 'l3.txt', lines(3), 'l3');
  t.mock.method(console, 'log', () => {});
  const error = t.mock.method(console, 'error', () => {});
  const code = runCheckPush({
    refs: [
      { branch: 'L1', sha: l1 },
      { branch: 'L2', sha: l2 },
      { branch: 'L3', sha: l3 },
    ],
    cwd: dir,
  });
  assert.equal(code, 1);
  assert.ok(error.mock.calls.some((c) => c.arguments[0].includes('PR GRANDE (L2)')));
});

test('runCheckPush: branch única mantém o comportamento contra main', (t) => {
  const dir = makeRepo();
  commit(dir, 'base.txt', 'v1\n', 'base');
  commit(dir, '.pr-limits.yaml', 'max_lines: 2\nmax_files: 10\n', 'limits');
  git(['checkout', '-b', 'feat'], dir);
  const feat = commit(dir, 'f.txt', lines(4), 'big');
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  assert.equal(runCheckPush({ refs: [{ branch: 'feat', sha: feat }], cwd: dir }), 1);
});
```

Append to `test/install.test.mjs`:

```js
test('install: shim tem check-push para o hook stack-aware', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-'));
  install(dir, {});
  const shim = readFileSync(join(dir, 'scripts', 'pr-split-verify.mjs'), 'utf8');
  assert.ok(shim.includes('check-push'));
  assert.ok(shim.includes('../.bento/lib/validate.mjs'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/stack.test.mjs test/install.test.mjs`
Expected: FAIL — `runCheckPush` não é exportado / shim sem `check-push`.

- [ ] **Step 3: Implement `runCheckPush`**

Em `lib/validate.mjs`, adicione o import e a função (após `runCheck`):

```js
import { resolveStackBases } from './stack.mjs';
```

```js
export function runCheckPush({ refs, cwd }) {
  const limits = loadLimits(cwd);
  const bases = resolveStackBases(cwd, refs);
  let failed = false;
  for (const { branch, sha } of refs) {
    const base = bases.get(branch);
    const files = getDiffStats(base, sha, cwd, true);
    const summary = summarize(files);
    const result = evaluate(limits, files);
    console.log(`[${branch}] diff ${base}...${sha} (merge-base): ${summary.lines} linhas, ${summary.files} arquivos`);
    if (result.violations.length > 0) {
      console.error(`PR GRANDE (${branch}):`);
      for (const v of result.violations) {
        console.error(`  - ${v}`);
      }
      failed = true;
    }
  }
  if (failed) return 1;
  console.log('PR(s) dentro dos limites.');
  return 0;
}
```

- [ ] **Step 4: Update the shim constant**

Em `lib/install.mjs`, substitua a constante `SHIM` inteira (linhas 22-34) por:

```js
const SHIM = `#!/usr/bin/env node
import { runCheck, runCheckPush, runEquivalence } from '../.bento/lib/validate.mjs';

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
`;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/stack.test.mjs test/install.test.mjs`
Expected: PASS. Depois rode a suíte completa: `npm test` → tudo verde (o `check`/`equivalence` não mudaram).

- [ ] **Step 6: Commit**

```bash
git add lib/validate.mjs lib/install.mjs test/stack.test.mjs test/install.test.mjs
git commit -m "feat: check-push por camada de stack (validate + shim)"
```

---

### Task 3: Hook pre-push stack-aware

**Files:**
- Modify: `templates/hooks/pre-push` (arquivo inteiro)
- Modify: `test/hooks.test.mjs` (append)

**Interfaces:**
- Consumes: `scripts/pr-split-verify.mjs check-push` (Task 2).
- Produces: hook que valida cada branch empurrado contra a base do seu stack; sem stack, base `main` (comportamento atual). O teste de install existente (`install.test.mjs:145`) continua válido porque o hook mantém a chamada `pr-split-verify.mjs check` no modo manual.

- [ ] **Step 1: Write the failing tests**

Append to `test/hooks.test.mjs`:

```js
function makeStackRepo() {
  const dir = makeRepo();
  const remote = makeRemote();
  git(['remote', 'add', 'origin', remote], dir);
  writeFileSync(join(dir, 'base.txt'), 'v1\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'base'], dir);
  writeFileSync(join(dir, '.pr-limits.yaml'), 'max_lines: 6\nmax_files: 10\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'limits'], dir);
  git(['checkout', '-b', 'L1'], dir);
  writeFileSync(join(dir, 'l1.txt'), 'a\nb\nc\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'l1'], dir);
  git(['checkout', '-b', 'L2'], dir);
  writeFileSync(join(dir, 'l2.txt'), 'a\nb\nc\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'l2'], dir);
  git(['checkout', '-b', 'L3'], dir);
  writeFileSync(join(dir, 'l3.txt'), 'a\nb\nc\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'l3'], dir);
  return { dir, remote };
}

test('hook real: push do stack inteiro passa quando cada camada está no limite', () => {
  const { dir } = makeStackRepo();
  install(dir, {});
  setupPrePushHook(dir);
  const r = spawnSync('git', ['push', 'origin', 'L1', 'L2', 'L3'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
});

test('hook real: push do stack é abortado quando uma camada estoura', () => {
  const dir = makeRepo();
  const remote = makeRemote();
  git(['remote', 'add', 'origin', remote], dir);
  writeFileSync(join(dir, 'base.txt'), 'v1\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'base'], dir);
  writeFileSync(join(dir, '.pr-limits.yaml'), 'max_lines: 6\nmax_files: 10\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'limits'], dir);
  git(['checkout', '-b', 'L1'], dir);
  writeFileSync(join(dir, 'l1.txt'), 'a\nb\nc\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'l1'], dir);
  git(['checkout', '-b', 'L2'], dir);
  writeFileSync(join(dir, 'l2.txt'), 'a\nb\nc\nd\ne\nf\ng\nh\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'l2 big'], dir);
  install(dir, {});
  setupPrePushHook(dir);
  const r = spawnSync('git', ['push', 'origin', 'L1', 'L2'], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes('PR GRANDE (L2)'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/hooks.test.mjs`
Expected: o teste "push do stack inteiro passa" FALHA (hook atual checa cada branch contra `main`; L1+L2+L3 = 9 linhas > 6) e o de bloquear passa por motivo errado (mensagem sem `(L2)`).

- [ ] **Step 3: Rewrite the hook template**

Substitua `templates/hooks/pre-push` inteiro por:

```sh
#!/bin/sh
# gerado pelo bento (templates/hooks/pre-push) — não edite; re-criado no update.
set -e
root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$root" || exit 0
git rev-parse --verify --quiet main >/dev/null 2>&1 || exit 0
[ -f scripts/pr-split-verify.mjs ] || exit 0

# Execução manual (sem refs no stdin): valida o checkout atual.
if [ -t 0 ]; then
  node scripts/pr-split-verify.mjs check
  exit $?
fi

# Git envia os refs do push no stdin: valida cada branch contra a base do seu
# stack (ancestral mais próximo no próprio push; default main).
set --
while read -r local_ref local_sha remote_ref remote_sha || [ -n "$local_ref" ]; do
  [ -n "$local_ref" ] || continue
  case "$local_sha" in 0000000000000000000000000000000000000000) continue ;; esac
  case "$remote_ref" in refs/heads/*) ;; *) continue ;; esac
  set -- "$@" "${local_ref#refs/heads/}" "$local_sha"
done
[ "$#" -gt 0 ] || exit 0
node scripts/pr-split-verify.mjs check-push "$@"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/hooks.test.mjs`
Expected: PASS — os 2 novos + os existentes (push isolado de `feat` continua bloqueando/passando contra `main`).

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add templates/hooks/pre-push test/hooks.test.mjs
git commit -m "feat: hook pre-push stack-aware (base por ancestralidade do push)"
```

---

### Task 4: Agents `orchestrator` e `implementer`

**Files:**
- Create: `templates/agents/orchestrator.md`
- Create: `templates/agents/implementer.md`
- Modify: `lib/agents.mjs` (linhas 6 e 25-32)
- Modify: `test/agents.test.mjs`
- Modify: `test/cli.test.mjs`

**Interfaces:**
- Consumes: mecanismo existente `installAgents`/`removeAgents` (marcador `# bento: agent` no frontmatter).
- Produces: agents instalados no grupo `profile`; `orchestrator` (primary) com `task` glob apenas para `implementer`/`verify`/`explorer`/`browser`; `implementer` (subagent) com `task: deny`.

- [ ] **Step 1: Write the failing tests**

Em `test/agents.test.mjs`:

1. Atualize a constante (linha 17):

```js
const TEMPLATES = ['flash', 'superpowers', 'explorer', 'verify', 'browser', 'orchestrator', 'implementer'];
```

2. Atualize o teste `installAgents: cria os 5 por padrão, só se ausentes` (nome e asserção) e o `removeAgents: remove só arquivos com marcador` (contagem):

```js
test('installAgents: cria os 7 por padrão, só se ausentes', () => {
  const dir = tmp();
  const r = installAgents(dir);
  assert.deepEqual(r.created.sort(), ['browser', 'explorer', 'flash', 'implementer', 'orchestrator', 'superpowers', 'verify']);
  assert.deepEqual(r.skipped, []);
  assert.ok(isBentoAgent(agentPath(dir, 'flash')));
  const second = installAgents(dir);
  assert.deepEqual(second.created, []);
});
```

```js
  assert.equal(removed.length, 7);
```

3. Adicione os testes de contrato dos templates novos:

```js
test('orchestrator: primary, task restrito a nível 2 e sem general', () => {
  const raw = template('orchestrator');
  assert.ok(raw.includes('mode: primary'));
  assert.ok(raw.includes('"*": deny'));
  assert.ok(raw.includes('implementer: allow'));
  assert.ok(raw.includes('verify: allow'));
  assert.ok(raw.includes('explorer: allow'));
  assert.ok(raw.includes('browser: allow'));
  assert.ok(!raw.includes('general: allow'));
  assert.ok(raw.includes('question'));
});

test('implementer: subagent terminal, edit/bash permitidos', () => {
  const raw = template('implementer');
  assert.ok(raw.includes('mode: subagent'));
  assert.ok(raw.includes('task: deny'));
  assert.ok(raw.includes('edit: allow'));
  assert.ok(raw.includes('bash: allow'));
});
```

4. Ajuste o teste de flags para o novo conjunto (o `profile: false` continua pulando os do perfil):

```js
test('installAgents: flags pulam agents (profile/superpowers/codegraph/agentBrowser)', () => {
  const dir = tmp();
  const r = installAgents(dir, { profile: false, superpowers: false, codegraph: false, agentBrowser: false });
  assert.deepEqual(r.created, []);
  assert.ok(!existsSync(agentPath(dir, 'flash')));
  assert.ok(!existsSync(agentPath(dir, 'orchestrator')));
  assert.ok(!existsSync(agentPath(dir, 'implementer')));
  assert.ok(!existsSync(agentPath(dir, 'superpowers')));
  const dir2 = tmp();
  const r2 = installAgents(dir2, { profile: false });
  assert.deepEqual(r2.created, ['superpowers']);
  const dir3 = tmp();
  const r3 = installAgents(dir3, { codegraph: false });
  assert.ok(!r3.created.includes('explorer'));
  assert.ok(r3.created.includes('browser'));
});
```

Em `test/cli.test.mjs`, no teste `update: venda superpowers, cria agents, define default_agent e mantém ponytail`, adicione após a linha que checa `verify.md`:

```js
  assert.ok(existsSync(join(dir, '.opencode', 'agents', 'orchestrator.md')));
  assert.ok(existsSync(join(dir, '.opencode', 'agents', 'implementer.md')));
```

E no teste `update --no-profile...`:

```js
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'orchestrator.md')));
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'implementer.md')));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/agents.test.mjs test/cli.test.mjs`
Expected: FAIL — templates não existem / `installAgents` não cria os novos / contagem 5.

- [ ] **Step 3: Write the templates**

Create `templates/agents/orchestrator.md`:

```markdown
---
# bento: agent v1 — edite livremente
description: Orquestrador de sessões — lê o roadmap da spec, planeja a sessão atual e executa o stack viva disparando subagents de nível 2 (implementer/verify/explorer/browser).
mode: primary
permission:
  task:
    "*": deny
    implementer: allow
    verify: allow
    explorer: allow
    browser: allow
  skill:
    "*": allow
  bash: allow
  edit: allow
  "codegraph_*": deny
  "agent-browser_*": deny
---

# Orquestrador

Você executa o roadmap de sessões da spec (skill `small-prs`, Modo 1), uma sessão por vez, e é o único que fala com o usuário.

## Ao iniciar

1. Leia a spec/roadmap (`docs/superpowers/specs/`) e identifique a próxima sessão pendente; confirme que as sessões dependentes anteriores foram mergeadas.
2. Detalhe o plano da sessão atual (skill `writing-plans` + Modo 1 do `small-prs`) em `docs/superpowers/plans/YYYY-MM-DD-<assunto>-s<N>.md` e commite no trunk antes de qualquer stack.
3. Siga o Modo 1.5: `gh stack init <branch1>` e, por task, `gh stack add <branchN>` → dispatch `implementer` → `bento check <baseN> HEAD` → checkpoint.

## Dispatch (teto de 2 níveis)

- Implementação: `implementer`; review/verificação: `verify`; exploração: `explorer`; browser: `browser`.
- Nunca despache `general` (quebraria o teto; nível 2 tem `task: deny`).
- Passe sempre caminhos (spec, plano, limites, diff) — nunca resumo de histórico.
- Exceção: o relatório de retorno do worker.

## Gates

Violação de limite, rebase difícil e merge são gates: o worker devolve o relatório **sem decidir**; você usa `question`, e retoma o worker com o mesmo `task_id` passando a decisão.

## Fim de sessão

Modo 4 (reviews por camada com `verify`) → `gh stack submit --auto --open` → `gh pr edit` por PR → pergunte antes do merge (`finishing-a-development-branch`).
```

Create `templates/agents/implementer.md`:

```markdown
---
# bento: agent v1 — edite livremente
description: Implementador de camada — implementa/testa/commita a task do plano com TDD e evidência; não dispara subagents.
mode: subagent
permission:
  task: deny
  edit: allow
  bash: allow
  skill:
    "*": allow
  "codegraph_*": deny
  "agent-browser_*": deny
---

# Implementador

Implemente a task descrita no dispatch, na camada/branch atual do stack:

1. Siga TDD (skill `test-driven-development`): teste que falha → implementação mínima → testes verdes.
2. Rode a suíte completa ao final e **cole a saída** no relatório.
3. Commite na camada atual (mensagem final = título do PR da camada); não faça squash interativo nem troque de camada.
4. Reporte: status, comandos rodados com saída, arquivos tocados e orçamento do diff (linhas/arquivos vs limite).
5. Não dispare subagents (`task` negado).
```

- [ ] **Step 4: Wire the agents registry**

Em `lib/agents.mjs`:

```js
const AGENT_NAMES = ['flash', 'superpowers', 'explorer', 'verify', 'browser', 'orchestrator', 'implementer'];
```

```js
function wantedAgents({ profile = true, superpowers = true, codegraph = true, agentBrowser = true } = {}) {
  const wanted = [];
  if (profile) wanted.push('flash', 'verify', 'orchestrator', 'implementer');
  if (superpowers) wanted.push('superpowers');
  if (profile && codegraph) wanted.push('explorer');
  if (profile && agentBrowser) wanted.push('browser');
  return wanted;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/agents.test.mjs test/cli.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add templates/agents/orchestrator.md templates/agents/implementer.md lib/agents.mjs test/agents.test.mjs test/cli.test.mjs
git commit -m "feat: agents orchestrator e implementer (teto de 2 níveis)"
```

---

### Task 5: `verify` reviewer + `flash`/seção do consumidor

**Files:**
- Modify: `templates/agents/verify.md`
- Modify: `templates/agents/flash.md` (linha 39)
- Modify: `templates/agents-section.md`
- Modify: `test/agents.test.mjs`

**Interfaces:**
- Consumes: nada de tasks anteriores (texto).
- Produces: `verify` com allows de bash para o fluxo (testes/lint/`bento check`/shim) e contrato de review em dois vereditos; `flash` e a seção do AGENTS.md do consumidor apontam para o Modo 1.5.

- [ ] **Step 1: Write the failing tests**

Em `test/agents.test.mjs`, ajuste o teste `verify:` para o novo contrato e adicione o teste do `flash`:

```js
test('verify: temperature 0, edit deny, allows de verificação e review por camada', () => {
  const raw = template('verify');
  assert.ok(raw.includes('temperature: 0'));
  assert.ok(raw.includes('edit: deny'));
  assert.ok(raw.includes('task: deny'));
  assert.ok(raw.includes('"*": ask'));
  assert.ok(raw.includes('"node --test*": allow'));
  assert.ok(raw.includes('"npm test*": allow'));
  assert.ok(raw.includes('"npm run *": allow'));
  assert.ok(raw.includes('"git diff*": allow'));
  assert.ok(raw.includes('"bento check*": allow'));
  assert.ok(raw.includes('"node scripts/pr-split-verify.mjs*": allow'));
  assert.ok(raw.includes('spec compliance'));
});

test('flash: aponta para o checkpoint por camada do Modo 1.5', () => {
  const raw = template('flash');
  assert.ok(raw.includes('Modo 1.5'));
  assert.ok(raw.includes('check'));
  assert.ok(raw.includes('camada'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/agents.test.mjs`
Expected: FAIL — `verify` sem os novos allows/contrato; `flash` sem "Modo 1.5".

- [ ] **Step 3: Rewrite `templates/agents/verify.md`**

```markdown
---
# bento: agent v1 — edite livremente
description: Verificador independente e reviewer por camada — read-only; roda a verificação, cita arquivo:linha e emite spec compliance + quality.
mode: subagent
temperature: 0
permission:
  edit: deny
  task: deny
  skill:
    "*": deny
  bash:
    "*": ask
    "git diff*": allow
    "git log*": allow
    "git status*": allow
    "git show*": allow
    "node --test*": allow
    "npm test*": allow
    "npm run *": allow
    "bento check*": allow
    "node scripts/pr-split-verify.mjs*": allow
  "codegraph_*": deny
  "agent-browser_*": deny
---

# Verificador independente / reviewer de camada

Read-only e cético. Verifique o trabalho descrito no dispatch:

1. Rode os comandos de verificação (testes/lint) e **cole a saída**; não resuma sem mostrar.
2. Cite sempre `arquivo:linha`; se não conseguir citar, não reporte.
3. Review por camada (Modo 4): emita DOIS vereditos — **spec compliance** ✅/❌ e **quality** Approved/Rejected — com findings em Critical/Important/Minor.
4. Baseline: defeitos pré-existentes do arquivo (ex.: lint na base) não são defeito novo; reporte só o que a camada introduziu.
5. Verifique por conteúdo (abra o arquivo), nunca por hash ou pela descrição de outro agente.
6. Não edite nada e não proponha refactors fora do escopo.
```

- [ ] **Step 4: Update `flash` and the consumer section**

Em `templates/agents/flash.md`, substitua a linha 39 por:

```markdown
4. Trabalho grande: sessão bem escopada (1 entregável + estimativa) e, na execução, commit + check por camada antes de seguir (skill `small-prs`, Modo 1.5); violação = pare e pergunte.
```

Substitua `templates/agents-section.md` inteiro por:

```markdown
## Bento (small-prs)

- Sessões: a spec fecha o roadmap (1 entregável demonstrável + estimativa; corte em ~3× o limite do PR); cada sessão tem plano próprio `docs/superpowers/plans/YYYY-MM-DD-<assunto>-s<N>.md`, commitado no trunk antes do stack.
- Stack viva: cada task vira camada via `gh stack add`; após a task rode `node scripts/pr-split-verify.mjs check <base> HEAD` (ou `bento check`) e pare se estourar; fix em camada inferior = commit na camada + `gh stack rebase --upstack` agrupado.
- Nunca abra um PR sem rodar `node scripts/pr-split-verify.mjs check` (ou `bento check`).
- Antes do check, atualize as duas branches envolvidas com o remote: `git fetch origin <base> <head>` (refs desatualizadas = diff fantasma).
- Diff acima de .pr-limits.yaml bloqueia o PR: ofereça o split antes.
- Entregas em cadeia via gh-stack (`gh stack init/add/push/submit`); equivalência do split retroativo: `node scripts/pr-split-verify.mjs equivalence <base> <head> <camada1> ...`.
- O hook pre-push é stack-aware: valida cada branch contra a base do seu stack (ancestral mais próximo no mesmo push).

### Agents (bento)

- Troque com Tab: `flash` (enxuto, padrão), `superpowers` (fluxo completo de skills) e `orchestrator` (executa o roadmap de sessões e dispara subagents).
- Delegue com `@explorer` (codegraph, leitura), `@verify` (verificação/review independente) e `@browser` (automação web); `implementer` é o worker de implementação (nível 2, sem subagents).
- `.opencode/agents/*.md` são seus: edite `model`, `temperature` e permissões à vontade; `bento update` não sobrescreve.
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/agents.test.mjs test/install.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add templates/agents/verify.md templates/agents/flash.md templates/agents-section.md test/agents.test.mjs
git commit -m "feat: verify reviewer por camada; flash e seção do consumidor no Modo 1.5"
```

---

### Task 6: Skill `small-prs` — Modo 1 (sessões) e Modo 1.5

**Files:**
- Modify: `skills/small-prs/SKILL.md` (arquivo inteiro)

**Interfaces:**
- Consumes: nada de código; descreve o fluxo que Tasks 1-5 tornam possível.
- Produces: skill com roadmap de sessões no Modo 1, Modo 1.5 (stack viva) e descrição atualizada (para ser invocada na execução).

- [ ] **Step 1: Rewrite the skill**

Substitua `skills/small-prs/SKILL.md` inteiro por:

````markdown
---
name: small-prs
description: Previne, valida, corrige e revisa PRs grandes no fluxo opencode (superpowers). Use ao planejar (roadmap de sessões + camadas do stack), ao executar planos (stack viva — gh stack add por task + check por camada; violação = parar), antes de abrir um PR (pr-split-verify), quando um diff avulso exceder os limites de .pr-limits.yaml (split em cadeia via gh-stack) e para revisão independente por camada (subagentes limpos).
---

# small-prs — prevenção, validação, correção e revisão de PRs grandes

## Modo 1 — Prevenção (sessões, roadmap e plano)

### Sessões (roadmap na spec)

Ao fazer brainstorming/spec, feche um roadmap de sessões antes de qualquer plano detalhado:

| # | sessão | entregável demonstrável | camadas estimadas | linhas/arquivos est. | depende de |
| - | ------ | ----------------------- | ----------------- | -------------------- | ---------- |

- 1 entregável demonstrável por sessão; sem entregável nomeável, não é sessão.
- Estimativa total da sessão > ~3× o limite do PR (default 400 → ~1200 linhas) → divida a sessão já no roadmap.
- Sessões dependentes só começam depois que as anteriores entregaram (merge); declare a ordem.
- Planejamento progressivo: o plano da sessão atual é detalhado em `docs/superpowers/plans/YYYY-MM-DD-<assunto>-s<N>.md`; sessões futuras ganham plano próprio quando começarem.
- Spec/roadmap + plano da sessão são commitados no trunk antes do stack (trunk protegido → docs na 1ª camada).

### Plano da sessão (stack)

Cada task do plano é uma camada de um stack gh-stack; declare a tabela:

| camada | branch | base | foco/arquivos previstos | aceite | título do PR | mensagem do commit |
| ------ | ------ | ---- | ----------------------- | ------ | ------------ | ------------------ |

- Branch no padrão `split/<slug>/<nn>-<nome>`; 1 acceptance criterion por camada.
- Testes viajam junto do código que validam; refactor separado de feature; migração junto do código que ela serve.
- Estime arquivos/linhas por camada: camada cuja estimativa já passa do limite é dividida **antes** de executar.
- Limite default: <=400 linhas de diff e <=10 arquivos por PR (ver .pr-limits.yaml).
- Declare dependências e ordem de entrega entre as camadas.

## Modo 1.5 — Execução em stack viva

Setup da sessão: confira o trunk (`git remote set-head origin <trunk>`; um origin/HEAD errado faz o stack mirar a branch errada) e rode `gh stack init <branch1>`.

Por task, nesta ordem:

1. `gh stack add <branchN>` (cria a camada sobre o topo e faz checkout; sem commit).
2. Implemente/teste/commite na camada (mensagem final = título do PR; vários commits ok — nada de squash interativo).
3. Rode `node scripts/pr-split-verify.mjs check <baseN> HEAD` (ou `bento check <baseN>`); base = camada anterior, trunk na 1ª.
4. Checkpoint: suíte de testes **completa** (não só a da task) + self-review curto do diff da camada.
5. **Violou → PARE**: mostre a tabela (camada, linhas, arquivos, limite) e aguarde decisão (subdividir a task, mudar escopo ou override de docs). Não inicie a próxima task.
6. Ok → registre o orçamento (linhas/arquivos vs limite) no relatório da task e, no fluxo subagent-driven-development, no ledger `.superpowers/sdd/progress.md`.

**Fix em camada inferior (política A):** a camada congela ao passar o checkpoint; novos commits nela só por correção. Fix na camada K: navegue até K (`gh stack bottom`/`down`), commite, **agrupe todos os fixes pendentes** e rode `gh stack rebase --upstack` UMA vez (rerere já ligado). Rebase com conflito difícil → `gh stack rebase --abort` e **pare e pergunte**. Pós-rebase: re-rode `check` nas camadas afetadas, a suíte no topo e verifique por conteúdo (`git show <topo>:<arquivo>` / `git merge-base --is-ancestor`), nunca por hash — rebase troca hashes.

Fim da sessão: Modo 4 (review por camada) → `gh stack submit --auto --open` → `gh pr edit` por PR → merge via `finishing-a-development-branch` (gate do usuário).

## Modo 2 — Validação (antes de abrir PR)

Antes de abrir qualquer PR (superpowers:finishing-a-development-branch):

1. Garanta que AS DUAS branches envolvidas (base e head) estão atualizadas com o remote: `git fetch origin <base> <head>`. Refs locais desatualizadas produzem diffs fantasmas (commits de outros PRs já mergeados aparecem como mudanças do seu PR).
2. Rode `node scripts/pr-split-verify.mjs check` (ou `bento check`).
3. Se exit 0: prossiga com gh-stack (`gh stack push`, `gh stack submit`; alias `gs` disponível via `gh stack alias`, opcional).
4. Se exit != 0 (PR GRANDE): NÃO abra o PR. Apresente o relatório e ofereça o split (Modo 3).

## Modo 3 — Correção (split retroativo)

Só execute após aprovação explícita do usuário:

1. Crie branch de salvaguarda: `git branch backup/<branch-atual>`.
2. **Antes de agrupar, pergunte a política de arquivo ÚNICO grande** (ex: docs de 795 linhas): dividir o conteúdo em partes ou deixar intocado mesmo acima do limite? (Default do usuário: docs intocadas.) Nunca presuma.
3. Analise o diff (arquivos e dependências/imports) e agrupe em camadas coerentes: mesmo módulo, refactor != feature, CODEOWNERS se existir. Arquivo ambíguo -> pergunte ao usuário. **Testes de invariante GLOBAL** (que validam vários arquivos, ex: "nenhum componente embute cost"): vão com o ÚLTIMO grupo que satisfaz o invariante (ou com todos os arquivos que ele valida), nunca com o primeiro. Arquivo único grande permitido -> camada própria com o arquivo inteiro.
4. Apresente o plano de split (tabela: camada, arquivos, dependências) e aguarde aprovação.
5. Execute: `gh stack init <camada1> <camada2> ...` (lista COMPLETA em ordem — adota branches já existentes; NÃO use `gh stack add` para branches criadas antes do init); em cada camada aplique `git diff <base>..<origem> -- <paths> | git apply` e commite (1 commit limpo por camada). **`git add <arquivos do grupo>` — nunca `git add -A`** (pode engolir scratch/artefatos de validação). Antes de iniciar, garanta o trunk correto: `git remote set-head origin <trunk>` (ex: main) — um origin/HEAD errado faz o stack inteiro mirar a branch errada.
6. Se a camada B usa símbolo renomeado na A, inclua shim/alias retrocompatível na A.
7. Verifique: `node scripts/pr-split-verify.mjs equivalence <base> <head> <camada1> ...` — precisa exit 0. Se houve transformação de conteúdo permitida (arquivo dividido), a equivalência de árvore vai reportar DIVERGENTE apenas nesses paths: confirme que são só eles, verifique a preservação de conteúdo e trate como aprovado. **Rode equivalence/check de QUALQUER checkout que tenha o shim** (ex: a branch de trabalho) — as camadas criadas de `<base>` não contêm `scripts/` nem `.bento/`; os refs resolvem de qualquer checkout.
8. Rode lint, build, testes **e `check` por camada**; pare e reporte se falhar. (O `check` pega crescimento silencioso — fixes podem passar o teto.)
9. Nomeação das camadas: `split/<slug-da-feature>/<nn>-<nome-curto-semantico>` (ex: `split/rls-sensitive-columns/01-fundacao`, `02-hook-variacoes`).
10. Commit de cada camada: mensagem = título do PR, conventional e descritivo (ex: `feat(rls): restringe colunas sensíveis — migração e utils`).
11. **Fixes durante o Modo 4 em camada N: rebase em cascata das camadas N+1..topo sobre a camada corrigida** (fix local não propaga automaticamente — sem isso o mergeável fica sem o fix). Verifique por CONTEÚDO no topo da cadeia (rebase troca hashes: `git show <topo>:<arquivo>` — não confie em hashes antigos).
12. Entrega: `gh stack submit --auto --open` (sem draft — confirme no `--help`). Depois, para CADA PR do stack: `gh pr edit <n> --title "<título>" --body "<descrição>"` com corpo contendo: o que faz, por que, e foco da review (arquivos-chave/riscos). PRs órfãos de iterações anteriores (branch deletada/renomeada): feche com comentário apontando o substituto.
13. Se não for o autor do PR original, credite o autor nos novos PRs. Nunca force-push na branch original antes da aprovação final.

## Modo 4 — Revisão independente por camada (gate antes do submit)

Integra com superpowers: é a fase de review do `subagent-driven-development`/`requesting-code-review` aplicada à stack. Reutilize os contratos existentes (não duplique): `task-reviewer-prompt.md` (subagent-driven-development) para revisão por camada e `code-reviewer.md` (requesting-code-review) para o review final da stack. O Modo 3 para na aprovação do usuário, mas a sequência natural é: Modo 3 passos 7-8 (equivalence + checks) → **Modo 4** → submit.

Para CADA camada da stack, ANTES do `gh stack submit`:

1. Setup de worktree por camada (reviewers são read-only, paralelos): `git worktree add <path-wt-N> <camadaN>` + `ln -s <clone>/node_modules <path-wt-N>/node_modules` (worktrees não compartilham node_modules).
2. Gere o pacote de review da camada (diff da camada contra a base dela, com contexto) e salve em arquivo — FORA do repo (ex: dir temporário).
3. Despache um subagente reviewer LIMPO (contexto zero da sessão — sem histórico do split) com:
   - o arquivo do diff (única fonte do que mudou),
   - os limites de `.pr-limits.yaml`,
   - o título/descrição do PR como contrato,
   - o worktree NOMEADO da camada (path absoluto),
   - **o baseline de lint pré-existentes por arquivo** (ex: "base tinha 5 no-explicit-any em X.ts — só os NOVOS são defeito"), para evitar falsos positivos de arquivos tocados de camadas anteriores,
   - a instrução de rodar os testes da camada E `bento check` da camada.
4. O reviewer emite DOIS vereditos (contrato task-reviewer): **spec compliance** ✅/❌ e **quality** Approved/Rejected, com findings por severidade Critical/Important/Minor.
5. Critical/Important → despache subagente fix LIMPO → re-review (mesmo ciclo do subagent-driven-development: fixer roda os testes de cobertura e reporta comando + saída). **Path ÚNICO de relatório** para fixer e reviewer (definido no dispatch — ex: `<dir-temp>/modo4/layerN-report.md`) para nunca se perderem.
6. Minor → registre no ledger (`.superpowers/sdd/progress.md`) para o review final da stack.
7. **GATE: camada sem review aprovado NÃO entra no submit.**

Ao final de todas as camadas, despache UM subagente de **whole-stack review** (contrato code-reviewer.md): lê a cadeia completa de diffs encadeados + o resultado da equivalence + os Minors acumulados no ledger → veredito final antes do merge. **Além de ler o diff, o whole-stack DEVE verificar a topologia**: para cada fix aprovado, confirme por conteúdo (não por hash — rebases trocam hashes) que está ANCESTRAL no topo da cadeia (`git merge-base --is-ancestor <fix> <topo>` ou `git show <topo>:<arquivo>`). Depois disso, siga para o `finishing-a-development-branch` (merge em cascata via `gh stack merge`).
````

- [ ] **Step 2: Verify the skill still installs**

Run: `node --test test/cli.test.mjs test/install.test.mjs`
Expected: PASS (a skill é copiada — sem teste de conteúdo).

- [ ] **Step 3: Commit**

```bash
git add skills/small-prs/SKILL.md
git commit -m "docs: small-prs com sessões/roadmap e Modo 1.5 (stack viva)"
```

---

### Task 7: Docs do repo (README + AGENTS.md)

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: tudo das tasks anteriores (nomes e comandos reais).
- Produces: docs alinhadas (agents, hook stack-aware, fluxo de sessões).

- [ ] **Step 1: Update README**

Edite `README.md`:

1. Linha 3 (intro):

```markdown
CLI do fluxo opencode pessoal: instala e mantém, num projeto consumidor, a skill `small-prs` (limites de PR + stack viva por sessão), o plugin ponytail, as skills vendadas do superpowers e agents escopados, os MCP servers codegraph e agent-browser, as skills agent-browser e taste-skill e um hook pre-push stack-aware.
```

2. Linha 25 (agents):

```markdown
- `.opencode/agents/` — agents `flash` (padrão), `superpowers`, `orchestrator` (executa o roadmap de sessões e dispara subagents), `explorer`, `verify` (verificação/review), `browser` e `implementer` (nível 2, sem subagents) (pule os do perfil com `--no-profile`; `superpowers` segue `--no-superpowers`; `explorer`/`browser` seguem `--no-codegraph`/`--no-agent-browser`)
```

3. Linha 67 (pre-push):

```markdown
O pre-push roda `check-push` automaticamente a cada `git push`, para cada branch empurrado (refs do stdin), resolvendo a base de cada camada de stack por ancestralidade (sem stack, base `main`); acima do limite o push é abortado.
```

4. Substitua a seção `## Fluxo small-prs` (linhas 71-77) por:

```markdown
## Fluxo small-prs

1. **Sessões** — a spec fecha um roadmap (1 entregável demonstrável + estimativa; corte em ~3× o limite do PR); cada sessão tem plano próprio `-s<N>`, commitado no trunk antes do stack.
2. **Prevenção** — cada task do plano é uma camada de stack (`gh stack add`), com 1 acceptance criterion e estimativa por camada (testes junto, refactor ≠ feature, ≤400 linhas/10 arquivos).
3. **Execução (stack viva)** — commit + `check` por camada antes de seguir (Modo 1.5); violação = parar e perguntar; fix em camada inferior = commit na camada + `gh stack rebase --upstack` agrupado.
4. **Validação** — antes de abrir PR, rode `check`; acima do limite o PR é bloqueado.
5. **Correção avulsa** — com aprovação: split em camadas coerentes, equivalência verificada, entrega em cadeia via `gh stack push`/`gh stack submit` (alias `gs` via `gh stack alias`, opcional).

Os agents escopados organizam o uso: `flash` (padrão enxuto), `superpowers` (skills completas), `orchestrator` (roadmap de sessões), `implementer`, `explorer`, `verify` e `browser`. Troque com Tab; edite os `.md` em `.opencode/agents/` para ajustar modelo/temperatura.
```

- [ ] **Step 2: Update AGENTS.md**

Edite `AGENTS.md`:

1. Linha 3 (intro):

```markdown
CLI que instala/atualiza/remove, num projeto consumidor, o fluxo opencode pessoal: skill `small-prs` (limites de PR + sessões/stack viva), plugin ponytail, 14 skills vendadas do superpowers com agents escopados (`flash`, `superpowers`, `orchestrator`, `implementer`, `explorer`, `verify`, `browser`), MCP servers (codegraph, agent-browser), skill agent-browser/taste-skill e hook pre-push stack-aware.
```

2. Na seção CLI, no bullet de `install`/`update` (o que lista os agents criados), troque `criam os agents escopados em `.opencode/agents/`` por:

```markdown
criam os agents escopados (`flash`, `superpowers`, `orchestrator`, `implementer`, `explorer`, `verify`, `browser`) em `.opencode/agents/`
```

3. Na seção Arquitetura, adicione o bullet do `lib/stack.mjs` logo antes do bullet do `lib/tools.mjs`:

```markdown
- `lib/stack.mjs` — resolve a base de cada branch de um push por ancestralidade entre os refs empurrados (base = ancestral mais próximo; sem stack → `main`); base do `check-push`, sem parsear `.git/gh-stack` nem depender de `gh`.
```

4. Ainda na Arquitetura, no bullet do `lib/hooks.mjs`, troque o final `é a fonte do hook instalado e valida os refs do stdin (cada branch empurrado), com fallback para o checkout atual quando rodado no terminal.` por:

```markdown
é a fonte do hook instalado; valida os refs do stdin em uma chamada `check-push` (cada branch contra a base do seu stack), com fallback para o checkout atual quando rodado no terminal.
```

5. Ainda na Arquitetura, no bullet do `lib/validate.mjs`, acrescente o `check-push`:

```markdown
- `lib/validate.mjs` — `evaluate`/`runCheck`/`runCheckPush`/`runEquivalence`; `lib/install.mjs` — install/uninstall + `packageRoot()`/`version()`.
```

(esse bullet substitui o atual `- `lib/validate.mjs` — `evaluate`/`runCheck`/`runEquivalence`; ...`)

6. Na seção Regras, adicione ao bullet de planos:

```markdown
- Planos/specs em `docs/superpowers/plans/` e `docs/superpowers/specs/` com nome `YYYY-MM-DD-<assunto>.md`; planos de sessão usam `YYYY-MM-DD-<assunto>-s<N>.md`.
```

- [ ] **Step 3: Verify nothing broke**

Run: `npm test`
Expected: tudo verde (docs não afetam testes; garante que nenhum texto copiado por testes mudou de lugar errado).

Run: `node bin/bento.mjs check`
Expected: diff `main...HEAD` dentro dos limites (≤400 linhas/10 arquivos). Se a branch já tiver trabalho anterior não mergeado, o número inclui esse trabalho — valide por camada/feature e faça o split (Modo 3) ou reserve para o PR.

- [ ] **Step 4: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: sessões, stack viva e agents novos no README/AGENTS"
```

---

## Self-review do plano

- **Cobertura da spec:** hook stack-aware (Tasks 1-3); skill Modo 1/1.5 + descrição (Task 6); `orchestrator`/`implementer`/teto de 2 níveis/`verify` reviewer/`flash`/seção do consumidor (Tasks 4-5); docs (Task 7). Sessões/roadmap são texto de processo (Tasks 5-6); `check-push` mecânico (Tasks 1-3). `equivalence` intacto; `check` manual intacto (nenhuma task o altera).
- **Placeholders:** nenhum "TBD/TODO"; todo passo de código tem o conteúdo completo.
- **Consistência de tipos:** `resolveStackBases(cwd, refs) → Map`, `runCheckPush({ refs, cwd }) → 0|1`, `refs = [{ branch, sha }]` usados de forma idêntica em Tasks 1-3; nomes de agents (`orchestrator`, `implementer`) idênticos em Tasks 4-7.
