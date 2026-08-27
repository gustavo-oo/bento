import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../lib/validate.mjs';
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
