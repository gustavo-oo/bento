import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync, chmodSync } from 'node:fs';
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
  assert.ok(r.stderr.includes('usage:'));
});

test('check: diff acima do limite sai com 1 e reports OVERSIZED PR', () => {
  const dir = makeRepo();
  writeFileSync(join(dir, 'f.txt'), 'v1\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'base'], dir);
  git(['checkout', '-b', 'feat'], dir);
  const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
  writeFileSync(join(dir, 'f.txt'), `${lines}\n`);
  git(['add', '-A'], dir);
  git(['commit', '-m', 'big'], dir);
  writeFileSync(join(dir, '.bento.yaml'), 'max_lines: 5\nmax_files: 10\n');
  const r = spawnSync(process.execPath, [BIN, 'check', 'main'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes('OVERSIZED PR'));
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
  writeFileSync(join(dir, '.bento.yaml'), 'max_lines: 500\nmax_files: 10\n');
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
  writeFileSync(join(dir, '.bento.yaml'), 'max_lines: 400\nmax_files: 10\n');
  const r = spawnSync(process.execPath, [BIN, 'check', 'main'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('PR within limits.'));
});

test('update: instala sem exigir gh', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(existsSync(join(dir, '.opencode', 'skills', 'small-prs', 'SKILL.md')));
});

test('update --language: grava a linguagem dos artefatos em .bento.yaml', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update', '--language', 'Portuguese (pt-BR)', '--no-ponytail', '--no-codegraph', '--no-agent-browser', '--no-profile', '--no-output-style'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('artifacts language'));
  assert.ok(readFileSync(join(dir, '.bento.yaml'), 'utf8').includes('artifacts_language: Portuguese (pt-BR)'));
});

test('update --language=valor: aceita a forma com igual', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update', '--language=Spanish (es)', '--no-ponytail', '--no-codegraph', '--no-agent-browser', '--no-profile', '--no-output-style'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(readFileSync(join(dir, '.bento.yaml'), 'utf8').includes('artifacts_language: Spanish (es)'));
});

test('update --language sem valor: uso inválido e sai 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update', '--language', '--no-ponytail'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.ok(r.stderr.includes('--language requires a value'));
});

test('update: preserva .bento.yaml existente sem perguntar', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  writeFileSync(join(dir, '.bento.yaml'), 'artifacts_language: French\n');
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-ponytail', '--no-codegraph', '--no-agent-browser', '--no-profile', '--no-output-style'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!r.stdout.includes('artifacts language'));
  assert.equal(readFileSync(join(dir, '.bento.yaml'), 'utf8'), 'artifacts_language: French\n');
});

test('update: migra .pr-limits.yaml para .bento.yaml e reporta', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  writeFileSync(join(dir, '.pr-limits.yaml'), 'max_lines: 250\nmax_files: 7\n');
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-ponytail', '--no-codegraph', '--no-agent-browser', '--no-profile', '--no-output-style'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('merged into .bento.yaml'));
  assert.ok(!existsSync(join(dir, '.pr-limits.yaml')));
  const config = readFileSync(join(dir, '.bento.yaml'), 'utf8');
  assert.ok(config.includes('max_lines: 250'));
  assert.ok(config.includes('max_files: 7'));
});

test('update --no-shim preserves an existing shim; without the flag it installs bento\'s', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  const sentinel = '#!/usr/bin/env node\nconsole.log("my shim");\n';
  writeFileSync(join(dir, 'scripts', 'pr-split-verify.mjs'), sentinel);
  const skipped = spawnSync(process.execPath, [BIN, 'update', '--no-shim'], { cwd: dir, encoding: 'utf8' });
  assert.equal(skipped.status, 0);
  assert.equal(readFileSync(join(dir, 'scripts', 'pr-split-verify.mjs'), 'utf8'), sentinel);
  const overwritten = spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(overwritten.status, 0);
  assert.ok(readFileSync(join(dir, 'scripts', 'pr-split-verify.mjs'), 'utf8').includes('../.bento/lib/validate.mjs'));
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
  assert.ok(r.stdout.includes('instructions'));
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'small-prs', 'SKILL.md')));
});

