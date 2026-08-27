import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluate, runEquivalence } from '../lib/validate.mjs';
import { parseLimitsYaml } from '../lib/config.mjs';

test('evaluate: sem violação dentro dos limites', () => {
  const limits = parseLimitsYaml('max_lines: 400\nmax_files: 10\n');
  const files = [
    { path: 'a.ts', added: 100, deleted: 0 },
    { path: 'b.ts', added: 100, deleted: 0 },
  ];
  const r = evaluate(limits, files);
  assert.deepEqual(r.violations, []);
  assert.equal(r.global.lines, 200);
  assert.equal(r.global.files, 2);
});

test('evaluate: viola max_lines global', () => {
  const limits = parseLimitsYaml('max_lines: 5\nmax_files: 10\n');
  const files = [
    { path: 'a.ts', added: 4, deleted: 0 },
    { path: 'b.ts', added: 4, deleted: 0 },
  ];
  const r = evaluate(limits, files);
  assert.ok(r.violations.some((v) => v.includes('linhas')));
});

test('evaluate: viola max_files global', () => {
  const limits = parseLimitsYaml('max_lines: 400\nmax_files: 2\n');
  const files = [
    { path: 'a.ts', added: 1, deleted: 0 },
    { path: 'b.ts', added: 1, deleted: 0 },
    { path: 'c.ts', added: 1, deleted: 0 },
  ];
  const r = evaluate(limits, files);
  assert.ok(r.violations.some((v) => v.includes('arquivos')));
});

test('evaluate: override por glob viola só o grupo', () => {
  const limits = parseLimitsYaml(
    'max_lines: 400\nmax_files: 10\noverrides:\n  - glob: "mig/**"\n    max_lines: 5\n'
  );
  const files = [
    { path: 'mig/001.sql', added: 6, deleted: 0 },
    { path: 'src/a.ts', added: 100, deleted: 0 },
  ];
  const r = evaluate(limits, files);
  assert.ok(r.violations.some((v) => v.includes('mig/**')));
  assert.equal(r.global.lines, 106);
  assert.equal(r.groups.length, 1);
});

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'bento-git-'));
  git(['init', '-b', 'main'], dir);
  git(['config', 'user.email', 't@test'], dir);
  git(['config', 'user.name', 't'], dir);
  return dir;
}

function commit(dir, files) {
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  git(['add', '-A'], dir);
  git(['commit', '-m', 'wip'], dir);
}

test('runEquivalence: camadas que somam igual ao original → 0', () => {
  const dir = makeRepo();
  commit(dir, { 'a.ts': '1\n' });
  git(['checkout', '-b', 'feat'], dir);
  commit(dir, { 'a.ts': '1\n2\n', 'b.ts': 'x\n' });
  commit(dir, { 'c.ts': 'y\n' });

  git(['checkout', '-b', 'layer1', 'main'], dir);
  commit(dir, { 'a.ts': '1\n2\n', 'b.ts': 'x\n' });
  git(['checkout', '-b', 'layer2'], dir);
  commit(dir, { 'c.ts': 'y\n' });

  const code = runEquivalence({ base: 'main', head: 'feat', layers: ['layer1', 'layer2'], cwd: dir });
  assert.equal(code, 0);
});

test('runEquivalence: camada com conteúdo diferente → 1 e relatório', () => {
  const dir = makeRepo();
  commit(dir, { 'a.ts': '1\n' });
  git(['checkout', '-b', 'feat'], dir);
  commit(dir, { 'a.ts': '1\n2\n', 'b.ts': 'x\n' });
  commit(dir, { 'c.ts': 'y\n' });

  git(['checkout', '-b', 'layer1', 'main'], dir);
  commit(dir, { 'a.ts': '1\n2\n', 'b.ts': 'x\n' });
  git(['checkout', '-b', 'layer2'], dir);
  commit(dir, { 'c.ts': 'y\nz\n' });

  const code = runEquivalence({ base: 'main', head: 'feat', layers: ['layer1', 'layer2'], cwd: dir });
  assert.equal(code, 1);
});

test('runEquivalence: camadas em falta → 1', () => {
  const dir = makeRepo();
  commit(dir, { 'a.ts': '1\n' });
  git(['checkout', '-b', 'feat'], dir);
  commit(dir, { 'a.ts': '1\n2\n', 'b.ts': 'x\n' });
  commit(dir, { 'c.ts': 'y\n' });

  git(['checkout', '-b', 'layer1', 'main'], dir);
  commit(dir, { 'a.ts': '1\n2\n', 'b.ts': 'x\n' });

  const code = runEquivalence({ base: 'main', head: 'feat', layers: ['layer1'], cwd: dir });
  assert.equal(code, 1);
});

test('runEquivalence: sem camadas → 2', () => {
  const dir = makeRepo();
  commit(dir, { 'a.ts': '1\n' });
  git(['checkout', '-b', 'feat'], dir);
  commit(dir, { 'a.ts': '1\n2\n' });
  const code = runEquivalence({ base: 'main', head: 'feat', layers: [], cwd: dir });
  assert.equal(code, 2);
});
