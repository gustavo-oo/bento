import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addSuperpowersPlugin, removeSuperpowersPlugin, SUPERPOWERS_PLUGIN } from '../lib/opencode-config.mjs';

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

test('remove: remove só a entrada superpowers, mantém outros plugins', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ plugin: ['@scope/a', SUPERPOWERS_PLUGIN, '@scope/b'] }, null, 2));
  const r = removeSuperpowersPlugin(dir);
  assert.ok(r);
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.deepEqual(obj.plugin, ['@scope/a', '@scope/b']);
});

test('remove: plugin só com superpowers — arquivo deletado quando fica {}', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ plugin: [SUPERPOWERS_PLUGIN] }, null, 2));
  const r = removeSuperpowersPlugin(dir);
  assert.ok(r);
  assert.ok(!existsSync(join(dir, 'opencode.json')));
});

test('remove: plugin vazio após remoção — chave removida, resto preservado', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ plugin: [SUPERPOWERS_PLUGIN], theme: 'dark' }, null, 2));
  const r = removeSuperpowersPlugin(dir);
  assert.ok(r);
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.equal(obj.plugin, undefined);
  assert.equal(obj.theme, 'dark');
});

test('remove: pin de versão (#v5.0.3) é removido', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ plugin: [`${SUPERPOWERS_PLUGIN}#v5.0.3`] }, null, 2));
  const r = removeSuperpowersPlugin(dir);
  assert.ok(r);
  assert.ok(!existsSync(join(dir, 'opencode.json')));
});

test('remove: jsonc — remove entrada e preserva comentários', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // plugins do projeto\n  "plugin": [\n    "@scope/a",\n    "' + SUPERPOWERS_PLUGIN + '"\n  ],\n  "theme": "dark"\n}\n');
  const r = removeSuperpowersPlugin(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('// plugins do projeto'));
  assert.ok(raw.includes('@scope/a'));
  assert.ok(raw.includes('"theme": "dark"'));
  assert.ok(!raw.includes(SUPERPOWERS_PLUGIN));
});

test('remove: jsonc — array vazio após remoção, chave removida, arquivo preservado', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // so superpowers\n  "plugin": ["' + SUPERPOWERS_PLUGIN + '"]\n}\n');
  const r = removeSuperpowersPlugin(dir);
  assert.ok(r);
  assert.ok(existsSync(join(dir, 'opencode.jsonc')));
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(!raw.includes('plugin'));
  assert.ok(raw.includes('// so superpowers'));
});

test('remove: ausente — retorna null e não altera', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), '{}');
  const before = readFileSync(join(dir, 'opencode.json'), 'utf8');
  assert.equal(removeSuperpowersPlugin(dir), null);
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), before);
});

test('remove: jsonc — sem vírgula órfã quando plugin é primeiro item', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  "plugin": ["' + SUPERPOWERS_PLUGIN + '"],\n  "b": 2\n}\n');
  const r = removeSuperpowersPlugin(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('"b": 2'));
  assert.ok(!raw.includes(','));
  assert.ok(!raw.includes(SUPERPOWERS_PLUGIN));
});

test('remove: jsonc — sem vírgula órfã com comentário entre chave e plugin', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  "a": 1,\n  // c\n  "plugin": ["' + SUPERPOWERS_PLUGIN + '"],\n  "b": 2\n}\n');
  const r = removeSuperpowersPlugin(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('"a": 1'));
  assert.ok(raw.includes('// c'));
  assert.ok(raw.includes('"b": 2'));
  assert.ok(!raw.includes('\n  ,'));
  assert.ok(!raw.includes(SUPERPOWERS_PLUGIN));
});

test('remove: arquivo inválido (sem chaves) — retorna null e não altera', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), 'isso não é json');
  assert.equal(removeSuperpowersPlugin(dir), null);
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), 'isso não é json');
});

test('remove: jsonc com plugin em forma de string — não altera', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{ // x\n  "plugin": "@scope/only"\n}\n');
  const before = readFileSync(join(dir, 'opencode.jsonc'), 'utf8');
  assert.equal(removeSuperpowersPlugin(dir), null);
  assert.equal(readFileSync(join(dir, 'opencode.jsonc'), 'utf8'), before);
});

test('add: .json inválido com chaves — não altera', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), '{ "plugin": [1, 2] "x" }');
  const before = readFileSync(join(dir, 'opencode.json'), 'utf8');
  assert.equal(addSuperpowersPlugin(dir), null);
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), before);
});

test('remove: .jsonc válido sem comentários — não deleta o arquivo', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), JSON.stringify({ plugin: [SUPERPOWERS_PLUGIN] }, null, 2) + '\n');
  const r = removeSuperpowersPlugin(dir);
  assert.ok(r);
  assert.ok(existsSync(join(dir, 'opencode.jsonc')));
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.jsonc'), 'utf8'));
  assert.deepEqual(obj, {});
});

test('add: jsonc — comentário na última linha do array não corrompe a inserção', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  "plugin": [\n    "@scope/a" // nota\n  ]\n}\n');
  const r = addSuperpowersPlugin(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('// nota'));
  assert.ok(raw.includes('@scope/a'));
  assert.ok(raw.includes(SUPERPOWERS_PLUGIN));
  assert.ok(!raw.includes('// nota,'));
});

test('remove: jsonc — sem vírgula pendurada quando plugin é último item', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // c\n  "a": 1,\n  "plugin": ["' + SUPERPOWERS_PLUGIN + '"]\n}\n');
  const r = removeSuperpowersPlugin(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('// c'));
  assert.ok(raw.includes('"a": 1'));
  assert.ok(!raw.includes(','));
  assert.ok(!raw.includes(SUPERPOWERS_PLUGIN));
});

test('remove: duplicatas no jsonc — todas removidas', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // dup\n  "plugin": [\n    "' + SUPERPOWERS_PLUGIN + '",\n    "' + SUPERPOWERS_PLUGIN + '"\n  ]\n}\n');
  const r = removeSuperpowersPlugin(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(!raw.includes(SUPERPOWERS_PLUGIN));
});

test('add: jsonc — plugin com prefixo parecido não conta como presente', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{ // x\n  "plugin": ["x-superpowers@git+https://github.com/obra/superpowers.git"]\n}\n');
  const r = addSuperpowersPlugin(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes(SUPERPOWERS_PLUGIN));
});

test('remove: avisa no stderr para plugin não-array', (t) => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{ // x\n  "plugin": "@scope/only"\n}\n');
  const mock = t.mock.method(console, 'error', () => {});
  assert.equal(removeSuperpowersPlugin(dir), null);
  assert.equal(mock.mock.callCount(), 1);
});
