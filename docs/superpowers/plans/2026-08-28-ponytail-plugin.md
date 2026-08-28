# Ponytail Plugin no Bento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar o plugin ponytail (`@dietrichgebert/ponytail`) ao `opencode.json` via `bento install`/`update`/`uninstall`, generalizando `lib/opencode-config.mjs`.

**Architecture:** `lib/opencode-config.mjs` passa a expor `addPlugin`/`removePlugin` genéricos (lógica jsonc parametrizada por plugin id); `addSuperpowersPlugin`/`removeSuperpowersPlugin` viram wrappers; novos wrappers `addPonytailPlugin`/`removePonytailPlugin`. `bin/bento.mjs` ganha a flag `--no-ponytail` e chama os wrappers ponytail em install/update/uninstall. `lib/install.mjs` fica inalterado.

**Tech Stack:** Node >= 18 puro (node:test, node:assert/strict), zero deps runtime.

## Global Constraints

- Node >= 18, zero dependências runtime (regra do repo).
- TDD obrigatório: teste falha antes da implementação (`node --test test/*.test.mjs`).
- Testes não dependem de rede nem de `gh` instalado.
- Convenções de commit: conventional commits (feat:, fix:, docs:, refactor:, test:).
- Mensagens, avisos e docs em PT-BR.
- Avisos no stderr **não** falham install/uninstall (config quebrada do usuário não derruba o bento).
- Matche de presença/remoção por prefixo (`startsWith(pluginId)`), cobrindo pin `#vX` e trailing `/`.
- `opencode.jsonc` nunca é deletado; `opencode.json` é deletado só quando fica `{}`.

---

### Task 1: Generalizar `lib/opencode-config.mjs`

**Files:**
- Modify: `lib/opencode-config.mjs` (substituição completa do módulo)
- Test: `test/opencode-config.test.mjs` (import + 2 testes novos)

**Interfaces:**
- Consumes: nada (módulo atual já existente).
- Produces: `addPlugin(projectRoot, pluginId)` → `{ changed: pluginId, path }` ou `null`; `removePlugin(projectRoot, pluginId)` → `{ removed: pluginId, path }` ou `null`; wrappers `addSuperpowersPlugin`/`removeSuperpowersPlugin` com assinatura e retorno idênticos aos atuais (API pública preservada).

- [ ] **Step 1: Escrever os testes que falham (API genérica)**

Adicionar ao import de `test/opencode-config.test.mjs` (linha 6):

```js
import { addPlugin, addSuperpowersPlugin, removePlugin, removeSuperpowersPlugin, SUPERPOWERS_PLUGIN } from '../lib/opencode-config.mjs';
```

Adicionar no fim do arquivo:

```js
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
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test`
Expected: FAIL — `addPlugin` não é uma função exportada (import de `undefined`).

- [ ] **Step 3: Reescrever `lib/opencode-config.mjs` (módulo genérico)**

Conteúdo completo do arquivo:

```js
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SUPERPOWERS_PLUGIN = 'superpowers@git+https://github.com/obra/superpowers.git';
export const PONYTAIL_PLUGIN = '@dietrichgebert/ponytail';

function pluginLabel(pluginId) {
  if (pluginId.startsWith('@')) return pluginId.slice(pluginId.lastIndexOf('/') + 1);
  const at = pluginId.indexOf('@');
  return at === -1 ? pluginId : pluginId.slice(0, at);
}

function entryRe(pluginId) {
  const escaped = pluginId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`"${escaped}[^"]*"[,\\s]*`);
}

function entryRemoveRe(pluginId) {
  const escaped = pluginId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`"${escaped}[^"]*"[,\\s]*(?:\\s*(?:\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/))?[,\\s]*`, 'g');
}

function configPath(projectRoot) {
  const json = join(projectRoot, 'opencode.json');
  if (existsSync(json)) return json;
  const jsonc = join(projectRoot, 'opencode.jsonc');
  if (existsSync(jsonc)) return jsonc;
  return json;
}

function freshObject(pluginId) {
  return `{\n  "plugin": ["${pluginId}"]\n}\n`;
}

