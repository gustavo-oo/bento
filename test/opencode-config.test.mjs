import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addSuperpowersPlugin, SUPERPOWERS_PLUGIN } from '../lib/opencode-config.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'bento-opencode-'));
}

test('add: cria opencode.json com o plugin quando não existe config', () => {
  const dir = tmp();
  const r = addSuperpowersPlugin(dir);
  assert.ok(r);
  assert.equal(r.changed, SUPERPOWERS_PLUGIN);
  assert.ok(r.path.endsWith('opencode.json'));
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.deepEqual(obj.plugin, [SUPERPOWERS_PLUGIN]);
});

test('add: preserva outras chaves do opencode.json', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ theme: 'dark', agent: ['build'] }, null, 2));
  const r = addSuperpowersPlugin(dir);
  assert.ok(r);
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.deepEqual(obj.theme, 'dark');
  assert.deepEqual(obj.agent, ['build']);
  assert.deepEqual(obj.plugin, [SUPERPOWERS_PLUGIN]);
});

test('add: idempotente quando já presente', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ plugin: [SUPERPOWERS_PLUGIN] }, null, 2));
  const before = readFileSync(join(dir, 'opencode.json'), 'utf8');
  assert.equal(addSuperpowersPlugin(dir), null);
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), before);
});

test('add: plugin como string vira array', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ plugin: '@scope/other' }, null, 2));
  const r = addSuperpowersPlugin(dir);
  assert.ok(r);
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.deepEqual(obj.plugin, ['@scope/other', SUPERPOWERS_PLUGIN]);
});

test('add: pin de versão (#v5.0.3) conta como presente', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ plugin: [`${SUPERPOWERS_PLUGIN}#v5.0.3`] }, null, 2));
  const before = readFileSync(join(dir, 'opencode.json'), 'utf8');
  assert.equal(addSuperpowersPlugin(dir), null);
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), before);
});

test('add: com opencode.json e opencode.jsonc, edita o .json', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), '{}');
  writeFileSync(join(dir, 'opencode.jsonc'), '{ // comentario\n}\n');
  const r = addSuperpowersPlugin(dir);
  assert.ok(r.path.endsWith('opencode.json'));
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.deepEqual(obj.plugin, [SUPERPOWERS_PLUGIN]);
  assert.ok(readFileSync(join(dir, 'opencode.jsonc'), 'utf8').includes('comentario'));
});

test('add: jsonc com comentários — preserva e adiciona ao array', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // tema do projeto\n  "theme": "dark",\n  "plugin": [\n    "@scope/a"\n  ]\n}\n');
  const r = addSuperpowersPlugin(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('// tema do projeto'));
  assert.ok(raw.includes('"theme": "dark"'));
  assert.ok(raw.includes('@scope/a'));
  assert.ok(raw.includes(SUPERPOWERS_PLUGIN));
});

test('add: jsonc sem plugin — insere a chave preservando comentários', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{ // topo\n  "a": 1\n}\n');
  const r = addSuperpowersPlugin(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('// topo'));
  assert.ok(raw.includes('"a": 1'));
  assert.ok(raw.includes('"plugin"'));
  assert.ok(raw.includes(SUPERPOWERS_PLUGIN));
});

test('add: arquivo vazio — escreve objeto com plugin', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), '');
  const r = addSuperpowersPlugin(dir);
  assert.ok(r);
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.deepEqual(obj.plugin, [SUPERPOWERS_PLUGIN]);
});

test('add: arquivo inválido (sem chaves) — não altera', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), 'isso não é json');
  assert.equal(addSuperpowersPlugin(dir), null);
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), 'isso não é json');
});

test('add: jsonc com plugin em forma de string — não altera', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{ // x\n  "plugin": "@scope/only"\n}\n');
  const before = readFileSync(join(dir, 'opencode.jsonc'), 'utf8');
  assert.equal(addSuperpowersPlugin(dir), null);
  assert.equal(readFileSync(join(dir, 'opencode.jsonc'), 'utf8'), before);
});