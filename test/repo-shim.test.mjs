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
