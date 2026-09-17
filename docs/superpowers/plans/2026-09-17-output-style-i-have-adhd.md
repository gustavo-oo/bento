# Output style direto (i-have-adhd) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instalar no projeto consumidor um estilo de saída direto e enxuto: skill `i-have-adhd` vendada + ruleset always-on via chave `instructions` do opencode, com flag `--no-output-style`.

**Architecture:** A skill upstream (MIT) é vendada verbatim em `skills/i-have-adhd/SKILL.md`; o ruleset always-on (resumo upstream + seção de artefatos humanos) vive em `templates/instructions/i-have-adhd.md`. `lib/opencode-config.mjs` ganha helpers de array genéricos (reutilizados por `plugin` e pela nova chave `instructions`); `lib/install.mjs` copia os artefatos; `bin/bento.mjs` registra/remove a entrada na config.

**Tech Stack:** Node >= 18, ESM, zero deps runtime, node:test.

## Global Constraints

- Node >= 18, ESM, zero dependências runtime.
- Testes com `node:test`; sem rede e sem `gh`.
- Mensagens de CLI, docs e commits em PT-BR; conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).
- Texto das duas regras novas (SKILL.md vendado e instructions) em inglês.
- Venda pinada: `ayghri/i-have-adhd`, commit `b15d0be58f55b33972ba3e39709e0e5208ef30cb`, `SKILL.md` sha256 `3170b16ace00aecb0dd7feb54c0b5aa642e7502acda06ecd24fd89a11c7127e9`, MIT.
- Entrada no config: `.opencode/instructions/i-have-adhd.md` (path relativo ao projeto).
- Flag `--no-output-style` em `install`/`update`; `uninstall` remove sempre, sem flag.
- `update` re-copia os dois artefatos (sobrescreve edições locais), como small-prs/taste-skill.
- `instructions`: mesma semântica do `plugin` (string vira array; outros tipos: aviso no stderr e sem escrita).

---

### Task 1: Chave `instructions` em `lib/opencode-config.mjs`

**Files:**
- Modify: `lib/opencode-config.mjs`
- Test: `test/opencode-config.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces (usado pelas Tasks 3 e 4):
  - `export const OUTPUT_STYLE_INSTRUCTIONS = '.opencode/instructions/i-have-adhd.md'`
  - `export function addInstructionsEntry(projectRoot, entry = OUTPUT_STYLE_INSTRUCTIONS)` → `{ changed: entry, path } | null`
  - `export function removeInstructionsEntry(projectRoot, entry = OUTPUT_STYLE_INSTRUCTIONS)` → `{ removed: entry, path } | null`
  - `addPlugin`/`removePlugin` mantêm API e retornos atuais (`{ changed: pluginId, path }` / `{ removed: pluginId, path }`).

- [ ] **Step 1: Escrever os testes que falham**

No fim de `test/opencode-config.test.mjs`, adicione os testes abaixo. Atualize a linha 6 de import para:

```js
import { addPlugin, addPonytailPlugin, addSuperpowersPlugin, addInstructionsEntry, removeInstructionsEntry, removePlugin, removePonytailPlugin, removeSuperpowersPlugin, setDefaultAgentIfAbsent, removeDefaultAgentIf, BENTO_DEFAULT_AGENT, PONYTAIL_PLUGIN, SUPERPOWERS_PLUGIN, OUTPUT_STYLE_INSTRUCTIONS } from '../lib/opencode-config.mjs';
```

Testes novos (append no fim do arquivo):

```js
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
```

- [ ] **Step 2: Rodar os testes para ver falhar**

Run: `node --test test/opencode-config.test.mjs`
Expected: FAIL — `addInstructionsEntry` importado como `undefined` (`TypeError: addInstructionsEntry is not a function`).

- [ ] **Step 3: Generalizar a implementação para aceitar a chave**

Em `lib/opencode-config.mjs`, substitua os blocos abaixo.

3a. Substitua as linhas 4–21 (constantes e helpers do topo) por:

```js
export const SUPERPOWERS_PLUGIN = 'superpowers@git+https://github.com/obra/superpowers.git';
export const PONYTAIL_PLUGIN = '@dietrichgebert/ponytail';
export const OUTPUT_STYLE_INSTRUCTIONS = '.opencode/instructions/i-have-adhd.md';

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pluginLabel(pluginId) {
  if (pluginId.startsWith('@')) return pluginId.slice(pluginId.lastIndexOf('/') + 1);
  const at = pluginId.indexOf('@');
  return at === -1 ? pluginId : pluginId.slice(0, at);
}