export function addPlugin(projectRoot, pluginId) {
  const label = pluginLabel(pluginId);
  const path = configPath(projectRoot);
  let raw = null;
  if (existsSync(path)) {
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      console.error(`aviso: não foi possível ler ${path} — ${label} pulado.`);
      return null;
    }
  }
  if (raw === null || raw.trim() === '') {
    writeFileSync(path, freshObject(pluginId));
    return { changed: pluginId, path };
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    if (!path.endsWith('.jsonc')) {
      console.error(`aviso: opencode.json não é um objeto JSON válido — ${label} pulado.`);
      return null;
    }
    return addJsoncText(path, raw, pluginId);
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    console.error(`aviso: opencode.json não é um objeto JSON — ${label} pulado.`);
    return null;
  }
  let plugins = obj.plugin;
  if (plugins === undefined) plugins = [];
  else if (typeof plugins === 'string') plugins = [plugins];
  else if (!Array.isArray(plugins)) {
    console.error(`aviso: "plugin" em opencode.json não é um array — ${label} pulado.`);
    return null;
  }
  if (plugins.some((p) => typeof p === 'string' && p.startsWith(pluginId))) return null;
  obj.plugin = [...plugins, pluginId];
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
  return { changed: pluginId, path };
}

function addJsoncText(path, raw, pluginId) {
  const label = pluginLabel(pluginId);
  if (/"plugin"\s*:/m.test(raw)) {
    const arrayMatch = /"plugin"\s*:\s*\[([\s\S]*?)\]/m.exec(raw);
    if (!arrayMatch) {
      console.error(`aviso: "plugin" em opencode.json não é um array — ${label} pulado.`);
      return null;
    }
    const inside = arrayMatch[1];
    if (entryRe(pluginId).test(inside)) return null;
    const hasEntries = inside.trim() !== '';
    const rebuilt = `"plugin": [${inside}${hasEntries ? '\n  ,' : ''}\n    "${pluginId}"\n  ]`;
    writeFileSync(path, raw.slice(0, arrayMatch.index) + rebuilt + raw.slice(arrayMatch.index + arrayMatch[0].length));
    return { changed: pluginId, path };
  }
  const brace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (brace === -1 || lastBrace <= brace) {
    console.error(`aviso: opencode.json não parece um objeto JSON — ${label} pulado.`);
    return null;
  }
  const middle = raw.slice(brace + 1, lastBrace);
  const updated = raw.slice(0, brace + 1) + `\n  "plugin": ["${pluginId}"]` + (middle.trim() ? ',' : '\n') + middle + raw.slice(lastBrace);
  writeFileSync(path, updated);
  return { changed: pluginId, path };
}

export function removePlugin(projectRoot, pluginId) {
  const label = pluginLabel(pluginId);
  const path = configPath(projectRoot);
  if (!existsSync(path)) return null;
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.error(`aviso: não foi possível ler ${path} — ${label} ignorado.`);
    return null;
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    if (!path.endsWith('.jsonc')) {
      console.error(`aviso: opencode.json não é um objeto JSON válido — ${label} ignorado.`);
      return null;
    }
    return removeJsoncText(path, raw, pluginId);
  }
  if (obj === null || typeof obj !== 'object') return null;
  const plugins = obj.plugin;
  if (plugins === undefined) return null;
  if (typeof plugins !== 'string' && !Array.isArray(plugins)) {
    console.error(`aviso: "plugin" em opencode.json não é um array — ${label} ignorado.`);
    return null;
  }
  const list = Array.isArray(plugins) ? plugins : [plugins];
  const kept = list.filter((p) => !(typeof p === 'string' && p.startsWith(pluginId)));
  if (kept.length === list.length) return null;
  if (kept.length === 0) {
    delete obj.plugin;
    if (Object.keys(obj).length === 0) {
      if (path.endsWith('.jsonc')) {
        writeFileSync(path, '{}\n');
      } else {
        rmSync(path, { force: true });
      }
      return { removed: pluginId, path };
    }
  } else {
    obj.plugin = kept;
  }
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
  return { removed: pluginId, path };
}

function removeJsoncText(path, raw, pluginId) {
  const label = pluginLabel(pluginId);
  if (!/"plugin"\s*:/m.test(raw)) {
    const brace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (brace === -1 || lastBrace <= brace) {
      console.error(`aviso: opencode.json não parece um objeto JSON — ${label} ignorado.`);
    }
    return null;
  }
  const arrayMatch = /"plugin"\s*:\s*\[([\s\S]*?)\]/m.exec(raw);
  if (!arrayMatch) {
    console.error(`aviso: "plugin" em opencode.json não é um array — ${label} ignorado.`);
    return null;
  }
  const inside = arrayMatch[1];
  if (!entryRe(pluginId).test(inside)) return null;
  const newInside = inside.replace(entryRemoveRe(pluginId), '').replace(/,\s*$/, '').trim();
  if (newInside === '') {
    const prefix = raw.slice(0, arrayMatch.index);
    const suffix = raw.slice(arrayMatch.index + arrayMatch[0].length);
    const suffixHadComma = /^,/.test(suffix);
    const after = suffix.replace(/^,\s*/, '');
    const prefixClean = suffixHadComma
      ? prefix
      : prefix.replace(/,\s*(\/\/[^\n]*|\/\*[\s\S]*?\*\/)?\s*$/, (_m, comment) => (comment ? ` ${comment}` : ''));
    writeFileSync(path, prefixClean + after);
  } else {
    writeFileSync(path, raw.slice(0, arrayMatch.index) + `"plugin": [${newInside}\n  ]` + raw.slice(arrayMatch.index + arrayMatch[0].length));
  }
  return { removed: pluginId, path };
}

