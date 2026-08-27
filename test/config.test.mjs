import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseLimitsYaml, loadLimits, matchesOverride } from '../lib/config.mjs';

test('defaults com yaml vazio', () => {
  const c = parseLimitsYaml('');
  assert.equal(c.maxLines, 400);
  assert.equal(c.maxFiles, 10);
  assert.deepEqual(c.overrides, []);
});

test('parse de chaves top-level', () => {
  const c = parseLimitsYaml('max_lines: 250\nmax_files: 7\n');
  assert.equal(c.maxLines, 250);
  assert.equal(c.maxFiles, 7);
});

test('parse de overrides com glob e max_lines', () => {
  const c = parseLimitsYaml(
    'max_lines: 400\nmax_files: 10\noverrides:\n  - glob: "supabase/migrations/**"\n    max_lines: 200\n'
  );
  assert.equal(c.overrides.length, 1);
  assert.equal(c.overrides[0].glob, 'supabase/migrations/**');
  assert.equal(c.overrides[0].maxLines, 200);
});

test('ignora comentários e chaves desconhecidas', () => {
  const c = parseLimitsYaml('# comentário\nmax_lines: 100\nfoo: bar\n');
  assert.equal(c.maxLines, 100);
});

test('glob matching com ** e *', () => {
  assert.ok(matchesOverride('supabase/migrations/001.sql', { glob: 'supabase/migrations/**' }));
  assert.ok(!matchesOverride('src/lib/x.ts', { glob: 'supabase/migrations/**' }));
  assert.ok(matchesOverride('src/lib/x.ts', { glob: 'src/**' }));
  assert.ok(matchesOverride('src/lib/x.ts', { glob: 'src/*/x.ts' }));
});

test('loadLimits usa defaults quando arquivo ausente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-config-'));
  assert.equal(loadLimits(dir).maxLines, 400);
});

test('loadLimits lê o arquivo do projeto', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-config-'));
  writeFileSync(join(dir, '.pr-limits.yaml'), 'max_lines: 123\n');
  assert.equal(loadLimits(dir).maxLines, 123);
});