function entryRe(entry) {
  return new RegExp(`"${escapeRe(entry)}[^"]*"[,\\s]*`);
}

function entryRemoveRe(entry) {
  return new RegExp(`"${escapeRe(entry)}[^"]*"[,\\s]*(?:\\s*(?:\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/))?[,\\s]*`, 'g');
}
```

3b. Substitua `freshObject` (linhas 76–78) e `addPlugin` (linhas 80–121) por:

```js
function freshObject(key, entry) {
  return `{\n  "${key}": ["${entry}"]\n}\n`;
}

function addArrayEntry(projectRoot, key, entry, label) {
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
    writeFileSync(path, freshObject(key, entry));
    return { changed: entry, path };
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    if (!path.endsWith('.jsonc')) {
      console.error(`aviso: opencode.json não é um objeto JSON válido — ${label} pulado.`);
      return null;
    }
    return addJsoncText(path, raw, key, entry, label);
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    console.error(`aviso: opencode.json não é um objeto JSON — ${label} pulado.`);
    return null;
  }
  let list = obj[key];
  if (list === undefined) list = [];
  else if (typeof list === 'string') list = [list];
  else if (!Array.isArray(list)) {
    console.error(`aviso: "${key}" em opencode.json não é um array — ${label} pulado.`);
    return null;
  }
  if (list.some((p) => typeof p === 'string' && p.startsWith(entry))) return null;
  obj[key] = [...list, entry];
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
  return { changed: entry, path };
}

export function addPlugin(projectRoot, pluginId) {
  return addArrayEntry(projectRoot, 'plugin', pluginId, pluginLabel(pluginId));
}

export function addInstructionsEntry(projectRoot, entry = OUTPUT_STYLE_INSTRUCTIONS) {
  return addArrayEntry(projectRoot, 'instructions', entry, entry);
}
```

3c. Substitua `pluginArrayMatch` (linhas 162–170) por:

```js
function arrayMatch(raw, masked, key) {
  const m = new RegExp(`"${escapeRe(key)}"\\s*:\\s*\\[`, 'm').exec(masked);
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  let end = arrayEnd(raw, open);
  if (end === -1) end = arrayEnd(raw, open, false);
  if (end === -1) return null;
  return { index: m.index, 0: raw.slice(m.index, end + 1) };
}
```

3d. Substitua `addJsoncText` (linhas 172–199) por:

```js
function addJsoncText(path, raw, key, entry, label) {
  const masked = maskComments(raw);
  if (new RegExp(`"${escapeRe(key)}"\\s*:`, 'm').test(masked)) {
    const array = arrayMatch(raw, masked, key);
    if (!array) {
      console.error(`aviso: "${key}" em opencode.json não é um array — ${label} pulado.`);
      return null;
    }
    const open = array[0].indexOf('[');
    const inside = raw.slice(array.index + open + 1, array.index + array[0].length - 1);
    if (entryRe(entry).test(inside)) return null;
    const hasEntries = inside.trim() !== '';
    const rebuilt = `"${key}": [${inside}${hasEntries ? '\n  ,' : ''}\n    "${entry}"\n  ]`;
    writeFileSync(path, raw.slice(0, array.index) + rebuilt + raw.slice(array.index + array[0].length));
    return { changed: entry, path };
  }
  const brace = masked.indexOf('{');
  const lastBrace = masked.lastIndexOf('}');
  if (brace === -1 || lastBrace <= brace) {
    console.error(`aviso: opencode.json não parece um objeto JSON — ${label} pulado.`);
    return null;
  }
  const middle = raw.slice(brace + 1, lastBrace);
  const updated = raw.slice(0, brace + 1) + `\n  "${key}": ["${entry}"]` + (middle.trim() ? ',' : '\n') + middle + raw.slice(lastBrace);
  writeFileSync(path, updated);
  return { changed: entry, path };
}
```

3e. Substitua `removePlugin` (linhas 201–247) por:

```js
function removeArrayEntry(projectRoot, key, entry, label) {
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
    return removeJsoncText(path, raw, key, entry, label);
  }
  if (obj === null || typeof obj !== 'object') return null;
  const list = obj[key];
  if (list === undefined) return null;
  if (typeof list !== 'string' && !Array.isArray(list)) {
    console.error(`aviso: "${key}" em opencode.json não é um array — ${label} ignorado.`);
    return null;
  }
  const items = Array.isArray(list) ? list : [list];
  const kept = items.filter((p) => !(typeof p === 'string' && p.startsWith(entry)));
  if (kept.length === items.length) return null;
  if (kept.length === 0) {
    delete obj[key];
    if (Object.keys(obj).length === 0) {
      if (path.endsWith('.jsonc')) {
        writeFileSync(path, '{}\n');
      } else {
        rmSync(path, { force: true });
      }
      return { removed: entry, path };
    }
  } else {
    obj[key] = kept;
  }
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
  return { removed: entry, path };
}

