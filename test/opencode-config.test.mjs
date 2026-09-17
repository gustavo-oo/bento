import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addPlugin, addPonytailPlugin, addSuperpowersPlugin, addInstructionsEntry, removeInstructionsEntry, removePlugin, removePonytailPlugin, removeSuperpowersPlugin, setDefaultAgentIfAbsent, removeDefaultAgentIf, BENTO_DEFAULT_AGENT, PONYTAIL_PLUGIN, SUPERPOWERS_PLUGIN, OUTPUT_STYLE_INSTRUCTIONS } from '../lib/opencode-config.mjs';

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

test('add: jsonc — comentário na mesma linha do fechamento não engole a vírgula', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{ // x\n  "plugin": ["@scope/a" // nota]\n}\n');
  const r = addSuperpowersPlugin(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('@scope/a'));
  assert.ok(raw.includes('// nota'));
  assert.ok(raw.includes(SUPERPOWERS_PLUGIN));
  assert.ok(!raw.includes('// nota,'));
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

test('remove: jsonc — vírgula e comentário na mesma linha da chave anterior', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  "a": 1, // nota\n  "plugin": ["' + SUPERPOWERS_PLUGIN + '"]\n}\n');
  const r = removeSuperpowersPlugin(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('"a": 1 // nota'));
  assert.ok(!raw.includes(SUPERPOWERS_PLUGIN));
});

test('remove: jsonc — comentário após a entrada removida não quebra o arquivo', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // sp\n  "plugin": [\n    "' + SUPERPOWERS_PLUGIN + '" // sp plugin\n  ],\n  "a": 1\n}\n');
  const r = removeSuperpowersPlugin(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('"a": 1'));
  assert.ok(!raw.includes(SUPERPOWERS_PLUGIN));
});

test('add: opencode.json é um diretório — avisa e não quebra', () => {
  const dir = tmp();
  mkdirSync(join(dir, 'opencode.json'));
  assert.equal(addSuperpowersPlugin(dir), null);
});

test('round-trip: add + remove em jsonc com comentários volta a um estado válido', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // tema\n  "theme": "dark",\n  "plugin": ["@scope/a"]\n}\n');
  addSuperpowersPlugin(dir);
  const withSp = readFileSync(join(dir, 'opencode.jsonc'), 'utf8');
  assert.ok(withSp.includes(SUPERPOWERS_PLUGIN));
  removeSuperpowersPlugin(dir);
  const back = readFileSync(join(dir, 'opencode.jsonc'), 'utf8');
  assert.ok(back.includes('@scope/a'));
  assert.ok(back.includes('// tema'));
  assert.ok(back.includes('"theme": "dark"'));
  assert.ok(!back.includes(SUPERPOWERS_PLUGIN));
});

test('remove: jsonc — comentário na entrada restante não engole o fechamento', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  "plugin": [\n    "@scope/a" // nota\n    ,\n    "' + SUPERPOWERS_PLUGIN + '"\n  ],\n  "theme": "dark"\n}\n');
  const r = removeSuperpowersPlugin(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('@scope/a'));
  assert.ok(raw.includes('// nota'));
  assert.ok(raw.includes('"theme": "dark"'));
  assert.ok(!raw.includes(SUPERPOWERS_PLUGIN));
  assert.ok(!raw.includes('// nota]'));
});

test('remove: opencode.json é um diretório — avisa e não quebra', () => {
  const dir = tmp();
  mkdirSync(join(dir, 'opencode.json'));
  assert.equal(removeSuperpowersPlugin(dir), null);
});

test('addPlugin genérico: cria opencode.json com plugin arbitrário', () => {
  const dir = tmp();
  const r = addPlugin(dir, '@scope/third');
  assert.ok(r);
  assert.equal(r.changed, '@scope/third');
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.deepEqual(obj.plugin, ['@scope/third']);
});

test('removePlugin genérico: remove plugin arbitrário mantendo outros', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ plugin: ['@scope/a', '@scope/third'] }, null, 2));
  const r = removePlugin(dir, '@scope/third');
  assert.ok(r);
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.deepEqual(obj.plugin, ['@scope/a']);
});