export function addSuperpowersPlugin(projectRoot) {
  return addPlugin(projectRoot, SUPERPOWERS_PLUGIN);
}

export function removeSuperpowersPlugin(projectRoot) {
  return removePlugin(projectRoot, SUPERPOWERS_PLUGIN);
}
```

- [ ] **Step 4: Rodar para ver passar**

Run: `npm test`
Expected: PASS — todos os 34 testes de `opencode-config.test.mjs` (32 existentes via wrappers + 2 novos) e demais suítes intactas.

- [ ] **Step 5: Commit**

```bash
git add lib/opencode-config.mjs test/opencode-config.test.mjs
git commit -m "refactor: opencode-config genérico (addPlugin/removePlugin) com wrappers superpowers"
```

---

### Task 2: Wrappers ponytail + testes

**Files:**
- Modify: `lib/opencode-config.mjs` (2 wrappers novos, após `removeSuperpowersPlugin`)
- Test: `test/opencode-config.test.mjs`

**Interfaces:**
- Consumes: `addPlugin(projectRoot, pluginId)` e `removePlugin(projectRoot, pluginId)` da Task 1; `PONYTAIL_PLUGIN` já exportado.
- Produces: `addPonytailPlugin(projectRoot)` → `{ changed: PONYTAIL_PLUGIN, path }` ou `null`; `removePonytailPlugin(projectRoot)` → `{ removed: PONYTAIL_PLUGIN, path }` ou `null`. Consumidos pela Task 3.

- [ ] **Step 1: Escrever os testes que falham**

Em `test/opencode-config.test.mjs`, atualizar o import (linha 6) para:

```js
import { addPlugin, addPonytailPlugin, addSuperpowersPlugin, removePlugin, removePonytailPlugin, removeSuperpowersPlugin, PONYTAIL_PLUGIN, SUPERPOWERS_PLUGIN } from '../lib/opencode-config.mjs';
```

Adicionar no fim do arquivo:

```js
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
  const obj = JSON.parse(readFileSync(r.path, 'utf8'));
  assert.deepEqual(obj.plugin, ['@scope/a', SUPERPOWERS_PLUGIN]);
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
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test`
Expected: FAIL — `addPonytailPlugin` não é exportada (7 testes novos falham).

- [ ] **Step 3: Implementar os wrappers**

No fim de `lib/opencode-config.mjs`, após `removeSuperpowersPlugin`:

```js
export function addPonytailPlugin(projectRoot) {
  return addPlugin(projectRoot, PONYTAIL_PLUGIN);
}

export function removePonytailPlugin(projectRoot) {
  return removePlugin(projectRoot, PONYTAIL_PLUGIN);
}
```

- [ ] **Step 4: Rodar para ver passar**

Run: `npm test`
Expected: PASS — suíte completa.

- [ ] **Step 5: Commit**

```bash
git add lib/opencode-config.mjs test/opencode-config.test.mjs
git commit -m "feat: add/remove ponytail plugin no opencode-config"
```

---

### Task 3: CLI — flag `--no-ponytail` e wiring

**Files:**
- Modify: `bin/bento.mjs`
- Test: `test/cli.test.mjs` (import + 3 testes alterados/novos)

**Interfaces:**
- Consumes: `addPonytailPlugin`/`removePonytailPlugin` (Task 2), `PONYTAIL_PLUGIN`, `SUPERPOWERS_PLUGIN` (Task 1).
- Produces: comportamento CLI — `install`/`update` adicionam ponytail (pulado com `--no-ponytail`), `uninstall` remove, help atualizado.

- [ ] **Step 1: Atualizar/reescrever os testes que falham**

Em `test/cli.test.mjs`, atualizar o import (linha 9):

```js
import { PONYTAIL_PLUGIN, SUPERPOWERS_PLUGIN } from '../lib/opencode-config.mjs';
```

Substituir o teste `update: adiciona superpowers ao opencode.json` (linhas 110-117) por:

```js
test('update: adiciona superpowers e ponytail ao opencode.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('superpowers'));
  assert.ok(r.stdout.includes('ponytail'));
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.deepEqual(obj.plugin, [SUPERPOWERS_PLUGIN, PONYTAIL_PLUGIN]);
});
```

Substituir o teste `update --no-superpowers: não toca opencode.json` (linhas 119-126) por:

```js
test('update --no-superpowers: adiciona só ponytail', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-superpowers'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!r.stdout.includes('superpowers'));
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.deepEqual(obj.plugin, [PONYTAIL_PLUGIN]);
});