export function removePlugin(projectRoot, pluginId) {
  return removeArrayEntry(projectRoot, 'plugin', pluginId, pluginLabel(pluginId));
}

export function removeInstructionsEntry(projectRoot, entry = OUTPUT_STYLE_INSTRUCTIONS) {
  return removeArrayEntry(projectRoot, 'instructions', entry, entry);
}
```

3f. Substitua `removeJsoncText` (linhas 249–282) por:

```js
function removeJsoncText(path, raw, key, entry, label) {
  const masked = maskComments(raw);
  if (!new RegExp(`"${escapeRe(key)}"\\s*:`, 'm').test(masked)) {
    const brace = masked.indexOf('{');
    const lastBrace = masked.lastIndexOf('}');
    if (brace === -1 || lastBrace <= brace) {
      console.error(`aviso: opencode.json não parece um objeto JSON — ${label} ignorado.`);
    }
    return null;
  }
  const array = arrayMatch(raw, masked, key);
  if (!array) {
    console.error(`aviso: "${key}" em opencode.json não é um array — ${label} ignorado.`);
    return null;
  }
  const open = array[0].indexOf('[');
  const inside = raw.slice(array.index + open + 1, array.index + array[0].length - 1);
  if (!entryRe(entry).test(inside)) return null;
  const newInside = inside.replace(entryRemoveRe(entry), '').replace(/,\s*$/, '').trim();
  if (newInside === '') {
    const prefix = raw.slice(0, array.index);
    const suffix = raw.slice(array.index + array[0].length);
    const suffixHadComma = /^,/.test(suffix);
    const after = suffix.replace(/^,\s*/, '');
    const prefixClean = suffixHadComma
      ? prefix
      : prefix.replace(/,\s*(\/\/[^\n]*|\/\*[\s\S]*?\*\/)?\s*$/, (_m, comment) => (comment ? ` ${comment}` : ''));
    writeFileSync(path, prefixClean + after);
  } else {
    writeFileSync(path, raw.slice(0, array.index) + `"${key}": [${newInside}\n  ]` + raw.slice(array.index + array[0].length));
  }
  return { removed: entry, path };
}
```

- [ ] **Step 4: Rodar os testes do módulo**

Run: `node --test test/opencode-config.test.mjs`
Expected: PASS (todos os antigos de `plugin`/`default_agent` + os 10 novos de `instructions`).

- [ ] **Step 5: Rodar a suíte inteira (regressão do refactor)**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/opencode-config.mjs test/opencode-config.test.mjs
git commit -m "feat: chave instructions no opencode-config com helpers de array genéricos"
```

---

### Task 2: Venda da skill + instructions e cópia no install/uninstall

