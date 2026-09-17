import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VENDORED_SKILLS, sameTree, installVendoredSkills, removeVendoredSkills } from '../lib/vendored-skills.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'bento-vendored-'));
}

function makeSource(prefix = 'bento-src-') {
  const root = mkdtempSync(join(tmpdir(), prefix));
  for (const name of ['a', 'b']) {
    mkdirSync(join(root, name), { recursive: true });
    writeFileSync(join(root, name, 'SKILL.md'), `# ${name}\n`);
  }
  mkdirSync(join(root, 'a', 'scripts'), { recursive: true });
  writeFileSync(join(root, 'a', 'scripts', 'helper.js'), 'console.log(1);\n');
  return root;
}

test('VENDORED_SKILLS tem as 14 skills do superpowers e não inclui agent-browser', () => {
  assert.equal(VENDORED_SKILLS.length, 14);
  assert.ok(VENDORED_SKILLS.includes('brainstorming'));
  assert.ok(VENDORED_SKILLS.includes('using-superpowers'));
  assert.ok(!VENDORED_SKILLS.includes('agent-browser'));
  assert.ok(!VENDORED_SKILLS.includes('small-prs'));
});

test('sameTree: igual só com mesmos caminhos e bytes', () => {
  const src = makeSource();
  const project = tmp();
  installVendoredSkills(project, src, ['a', 'b']);
  assert.ok(sameTree(join(src, 'a'), join(project, '.opencode', 'skills', 'a')));
  assert.ok(!sameTree(join(src, 'a'), join(src, 'b')));
  assert.ok(!sameTree(join(src, 'a'), join(project, '.opencode', 'skills', 'nao-existe')));
  const altered = join(tmp(), 'copy');
  cpSync(join(src, 'a'), altered, { recursive: true });
  assert.ok(sameTree(join(src, 'a'), altered));
  writeFileSync(join(altered, 'scripts', 'helper.js'), 'console.log(2);\n');
  assert.ok(!sameTree(join(src, 'a'), altered));
});

test('installVendoredSkills: copia recursivamente (inclui arquivos auxiliares)', () => {
  const src = makeSource();
  const project = tmp();
  const r = installVendoredSkills(project, src, ['a', 'b']);
  assert.deepEqual(r.installed, ['a', 'b']);
  assert.deepEqual(r.skipped, []);
  assert.ok(existsSync(join(project, '.opencode', 'skills', 'a', 'scripts', 'helper.js')));
  assert.equal(readFileSync(join(project, '.opencode', 'skills', 'a', 'SKILL.md'), 'utf8'), '# a\n');
});

test('installVendoredSkills: preserva skill existente com conteúdo diferente (avisa)', (t) => {
  const src = makeSource();
  const project = tmp();
  mkdirSync(join(project, '.opencode', 'skills', 'a'), { recursive: true });
  writeFileSync(join(project, '.opencode', 'skills', 'a', 'SKILL.md'), '# meu\n');
  const mock = t.mock.method(console, 'error', () => {});
  const r = installVendoredSkills(project, src, ['a', 'b']);
  assert.deepEqual(r.installed, ['b']);
  assert.deepEqual(r.skipped, ['a']);
  assert.equal(mock.mock.callCount(), 1);
  assert.ok(mock.mock.calls[0].arguments[0].includes('conteúdo diferente'));
  assert.equal(readFileSync(join(project, '.opencode', 'skills', 'a', 'SKILL.md'), 'utf8'), '# meu\n');
});

test('installVendoredSkills: idempotente quando já idêntica', () => {
  const src = makeSource();
  const project = tmp();
  installVendoredSkills(project, src, ['a']);
  const r = installVendoredSkills(project, src, ['a']);
  assert.deepEqual(r.installed, ['a']);
  assert.deepEqual(r.skipped, []);
});

test('removeVendoredSkills: remove só o que é idêntico à referência', (t) => {
  const src = makeSource();
  const project = tmp();
  installVendoredSkills(project, src, ['a', 'b']);
  mkdirSync(join(project, '.bento', 'skills'), { recursive: true });
  cpSync(join(src, 'a'), join(project, '.bento', 'skills', 'a'), { recursive: true });
  cpSync(join(src, 'b'), join(project, '.bento', 'skills', 'b'), { recursive: true });
  writeFileSync(join(project, '.opencode', 'skills', 'b', 'SKILL.md'), '# modificada\n');
  const mock = t.mock.method(console, 'error', () => {});
  const r = removeVendoredSkills(project, join(project, '.bento', 'skills'), ['a', 'b']);
  assert.deepEqual(r.removed, ['.opencode/skills/a']);
  assert.deepEqual(r.preserved, ['b']);
  assert.ok(!existsSync(join(project, '.opencode', 'skills', 'a')));
  assert.ok(existsSync(join(project, '.opencode', 'skills', 'b')));
  assert.equal(mock.mock.callCount(), 1);
});

test('removeVendoredSkills: preserva quando não há referência em .bento', () => {
  const src = makeSource();
  const project = tmp();
  installVendoredSkills(project, src, ['a']);
  const r = removeVendoredSkills(project, join(project, '.bento', 'skills'), ['a']);
  assert.deepEqual(r.removed, []);
  assert.deepEqual(r.preserved, ['a']);
  assert.ok(existsSync(join(project, '.opencode', 'skills', 'a')));
});

test('installVendoredSkills: atualiza skill nossa desatualizada (destino idêntico à referência anterior)', () => {
  const src = makeSource();
  const project = tmp();
  const ref = join(project, '.bento', 'skills');
  installVendoredSkills(project, src, ['a']);
  mkdirSync(ref, { recursive: true });
  cpSync(join(src, 'a'), join(ref, 'a'), { recursive: true });
  writeFileSync(join(src, 'a', 'SKILL.md'), '# a v2\n');
  const r = installVendoredSkills(project, src, ['a'], ref);
  assert.deepEqual(r.installed, ['a']);
  assert.deepEqual(r.skipped, []);
  assert.equal(readFileSync(join(project, '.opencode', 'skills', 'a', 'SKILL.md'), 'utf8'), '# a v2\n');
});

test('installVendoredSkills: preserva modificada mesmo havendo referência', (t) => {
  const src = makeSource();
  const project = tmp();
  const ref = join(project, '.bento', 'skills');
  installVendoredSkills(project, src, ['a']);
  mkdirSync(ref, { recursive: true });
  cpSync(join(src, 'a'), join(ref, 'a'), { recursive: true });
  writeFileSync(join(project, '.opencode', 'skills', 'a', 'SKILL.md'), '# meu\n');
  const mock = t.mock.method(console, 'error', () => {});
  const r = installVendoredSkills(project, src, ['a'], ref);
  assert.deepEqual(r.installed, []);
  assert.deepEqual(r.skipped, ['a']);
  assert.equal(readFileSync(join(project, '.opencode', 'skills', 'a', 'SKILL.md'), 'utf8'), '# meu\n');
  assert.equal(mock.mock.callCount(), 1);
});

test('installVendoredSkills: origem ausente avisa e pula sem abortar', (t) => {
  const mock = t.mock.method(console, 'error', () => {});
  const r = installVendoredSkills(tmp(), tmp(), ['nao-existe']);
  assert.deepEqual(r.installed, []);
  assert.deepEqual(r.skipped, ['nao-existe']);
  assert.equal(mock.mock.callCount(), 1);
});
