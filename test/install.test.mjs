import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs';
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

test('install: copia a skill self-review', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-'));
  install(dir, {});
  const src = readFileSync(new URL('../skills/self-review/SKILL.md', import.meta.url), 'utf8');
  assert.equal(readFileSync(join(dir, '.opencode', 'skills', 'self-review', 'SKILL.md'), 'utf8'), src);
  assert.ok(existsSync(join(dir, '.opencode', 'agents', 'reviewer.md')));
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

test('install: seção do AGENTS.md cita o gate de self-review', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-'));
  install(dir, {});
  const agents = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
  assert.ok(agents.includes('self-review'));
  assert.ok(agents.includes('@reviewer'));
});

test('install: avisa quando flash e seção existentes não citam o self-review', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-stale-'));
  mkdirSync(join(dir, '.opencode', 'agents'), { recursive: true });
  writeFileSync(join(dir, '.opencode', 'agents', 'flash.md'), '---\n# bento: agent v1\ndescription: antigo\n---\nvelho\n');
  writeFileSync(join(dir, 'AGENTS.md'), '## Bento (small-prs)\n\n- regra antiga\n');
  const mock = t.mock.method(console, 'error', () => {});
  install(dir, {});
  const calls = mock.mock.calls.map((c) => c.arguments[0]);
  assert.ok(calls.some((m) => m.includes('flash.md não cita o gate')), calls.join('\n'));
  assert.ok(calls.some((m) => m.includes('seção ## Bento existente não cita o self-review')), calls.join('\n'));
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

test('uninstall: remove a skill taste-skill', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-uninstall-taste-'));
  install(dir, {});
  const { removed } = uninstall(dir);
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'taste-skill')));
  assert.ok(removed.includes('.opencode/skills/taste-skill'));
});

test('uninstall: remove a skill self-review', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-uninstall-'));
  install(dir, {});
  const { removed } = uninstall(dir);
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'self-review')));
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'reviewer.md')));
  assert.ok(removed.includes('.opencode/skills/self-review'));
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

test('install: copia a skill agent-browser; noAgentBrowser pula', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-'));
  install(dir, {});
  assert.ok(existsSync(join(dir, '.opencode', 'skills', 'agent-browser', 'SKILL.md')));
  const dir2 = mkdtempSync(join(tmpdir(), 'bento-install-'));
  install(dir2, { noAgentBrowser: true });
  assert.ok(!existsSync(join(dir2, '.opencode', 'skills', 'agent-browser')));
});

test('uninstall: remove a skill agent-browser', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-uninstall-'));
  install(dir, {});
  const { removed } = uninstall(dir);
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'agent-browser')));
  assert.ok(removed.includes('.opencode/skills/agent-browser'));
});

test('install: copia hook pre-push executável em .bento/hooks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-'));
  install(dir, {});
  const hookPath = join(dir, '.bento', 'hooks', 'pre-push');
  assert.ok(existsSync(hookPath));
  assert.notEqual(statSync(hookPath).mode & 0o111, 0);
  assert.ok(readFileSync(hookPath, 'utf8').includes('pr-split-verify.mjs check'));
});

test('install: noHooks não copia o hook', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-'));
  install(dir, { noHooks: true });
  assert.ok(!existsSync(join(dir, '.bento', 'hooks', 'pre-push')));
});

test('install: venda as 14 skills do superpowers (diretório completo)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-vendored-install-'));
  install(dir, {});
  const src = readFileSync(new URL('../skills/brainstorming/SKILL.md', import.meta.url), 'utf8');
  const dest = readFileSync(join(dir, '.opencode', 'skills', 'brainstorming', 'SKILL.md'), 'utf8');
  assert.equal(dest, src);
  assert.ok(existsSync(join(dir, '.opencode', 'skills', 'brainstorming', 'visual-companion.md')));
  assert.ok(existsSync(join(dir, '.opencode', 'skills', 'using-superpowers', 'references', 'pi-tools.md')));
});

test('install: preserva skill vendada divergente e avisa', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-vendored-install-'));
  mkdirSync(join(dir, '.opencode', 'skills', 'writing-plans'), { recursive: true });
  writeFileSync(join(dir, '.opencode', 'skills', 'writing-plans', 'SKILL.md'), '# meu\n');
  const mock = t.mock.method(console, 'error', () => {});
  install(dir, {});
  assert.equal(readFileSync(join(dir, '.opencode', 'skills', 'writing-plans', 'SKILL.md'), 'utf8'), '# meu\n');
  assert.ok(mock.mock.calls.some((c) => c.arguments[0].includes('conteúdo diferente')));
});