**Files:**
- Create: `skills/i-have-adhd/SKILL.md`
- Create: `templates/instructions/i-have-adhd.md`
- Modify: `lib/install.mjs`
- Test: `test/install.test.mjs`

**Interfaces:**
- Consumes: nada da Task 1 (install só copia arquivos).
- Produces: opção `noOutputStyle` em `install(projectRoot, opts)`; artefatos em `.opencode/skills/i-have-adhd/SKILL.md` e `.opencode/instructions/i-have-adhd.md`; `uninstall` remove ambos e reporta em `removed`.

- [ ] **Step 1: Vendar a skill do upstream (pinada por commit)**

```bash
mkdir -p skills/i-have-adhd
curl -fsSL https://raw.githubusercontent.com/ayghri/i-have-adhd/b15d0be58f55b33972ba3e39709e0e5208ef30cb/skills/i-have-adhd/SKILL.md -o skills/i-have-adhd/SKILL.md
shasum -a 256 skills/i-have-adhd/SKILL.md
```

Expected: `3170b16ace00aecb0dd7feb54c0b5aa642e7502acda06ecd24fd89a11c7127e9  skills/i-have-adhd/SKILL.md` e 142 linhas. Se o hash divergir, pare e reporte (não edite o arquivo).

- [ ] **Step 2: Criar `templates/instructions/i-have-adhd.md`**

Conteúdo exato (inglês):

```markdown
## Output style

The reader has ADHD. Shape every response so it can be acted on:

1. Lead with the answer or next action: command, path, or snippet first.
2. Number multi-step work; one bounded action per step.
3. End with one next action doable in under two minutes.
4. Finish the current issue before raising a new one.
5. Restate progress each turn ("step 3 of 5 done").
6. Give time estimates in concrete units, never "a bit".
7. After a change, show what now works.
8. Errors: state location, cause, and fix. No drama.
9. Cap lists to 5 items.
10. No preamble, no recaps, no closers.

Exceptions: explain fully when asked to explain. Confirm before destructive actions.
After three failed fixes, stop and name the doubtful assumption. If the request is
ambiguous, ask one short question.

### Human-readable artifacts

Apply the same shape to anything a person will read: PR bodies, commit messages,
docs, specs, plans.

- PR body: first line = what changed and why; numbered test plan; risks/review focus
  before prose. No filler.
- Commit messages: conventional, imperative, one line; body only when it adds information.
- Docs/specs/plans: conclusion first; short sentences; concrete examples; headers for
  skimming; keep enough context to stand alone (unlike chat, a doc has no history).
- Comments: only when the code does not explain itself.
- Lists: max 5 per group, most relevant first; groups instead of a long list.

Stay on for the whole session. Turn off only when the user says "stop adhd mode" or
"normal mode"; confirm in one line, then use the default style.
```

- [ ] **Step 3: Escrever os testes que falham**

Append em `test/install.test.mjs`:

