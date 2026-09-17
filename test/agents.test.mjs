import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AGENT_MARKER, isBentoAgent, hasBentoAgent, installAgents, removeAgents } from '../lib/agents.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'bento-agents-'));
}

function agentPath(dir, name) {
  return join(dir, '.opencode', 'agents', `${name}.md`);
}

const TEMPLATES = ['flash', 'superpowers', 'explorer', 'verify', 'reviewer', 'browser'];

function template(name) {
  return readFileSync(new URL(`../templates/agents/${name}.md`, import.meta.url), 'utf8');
}

test('templates: frontmatter tem marcador, descrição e mode', () => {
  for (const name of TEMPLATES) {
    const raw = template(name);
    assert.match(raw, /^---\n# bento: agent\b/m, `${name}: marcador`);
    assert.match(raw, /^description: .+$/m, `${name}: description`);
    assert.match(raw, /^mode: (primary|subagent)$/m, `${name}: mode`);
    assert.ok(raw.split('---').length >= 3, `${name}: frontmatter fechado`);
  }
});

test('flash: nega skills do superpowers/agent-browser e MCPs; task fechado nos 3 subagentes', () => {
  const raw = template('flash');
  for (const s of ['brainstorming', 'writing-plans', 'using-superpowers', 'writing-skills', 'agent-browser']) {
    assert.ok(raw.includes(`${s}: deny`), `flash: deny ${s}`);
  }
  assert.ok(raw.includes('"*": allow'));
  assert.ok(raw.includes('"codegraph_*": deny'));
  assert.ok(raw.includes('"agent-browser_*": deny'));
  assert.ok(raw.includes('explorer: allow'));
  assert.ok(raw.includes('verify: allow'));
  assert.ok(raw.includes('browser: allow'));
  assert.ok(raw.includes('reviewer: allow'));
});

test('flash: inclui o gate de self-review no checklist', () => {
  const raw = template('flash');
  assert.ok(raw.includes('self-review'));
});

test('superpowers: bootstrap embutido, tool mapping e copyright/atribuição', () => {
  const raw = template('superpowers');
  assert.ok(raw.includes('<EXTREMELY_IMPORTANT>'));
  assert.ok(raw.includes('using-superpowers'));
  assert.ok(raw.includes('subagent_type: "general"'));
  assert.ok(raw.includes('d884ae04edebef577e82ff7c4e143debd0bbec99'));
  assert.ok(raw.includes('mode: primary'));
});

test('explorer: read-only, codegraph allow, MCPs e skills negados', () => {
  const raw = template('explorer');
  assert.ok(raw.includes('mode: subagent'));
  assert.ok(raw.includes('edit: deny'));
  assert.ok(raw.includes('bash: deny'));
  assert.ok(raw.includes('"codegraph_*": allow'));
  assert.ok(raw.includes('"agent-browser_*": deny'));
  assert.match(raw, /skill:\n\s+"\*": deny/);
});

test('verify: temperature 0, edit deny, allows de verificação', () => {
  const raw = template('verify');
  assert.ok(raw.includes('temperature: 0'));
  assert.ok(raw.includes('edit: deny'));
  assert.ok(raw.includes('"*": ask'));
  assert.ok(raw.includes('"node --test*": allow'));
  assert.ok(raw.includes('"npm test*": allow'));
  assert.ok(raw.includes('"git diff*": allow'));
});

test('browser: agent-browser allow em skill, bash e MCP', () => {
  const raw = template('browser');
  assert.ok(raw.includes('edit: deny'));
  assert.ok(raw.includes('"agent-browser *": allow'));
  assert.ok(raw.includes('"agent-browser_*": allow'));
  assert.match(raw, /skill:\n\s+"\*": deny\n\s+agent-browser: allow/);
});

test('reviewer: read-only adversarial, temp 0, MCPs negados', () => {
  const raw = template('reviewer');
  assert.ok(raw.includes('mode: subagent'));
  assert.ok(raw.includes('temperature: 0'));
  assert.ok(raw.includes('edit: deny'));
  assert.ok(raw.includes('task: deny'));
  assert.match(raw, /skill:\n\s+"\*": deny/);
  assert.ok(raw.includes('"node --test*": allow'));
  assert.ok(raw.includes('"npm test*": allow'));
  assert.ok(raw.includes('"codegraph_*": deny'));
  assert.ok(raw.includes('"agent-browser_*": deny'));
});

test('AGENT_MARKER/isBentoAgent: só reconhece marcador no frontmatter', () => {
  const dir = tmp();
  mkdirSync(join(dir, '.opencode', 'agents'), { recursive: true });
  writeFileSync(agentPath(dir, 'flash'), '---\n# bento: agent v1\n---\n');
  writeFileSync(agentPath(dir, 'user'), '---\ndescription: meu\n---\n');
  writeFileSync(agentPath(dir, 'corpo'), '---\ndescription: meu\n---\n# bento: agent v1\n');
  writeFileSync(agentPath(dir, 'sem-fence'), '# bento: agent v1\n');
  assert.ok(AGENT_MARKER.test('---\n# bento: agent v1\n---\n'));
  assert.ok(isBentoAgent(agentPath(dir, 'flash')));
  assert.ok(!isBentoAgent(agentPath(dir, 'user')));
  assert.ok(!isBentoAgent(agentPath(dir, 'corpo')));
  assert.ok(!isBentoAgent(agentPath(dir, 'sem-fence')));
  assert.ok(!isBentoAgent(agentPath(dir, 'nao-existe')));
});

test('hasBentoAgent: true só quando o agent instalado é do bento', () => {
  const dir = tmp();
  assert.ok(!hasBentoAgent(dir, 'flash'));
  mkdirSync(join(dir, '.opencode', 'agents'), { recursive: true });
  writeFileSync(agentPath(dir, 'flash'), '---\ndescription: meu flash\n---\n');
  assert.ok(!hasBentoAgent(dir, 'flash'));
  writeFileSync(agentPath(dir, 'flash'), '---\n# bento: agent v1\n---\n');
  assert.ok(hasBentoAgent(dir, 'flash'));
});

test('removeAgents: preserva arquivo do usuário com marcador apenas no corpo', () => {
  const dir = tmp();
  mkdirSync(join(dir, '.opencode', 'agents'), { recursive: true });
  writeFileSync(agentPath(dir, 'flash'), '---\ndescription: user\n---\n# bento: agent v1\n');
  const { removed } = removeAgents(dir);
  assert.deepEqual(removed, []);
  assert.ok(existsSync(agentPath(dir, 'flash')));
});

test('installAgents: cria os 6 por padrão, só se ausentes', () => {
  const dir = tmp();
  const r = installAgents(dir);
  assert.deepEqual(r.created.sort(), ['browser', 'explorer', 'flash', 'reviewer', 'superpowers', 'verify']);
  assert.deepEqual(r.skipped, []);
  assert.ok(isBentoAgent(agentPath(dir, 'flash')));
  const second = installAgents(dir);
  assert.deepEqual(second.created, []);
});

test('installAgents: flags pulam agents (profile/superpowers/codegraph/agentBrowser)', () => {
  const dir = tmp();
  const r = installAgents(dir, { profile: false, superpowers: false, codegraph: false, agentBrowser: false });
  assert.deepEqual(r.created, []);
  assert.ok(!existsSync(agentPath(dir, 'flash')));
  assert.ok(!existsSync(agentPath(dir, 'superpowers')));
  const dir2 = tmp();
  const r2 = installAgents(dir2, { profile: false });
  assert.deepEqual(r2.created, ['superpowers']);
  assert.ok(!r2.created.includes('reviewer'));
  const dir3 = tmp();
  const r3 = installAgents(dir3, { codegraph: false });
  assert.ok(!r3.created.includes('explorer'));
  assert.ok(r3.created.includes('browser'));
});

test('installAgents: não sobrescreve arquivo com marcador e avisa sem marcador', (t) => {
  const dir = tmp();
  mkdirSync(join(dir, '.opencode', 'agents'), { recursive: true });
  writeFileSync(agentPath(dir, 'flash'), '---\n# bento: agent v1\ndescription: custom\n---\nmeu corpo\n');
  const mock = t.mock.method(console, 'error', () => {});
  const r = installAgents(dir);
  assert.ok(!r.created.includes('flash'));
  assert.equal(readFileSync(agentPath(dir, 'flash'), 'utf8').includes('meu corpo'), true);

  const dir2 = tmp();
  mkdirSync(join(dir2, '.opencode', 'agents'), { recursive: true });
  writeFileSync(agentPath(dir2, 'verify'), '---\ndescription: meu agent\n---\n');
  const r2 = installAgents(dir2);
  assert.ok(r2.skipped.includes('verify'));
  assert.ok(!r2.created.includes('verify'));
  assert.equal(mock.mock.callCount(), 1);
  assert.ok(mock.mock.calls[0].arguments[0].includes('não é do bento'));
});

test('removeAgents: remove só arquivos com marcador e devolve caminhos', () => {
  const dir = tmp();
  installAgents(dir);
  writeFileSync(agentPath(dir, 'meu'), '---\ndescription: user\n---\n');
  const { removed } = removeAgents(dir);
  assert.equal(removed.length, 6);
  assert.ok(removed.includes('.opencode/agents/flash.md'));
  assert.ok(!existsSync(agentPath(dir, 'flash')));
  assert.ok(existsSync(agentPath(dir, 'meu')));
});