test('install: noSuperpowers não venda skills nem cria o agent superpowers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-vendored-install-'));
  install(dir, { noSuperpowers: true });
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'brainstorming')));
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'superpowers.md')));
  assert.ok(existsSync(join(dir, '.opencode', 'agents', 'flash.md')));
});

test('install: noSuperpowers preserva o snapshot anterior de .bento/skills', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-vendored-snapshot-'));
  install(dir, {});
  writeFileSync(join(dir, '.bento', 'skills', 'brainstorming', 'SKILL.md'), '# snapshot antigo\n');
  install(dir, { noSuperpowers: true });
  assert.equal(readFileSync(join(dir, '.bento', 'skills', 'brainstorming', 'SKILL.md'), 'utf8'), '# snapshot antigo\n');
  install(dir, {});
  const src = readFileSync(new URL('../skills/brainstorming/SKILL.md', import.meta.url), 'utf8');
  assert.equal(readFileSync(join(dir, '.bento', 'skills', 'brainstorming', 'SKILL.md'), 'utf8'), src);
});

test('install: refresh de .bento/skills substitui a árvore (remove órfão)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-vendored-refresh-'));
  install(dir, {});
  writeFileSync(join(dir, '.bento', 'skills', 'brainstorming', 'extra.md'), 'orfao\n');
  install(dir, {});
  assert.ok(!existsSync(join(dir, '.bento', 'skills', 'brainstorming', 'extra.md')));
});

test('install: noProfile não cria agents do perfil; noCodegraph/noAgentBrowser pulam explorer/browser', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-agents-install-'));
  install(dir, { noProfile: true });
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'flash.md')));
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'reviewer.md')));
  assert.ok(existsSync(join(dir, '.opencode', 'skills', 'brainstorming')));
  const dir2 = mkdtempSync(join(tmpdir(), 'bento-agents-install-'));
  install(dir2, { noCodegraph: true, noAgentBrowser: true });
  assert.ok(!existsSync(join(dir2, '.opencode', 'agents', 'explorer.md')));
  assert.ok(!existsSync(join(dir2, '.opencode', 'agents', 'browser.md')));
  assert.ok(existsSync(join(dir2, '.opencode', 'agents', 'flash.md')));
});

test('install: cria agents com marcador e não sobrescreve existente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-agents-install-'));
  mkdirSync(join(dir, '.opencode', 'agents'), { recursive: true });
  writeFileSync(join(dir, '.opencode', 'agents', 'flash.md'), '---\n# bento: agent v1\ndescription: meu\n---\nmeu corpo\n');
  install(dir, {});
  assert.ok(readFileSync(join(dir, '.opencode', 'agents', 'flash.md'), 'utf8').includes('meu corpo'));
  assert.ok(readFileSync(join(dir, '.opencode', 'agents', 'verify.md'), 'utf8').includes('# bento: agent'));
});

test('uninstall: remove skills vendadas idênticas e preserva divergentes', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-vendored-uninstall-'));
  install(dir, {});
  writeFileSync(join(dir, '.opencode', 'skills', 'writing-plans', 'SKILL.md'), '# modificada\n');
  const mock = t.mock.method(console, 'error', () => {});
  const { removed } = uninstall(dir);
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'brainstorming')));
  assert.ok(removed.includes('.opencode/skills/brainstorming'));
  assert.ok(existsSync(join(dir, '.opencode', 'skills', 'writing-plans')));
  assert.ok(!removed.includes('.opencode/skills/writing-plans'));
  assert.ok(mock.mock.calls.some((c) => c.arguments[0].includes('modificada')));
});

test('uninstall: remove agents com marcador e preserva agent do usuário', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-agents-uninstall-'));
  install(dir, {});
  writeFileSync(join(dir, '.opencode', 'agents', 'meu.md'), '---\ndescription: user\n---\n');
  const { removed } = uninstall(dir);
  assert.ok(removed.includes('.opencode/agents/flash.md'));
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'flash.md')));
  assert.ok(existsSync(join(dir, '.opencode', 'agents', 'meu.md')));
});

test('install: atualiza venda nossa desatualizada e uninstall remove depois', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-vendored-update-'));
  install(dir, {});
  writeFileSync(join(dir, '.opencode', 'skills', 'brainstorming', 'SKILL.md'), '# v-old\n');
  writeFileSync(join(dir, '.bento', 'skills', 'brainstorming', 'SKILL.md'), '# v-old\n');
  install(dir, {});
  const src = readFileSync(new URL('../skills/brainstorming/SKILL.md', import.meta.url), 'utf8');
  assert.equal(readFileSync(join(dir, '.opencode', 'skills', 'brainstorming', 'SKILL.md'), 'utf8'), src);
  const { removed } = uninstall(dir);
  assert.ok(removed.includes('.opencode/skills/brainstorming'));
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'brainstorming')));
});