```js
test('install: copia a skill i-have-adhd e o instructions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-'));
  install(dir, {});
  const vendada = readFileSync(new URL('../skills/i-have-adhd/SKILL.md', import.meta.url), 'utf8');
  const copiada = readFileSync(join(dir, '.opencode', 'skills', 'i-have-adhd', 'SKILL.md'), 'utf8');
  assert.equal(copiada, vendada);
  const src = readFileSync(new URL('../templates/instructions/i-have-adhd.md', import.meta.url), 'utf8');
  const instructions = readFileSync(join(dir, '.opencode', 'instructions', 'i-have-adhd.md'), 'utf8');
  assert.equal(instructions, src);
});

test('install: noOutputStyle pula a skill e o instructions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-'));
  install(dir, { noOutputStyle: true });
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'i-have-adhd')));
  assert.ok(!existsSync(join(dir, '.opencode', 'instructions', 'i-have-adhd.md')));
});

test('install: update sobrescreve skill e instructions editados', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-'));
  install(dir, {});
  writeFileSync(join(dir, '.opencode', 'skills', 'i-have-adhd', 'SKILL.md'), '# meu\n');
  writeFileSync(join(dir, '.opencode', 'instructions', 'i-have-adhd.md'), '# meu\n');
  install(dir, {});
  const vendada = readFileSync(new URL('../skills/i-have-adhd/SKILL.md', import.meta.url), 'utf8');
  assert.equal(readFileSync(join(dir, '.opencode', 'skills', 'i-have-adhd', 'SKILL.md'), 'utf8'), vendada);
  const src = readFileSync(new URL('../templates/instructions/i-have-adhd.md', import.meta.url), 'utf8');
  assert.equal(readFileSync(join(dir, '.opencode', 'instructions', 'i-have-adhd.md'), 'utf8'), src);
});

test('uninstall: remove a skill i-have-adhd e o instructions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-uninstall-'));
  install(dir, {});
  const { removed } = uninstall(dir);
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'i-have-adhd')));
  assert.ok(!existsSync(join(dir, '.opencode', 'instructions', 'i-have-adhd.md')));
  assert.ok(removed.includes('.opencode/skills/i-have-adhd'));
  assert.ok(removed.includes('.opencode/instructions/i-have-adhd.md'));
});
```

- [ ] **Step 4: Rodar os testes para ver falhar**

Run: `node --test test/install.test.mjs`
Expected: FAIL — arquivos `.opencode/skills/i-have-adhd/SKILL.md` inexistentes.

- [ ] **Step 5: Implementar em `lib/install.mjs`**

5a. Na assinatura de `install` (linha 36), adicione a opção:

```js
export function install(projectRoot, { noAgents = false, noAgentBrowser = false, noHooks = false, noSuperpowers = false, noProfile = false, noCodegraph = false, noOutputStyle = false } = {}) {
```

5b. Depois do bloco da skill taste-skill (linha 77, após o `cpSync` dela), insira:

```js
  if (!noOutputStyle) {
    const styleSkillDir = join(projectRoot, '.opencode', 'skills', 'i-have-adhd');
    mkdirSync(styleSkillDir, { recursive: true });
    cpSync(join(PKG_ROOT, 'skills', 'i-have-adhd'), styleSkillDir, { recursive: true });

    const instructionsDir = join(projectRoot, '.opencode', 'instructions');
    mkdirSync(instructionsDir, { recursive: true });
    copyFileSync(join(PKG_ROOT, 'templates', 'instructions', 'i-have-adhd.md'), join(instructionsDir, 'i-have-adhd.md'));
  }
```

5c. No `uninstall`, depois do bloco da skill taste-skill (linha 149), insira:

```js
  const styleSkillDir = join(projectRoot, '.opencode', 'skills', 'i-have-adhd');
  if (existsSync(styleSkillDir)) {
    rmSync(styleSkillDir, { recursive: true, force: true });
    removed.push('.opencode/skills/i-have-adhd');
  }

  const styleInstructions = join(projectRoot, '.opencode', 'instructions', 'i-have-adhd.md');
  if (existsSync(styleInstructions)) {
    rmSync(styleInstructions, { force: true });
    removed.push('.opencode/instructions/i-have-adhd.md');
  }
```

- [ ] **Step 6: Rodar os testes**

Run: `node --test test/install.test.mjs`
Expected: PASS.

- [ ] **Step 7: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add skills/i-have-adhd/SKILL.md templates/instructions/i-have-adhd.md lib/install.mjs test/install.test.mjs
git commit -m "feat: venda a skill i-have-adhd e o instructions always-on no install/uninstall"
```

---

### Task 3: CLI — flag, registro da entrada e testes de ponta a ponta

**Files:**
- Modify: `bin/bento.mjs`
- Modify: `test/cli.test.mjs`

**Interfaces:**
- Consumes: `addInstructionsEntry`/`removeInstructionsEntry` (Task 1) e a opção `noOutputStyle` (Task 2).
- Produces: `bento install|update` registra `.opencode/instructions/i-have-adhd.md` na chave `instructions` e loga `instructions → ...`; `bento uninstall` remove a entrada; `--no-output-style` pula.

- [ ] **Step 1: Escrever os testes novos e ajustar os 3 testes afetados**

1a. Append em `test/cli.test.mjs`:

```js
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
```

1b. No teste `update: flash do usuário (sem marcador) não vira default_agent` (linha ~169), troque a última asserção:

```js
  assert.ok(!existsSync(join(dir, 'opencode.json')));