test('add ponytail: cria opencode.json com o plugin quando não existe config', () => {
  const dir = tmp();
  const r = addPonytailPlugin(dir);
  assert.ok(r);
  assert.equal(r.changed, PONYTAIL_PLUGIN);
  assert.ok(r.path.endsWith('opencode.json'));
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.deepEqual(obj.plugin, [PONYTAIL_PLUGIN]);
});

test('add ponytail: preserva outras chaves e o plugin superpowers', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ theme: 'dark', plugin: [SUPERPOWERS_PLUGIN] }, null, 2));
  const r = addPonytailPlugin(dir);
  assert.ok(r);
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.deepEqual(obj.theme, 'dark');
  assert.deepEqual(obj.plugin, [SUPERPOWERS_PLUGIN, PONYTAIL_PLUGIN]);
});

test('add ponytail: idempotente quando já presente', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ plugin: [PONYTAIL_PLUGIN] }, null, 2));
  const before = readFileSync(join(dir, 'opencode.json'), 'utf8');
  assert.equal(addPonytailPlugin(dir), null);
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), before);
});

test('add ponytail: jsonc com comentários — preserva e adiciona ao array', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // plugins do projeto\n  "plugin": [\n    "@scope/a"\n  ]\n}\n');
  const r = addPonytailPlugin(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('// plugins do projeto'));
  assert.ok(raw.includes('@scope/a'));
  assert.ok(raw.includes(PONYTAIL_PLUGIN));
});

test('remove ponytail: remove só a entrada ponytail, mantém superpowers e outros', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ plugin: ['@scope/a', SUPERPOWERS_PLUGIN, PONYTAIL_PLUGIN] }, null, 2));
  const r = removePonytailPlugin(dir);
  assert.ok(r);
  assert.equal(r.removed, PONYTAIL_PLUGIN);
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.deepEqual(obj.plugin, ['@scope/a', SUPERPOWERS_PLUGIN]);
});

test('remove ponytail: ausente — retorna null e não altera', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ plugin: ['@scope/a'] }, null, 2));
  const before = readFileSync(join(dir, 'opencode.json'), 'utf8');
  assert.equal(removePonytailPlugin(dir), null);
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), before);
});

test('remove ponytail: plugin vazio após remoção — chave removida, resto preservado', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ plugin: [PONYTAIL_PLUGIN], theme: 'dark' }, null, 2));
  const r = removePonytailPlugin(dir);
  assert.ok(r);
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.equal(obj.plugin, undefined);
  assert.equal(obj.theme, 'dark');
});

test('remove ponytail: arquivo {} após remoção — deletado', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ plugin: [PONYTAIL_PLUGIN] }, null, 2));
  const r = removePonytailPlugin(dir);
  assert.ok(r);
  assert.ok(!existsSync(join(dir, 'opencode.json')));
});

test('add ponytail: jsonc com plugin em forma de string — avisa e não altera', (t) => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{ // x\n  "plugin": "@scope/only"\n}\n');
  const before = readFileSync(join(dir, 'opencode.jsonc'), 'utf8');
  const mock = t.mock.method(console, 'error', () => {});
  assert.equal(addPonytailPlugin(dir), null);
  assert.equal(mock.mock.callCount(), 1);
  assert.ok(mock.mock.calls[0].arguments[0].includes('ponytail'));
  assert.equal(readFileSync(join(dir, 'opencode.jsonc'), 'utf8'), before);
});

test('default_agent: set cria opencode.json quando não existe config', () => {
  const dir = tmp();
  const r = setDefaultAgentIfAbsent(dir);
  assert.ok(r);
  assert.equal(r.changed, 'default_agent');
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.equal(obj.default_agent, BENTO_DEFAULT_AGENT);
});

test('default_agent: set define quando ausente e preserva outras chaves', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ theme: 'dark' }, null, 2));
  const r = setDefaultAgentIfAbsent(dir, 'flash');
  assert.ok(r);
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.equal(obj.default_agent, 'flash');
  assert.equal(obj.theme, 'dark');
});

