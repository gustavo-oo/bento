import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install, uninstall } from '../lib/install.mjs';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

test('install: copia skill, shim, .bento e preserva .pr-limits.yaml existente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-'));
  writeFileSync(join(dir, '.pr-limits.yaml'), 'max_lines: 123\n');
  install(dir, {});
  assert.ok(existsSync(join(dir, '.opencode', 'skills', 'small-prs', 'SKILL.md')));
  assert.ok(existsSync(join(dir, 'scripts', 'pr-split-verify.mjs')));
  assert.ok(existsSync(join(dir, '.bento', 'lib', 'validate.mjs')));
  assert.ok(existsSync(join(dir, '.bento', 'bin', 'bento.mjs')));
  assert.ok(existsSync(join(dir, '.bento', 'templates', 'pr-limits.yaml')));
  assert.equal(readFileSync(join(dir, '.pr-limits.yaml'), 'utf8'), 'max_lines: 123\n');
  assert.ok(readFileSync(join(dir, 'AGENTS.md'), 'utf8').includes('## Bento'));
});

test('install: copia a skill taste-skill para .opencode/skills/taste-skill', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-taste-'));
  install(dir, {});
  const vendada = readFileSync(new URL('../skills/taste-skill/SKILL.md', import.meta.url), 'utf8');
  const copiada = readFileSync(join(dir, '.opencode', 'skills', 'taste-skill', 'SKILL.md'), 'utf8');
  assert.equal(copiada, vendada);
});

test('install: cria .pr-limits.yaml quando ausente e é idempotente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-'));
  install(dir, {});
  assert.ok(existsSync(join(dir, '.pr-limits.yaml')));
  const first = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
  install(dir, {});
  assert.equal(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), first);
  assert.equal(first.split('## Bento').length, 2);
});

test('install: noAgents não cria AGENTS.md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-'));
  install(dir, { noAgents: true });
  assert.ok(!existsSync(join(dir, 'AGENTS.md')));
});

test('install: shim importa de ../.bento/lib/validate.mjs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-'));
  install(dir, {});
  const shim = readFileSync(join(dir, 'scripts', 'pr-split-verify.mjs'), 'utf8');
  assert.ok(shim.includes('../.bento/lib/validate.mjs'));
});

test('shim instalado roda check num repo git', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-shim-'));
  git(['init', '-b', 'main'], dir);
  git(['config', 'user.email', 't@test'], dir);
  git(['config', 'user.name', 't'], dir);
  writeFileSync(join(dir, 'f.txt'), 'v1\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'base'], dir);
  git(['checkout', '-b', 'feat'], dir);
  writeFileSync(join(dir, 'f.txt'), 'v1\nv2\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'small'], dir);
  writeFileSync(join(dir, '.pr-limits.yaml'), 'max_lines: 500\nmax_files: 10\n');
  install(dir, {});
  const r = spawnSync(process.execPath, [join(dir, 'scripts', 'pr-split-verify.mjs'), 'check', 'main'], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
});

test('uninstall: remove tudo do install e preserva AGENTS.md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-uninstall-'));
  const original = '# Meu Projeto\n\n## Regras\n\n- algo\n';
  writeFileSync(join(dir, 'AGENTS.md'), original);
  install(dir, {});
  const { removed } = uninstall(dir);
  assert.ok(!existsSync(join(dir, '.bento')));
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'small-prs')));
  assert.ok(!existsSync(join(dir, 'scripts', 'pr-split-verify.mjs')));
  assert.ok(!existsSync(join(dir, '.pr-limits.yaml')));
  const agents = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
  assert.ok(!agents.includes('## Bento'));
  assert.ok(agents.includes('# Meu Projeto'));
  assert.ok(agents.includes('## Regras'));
  assert.ok(agents.includes('- algo'));
  assert.equal(agents, original);
  assert.ok(removed.includes('AGENTS.md'));
});

test('uninstall: idempotente em projeto limpo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-uninstall-clean-'));
  const { removed } = uninstall(dir);
  assert.deepEqual(removed, []);
});

test('uninstall: não apaga shim do usuário', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-uninstall-shim-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  const userShim = '#!/usr/bin/env node\nconsole.log("meu shim");\n';
  writeFileSync(join(dir, 'scripts', 'pr-split-verify.mjs'), userShim);
  const { removed } = uninstall(dir);
  assert.ok(existsSync(join(dir, 'scripts', 'pr-split-verify.mjs')));
  assert.equal(readFileSync(join(dir, 'scripts', 'pr-split-verify.mjs'), 'utf8'), userShim);
  assert.ok(!removed.includes('scripts/pr-split-verify.mjs'));
});
