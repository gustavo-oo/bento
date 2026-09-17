import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveStackBases } from '../lib/stack.mjs';
import { runCheckPush } from '../lib/validate.mjs';

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

test('resolveStackBases: branches no mesmo commit resolvem para main, não um para o outro', () => {
  const dir = makeRepo();
  commit(dir, 'base.txt', 'v1\n', 'base');
  git(['checkout', '-b', 'feat'], dir);
  const shared = commit(dir, 'shared.txt', lines(4), 'shared');
  git(['checkout', '-b', 'feat-copy'], dir);
  const bases = resolveStackBases(dir, [
    { branch: 'feat', sha: shared },
    { branch: 'feat-copy', sha: shared },
  ]);
  assert.equal(bases.get('feat'), 'main');
  assert.equal(bases.get('feat-copy'), 'main');
});

test('runCheckPush: refs no mesmo commit avaliam contra main e bloqueiam diff grande', (t) => {
  const dir = makeRepo();
  commit(dir, 'base.txt', 'v1\n', 'base');
  commit(dir, '.pr-limits.yaml', 'max_lines: 2\nmax_files: 10\n', 'limits');
  git(['checkout', '-b', 'feat'], dir);
  const shared = commit(dir, 'shared.txt', lines(4), 'shared');
  git(['checkout', '-b', 'feat-copy'], dir);
  t.mock.method(console, 'log', () => {});
  const error = t.mock.method(console, 'error', () => {});
  const code = runCheckPush({
    refs: [
      { branch: 'feat', sha: shared },
      { branch: 'feat-copy', sha: shared },
    ],
    cwd: dir,
  });
  assert.equal(code, 1);
  assert.ok(
    error.mock.calls.some(
      (c) =>
        c.arguments[0].includes('PR GRANDE (feat)') ||
        c.arguments[0].includes('PR GRANDE (feat-copy)'),
    ),
  );
});

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