test('default_agent: set com valor presente — skip, avisa e não altera', (t) => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ default_agent: 'build' }, null, 2));
  const before = readFileSync(join(dir, 'opencode.json'), 'utf8');
  const mock = t.mock.method(console, 'error', () => {});
  const r = setDefaultAgentIfAbsent(dir);
  assert.deepEqual(r, { skipped: true, value: 'build' });
  assert.equal(mock.mock.callCount(), 1);
  assert.ok(mock.mock.calls[0].arguments[0].includes('já definido'));
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), before);
});

test('default_agent: set em jsonc insere preservando comentários', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // topo\n  "theme": "dark"\n}\n');
  const r = setDefaultAgentIfAbsent(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('// topo'));
  assert.ok(raw.includes('"theme": "dark"'));
  assert.ok(raw.includes('"default_agent": "flash"'));
});

test('default_agent: set em jsonc com chave presente — skip', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // c\n  "default_agent": "build"\n}\n');
  const before = readFileSync(join(dir, 'opencode.jsonc'), 'utf8');
  const r = setDefaultAgentIfAbsent(dir);
  assert.deepEqual(r, { skipped: true, value: 'build' });
  assert.equal(readFileSync(join(dir, 'opencode.jsonc'), 'utf8'), before);
});

test('default_agent: set com json inválido — avisa e não altera', (t) => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), 'isso não é json');
  const mock = t.mock.method(console, 'error', () => {});
  assert.equal(setDefaultAgentIfAbsent(dir), null);
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), 'isso não é json');
  assert.equal(mock.mock.callCount(), 1);
});

test('default_agent: set edita o .json quando os dois existem', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), '{}');
  writeFileSync(join(dir, 'opencode.jsonc'), '{ // c\n}\n');
  const r = setDefaultAgentIfAbsent(dir);
  assert.ok(r.path.endsWith('opencode.json'));
  assert.ok(readFileSync(join(dir, 'opencode.jsonc'), 'utf8').includes('// c'));
});

test('default_agent: remove só com valor igual; arquivo {} é deletado', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ default_agent: 'flash' }, null, 2));
  const r = removeDefaultAgentIf(dir);
  assert.ok(r);
  assert.ok(!existsSync(join(dir, 'opencode.json')));
});

test('default_agent: remove preserva outras chaves', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ default_agent: 'flash', theme: 'dark' }, null, 2));
  const r = removeDefaultAgentIf(dir);
  assert.ok(r);
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.equal(obj.default_agent, undefined);
  assert.equal(obj.theme, 'dark');
});

test('default_agent: remove com valor diferente — null e inalterado', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ default_agent: 'build' }, null, 2));
  const before = readFileSync(join(dir, 'opencode.json'), 'utf8');
  assert.equal(removeDefaultAgentIf(dir), null);
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), before);
});

test('default_agent: remove em jsonc preserva comentários e não deleta arquivo', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // nota\n  "default_agent": "flash",\n  "theme": "dark"\n}\n');
  const r = removeDefaultAgentIf(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('// nota'));
  assert.ok(raw.includes('"theme": "dark"'));
  assert.ok(!raw.includes('default_agent'));
  assert.ok(existsSync(r.path));
});

test('default_agent: remove em jsonc sozinho vira {} escrito', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  "default_agent": "flash"\n}\n');
  const r = removeDefaultAgentIf(dir);
  assert.ok(r);
  assert.equal(readFileSync(r.path, 'utf8'), '{}\n');
});

test('default_agent: remove em jsonc só com comentário preserva o comentário', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // nota\n  "default_agent": "flash"\n}\n');
  const r = removeDefaultAgentIf(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('// nota'));
  assert.ok(!raw.includes('default_agent'));
  assert.notEqual(raw, '{}\n');
});

test('default_agent: remove com json inválido — avisa e não altera', (t) => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), '{ "default_agent": }');
  const mock = t.mock.method(console, 'error', () => {});
  assert.equal(removeDefaultAgentIf(dir), null);
  assert.equal(mock.mock.callCount(), 1);
});

test('default_agent: set em jsonc ignora chave apenas comentada', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // "default_agent": "build"\n  "theme": "dark"\n}\n');
  const r = setDefaultAgentIfAbsent(dir);
  assert.ok(r);
  assert.equal(r.changed, 'default_agent');
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('// "default_agent": "build"'));
  assert.match(raw, /^\s*"default_agent"\s*:\s*"flash"/m);
});

