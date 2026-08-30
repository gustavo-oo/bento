import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PONYTAIL_PLUGIN, SUPERPOWERS_PLUGIN } from '../lib/opencode-config.mjs';

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

test('check: usa three-dot (merge-base) — main avançado não conta como deleção fantasma', () => {
  const dir = makeRepo();
  writeFileSync(join(dir, 'a.txt'), 'v1\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'base'], dir);
  git(['checkout', '-b', 'feat'], dir);
  writeFileSync(join(dir, 'a.txt'), 'v1\nv2\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'small'], dir);
  git(['checkout', 'main'], dir);
  const big = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n');
  writeFileSync(join(dir, 'big.txt'), `${big}\n`);
  git(['add', '-A'], dir);
  git(['commit', '-m', 'big on main'], dir);
  git(['checkout', 'feat'], dir);
  writeFileSync(join(dir, '.pr-limits.yaml'), 'max_lines: 400\nmax_files: 10\n');
  const r = spawnSync(process.execPath, [BIN, 'check', 'main'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('PR dentro dos limites.'));
});

test('update: instala sem exigir gh', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(existsSync(join(dir, '.opencode', 'skills', 'small-prs', 'SKILL.md')));
});

test('update funciona a partir da cópia instalada (.bento/bin/bento.mjs)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const first = spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(first.status, 0);
  const installed = join(dir, '.bento', 'bin', 'bento.mjs');
  assert.ok(existsSync(installed));
  const second = spawnSync(process.execPath, [installed, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(second.status, 0);
  assert.ok(existsSync(join(dir, '.opencode', 'skills', 'small-prs', 'SKILL.md')));
});

test('uninstall: CLI remove e sai 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const upd = spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(upd.status, 0);
  assert.ok(existsSync(join(dir, '.opencode', 'skills', 'small-prs', 'SKILL.md')));
  const r = spawnSync(process.execPath, [BIN, 'uninstall'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'small-prs', 'SKILL.md')));
});

test('update: adiciona superpowers e ponytail ao opencode.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('superpowers'));
  assert.ok(r.stdout.includes('ponytail'));
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.deepEqual(obj.plugin, [SUPERPOWERS_PLUGIN, PONYTAIL_PLUGIN]);
});

test('update --no-superpowers: adiciona só ponytail', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-superpowers'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!r.stdout.includes('superpowers'));
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.deepEqual(obj.plugin, [PONYTAIL_PLUGIN]);
});

test('update --no-ponytail: adiciona só superpowers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-ponytail'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!r.stdout.includes('ponytail'));
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.deepEqual(obj.plugin, [SUPERPOWERS_PLUGIN]);
});

test('update --no-superpowers --no-ponytail --no-codegraph --no-agent-browser: não toca opencode.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  writeFileSync(join(dir, 'opencode.json'), '{ "theme": "dark" }');
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-superpowers', '--no-ponytail', '--no-codegraph', '--no-agent-browser'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!r.stdout.includes('superpowers'));
  assert.ok(!r.stdout.includes('ponytail'));
  assert.ok(!r.stdout.includes('codegraph'));
  assert.ok(!r.stdout.includes('agent-browser'));
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), '{ "theme": "dark" }');
});

test('uninstall: remove superpowers do opencode.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  const r = spawnSync(process.execPath, [BIN, 'uninstall'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('superpowers'));
  assert.ok(!existsSync(join(dir, 'opencode.json')));
});

test('uninstall: remove ponytail do opencode.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  const r = spawnSync(process.execPath, [BIN, 'uninstall'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('ponytail'));
  assert.ok(!existsSync(join(dir, 'opencode.json')));
});

test('update: adiciona codegraph e agent-browser ao mcp do opencode.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('codegraph'));
  assert.ok(r.stdout.includes('agent-browser'));
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.deepEqual(obj.mcp.codegraph.command, ['codegraph', 'serve', '--mcp']);
  assert.deepEqual(obj.mcp['agent-browser'].command, ['agent-browser', 'mcp']);
});

test('update --no-codegraph: adiciona só agent-browser ao mcp', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-codegraph'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.equal(obj.mcp.codegraph, undefined);
  assert.deepEqual(obj.mcp['agent-browser'].command, ['agent-browser', 'mcp']);
});

test('update --no-agent-browser: adiciona só codegraph ao mcp e não copia a skill', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-agent-browser'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.equal(obj.mcp['agent-browser'], undefined);
  assert.deepEqual(obj.mcp.codegraph.command, ['codegraph', 'serve', '--mcp']);
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'agent-browser', 'SKILL.md')));
});

test('uninstall: remove codegraph e agent-browser (mcp, skill, .codegraph) e sai 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  mkdirSync(join(dir, '.codegraph'), { recursive: true });
  const r = spawnSync(process.execPath, [BIN, 'uninstall'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('codegraph'));
  assert.ok(r.stdout.includes('agent-browser'));
  assert.ok(r.stdout.includes('.codegraph'));
  assert.ok(!existsSync(join(dir, 'opencode.json')));
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'agent-browser')));
  assert.ok(!existsSync(join(dir, '.codegraph')));
});
