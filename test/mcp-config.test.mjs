import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addMcpServer, removeMcpServer, CODEGRAPH_MCP } from '../lib/mcp-config.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'bento-mcp-'));
}

test('add: cria opencode.json com o servidor quando não existe config', () => {
  const dir = tmp();
  const r = addMcpServer(dir, CODEGRAPH_MCP.name, CODEGRAPH_MCP.command);
  assert.ok(r);
  assert.equal(r.changed, 'codegraph');
  assert.ok(r.path.endsWith('opencode.json'));
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.deepEqual(obj.mcp.codegraph, { type: 'local', command: ['codegraph', 'serve', '--mcp'], enabled: true });
});

test('add: preserva outras chaves e outros MCP servers', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ theme: 'dark', mcp: { sentry: { type: 'remote', url: 'https://x' } } }, null, 2));
  const r = addMcpServer(dir, CODEGRAPH_MCP.name, CODEGRAPH_MCP.command);
  assert.ok(r);
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.deepEqual(obj.theme, 'dark');
  assert.deepEqual(obj.mcp.sentry, { type: 'remote', url: 'https://x' });
  assert.deepEqual(obj.mcp.codegraph.command, ['codegraph', 'serve', '--mcp']);
});

test('add: idempotente quando o nome já existe', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ mcp: { codegraph: { type: 'local', command: ['codegraph', 'serve', '--mcp'] } } }, null, 2));
  const before = readFileSync(join(dir, 'opencode.json'), 'utf8');
  assert.equal(addMcpServer(dir, 'codegraph', ['codegraph', 'serve', '--mcp']), null);
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), before);
});

test('add: jsonc com comentários — preserva e adiciona ao bloco mcp', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // servers do projeto\n  "mcp": {\n    "sentry": {\n      "type": "remote",\n      "url": "https://x"\n    }\n  }\n}\n');
  const r = addMcpServer(dir, CODEGRAPH_MCP.name, CODEGRAPH_MCP.command);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('// servers do projeto'));
  assert.ok(raw.includes('"sentry"'));
  assert.ok(raw.includes('"codegraph"'));
  assert.ok(raw.includes('"serve"'));
});

test('add: jsonc sem mcp — insere a chave preservando comentários', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{ // topo\n  "a": 1\n}\n');
  const r = addMcpServer(dir, CODEGRAPH_MCP.name, CODEGRAPH_MCP.command);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('// topo'));
  assert.ok(raw.includes('"a": 1'));
  assert.ok(raw.includes('"mcp"'));
  assert.ok(raw.includes('"codegraph"'));
});

test('remove: remove só a entrada do nome, mantém outros servers', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ mcp: { sentry: { type: 'remote', url: 'https://x' }, codegraph: { type: 'local', command: ['codegraph', 'serve', '--mcp'] } } }, null, 2));
  const r = removeMcpServer(dir, 'codegraph');
  assert.ok(r);
  assert.equal(r.removed, 'codegraph');
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.equal(obj.mcp.codegraph, undefined);
  assert.deepEqual(obj.mcp.sentry, { type: 'remote', url: 'https://x' });
});

test('remove: mcp vazio após remoção — chave removida; arquivo {} → deletado', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ mcp: { codegraph: { type: 'local', command: ['codegraph', 'serve', '--mcp'] } }, theme: 'dark' }, null, 2));
  const r = removeMcpServer(dir, 'codegraph');
  assert.ok(r);
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.equal(obj.mcp, undefined);
  assert.equal(obj.theme, 'dark');
  const dir2 = tmp();
  writeFileSync(join(dir2, 'opencode.json'), JSON.stringify({ mcp: { codegraph: { type: 'local', command: ['codegraph', 'serve', '--mcp'] } } }, null, 2));
  assert.ok(removeMcpServer(dir2, 'codegraph'));
  assert.ok(!existsSync(join(dir2, 'opencode.json')));
});

test('remove: jsonc — bloco vazio após remoção, chave removida, arquivo preservado', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // so codegraph\n  "mcp": {\n    "codegraph": {\n      "type": "local",\n      "command": ["codegraph", "serve", "--mcp"]\n    }\n  }\n}\n');
  const r = removeMcpServer(dir, 'codegraph');
  assert.ok(r);
  assert.ok(existsSync(join(dir, 'opencode.jsonc')));
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(!raw.includes('mcp'));
  assert.ok(raw.includes('// so codegraph'));
});

test('mcp não-objeto (string) — avisa e não altera (add e remove)', (t) => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{ // x\n  "mcp": "apenas-um-nome"\n}\n');
  const before = readFileSync(join(dir, 'opencode.jsonc'), 'utf8');
  const mock = t.mock.method(console, 'error', () => {});
  assert.equal(addMcpServer(dir, 'codegraph', ['codegraph', 'serve', '--mcp']), null);
  assert.equal(removeMcpServer(dir, 'codegraph'), null);
  assert.equal(mock.mock.callCount(), 2);
  assert.equal(readFileSync(join(dir, 'opencode.jsonc'), 'utf8'), before);
});

test('arquivo inválido (sem chaves) — avisa e não altera', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), 'isso não é json');
  assert.equal(addMcpServer(dir, 'codegraph', ['codegraph', 'serve', '--mcp']), null);
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), 'isso não é json');
});

test('com opencode.json e opencode.jsonc, edita o .json', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), '{}');
  writeFileSync(join(dir, 'opencode.jsonc'), '{ // comentario\n}\n');
  const r = addMcpServer(dir, 'codegraph', ['codegraph', 'serve', '--mcp']);
  assert.ok(r.path.endsWith('opencode.json'));
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.deepEqual(obj.mcp.codegraph.command, ['codegraph', 'serve', '--mcp']);
});

test('add+remove: round-trip em jsonc com comentários volta a um estado válido', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // tema\n  "theme": "dark",\n  "mcp": {\n    "sentry": {\n      "type": "remote",\n      "url": "https://x"\n    }\n  }\n}\n');
  addMcpServer(dir, CODEGRAPH_MCP.name, CODEGRAPH_MCP.command);
  const withCg = readFileSync(join(dir, 'opencode.jsonc'), 'utf8');
  assert.ok(withCg.includes('"codegraph"'));
  removeMcpServer(dir, 'codegraph');
  const back = readFileSync(join(dir, 'opencode.jsonc'), 'utf8');
  assert.ok(back.includes('"sentry"'));
  assert.ok(back.includes('// tema'));
  assert.ok(back.includes('"theme": "dark"'));
  assert.ok(!back.includes('"codegraph"'));
});
