import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'bento.mjs');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  git(['init', '-b', 'main'], dir);
  git(['config', 'user.email', 't@test'], dir);
  git(['config', 'user.name', 't'], dir);
  return dir;
}

test('sem argumento mostra uso e sai com 2', () => {
  const r = spawnSync(process.execPath, [BIN], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.ok(r.stderr.includes('uso:'));
});

test('check: diff acima do limite sai com 1 e reporta PR GRANDE', () => {
  const dir = makeRepo();
  writeFileSync(join(dir, 'f.txt'), 'v1\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'base'], dir);
  git(['checkout', '-b', 'feat'], dir);
  const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
  writeFileSync(join(dir, 'f.txt'), `${lines}\n`);
  git(['add', '-A'], dir);
  git(['commit', '-m', 'big'], dir);
  writeFileSync(join(dir, '.pr-limits.yaml'), 'max_lines: 5\nmax_files: 10\n');
  const r = spawnSync(process.execPath, [BIN, 'check', 'main'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes('PR GRANDE'));
});

test('check: diff dentro dos limites sai com 0', () => {
  const dir = makeRepo();
  writeFileSync(join(dir, 'f.txt'), 'v1\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'base'], dir);
  git(['checkout', '-b', 'feat'], dir);
  writeFileSync(join(dir, 'f.txt'), 'v1\nv2\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'small'], dir);
  writeFileSync(join(dir, '.pr-limits.yaml'), 'max_lines: 500\nmax_files: 10\n');
  const r = spawnSync(process.execPath, [BIN, 'check', 'main'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
});

test('update: instala sem exigir gh', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(existsSync(join(dir, '.opencode', 'skills', 'small-prs', 'SKILL.md')));
});
