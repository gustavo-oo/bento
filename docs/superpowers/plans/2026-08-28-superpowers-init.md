# Superpowers init no bento install — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `bento install`/`update` passam a adicionar o plugin superpowers ao `opencode.json` do projeto (flag `--no-superpowers` pula), e `uninstall` remove a entrada.

**Architecture:** Novo módulo `lib/opencode-config.mjs` com `addSuperpowersPlugin`/`removeSuperpowersPlugin` (funções puras, padrão de `lib/install.mjs`). Edição híbrida: arquivo que parseia como JSON estrito é editado via `JSON.parse`/`JSON.stringify` (preserva outras chaves); arquivo com comentários (parse falha) é editado por splice textual (preserva comentários). `lib/install.mjs` fica inalterado — o `bin/bento.mjs` chama o novo módulo.

**Tech Stack:** Node >= 18, zero deps runtime, `node:test` (`npm test` = `node --test test/*.test.mjs`).

## Global Constraints

- Node puro, zero deps runtime (Node >= 18).
- TDD obrigatório: escrever o teste antes da implementação.
- Testes não dependem de rede nem de `gh` instalado — no CLI, usar só `update`/`uninstall` (o `install` exige `gh` via `ensureGhStack`).
- Convenções de commit: conventional commits (`feat:`, `docs:`).
- Constante do plugin: `SUPERPOWERS_PLUGIN = 'superpowers@git+https://github.com/obra/superpowers.git'` — presença/remoção por `startsWith` do prefixo (cobre pin `#vX` e trailing `/`).
- Resolução do arquivo: prefere `opencode.json`; senão `opencode.jsonc`; senão cria `opencode.json`.
- Arquivo inválido/não-array `plugin`: avisa no stderr e NÃO falha o install/uninstall.
- No caminho jsonc, nunca deleta o arquivo; no caminho estrito, arquivo `{}` após remoção é deletado.

---

### Task 1: addSuperpowersPlugin — criação, caminho JSON estrito e caminho jsonc

**Files:**
- Create: `lib/opencode-config.mjs`
- Test: `test/opencode-config.test.mjs`

**Interfaces:**
- Consumes: nada (funções puras de filesystem).
- Produces:
  - `export const SUPERPOWERS_PLUGIN: string`
  - `export function addSuperpowersPlugin(projectRoot: string): { changed: string, path: string } | null` — `null` quando já presente ou quando não altera (com aviso no stderr).
  - `export function removeSuperpowersPlugin(projectRoot: string): { removed: string, path: string } | null` (definida na Task 2)

- [ ] **Step 1: Escrever o teste que falha**

Crie `test/opencode-config.test.mjs`:

```js
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
```

- [ ] **Step 2: Rodar o teste para verificar que falha**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/opencode-config.mjs'`.

- [ ] **Step 3: Implementar `lib/opencode-config.mjs` (parte de add)**

Crie `lib/opencode-config.mjs`:

