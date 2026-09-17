import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupPrePushHook, removePrePushHook, bentoHooksActive } from '../lib/hooks.mjs';
import { install } from '../lib/install.mjs';

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

test('setup: falha ao escrever core.hooksPath em git config → skip config-write', (t) => {
  const dir = makeRepo();
  chmodSync(join(dir, '.git'), 0o555);
  const mock = t.mock.method(console, 'error', () => {});
  try {
    const r = setupPrePushHook(dir);
    assert.equal(r.status, 'skipped');
    assert.equal(r.reason, 'config-write');
    assert.equal(mock.mock.callCount(), 1);
  } finally {
    chmodSync(join(dir, '.git'), 0o755);
  }
});

test('bentoHooksActive: ativo quando core.hooksPath aponta para o bento', () => {
  const dir = makeRepo();
  git(['config', '--local', 'core.hooksPath', '.bento/hooks'], dir);
  assert.deepEqual(bentoHooksActive(dir), { active: true, value: '.bento/hooks' });
});

test('bentoHooksActive: null sem hooksPath ou apontando para outro lugar', () => {
  const dir = makeRepo();
  assert.equal(bentoHooksActive(dir), null);
  git(['config', '--local', 'core.hooksPath', '.husky'], dir);
  assert.equal(bentoHooksActive(dir), null);
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

test('setup: hook manual no diretório comum é visto em linked worktree', (t) => {
  const dir = makeRepo();
  writeFileSync(join(dir, 'f.txt'), 'v1\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'base'], dir);
  mkdirSync(join(dir, '.git', 'hooks'), { recursive: true });
  writeFileSync(join(dir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\n');
  const wt = join(mkdtempSync(join(tmpdir(), 'bento-hooks-wt-')), 'wt');
  git(['worktree', 'add', wt], dir);
  const mock = t.mock.method(console, 'error', () => {});
  const r = setupPrePushHook(wt);
  assert.equal(r.status, 'skipped');
  assert.equal(r.reason, 'manual-hooks');
  assert.equal(localHooksPath(wt), null);
  assert.equal(mock.mock.callCount(), 1);
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

test('remove: falha ao desconfigurar → null + aviso, config preservado', (t) => {
  const dir = makeRepo();
  setupPrePushHook(dir);
  chmodSync(join(dir, '.git'), 0o555);
  const mock = t.mock.method(console, 'error', () => {});
  try {
    assert.equal(removePrePushHook(dir), null);
    assert.equal(mock.mock.callCount(), 1);
    assert.equal(localHooksPath(dir), '.bento/hooks');
  } finally {
    chmodSync(join(dir, '.git'), 0o755);
  }
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
  writeFileSync(join(dir, '.bento.yaml'), 'max_lines: 2\nmax_files: 10\n');
  writeFileSync(join(dir, 'f.txt'), 'v1\nv2\nv3\nv4\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'big'], dir);
  install(dir, {});
  setupPrePushHook(dir);
  const r = spawnSync('git', ['push', '-u', 'origin', 'feat'], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes('OVERSIZED PR'));
});

test('hook real: branch não-checked-out é validada no push (refs do stdin)', () => {
  const dir = makeRepo();
  const remote = makeRemote();
  git(['remote', 'add', 'origin', remote], dir);
  writeFileSync(join(dir, 'f.txt'), 'v1\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'base'], dir);
  git(['checkout', '-b', 'feat'], dir);
  writeFileSync(join(dir, '.bento.yaml'), 'max_lines: 2\nmax_files: 10\n');
  writeFileSync(join(dir, 'f.txt'), 'v1\nv2\nv3\nv4\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'big'], dir);
  git(['checkout', 'main'], dir);
  writeFileSync(join(dir, '.bento.yaml'), 'max_lines: 2\nmax_files: 10\n');
  install(dir, {});
  setupPrePushHook(dir);
  const r = spawnSync('git', ['push', '-u', 'origin', 'feat'], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes('OVERSIZED PR'));
});

test('hook real: push dentro dos limites passa', () => {
  const dir = makeRepo();
  const remote = makeRemote();
  git(['remote', 'add', 'origin', remote], dir);
  writeFileSync(join(dir, 'f.txt'), 'v1\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'base'], dir);
  git(['checkout', '-b', 'feat'], dir);
  writeFileSync(join(dir, '.bento.yaml'), 'max_lines: 10\nmax_files: 10\n');
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

function makeStackRepo() {
  const dir = makeRepo();
  const remote = makeRemote();
  git(['remote', 'add', 'origin', remote], dir);
  writeFileSync(join(dir, 'base.txt'), 'v1\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'base'], dir);
  writeFileSync(join(dir, '.bento.yaml'), 'max_lines: 6\nmax_files: 10\n');
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
  writeFileSync(join(dir, '.bento.yaml'), 'max_lines: 6\nmax_files: 10\n');
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
  assert.ok(r.stderr.includes('OVERSIZED PR (L2)'));
});