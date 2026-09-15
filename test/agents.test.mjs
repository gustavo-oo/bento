import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const TEMPLATES = ['flash', 'superpowers', 'explorer', 'verify', 'browser'];

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