```js
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SUPERPOWERS_PLUGIN = 'superpowers@git+https://github.com/obra/superpowers.git';

const ESCAPED = SUPERPOWERS_PLUGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ENTRY_RE = new RegExp(`"[^"]*${ESCAPED}[^"]*"[,\\s]*`);

function configPath(projectRoot) {
  const json = join(projectRoot, 'opencode.json');
  if (existsSync(json)) return json;
  const jsonc = join(projectRoot, 'opencode.jsonc');
  if (existsSync(jsonc)) return jsonc;
  return json;
}

function freshObject() {
  return `{\n  "plugin": ["${SUPERPOWERS_PLUGIN}"]\n}\n`;
}

export function addSuperpowersPlugin(projectRoot) {
  const path = configPath(projectRoot);
  const raw = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (raw === null || raw.trim() === '') {
    writeFileSync(path, freshObject());
    return { changed: SUPERPOWERS_PLUGIN, path };
  }
  try {
    const obj = JSON.parse(raw);
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      console.error('aviso: opencode.json não é um objeto JSON — superpowers pulado.');
      return null;
    }
    let plugins = obj.plugin;
    if (plugins === undefined) plugins = [];
    else if (typeof plugins === 'string') plugins = [plugins];
    else if (!Array.isArray(plugins)) {
      console.error('aviso: "plugin" em opencode.json não é um array — superpowers pulado.');
      return null;
    }
    if (plugins.some((p) => typeof p === 'string' && p.startsWith(SUPERPOWERS_PLUGIN))) return null;
    obj.plugin = [...plugins, SUPERPOWERS_PLUGIN];
    writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
    return { changed: SUPERPOWERS_PLUGIN, path };
  } catch {
    return addJsoncText(path, raw);
  }
}

function addJsoncText(path, raw) {
  if (/"(plugin)"\s*:/m.test(raw)) {
    const arrayMatch = /"plugin"\s*:\s*\[([\s\S]*?)\]/m.exec(raw);
    if (!arrayMatch) {
      console.error('aviso: "plugin" em opencode.json não é um array — superpowers pulado.');
      return null;
    }
    const inside = arrayMatch[1];
    if (ENTRY_RE.test(inside)) return null;
    const rebuilt = `"plugin": [${inside.trimEnd()}${inside.trim() ? ',\n    ' : ''}"${SUPERPOWERS_PLUGIN}"]`;
    writeFileSync(path, raw.slice(0, arrayMatch.index) + rebuilt + raw.slice(arrayMatch.index + arrayMatch[0].length));
    return { changed: SUPERPOWERS_PLUGIN, path };
  }
  const brace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (brace === -1 || lastBrace <= brace) {
    console.error('aviso: opencode.json não parece um objeto JSON — superpowers pulado.');
    return null;
  }
  const middle = raw.slice(brace + 1, lastBrace);
  const updated = raw.slice(0, brace + 1) + `\n  "plugin": ["${SUPERPOWERS_PLUGIN}"]` + (middle.trim() ? ',' : '\n') + middle + raw.slice(lastBrace);
  writeFileSync(path, updated);
  return { changed: SUPERPOWERS_PLUGIN, path };
}
```

- [ ] **Step 4: Rodar o teste para verificar que passa**

Run: `npm test`
Expected: PASS (todos os testes, incluindo os existentes).

- [ ] **Step 5: Commit**

```bash
git add lib/opencode-config.mjs test/opencode-config.test.mjs
git commit -m "feat: addSuperpowersPlugin — plugin superpowers no opencode.json (estrito + jsonc)"
```

### Task 2: removeSuperpowersPlugin — caminho estrito e jsonc

**Files:**
- Modify: `lib/opencode-config.mjs` (import + 2 funções novas no fim)
- Test: `test/opencode-config.test.mjs` (import + testes de remoção)

**Interfaces:**
- Consumes: `SUPERPOWERS_PLUGIN`, `ENTRY_RE`, `configPath` da Task 1.
- Produces: `export function removeSuperpowersPlugin(projectRoot: string): { removed: string, path: string } | null` — `null` quando ausente.

- [ ] **Step 1: Escrever o teste que falha**

No fim de `test/opencode-config.test.mjs`, ajuste o import para:

```js
import { addSuperpowersPlugin, removeSuperpowersPlugin, SUPERPOWERS_PLUGIN } from '../lib/opencode-config.mjs';
```

E adicione os testes:

```js
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
```

- [ ] **Step 2: Rodar o teste para verificar que falha**

Run: `npm test`
Expected: FAIL — `removeSuperpowersPlugin is not a function`.

- [ ] **Step 3: Implementar a remoção**

Em `lib/opencode-config.mjs`, troque o import por:

```js
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
```

E adicione no fim do arquivo:

```js
export function removeSuperpowersPlugin(projectRoot) {
  const path = configPath(projectRoot);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  try {
    const obj = JSON.parse(raw);
    if (obj === null || typeof obj !== 'object') return null;
    const plugins = obj.plugin;
    if (plugins === undefined) return null;
    const list = Array.isArray(plugins) ? plugins : [plugins];
    const kept = list.filter((p) => !(typeof p === 'string' && p.startsWith(SUPERPOWERS_PLUGIN)));
    if (kept.length === list.length) return null;
    if (kept.length === 0) {
      delete obj.plugin;
      if (Object.keys(obj).length === 0) {
        rmSync(path, { force: true });
        return { removed: SUPERPOWERS_PLUGIN, path };
      }
    } else {
      obj.plugin = kept;
    }
    writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
    return { removed: SUPERPOWERS_PLUGIN, path };
  } catch {
    return removeJsoncText(path, raw);
  }
}

function removeJsoncText(path, raw) {
  const arrayMatch = /"plugin"\s*:\s*\[([\s\S]*?)\]/m.exec(raw);
  if (!arrayMatch) return null;
  const inside = arrayMatch[1];
  if (!ENTRY_RE.test(inside)) return null;
  const newInside = inside.replace(ENTRY_RE, '').replace(/,\s*$/, '').trim();
  if (newInside === '') {
    const cleaned = raw.slice(0, arrayMatch.index).replace(/,\s*$/, '') + raw.slice(arrayMatch.index + arrayMatch[0].length);
    writeFileSync(path, cleaned);
  } else {
    writeFileSync(path, raw.slice(0, arrayMatch.index) + `"plugin": [${newInside}]` + raw.slice(arrayMatch.index + arrayMatch[0].length));
  }
  return { removed: SUPERPOWERS_PLUGIN, path };
}
```

- [ ] **Step 4: Rodar o teste para verificar que passa**

Run: `npm test`
Expected: PASS (todos os testes).

- [ ] **Step 5: Commit**

```bash
git add lib/opencode-config.mjs test/opencode-config.test.mjs
git commit -m "feat: removeSuperpowersPlugin — remove superpowers do opencode.json (estrito + jsonc)"
```

### Task 3: Wiring no CLI — install/update/uninstall + flag --no-superpowers

**Files:**
- Modify: `bin/bento.mjs`
- Test: `test/cli.test.mjs`

**Interfaces:**
- Consumes: `addSuperpowersPlugin`, `removeSuperpowersPlugin` (Tasks 1–2).
- Produces: `bento install`/`update` adicionam superpowers (pulado com `--no-superpowers`); `bento uninstall` remove e reporta `removido: superpowers (caminho)`.

- [ ] **Step 1: Escrever o teste que falha**

Em `test/cli.test.mjs`, ajuste os imports para:

```js
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { SUPERPOWERS_PLUGIN } from '../lib/opencode-config.mjs';
```

E adicione no fim:

```js
test('update: adiciona superpowers ao opencode.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('superpowers'));
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.deepEqual(obj.plugin, [SUPERPOWERS_PLUGIN]);
});

test('update --no-superpowers: não toca opencode.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  writeFileSync(join(dir, 'opencode.json'), '{ "theme": "dark" }');
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-superpowers'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!r.stdout.includes('superpowers'));
  assert.equal(readFileSync(join(dir, 'opencode.json'), 'utf8'), '{ "theme": "dark" }');
});

test('uninstall: remove superpowers do opencode.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  const r = spawnSync(process.execPath, [BIN, 'uninstall'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('superpowers'));
  assert.ok(!existsSync(join(dir, 'opencode.json')));
});
```

- [ ] **Step 2: Rodar o teste para verificar que falha**

Run: `npm test`
Expected: FAIL — `update` não adiciona superpowers (stdout sem `superpowers`, `opencode.json` não criado).

- [ ] **Step 3: Implementar o wiring**

Em `bin/bento.mjs`:

- Troque o import por:

```js
import { install, uninstall } from '../lib/install.mjs';
import { addSuperpowersPlugin, removeSuperpowersPlugin } from '../lib/opencode-config.mjs';
```

- Troque o início de `run()` por:

```js
function run() {
  const noAgents = args.includes('--no-agents');
  const noSuperpowers = args.includes('--no-superpowers');
```

- No `case 'install'`, após o `console.log` do `lib`, adicione:

```js
      if (!noSuperpowers) {
        const sp = addSuperpowersPlugin(process.cwd());
        if (sp) console.log(`  superpowers → ${sp.path}`);
      }
```

- No `case 'update'`, troque por:

```js
    case 'update': {
      install(process.cwd(), { noAgents });
      if (!noSuperpowers) {
        const sp = addSuperpowersPlugin(process.cwd());
        if (sp) console.log(`  superpowers → ${sp.path}`);
      }
      console.log('bento atualizado.');
      return;
    }
```

- No `case 'uninstall'`, troque o bloco de relatório por:

```js
      const { removed } = uninstall(process.cwd());
      const sp = removeSuperpowersPlugin(process.cwd());
      const all = sp ? [...removed, `superpowers (${sp.path})`] : removed;
      if (all.length === 0) {
        console.log('bento: nada para remover.');
      } else {
        console.log('bento desinstalado:');
        for (const path of all) console.log(`  removido: ${path}`);
      }
      return;
```

- No texto de uso (`default`), troque por:

```
  install          instala skill, scripts, config, gh-stack e superpowers no projeto
                   (--no-agents pula AGENTS.md; --no-superpowers pula superpowers)
  update           re-instala mantendo .pr-limits.yaml (não toca gh-stack)
  uninstall        remove tudo do bento (gh-stack, .bento, skill, shim, config, superpowers, seção AGENTS.md)
  check [base]     valida tamanho do diff (head = HEAD, base default = main)
  equivalence <base> <head> <camada1> [camada2 ...]
```

- [ ] **Step 4: Rodar o teste para verificar que passa**

Run: `npm test`
Expected: PASS (inclui o teste existente `update funciona a partir da cópia instalada (.bento/bin/bento.mjs)`, que valida a resolução do import `../lib/opencode-config.mjs` na cópia instalada).

- [ ] **Step 5: Commit**

```bash
git add bin/bento.mjs test/cli.test.mjs
git commit -m "feat: install/update adicionam superpowers ao opencode.json (--no-superpowers pula); uninstall remove"
```

### Task 4: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Atualizar o README**

Na seção `## Instalação (no projeto consumidor)`:

- Troque o bloco de código por:

```bash
node bin/bento.mjs install        # instala skill, scripts, .pr-limits.yaml, gh-stack e superpowers
node bin/bento.mjs update         # re-instala mantendo .pr-limits.yaml local
```

- Adicione o bullet após `.pr-limits.yaml`:

```markdown
- `superpowers` — plugin adicionado ao `opencode.json` (pule com `--no-superpowers`)
```

Na seção `## Desinstalação`, adicione após o bullet do `.pr-limits.yaml`:

```markdown
- entrada do plugin superpowers no `opencode.json` (arquivo removido se ficar vazio)
```

- [ ] **Step 2: Verificar**

Run: `npm test`
Expected: PASS (nada quebrou).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: superpowers no install/update/uninstall do bento"
```