test('update: venda superpowers, cria os agents, define default_agent e mantém ponytail', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('superpowers'));
  assert.ok(r.stdout.includes('ponytail'));
  assert.ok(r.stdout.includes('agents'));
  assert.ok(r.stdout.includes('default_agent'));
  assert.ok(existsSync(join(dir, '.opencode', 'skills', 'brainstorming', 'SKILL.md')));
  assert.ok(existsSync(join(dir, '.opencode', 'agents', 'flash.md')));
  assert.ok(existsSync(join(dir, '.opencode', 'agents', 'verify.md')));
  assert.ok(existsSync(join(dir, '.opencode', 'agents', 'reviewer.md')));
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'orchestrator.md')));
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'implementer.md')));
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.deepEqual(obj.plugin, [PONYTAIL_PLUGIN]);
  assert.equal(obj.default_agent, 'flash');
});

test('update: avisa (e preserva) agents obsoletos de instalações antigas', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  mkdirSync(join(dir, '.opencode', 'agents'), { recursive: true });
  writeFileSync(join(dir, '.opencode', 'agents', 'orchestrator.md'), '---\n# bento: agent v1\ndescription: antigo\n---\n');
  const r = spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stderr.includes('orchestrator'));
  assert.ok(existsSync(join(dir, '.opencode', 'agents', 'orchestrator.md')));
});

test('update: remove o plugin superpowers de instalações antigas', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ plugin: [SUPERPOWERS_PLUGIN] }, null, 2));
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-ponytail', '--no-codegraph', '--no-agent-browser'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('plugin removed'));
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.ok(!(obj.plugin ?? []).includes(SUPERPOWERS_PLUGIN));
});

test('update --no-superpowers: não venda skills e mantém ponytail', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-superpowers'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!r.stdout.includes('superpowers'));
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'brainstorming')));
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'superpowers.md')));
  assert.ok(existsSync(join(dir, '.opencode', 'agents', 'flash.md')));
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.deepEqual(obj.plugin, [PONYTAIL_PLUGIN]);
  assert.equal(obj.default_agent, 'flash');
});

test('update --no-ponytail: não adiciona plugin e define default_agent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-ponytail'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!r.stdout.includes('ponytail'));
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.equal(obj.plugin, undefined);
  assert.equal(obj.default_agent, 'flash');
});

test('update: preserva default_agent definido pelo usuário e avisa', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ default_agent: 'build' }, null, 2));
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-ponytail', '--no-codegraph', '--no-agent-browser'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stderr.includes('default_agent already set'));
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.equal(obj.default_agent, 'build');
});

test('update: flash do usuário (sem marcador) não vira default_agent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  mkdirSync(join(dir, '.opencode', 'agents'), { recursive: true });
  writeFileSync(join(dir, '.opencode', 'agents', 'flash.md'), '---\ndescription: meu flash\n---\n');
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-ponytail', '--no-codegraph', '--no-agent-browser'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.equal(obj.default_agent, undefined);
});

test('update --no-profile: não cria agents do perfil nem default_agent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-profile', '--no-ponytail', '--no-codegraph', '--no-agent-browser', '--no-output-style'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'flash.md')));
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'orchestrator.md')));
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'implementer.md')));
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'superpowers.md')));
  assert.ok(existsSync(join(dir, '.opencode', 'skills', 'brainstorming', 'SKILL.md')));
  assert.ok(!existsSync(join(dir, 'opencode.json')));
});

test('update --no-superpowers --no-ponytail --no-codegraph --no-agent-browser: não toca opencode.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  writeFileSync(join(dir, 'opencode.json'), '{ "theme": "dark" }');
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-superpowers', '--no-ponytail', '--no-codegraph', '--no-agent-browser', '--no-profile', '--no-output-style'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!r.stdout.includes('superpowers'));
  assert.ok(!r.stdout.includes('ponytail'));
  assert.ok(!r.stdout.includes('codegraph'));
  assert.ok(!r.stdout.includes('agent-browser'));
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), '{ "theme": "dark" }');
});

test('uninstall: remove o plugin superpowers pré-existente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ plugin: [SUPERPOWERS_PLUGIN] }, null, 2));
  const r = spawnSync(process.execPath, [BIN, 'uninstall'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('superpowers'));
  assert.ok(!existsSync(join(dir, 'opencode.json')));
});

test('uninstall: remove default_agent do bento e preserva o do usuário', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  const r = spawnSync(process.execPath, [BIN, 'uninstall'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!existsSync(join(dir, 'opencode.json')));

  const dir2 = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  writeFileSync(join(dir2, 'opencode.json'), JSON.stringify({ default_agent: 'build' }, null, 2));
  spawnSync(process.execPath, [BIN, 'update', '--no-ponytail', '--no-codegraph', '--no-agent-browser'], { cwd: dir2, encoding: 'utf8' });
  const r2 = spawnSync(process.execPath, [BIN, 'uninstall'], { cwd: dir2, encoding: 'utf8' });
  assert.equal(r2.status, 0);
  const obj = JSON.parse(readFileSync(join(dir2, 'opencode.json'), 'utf8'));
  assert.equal(obj.default_agent, 'build');
});

