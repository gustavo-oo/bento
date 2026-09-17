import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function skill(name) {
  return readFileSync(new URL(`../skills/${name}/SKILL.md`, import.meta.url), 'utf8');
}

test('self-review: documenta ledger, severidades, repro e gate', () => {
  const raw = skill('self-review');
  assert.match(raw, /^name: self-review$/m);
  assert.ok(raw.includes('.superpowers/self-review/'));
  assert.ok(raw.includes('High'));
  assert.ok(raw.includes('Medium'));
  assert.ok(raw.includes('Low'));
  assert.match(raw, /^## Severidade$/m);
  assert.ok(raw.includes('repro'));
  assert.ok(raw.includes('small-prs'));
  assert.ok(raw.includes('verify'));
  assert.ok(raw.includes('reviewer'));
  assert.ok(raw.includes('finishing-a-development-branch'));
  assert.ok(raw.includes('3 rodadas'));
  assert.ok(raw.includes('local/inequívoco') || raw.includes('local/inequívoca'));
});

test('self-review: proíbe postar no GitHub e editar skills vendadas', () => {
  const raw = skill('self-review');
  assert.ok(raw.includes('GitHub'));
  assert.ok(raw.includes('vendadas'));
});

test('small-prs Modo 4 usa a skill self-review no whole-stack', () => {
  const raw = skill('small-prs');
  assert.ok(raw.includes('self-review'));
});