test('update --no-ponytail: adiciona só superpowers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-ponytail'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!r.stdout.includes('ponytail'));
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.deepEqual(obj.plugin, [SUPERPOWERS_PLUGIN]);
});

test('update --no-superpowers --no-ponytail: não toca opencode.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  writeFileSync(join(dir, 'opencode.json'), '{ "theme": "dark" }');
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-superpowers', '--no-ponytail'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!r.stdout.includes('superpowers'));
  assert.ok(!r.stdout.includes('ponytail'));
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), '{ "theme": "dark" }');
});
```

Adicionar após o teste `uninstall: remove superpowers do opencode.json`:

```js
test('uninstall: remove ponytail do opencode.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  const r = spawnSync(process.execPath, [BIN, 'uninstall'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('ponytail'));
  assert.ok(!existsSync(join(dir, 'opencode.json')));
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test`
Expected: FAIL — `update` ainda não adiciona ponytail (testes novos; os 2 testes substituídos também falham).

- [ ] **Step 3: Implementar no `bin/bento.mjs`**

Import (linha 5) passa a:

```js
import { addPonytailPlugin, addSuperpowersPlugin, removePonytailPlugin, removeSuperpowersPlugin } from '../lib/opencode-config.mjs';
```

Em `run()` (após linha 21):

```js
const noPonytail = args.includes('--no-ponytail');
```

No case `install`, após o bloco superpowers:

```js
      if (!noPonytail) {
        const pt = addPonytailPlugin(process.cwd());
        if (pt) console.log(`  ponytail → ${pt.path}`);
      }
```

No case `update`, após o bloco superpowers:

```js
      if (!noPonytail) {
        const pt = addPonytailPlugin(process.cwd());
        if (pt) console.log(`  ponytail → ${pt.path}`);
      }
```

No case `uninstall`, substituir as linhas 57-58:

```js
      const sp = removeSuperpowersPlugin(process.cwd());
      const pt = removePonytailPlugin(process.cwd());
      const all = [...removed];
      if (sp) all.push(`superpowers (${sp.path})`);
      if (pt) all.push(`ponytail (${pt.path})`);
```

No help (case default), atualizar o texto:

```js
      console.error(`uso: bento install|update|uninstall|check|equivalence
  install          instala skill, scripts, config, gh-stack, superpowers e ponytail no projeto
                   (--no-agents pula AGENTS.md; --no-superpowers pula superpowers; --no-ponytail pula ponytail)
  update           re-instala mantendo .pr-limits.yaml (não toca gh-stack)
  uninstall        remove tudo do bento (gh-stack, .bento, skill, shim, config, superpowers, ponytail, seção AGENTS.md)
  check [base]     valida tamanho do diff (head = HEAD, base default = main)
  equivalence <base> <head> <camada1> [camada2 ...]
`);
```

- [ ] **Step 4: Rodar para ver passar**

Run: `npm test`
Expected: PASS — suíte completa (cli, opencode-config, validate, diff, config, smoke).

- [ ] **Step 5: Commit**

```bash
git add bin/bento.mjs test/cli.test.mjs
git commit -m "feat: ponytail no install/update/uninstall (--no-ponytail)"
```

---

### Task 4: README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nada.
- Produces: docs atualizadas (nenhuma API).

- [ ] **Step 1: Atualizar README**

Linha 8:

```md
node bin/bento.mjs install        # instala skill, scripts, .pr-limits.yaml, gh-stack, superpowers e ponytail
```

Após a linha 19 (`- superpowers — plugin adicionado ao opencode.json (pule com --no-superpowers)`):

```md
- ponytail — plugin adicionado ao opencode.json (pule com `--no-ponytail`)
```

Após a linha 36 (`- entrada do plugin superpowers no opencode.json (arquivo removido se ficar vazio)`):

```md
- entrada do plugin ponytail no `opencode.json` (arquivo removido se ficar vazio)
```

- [ ] **Step 2: Verificar**

Run: `npm test`
Expected: PASS (nenhum teste cobre README; verificação de regressão).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: ponytail no install/uninstall do bento"
```