test('default_agent: set em jsonc ignora chave em comentário de bloco', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  /* "default_agent": "build" */\n  "theme": "dark"\n}\n');
  const r = setDefaultAgentIfAbsent(dir);
  assert.ok(r);
  assert.equal(r.changed, 'default_agent');
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('/* "default_agent": "build" */'));
  assert.match(raw, /^\s*"default_agent"\s*:\s*"flash"/m);
});

test('default_agent: set em jsonc com chave real e comentada — skip com o valor real', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // "default_agent": "build"\n  "default_agent": "flash"\n}\n');
  const before = readFileSync(join(dir, 'opencode.jsonc'), 'utf8');
  const r = setDefaultAgentIfAbsent(dir);
  assert.deepEqual(r, { skipped: true, value: 'flash' });
  assert.equal(readFileSync(join(dir, 'opencode.jsonc'), 'utf8'), before);
});

test('default_agent: remove em jsonc com chave apenas comentada — null e inalterado', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // "default_agent": "flash"\n  "theme": "dark"\n}\n');
  const before = readFileSync(join(dir, 'opencode.jsonc'), 'utf8');
  assert.equal(removeDefaultAgentIf(dir), null);
  assert.equal(readFileSync(join(dir, 'opencode.jsonc'), 'utf8'), before);
});

test('default_agent: remove em jsonc com chave real e comentada — preserva o comentário', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // "default_agent": "build"\n  "default_agent": "flash",\n  "theme": "dark"\n}\n');
  const r = removeDefaultAgentIf(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('// "default_agent": "build"'));
  assert.ok(raw.includes('"theme": "dark"'));
  assert.ok(!raw.includes('"default_agent": "flash"'));
  assert.ok(!raw.includes(','));
});

test('add: jsonc — "plugin" apenas em comentário não conta como presente', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // "plugin": ["@scope/a"]\n  "theme": "dark"\n}\n');
  const r = addSuperpowersPlugin(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('// "plugin": ["@scope/a"]'));
  assert.ok(raw.includes('"theme": "dark"'));
  assert.ok(raw.includes(SUPERPOWERS_PLUGIN));
  assert.match(raw, /^\s*"plugin"\s*:/m);
});

test('add: jsonc — string com URL não é tratada como comentário na detecção', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // exemplo: "plugin": ["@scope/old"]\n  "url": "https://x", "plugin": ["@scope/a"]\n}\n');
  const r = addSuperpowersPlugin(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('// exemplo: "plugin": ["@scope/old"]'));
  assert.ok(raw.includes('"@scope/a"'));
  assert.ok(raw.includes(SUPERPOWERS_PLUGIN));
  assert.equal(raw.match(/"plugin"\s*:/g).length, 2);
});

test('add: jsonc — chave { em comentário não desloca a inserção', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '// { anotação\n{\n  "a": 1\n}\n');
  const r = addSuperpowersPlugin(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('// { anotação'));
  assert.ok(raw.includes('"a": 1'));
  assert.ok(raw.includes(SUPERPOWERS_PLUGIN));
  assert.match(raw, /^\s*"plugin"\s*:/m);
});

test('remove: jsonc — "plugin" apenas em comentário não é removido', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // "plugin": ["' + SUPERPOWERS_PLUGIN + '"]\n  "theme": "dark"\n}\n');
  const before = readFileSync(join(dir, 'opencode.jsonc'), 'utf8');
  assert.equal(removeSuperpowersPlugin(dir), null);
  assert.equal(readFileSync(join(dir, 'opencode.jsonc'), 'utf8'), before);
});

test('add: jsonc — valor real string e comentário com "plugin" array não corrompe o config', (t) => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), `{\n  // "plugin": ["${SUPERPOWERS_PLUGIN}"]\n  "plugin": "@scope/only"\n}\n`);
  const before = readFileSync(join(dir, 'opencode.jsonc'), 'utf8');
  const mock = t.mock.method(console, 'error', () => {});
  assert.equal(addSuperpowersPlugin(dir), null);
  assert.equal(mock.mock.callCount(), 1);
  assert.equal(readFileSync(join(dir, 'opencode.jsonc'), 'utf8'), before);
});