test('uninstall: não toca em ferramentas globais (gh-stack, codegraph, agent-browser)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  const fakeBin = mkdtempSync(join(tmpdir(), 'bento-fake-'));
  const log = join(fakeBin, 'calls.log');
  for (const name of ['npm', 'gh']) {
    writeFileSync(join(fakeBin, name), `#!/bin/sh\necho "${name} $@" >> ${JSON.stringify(log)}\n`);
    chmodSync(join(fakeBin, name), 0o755);
  }
  const r = spawnSync(process.execPath, [BIN, 'uninstall'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` },
  });
  assert.equal(r.status, 0);
  const calls = existsSync(log) ? readFileSync(log, 'utf8') : '';
  assert.equal(calls, '', `chamadas globais inesperadas:\n${calls}`);
});

test('uninstall: remove o agent reviewer', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  const r = spawnSync(process.execPath, [BIN, 'uninstall'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'reviewer.md')));
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
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'explorer.md')));
  assert.ok(existsSync(join(dir, '.opencode', 'agents', 'browser.md')));
});

test('update --no-agent-browser: adiciona só codegraph ao mcp e não copia a skill', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-agent-browser'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.equal(obj.mcp['agent-browser'], undefined);
  assert.deepEqual(obj.mcp.codegraph.command, ['codegraph', 'serve', '--mcp']);
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'agent-browser', 'SKILL.md')));
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'browser.md')));
  assert.ok(existsSync(join(dir, '.opencode', 'agents', 'explorer.md')));
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

test('update: configura core.hooksPath em repo git', () => {
  const dir = makeRepo();
  const r = spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('pre-push'));
  const hp = execFileSync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: dir, encoding: 'utf8' }).trim();
  assert.equal(hp, '.bento/hooks');
});

test('update --no-hooks: não configura hooksPath nem copia hook', () => {
  const dir = makeRepo();
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-hooks'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!r.stdout.includes('pre-push'));
  assert.ok(!existsSync(join(dir, '.bento', 'hooks', 'pre-push')));
  const hp = spawnSync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: dir, encoding: 'utf8' });
  assert.equal(hp.status, 1);
});

test('update --no-hooks: avisa que o pre-push continua ativo de install anterior', () => {
  const dir = makeRepo();
  const first = spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(first.status, 0);
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-hooks'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stderr.includes('pre-push still active'));
  const hp = execFileSync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: dir, encoding: 'utf8' }).trim();
  assert.equal(hp, '.bento/hooks');
});

test('uninstall: remove core.hooksPath do bento', () => {
  const dir = makeRepo();
  const upd = spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(upd.status, 0);
  const r = spawnSync(process.execPath, [BIN, 'uninstall'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('pre-push'));
  const hp = spawnSync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: dir, encoding: 'utf8' });
  assert.equal(hp.status, 1);
});

test('update --no-superpowers: preserva plugin superpowers pré-existente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ plugin: [SUPERPOWERS_PLUGIN] }, null, 2));
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-superpowers'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.ok(obj.plugin.includes(SUPERPOWERS_PLUGIN));
});

test('update: registra o instructions do output style e loga', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('instructions'));
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.deepEqual(obj.instructions, ['.opencode/instructions/i-have-adhd.md']);
  assert.ok(existsSync(join(dir, '.opencode', 'instructions', 'i-have-adhd.md')));
});

test('update --no-output-style: não copia nem registra, sem tocar no config', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-output-style', '--no-ponytail', '--no-codegraph', '--no-agent-browser', '--no-profile'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!r.stdout.includes('instructions'));
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'i-have-adhd')));
  assert.ok(!existsSync(join(dir, '.opencode', 'instructions')));
  assert.ok(!existsSync(join(dir, 'opencode.json')));
});

test('uninstall: remove o instructions do config e os arquivos', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  const r = spawnSync(process.execPath, [BIN, 'uninstall'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!existsSync(join(dir, '.opencode', 'instructions', 'i-have-adhd.md')));
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'i-have-adhd')));
  assert.ok(!existsSync(join(dir, 'opencode.json')));
});
