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