```

por:

```js
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.equal(obj.default_agent, undefined);
```

1c. No teste `update --no-profile: não cria agents do perfil nem default_agent` (linha ~180), acrescente `--no-output-style` aos args:

```js
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-profile', '--no-ponytail', '--no-codegraph', '--no-agent-browser', '--no-output-style'], { cwd: dir, encoding: 'utf8' });
```

1d. No teste `update --no-superpowers --no-ponytail --no-codegraph --no-agent-browser: não toca opencode.json` (linha ~191), acrescente `--no-output-style` aos args:

```js
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-superpowers', '--no-ponytail', '--no-codegraph', '--no-agent-browser', '--no-profile', '--no-output-style'], { cwd: dir, encoding: 'utf8' });
```

- [ ] **Step 2: Rodar os testes para ver falhar**

Run: `node --test test/cli.test.mjs`
Expected: FAIL nos 3 testes novos (`instructions` ausente no stdout/config).

- [ ] **Step 3: Implementar em `bin/bento.mjs`**

3a. Atualize o import (linha 8):

```js
import { addPonytailPlugin, removePonytailPlugin, removeSuperpowersPlugin, setDefaultAgentIfAbsent, removeDefaultAgentIf, addInstructionsEntry, removeInstructionsEntry } from '../lib/opencode-config.mjs';
```

3b. Adicione a flag junto das demais (linha ~33):

```js
  const noOutputStyle = args.includes('--no-output-style');
```

3c. Nos dois casos (`install` e `update`), passe a opção:

```js
      const result = install(process.cwd(), { noAgents, noAgentBrowser, noHooks, noSuperpowers, noProfile, noCodegraph, noOutputStyle });
```

3d. Nos dois casos (`install` e `update`), depois do bloco do ponytail (linha ~68 e ~107), insira:

```js
      if (!noOutputStyle) {
        const st = addInstructionsEntry(process.cwd());
        if (st) console.log('  instructions → .opencode/instructions/i-have-adhd.md');
      }
```

3e. No `uninstall`, depois de `const pt = removePonytailPlugin(process.cwd());` (linha ~133), insira:

```js
      const st = removeInstructionsEntry(process.cwd());
```

E na montagem da lista `all`, depois de `if (pt) all.push(...)`, insira:

```js
      if (st) all.push(`instructions (${st.path})`);
```

3f. No texto de usage (linha ~164), atualize para incluir a flag:

```
  install          instala skill, scripts, config, hook pre-push, gh-stack, skills vendadas do superpowers, agents, ponytail, codegraph, agent-browser e o output style (instructions) no projeto
                   (--no-agents pula AGENTS.md; --no-superpowers pula skills vendadas/agent superpowers (não mexe no plugin);
                    --no-profile pula os agents do bento e o default_agent; --no-ponytail pula ponytail;
                    --no-hooks pula o pre-push; --no-codegraph pula codegraph; --no-agent-browser pula agent-browser;
                    --no-output-style pula a skill i-have-adhd e a entrada em instructions)
```

- [ ] **Step 4: Rodar os testes de CLI**

Run: `node --test test/cli.test.mjs`
Expected: PASS.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add bin/bento.mjs test/cli.test.mjs
git commit -m "feat: flag --no-output-style e registro do instructions no CLI"
```

---

### Task 4: Documentação (AGENTS.md e README)

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: comportamento implementado nas Tasks 1–3.
- Produces: nada (docs).

- [ ] **Step 1: Atualizar `AGENTS.md`**

1a. No parágrafo de abertura (linha 3), acrescente o output style antes de "e hook pre-push":