test('remove: jsonc — valor real string e comentário com "plugin" array não remove o comentário', (t) => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), `{\n  // "plugin": ["${SUPERPOWERS_PLUGIN}"]\n  "plugin": "@scope/only"\n}\n`);
  const before = readFileSync(join(dir, 'opencode.jsonc'), 'utf8');
  const mock = t.mock.method(console, 'error', () => {});
  assert.equal(removeSuperpowersPlugin(dir), null);
  assert.equal(mock.mock.callCount(), 1);
  assert.equal(readFileSync(join(dir, 'opencode.jsonc'), 'utf8'), before);
});

test('add: jsonc — ] dentro de string no array não corrompe a inserção', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  "plugin": ["a]b"] // c\n}\n');
  const r = addSuperpowersPlugin(dir);
  assert.ok(r);
  assert.equal(
    readFileSync(r.path, 'utf8'),
    `{\n  "plugin": ["a]b"\n  ,\n    "${SUPERPOWERS_PLUGIN}"\n  ] // c\n}\n`,
  );
});

test('remove: jsonc — ] dentro de string no array não corrompe a remoção', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), `{\n  // c\n  "plugin": ["${SUPERPOWERS_PLUGIN}", "x]y"]\n}\n`);
  const r = removeSuperpowersPlugin(dir);
  assert.ok(r);
  assert.equal(readFileSync(r.path, 'utf8'), '{\n  // c\n  "plugin": ["x]y"\n  ]\n}\n');
});

test('instructions: add cria opencode.json quando não existe config', () => {
  const dir = tmp();
  const r = addInstructionsEntry(dir);
  assert.ok(r);
  assert.equal(r.changed, OUTPUT_STYLE_INSTRUCTIONS);
  assert.ok(r.path.endsWith('opencode.json'));
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.deepEqual(obj.instructions, [OUTPUT_STYLE_INSTRUCTIONS]);
});

test('instructions: add preserva outras chaves e entradas existentes', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ theme: 'dark', instructions: ['CONTRIBUTING.md'] }, null, 2));
  const r = addInstructionsEntry(dir);
  assert.ok(r);
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.equal(obj.theme, 'dark');
  assert.deepEqual(obj.instructions, ['CONTRIBUTING.md', OUTPUT_STYLE_INSTRUCTIONS]);
});

test('instructions: add idempotente quando já presente', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ instructions: [OUTPUT_STYLE_INSTRUCTIONS] }, null, 2));
  const before = readFileSync(join(dir, 'opencode.json'), 'utf8');
  assert.equal(addInstructionsEntry(dir), null);
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), before);
});

test('instructions: add em jsonc preserva comentários', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // docs do projeto\n  "theme": "dark"\n}\n');
  const r = addInstructionsEntry(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('// docs do projeto'));
  assert.ok(raw.includes('"theme": "dark"'));
  assert.ok(raw.includes(OUTPUT_STYLE_INSTRUCTIONS));
  assert.match(raw, /^\s*"instructions"\s*:/m);
});

test('instructions: remove só a nossa entrada e mantém as outras', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ instructions: ['CONTRIBUTING.md', OUTPUT_STYLE_INSTRUCTIONS, 'docs/x.md'] }, null, 2));
  const r = removeInstructionsEntry(dir);
  assert.ok(r);
  assert.equal(r.removed, OUTPUT_STYLE_INSTRUCTIONS);
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.deepEqual(obj.instructions, ['CONTRIBUTING.md', 'docs/x.md']);
});

test('instructions: remove esvazia a chave e deleta o arquivo {}', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ instructions: [OUTPUT_STYLE_INSTRUCTIONS] }, null, 2));
  const r = removeInstructionsEntry(dir);
  assert.ok(r);
  assert.ok(!existsSync(join(dir, 'opencode.json')));
});