```
CLI que instala/atualiza/remove, num projeto consumidor, o fluxo opencode pessoal: skill `small-prs` (limites de PR + split), plugin ponytail, 14 skills vendadas do superpowers com agents escopados (`flash`, `superpowers`, `explorer`, `verify`, `browser`), MCP servers (codegraph, agent-browser), skill agent-browser/taste-skill, estilo de saída direto (skill `i-have-adhd` + `instructions` always-on) e hook pre-push.
```

1b. No bullet de `install`/`update` da seção CLI (linha 9), acrescente após "`taste-skill` e, salvo flag, `agent-browser`)":

```
, o output style (`.opencode/skills/i-have-adhd`, `.opencode/instructions/i-have-adhd.md` e a chave `instructions` no `opencode.json`/`.jsonc`; pule com `--no-output-style`)
```

1c. Na lista de flags (linha 10), acrescente `--no-output-style` ao final:

```
- Flags de install/update: `--no-agents`, `--no-superpowers` (pula skills vendadas + agent superpowers; não mexe no plugin nem avança o snapshot `.bento/skills`), `--no-profile` (pula agents de perfil + `default_agent`), `--no-ponytail`, `--no-hooks`, `--no-codegraph`, `--no-agent-browser`, `--no-output-style`.
```

1d. No bullet de `lib/opencode-config.mjs` da seção Arquitetura (linha 11), acrescente a chave `instructions`:

```
- `lib/opencode-config.mjs` — edita `opencode.json` E `opencode.jsonc` (roteia por extensão) preservando comentários; vírgulas/comentários têm testes dedicados; também gerencia a chave escalar `default_agent` (set condicional/remoção) e a entrada da chave `instructions` (`addInstructionsEntry`/`removeInstructionsEntry`).
```

1e. Na seção Arquitetura, acrescente um bullet novo depois do bullet do taste-skill:

```
- `skills/i-have-adhd/SKILL.md` — venda do upstream https://github.com/ayghri/i-have-adhd (commit `b15d0be58f55b33972ba3e39709e0e5208ef30cb`, 16/09/2026, MIT). Atualização manual: re-copiar do commit novo e atualizar este bullet. `templates/instructions/i-have-adhd.md` — ruleset always-on (resumo do upstream + seção de artefatos humanos) instalado na chave `instructions`.
```

- [ ] **Step 2: Atualizar `README.md`**

2a. Na intro (linha 3), acrescente o output style antes do hook pre-push:

```
CLI do fluxo opencode pessoal: instala e mantém, num projeto consumidor, a skill `small-prs` (limites de tamanho de PR + split em camadas), o plugin ponytail, as skills vendadas do superpowers e agents escopados, os MCP servers codegraph e agent-browser, as skills agent-browser e taste-skill, o estilo de saída direto (skill `i-have-adhd` + `instructions` always-on) e um hook pre-push.
```

2b. Na lista "Instala:" (depois da linha do agent-browser, ~linha 19), insira:

```
- `.opencode/skills/i-have-adhd/SKILL.md` + `.opencode/instructions/i-have-adhd.md` — estilo de saída direto, always-on via chave `instructions` do `opencode.json`/`.jsonc` (pule com `--no-output-style`)
```

2c. Na lista "Remove:" (depois da linha da skill agent-browser, ~linha 45), insira:

```
- `.opencode/skills/i-have-adhd/` e `.opencode/instructions/i-have-adhd.md` — output style (e a entrada em `instructions` no `opencode.json`/`.jsonc`)
```

- [ ] **Step 3: Verificar a suíte**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md README.md
git commit -m "docs: documenta o output style direto (i-have-adhd)"
```

---

## Verificação final

- [ ] `npm test` verde.
- [ ] `node bin/bento.mjs update` num diretório temporário cria `.opencode/skills/i-have-adhd/SKILL.md`, `.opencode/instructions/i-have-adhd.md` e `instructions` no `opencode.json`.
- [ ] `node bin/bento.mjs uninstall` no mesmo diretório remove tudo e não deixa `opencode.json`.
- [ ] `git show --stat HEAD~4..HEAD` mostra os 4 commits das tasks.