test('instructions: remove em jsonc preserva comentários e demais chaves', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // docs\n  "instructions": [\n    "CONTRIBUTING.md",\n    "' + OUTPUT_STYLE_INSTRUCTIONS + '"\n  ],\n  "theme": "dark"\n}\n');
  const r = removeInstructionsEntry(dir);
  assert.ok(r);
  const raw = readFileSync(r.path, 'utf8');
  assert.ok(raw.includes('// docs'));
  assert.ok(raw.includes('CONTRIBUTING.md'));
  assert.ok(raw.includes('"theme": "dark"'));
  assert.ok(!raw.includes(OUTPUT_STYLE_INSTRUCTIONS));
});

test('instructions: não-array avisa e não altera', (t) => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{ // x\n  "instructions": 42\n}\n');
  const before = readFileSync(join(dir, 'opencode.jsonc'), 'utf8');
  const mock = t.mock.method(console, 'error', () => {});
  assert.equal(addInstructionsEntry(dir), null);
  assert.equal(mock.mock.callCount(), 1);
  assert.equal(readFileSync(join(dir, 'opencode.jsonc'), 'utf8'), before);
});

test('instructions: remove ausente retorna null e não altera', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), '{}');
  assert.equal(removeInstructionsEntry(dir), null);
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), '{}');
});

test('instructions: round-trip add + remove em jsonc volta a um estado válido', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // tema\n  "theme": "dark"\n}\n');
  addInstructionsEntry(dir);
  assert.ok(readFileSync(join(dir, 'opencode.jsonc'), 'utf8').includes(OUTPUT_STYLE_INSTRUCTIONS));
  removeInstructionsEntry(dir);
  const back = readFileSync(join(dir, 'opencode.jsonc'), 'utf8');
  assert.ok(back.includes('// tema'));
  assert.ok(back.includes('"theme": "dark"'));
  assert.ok(!back.includes(OUTPUT_STYLE_INSTRUCTIONS));
});

test('instructions: match exato — entrada .bak não bloqueia o add e é preservada', () => {
  const dir = tmp();
  const bak = `${OUTPUT_STYLE_INSTRUCTIONS}.bak`;
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ instructions: [bak] }, null, 2));
  const r = addInstructionsEntry(dir);
  assert.ok(r);
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.deepEqual(obj.instructions, [bak, OUTPUT_STYLE_INSTRUCTIONS]);
});

test('instructions: match exato no remove — entrada .bak é preservada', () => {
  const dir = tmp();
  const bak = `${OUTPUT_STYLE_INSTRUCTIONS}.bak`;
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ instructions: [bak, OUTPUT_STYLE_INSTRUCTIONS] }, null, 2));
  const r = removeInstructionsEntry(dir);
  assert.ok(r);
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.deepEqual(obj.instructions, [bak]);
});

test('instructions: match exato em jsonc preserva a entrada .bak no add e no remove', () => {
  const dir = tmp();
  const bak = `${OUTPUT_STYLE_INSTRUCTIONS}.bak`;
  writeFileSync(join(dir, 'opencode.jsonc'), `{\n  // docs\n  "instructions": ["${bak}"]\n}\n`);
  assert.ok(addInstructionsEntry(dir));
  let raw = readFileSync(join(dir, 'opencode.jsonc'), 'utf8');
  assert.ok(raw.includes(bak));
  assert.ok(raw.includes(`"${OUTPUT_STYLE_INSTRUCTIONS}"`));
  assert.ok(removeInstructionsEntry(dir));
  raw = readFileSync(join(dir, 'opencode.jsonc'), 'utf8');
  assert.ok(raw.includes(bak));
  assert.ok(!raw.includes(`"${OUTPUT_STYLE_INSTRUCTIONS}"`));
});

test('instructions: entry customizada funciona no add e no remove', () => {
  const dir = tmp();
  assert.ok(addInstructionsEntry(dir, 'docs/style.md'));
  let obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.deepEqual(obj.instructions, ['docs/style.md']);
  assert.ok(removeInstructionsEntry(dir, 'docs/style.md'));
  assert.ok(!existsSync(join(dir, 'opencode.json')));
});

test('instructions: valor string vira array no add', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ instructions: 'CONTRIBUTING.md' }, null, 2));
  const r = addInstructionsEntry(dir);
  assert.ok(r);
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.deepEqual(obj.instructions, ['CONTRIBUTING.md', OUTPUT_STYLE_INSTRUCTIONS]);
});
