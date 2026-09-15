# Agents escopados e superpowers vendado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o plugin always-on do superpowers por skills vendadas + agents escopados (`flash`, `superpowers`, `explorer`, `verify`, `browser`) com `default_agent: flash` opcional, conforme o spec `docs/superpowers/specs/2026-09-15-agentes-escopados-design.md`.

**Architecture:** Skills do superpowers v6.1.1 são vendadas em `skills/<nome>/` (diretório completo, fiel ao upstream) e copiadas para `.opencode/skills/` por `lib/vendored-skills.mjs` (copia se ausente ou idêntica; preserva se divergente; remove só se idêntica ao `.bento/skills/`). Agents são markdown em `templates/agents/<nome>.md` criados por `lib/agents.mjs` (somente se ausentes; marcador `# bento: agent` define propriedade). `lib/opencode-config.mjs` ganha `setDefaultAgentIfAbsent`/`removeDefaultAgentIf`. `bin/bento.mjs` deixa de adicionar o plugin superpowers (passa a removê-lo) e orquestra as flags novas.

**Tech Stack:** Node >= 18 puro (node:test, node:assert/strict), ESM, zero deps runtime.

## Global Constraints

- Node >= 18, ESM, zero dependências runtime (regra do repo).
- TDD obrigatório: teste falha antes da implementação (`node --test test/*.test.mjs`).
- Testes não dependem de rede nem de `gh` instalado (rede só em passos de setup do repo, nunca em teste).
- Mensagens de CLI, avisos e docs em PT-BR; conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).
- Avisos no stderr **não** falham install/update/uninstall.
- Conteúdo vendado (skills) permanece **intacto**: cópia exata do upstream no commit `d884ae04edebef577e82ff7c4e143debd0bbec99` (v6.1.1, MIT).
- `opencode.jsonc` nunca é deletado; `opencode.json` é deletado só quando fica `{}`.
- Agents existentes **nunca** são sobrescritos por install/update.
- Marcador de propriedade de agent: regex `/^#\s*bento:\s*agent\b/m`.
- Flags finais: `--no-superpowers` (skills vendadas + agent superpowers; não mexe no plugin), `--no-profile` (agents flash/verify/explorer/browser + `default_agent`), `--no-codegraph`/`--no-agent-browser` (também pulam explorer/browser), `--no-agents`/`--no-hooks`/`--no-ponytail` inalteradas.
- Skills vendadas (14): brainstorming, dispatching-parallel-agents, executing-plans, finishing-a-development-branch, receiving-code-review, requesting-code-review, subagent-driven-development, systematic-debugging, test-driven-development, using-git-worktrees, using-superpowers, verification-before-completion, writing-plans, writing-skills.
- `agent-browser`, `small-prs` e `taste-skill` continuam com o fluxo atual (não entram em `VENDORED_SKILLS`).

---

### Task 1: Vendar as 14 skills e criar `lib/vendored-skills.mjs`

**Files:**
- Create: `skills/<14 nomes>/` (diretórios completos do upstream)
- Create: `lib/vendored-skills.mjs`
- Create: `test/vendored-skills.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: `VENDORED_SKILLS` (array de 14 nomes), `sameTree(a, b)` → boolean, `installVendoredSkills(projectRoot, sourceSkillsRoot, names = VENDORED_SKILLS)` → `{ installed: string[], skipped: string[] }`, `removeVendoredSkills(projectRoot, referenceSkillsRoot, names = VENDORED_SKILLS)` → `{ removed: string[], preserved: string[] }`. Consumidos pela Task 5.

- [ ] **Step 1: Copiar os diretórios da venda pinada**

```bash
tmp=$(mktemp -d)
git clone --quiet https://github.com/obra/superpowers.git "$tmp/superpowers"
git -C "$tmp/superpowers" checkout --quiet d884ae04edebef577e82ff7c4e143debd0bbec99
for s in brainstorming dispatching-parallel-agents executing-plans finishing-a-development-branch receiving-code-review requesting-code-review subagent-driven-development systematic-debugging test-driven-development using-git-worktrees using-superpowers verification-before-completion writing-plans writing-skills; do
  rm -rf "skills/$s"
  cp -R "$tmp/superpowers/skills/$s" "skills/$s"
done
rm -rf "$tmp"
ls skills | wc -l
```

Expected: `17` (14 vendadas + small-prs + taste-skill + agent-browser). Nenhum arquivo vendado pode ser editado depois.

- [ ] **Step 2: Escrever os testes que falham**

Criar `test/vendored-skills.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VENDORED_SKILLS, sameTree, installVendoredSkills, removeVendoredSkills } from '../lib/vendored-skills.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'bento-vendored-'));
}

function makeSource(prefix = 'bento-src-') {
  const root = mkdtempSync(join(tmpdir(), prefix));
  for (const name of ['a', 'b']) {
    mkdirSync(join(root, name), { recursive: true });
    writeFileSync(join(root, name, 'SKILL.md'), `# ${name}\n`);
  }
  mkdirSync(join(root, 'a', 'scripts'), { recursive: true });
  writeFileSync(join(root, 'a', 'scripts', 'helper.js'), 'console.log(1);\n');
  return root;
}

test('VENDORED_SKILLS tem as 14 skills do superpowers e não inclui agent-browser', () => {
  assert.equal(VENDORED_SKILLS.length, 14);
  assert.ok(VENDORED_SKILLS.includes('brainstorming'));
  assert.ok(VENDORED_SKILLS.includes('using-superpowers'));
  assert.ok(!VENDORED_SKILLS.includes('agent-browser'));
  assert.ok(!VENDORED_SKILLS.includes('small-prs'));
});

test('sameTree: igual só com mesmos caminhos e bytes', () => {
  const src = makeSource();
  const project = tmp();
  installVendoredSkills(project, src, ['a', 'b']);
  assert.ok(sameTree(join(src, 'a'), join(project, '.opencode', 'skills', 'a')));
  assert.ok(!sameTree(join(src, 'a'), join(src, 'b')));
  assert.ok(!sameTree(join(src, 'a'), join(project, '.opencode', 'skills', 'nao-existe')));
  const altered = join(tmp(), 'copy');
  cpSync(join(src, 'a'), altered, { recursive: true });
  assert.ok(sameTree(join(src, 'a'), altered));
  writeFileSync(join(altered, 'scripts', 'helper.js'), 'console.log(2);\n');
  assert.ok(!sameTree(join(src, 'a'), altered));
});

test('installVendoredSkills: copia recursivamente (inclui arquivos auxiliares)', () => {
  const src = makeSource();
  const project = tmp();
  const r = installVendoredSkills(project, src, ['a', 'b']);
  assert.deepEqual(r.installed, ['a', 'b']);
  assert.deepEqual(r.skipped, []);
  assert.ok(existsSync(join(project, '.opencode', 'skills', 'a', 'scripts', 'helper.js')));
  assert.equal(readFileSync(join(project, '.opencode', 'skills', 'a', 'SKILL.md'), 'utf8'), '# a\n');
});

test('installVendoredSkills: preserva skill existente com conteúdo diferente (avisa)', (t) => {
  const src = makeSource();
  const project = tmp();
  mkdirSync(join(project, '.opencode', 'skills', 'a'), { recursive: true });
  writeFileSync(join(project, '.opencode', 'skills', 'a', 'SKILL.md'), '# meu\n');
  const mock = t.mock.method(console, 'error', () => {});
  const r = installVendoredSkills(project, src, ['a', 'b']);
  assert.deepEqual(r.installed, ['b']);
  assert.deepEqual(r.skipped, ['a']);
  assert.equal(mock.mock.callCount(), 1);
  assert.ok(mock.mock.calls[0].arguments[0].includes('conteúdo diferente'));
  assert.equal(readFileSync(join(project, '.opencode', 'skills', 'a', 'SKILL.md'), 'utf8'), '# meu\n');
});

test('installVendoredSkills: idempotente quando já idêntica', () => {
  const src = makeSource();
  const project = tmp();
  installVendoredSkills(project, src, ['a']);
  const r = installVendoredSkills(project, src, ['a']);
  assert.deepEqual(r.installed, ['a']);
  assert.deepEqual(r.skipped, []);
});

test('removeVendoredSkills: remove só o que é idêntico à referência', () => {
  const src = makeSource();
  const project = tmp();
  installVendoredSkills(project, src, ['a', 'b']);
  mkdirSync(join(project, '.bento', 'skills'), { recursive: true });
  cpSync(join(src, 'a'), join(project, '.bento', 'skills', 'a'), { recursive: true });
  cpSync(join(src, 'b'), join(project, '.bento', 'skills', 'b'), { recursive: true });
  writeFileSync(join(project, '.opencode', 'skills', 'b', 'SKILL.md'), '# modificada\n');
  const mock = t.mock.method(console, 'error', () => {});
  const r = removeVendoredSkills(project, join(project, '.bento', 'skills'), ['a', 'b']);
  assert.deepEqual(r.removed, ['.opencode/skills/a']);
  assert.deepEqual(r.preserved, ['b']);
  assert.ok(!existsSync(join(project, '.opencode', 'skills', 'a')));
  assert.ok(existsSync(join(project, '.opencode', 'skills', 'b')));
  assert.equal(mock.mock.callCount(), 1);
});

test('removeVendoredSkills: preserva quando não há referência em .bento', () => {
  const src = makeSource();
  const project = tmp();
  installVendoredSkills(project, src, ['a']);
  const r = removeVendoredSkills(project, join(project, '.bento', 'skills'), ['a']);
  assert.deepEqual(r.removed, []);
  assert.deepEqual(r.preserved, ['a']);
  assert.ok(existsSync(join(project, '.opencode', 'skills', 'a')));
});
```

- [ ] **Step 3: Rodar os testes para ver falhar**

Run: `node --test test/vendored-skills.test.mjs`
Expected: FAIL com `Cannot find module '../lib/vendored-skills.mjs'`.

- [ ] **Step 4: Implementar `lib/vendored-skills.mjs`**

```js
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const VENDORED_SKILLS = [
  'brainstorming',
  'dispatching-parallel-agents',
  'executing-plans',
  'finishing-a-development-branch',
  'receiving-code-review',
  'requesting-code-review',
  'subagent-driven-development',
  'systematic-debugging',
  'test-driven-development',
  'using-git-worktrees',
  'using-superpowers',
  'verification-before-completion',
  'writing-plans',
  'writing-skills',
];

function listFiles(root, base = root, acc = []) {
  const entries = readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const abs = join(root, entry.name);
    if (entry.isDirectory()) listFiles(abs, base, acc);
    else acc.push(abs.slice(base.length + 1));
  }
  return acc;
}

export function sameTree(a, b) {
  if (!existsSync(a) || !existsSync(b)) return false;
  const filesA = listFiles(a);
  const filesB = listFiles(b);
  if (filesA.length !== filesB.length) return false;
  for (let i = 0; i < filesA.length; i += 1) {
    if (filesA[i] !== filesB[i]) return false;
    if (!readFileSync(join(a, filesA[i])).equals(readFileSync(join(b, filesB[i])))) return false;
  }
  return true;
}

export function installVendoredSkills(projectRoot, sourceSkillsRoot, names = VENDORED_SKILLS) {
  const installed = [];
  const skipped = [];
  for (const name of names) {
    const src = join(sourceSkillsRoot, name);
    const dest = join(projectRoot, '.opencode', 'skills', name);
    if (existsSync(dest) && !sameTree(src, dest)) {
      console.error(`aviso: skill ${name} já existe com conteúdo diferente; preservada.`);
      skipped.push(name);
      continue;
    }
    cpSync(src, dest, { recursive: true });
    installed.push(name);
  }
  return { installed, skipped };
}

export function removeVendoredSkills(projectRoot, referenceSkillsRoot, names = VENDORED_SKILLS) {
  const removed = [];
  const preserved = [];
  for (const name of names) {
    const dest = join(projectRoot, '.opencode', 'skills', name);
    if (!existsSync(dest)) continue;
    const ref = join(referenceSkillsRoot, name);
    if (existsSync(ref) && sameTree(dest, ref)) {
      rmSync(dest, { recursive: true, force: true });
      removed.push(`.opencode/skills/${name}`);
    } else {
      console.error(`aviso: skill ${name} foi modificada; preservada.`);
      preserved.push(name);
    }
  }
  return { removed, preserved };
}
```

- [ ] **Step 5: Rodar os testes para ver passar**

Run: `node --test test/vendored-skills.test.mjs`
Expected: PASS (7 testes).

- [ ] **Step 6: Rodar a suíte completa**

Run: `npm test`
Expected: todos passam (nenhum teste existente depende das skills novas).

- [ ] **Step 7: Commit**

```bash
git add skills lib/vendored-skills.mjs test/vendored-skills.test.mjs
git commit -m "feat: vendas do superpowers v6.1.1 e lib de skills vendadas"
```

---

### Task 2: Templates dos 5 agents + testes de frontmatter

**Files:**
- Create: `templates/agents/flash.md`
- Create: `templates/agents/superpowers.md` (montado a partir da Task 1)
- Create: `templates/agents/explorer.md`
- Create: `templates/agents/verify.md`
- Create: `templates/agents/browser.md`
- Create: `test/agents.test.mjs` (somente os testes de template nesta task; testes de comportamento entram na Task 3)

**Interfaces:**
- Consumes: `skills/using-superpowers/SKILL.md` (Task 1).
- Produces: 5 arquivos em `templates/agents/` com frontmatter válido e marcador. Consumidos pela Task 3.

- [ ] **Step 1: Escrever os testes que falham**

Criar `test/agents.test.mjs` (os imports de `lib/agents.mjs` só entram na Task 3 — por ora só o bloco de template):

```js
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
```

- [ ] **Step 2: Rodar os testes para ver falhar**

Run: `node --test test/agents.test.mjs`
Expected: FAIL com `ENOENT` para `templates/agents/flash.md`.

- [ ] **Step 3: Criar `templates/agents/flash.md`**

```markdown
---
# bento: agent v1 — edite livremente
description: Agente principal enxuto para modelos rápidos — passos pequenos, verificação com evidência e delegação.
mode: primary
permission:
  skill:
    "*": allow
    brainstorming: deny
    dispatching-parallel-agents: deny
    executing-plans: deny
    finishing-a-development-branch: deny
    receiving-code-review: deny
    requesting-code-review: deny
    subagent-driven-development: deny
    systematic-debugging: deny
    test-driven-development: deny
    using-git-worktrees: deny
    using-superpowers: deny
    verification-before-completion: deny
    writing-plans: deny
    writing-skills: deny
    agent-browser: deny
  task:
    "*": deny
    explorer: allow
    verify: allow
    browser: allow
  "codegraph_*": deny
  "agent-browser_*": deny
---

# Modo enxuto (modelo rápido)

Você trabalha em passos pequenos e verificáveis.

1. Uma tarefa por vez; mantenha a lista em `todowrite` e atualize conforme conclui.
2. Leia o arquivo antes de editá-lo; siga as convenções existentes; não invente API — consulte as docs do projeto.
3. Nunca declare algo pronto sem evidência: rode a verificação do projeto (testes/lint) e cole a saída no relatório.
4. Antes de abrir PR, confira `.pr-limits.yaml` e use a skill `small-prs` se o diff crescer.
5. Delegue: `@explorer` para localizar código, `@verify` para verificação independente antes de concluir tarefas grandes, `@browser` para páginas web.
6. Em ambiguidade, pergunte com a tool `question` em vez de presumir.
7. Prefira a mudança mínima; sem refactor não pedido.
```

- [ ] **Step 4: Criar `templates/agents/explorer.md`**

```markdown
---
# bento: agent v1 — edite livremente
description: Explora o codebase com codegraph (read-only) e devolve síntese curta com arquivo:linha.
mode: subagent
permission:
  edit: deny
  bash: deny
  task: deny
  skill:
    "*": deny
  "codegraph_*": allow
  "agent-browser_*": deny
---

# Explorador

Localize e explique código usando as tools `codegraph_*` e as tools nativas `read`/`grep`/`glob`.

- Devolva uma síntese curta (até ~15 linhas) com `arquivo:linha` do que importa para a tarefa.
- Não edite arquivos e não execute comandos (`bash` negado).
```

- [ ] **Step 5: Criar `templates/agents/verify.md`**

```markdown
---
# bento: agent v1 — edite livremente
description: Verificador independente read-only — cita arquivo:linha, roda a verificação e cola a saída.
mode: subagent
temperature: 0
permission:
  edit: deny
  task: deny
  skill:
    "*": deny
  bash:
    "*": ask
    "git diff*": allow
    "git log*": allow
    "git status*": allow
    "git show*": allow
    "node --test*": allow
    "npm test*": allow
  "codegraph_*": deny
  "agent-browser_*": deny
---

# Verificador independente

Read-only e cético. Verifique o trabalho descrito pelo agente principal:

1. Rode os comandos de verificação (testes/lint) e **cole a saída**; não resuma sem mostrar.
2. Cite sempre `arquivo:linha`; se não conseguir citar, não reporte.
3. Separe o veredito em: conformidade com o pedido/spec · qualidade e bugs · riscos.
4. Verifique por conteúdo (abra o arquivo), nunca por hash ou pela descrição de outro agente.
5. Não edite nada e não proponha refactors fora do escopo.
```

- [ ] **Step 6: Criar `templates/agents/browser.md`**

```markdown
---
# bento: agent v1 — edite livremente
description: Automação de browser (agent-browser) para testar/inspecionar páginas e devolver evidência.
mode: subagent
permission:
  edit: deny
  task: deny
  skill:
    "*": deny
    agent-browser: allow
  bash:
    "*": deny
    "agent-browser *": allow
  "codegraph_*": deny
  "agent-browser_*": allow
---

# Browser

Use as tools `agent-browser_*` (e a skill `agent-browser` quando precisar do fluxo completo).

- Devolva evidência: URL, resultado textual ou caminho de screenshot.
- Não edite arquivos do projeto (`edit` negado).
```

- [ ] **Step 7: Montar `templates/agents/superpowers.md`**

```bash
mkdir -p templates/agents
{
  cat <<'YAML'
---
# bento: agent v1 — edite livremente
# Vendado de obra/superpowers v6.1.1 (commit d884ae04edebef577e82ff7c4e143debd0bbec99, MIT). Atualização manual.
description: Fluxo superpowers completo (brainstorm → plano → execução com subagentes → review). Use para features e trabalho criativo.
mode: primary
permission:
  "codegraph_*": deny
  "agent-browser_*": deny
---
YAML
  echo '<EXTREMELY_IMPORTANT>'
  echo 'You have superpowers.'
  echo
  echo '**IMPORTANT: The using-superpowers skill content is included below. It is ALREADY LOADED - you are currently following it. Do NOT use the skill tool to load "using-superpowers" again - that would be redundant.**'
  echo
  node -e "const fs=require('fs');const s=fs.readFileSync('skills/using-superpowers/SKILL.md','utf8');process.stdout.write(s.replace(/^---\n[\s\S]*?\n---\n/,'').trim()+'\n')"
  echo
  cat <<'MAPPING'
**Tool Mapping for OpenCode:**
When skills request actions, substitute OpenCode equivalents:
- Create or update todos → `todowrite`
- `Subagent (general-purpose):` → `task` with `subagent_type: "general"`
- Invoke a skill → OpenCode's native `skill` tool
- Read files → `read`
- Create, edit, or delete files → `apply_patch`
- Run shell commands → `bash`
- Search files → `grep`, `glob`
- Fetch a URL → `webfetch`

Use OpenCode's native `skill` tool to list and load skills.
MAPPING
  echo '</EXTREMELY_IMPORTANT>'
} > templates/agents/superpowers.md
head -12 templates/agents/superpowers.md
```

Expected: frontmatter com marcador + `mode: primary`, seguido de `<EXTREMELY_IMPORTANT>`.

- [ ] **Step 8: Rodar os testes para ver passar**

Run: `node --test test/agents.test.mjs`
Expected: PASS (6 testes).

- [ ] **Step 9: Rodar a suíte completa**

Run: `npm test`
Expected: todos passam.

- [ ] **Step 10: Commit**

```bash
git add templates/agents test/agents.test.mjs
git commit -m "feat: templates dos agents escopados (flash, superpowers, explorer, verify, browser)"
```

---

### Task 3: `lib/agents.mjs` — instala/pula/remove agents com marcador

**Files:**
- Create: `lib/agents.mjs`
- Modify: `test/agents.test.mjs` (adicionar imports e testes de comportamento)

**Interfaces:**
- Consumes: `templates/agents/*.md` (Task 2).
- Produces: `AGENT_MARKER` (RegExp), `isBentoAgent(filePath)` → boolean, `installAgents(projectRoot, { profile, superpowers, codegraph, agentBrowser })` → `{ created: string[], skipped: string[] }`, `removeAgents(projectRoot)` → `{ removed: string[] }` (entradas no formato `.opencode/agents/<nome>.md`). Consumidos pela Task 5.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar no topo de `test/agents.test.mjs` (junto ao import de `readFileSync`):

```js
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AGENT_MARKER, isBentoAgent, installAgents, removeAgents } from '../lib/agents.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'bento-agents-'));
}

function agentPath(dir, name) {
  return join(dir, '.opencode', 'agents', `${name}.md`);
}
```

E anexar ao fim do arquivo:

```js
test('AGENT_MARKER/isBentoAgent: só reconhece marcador no frontmatter', () => {
  const dir = tmp();
  mkdirSync(join(dir, '.opencode', 'agents'), { recursive: true });
  writeFileSync(agentPath(dir, 'flash'), '---\n# bento: agent v1\n---\n');
  writeFileSync(agentPath(dir, 'user'), '---\ndescription: meu\n---\n');
  assert.ok(AGENT_MARKER.test('---\n# bento: agent v1\n---\n'));
  assert.ok(isBentoAgent(agentPath(dir, 'flash')));
  assert.ok(!isBentoAgent(agentPath(dir, 'user')));
  assert.ok(!isBentoAgent(agentPath(dir, 'nao-existe')));
});

test('installAgents: cria os 5 por padrão, só se ausentes', () => {
  const dir = tmp();
  const r = installAgents(dir);
  assert.deepEqual(r.created.sort(), ['browser', 'explorer', 'flash', 'superpowers', 'verify']);
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
  assert.equal(removed.length, 5);
  assert.ok(removed.includes('.opencode/agents/flash.md'));
  assert.ok(!existsSync(agentPath(dir, 'flash')));
  assert.ok(existsSync(agentPath(dir, 'meu')));
});
```

- [ ] **Step 2: Rodar os testes para ver falhar**

Run: `node --test test/agents.test.mjs`
Expected: FAIL com `Cannot find module '../lib/agents.mjs'`.

- [ ] **Step 3: Implementar `lib/agents.mjs`**

```js
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_NAMES = ['flash', 'superpowers', 'explorer', 'verify', 'browser'];

export const AGENT_MARKER = /^#\s*bento:\s*agent\b/m;

export function isBentoAgent(filePath) {
  try {
    return AGENT_MARKER.test(readFileSync(filePath, 'utf8'));
  } catch {
    return false;
  }
}

function wantedAgents({ profile = true, superpowers = true, codegraph = true, agentBrowser = true } = {}) {
  const wanted = [];
  if (profile) wanted.push('flash', 'verify');
  if (superpowers) wanted.push('superpowers');
  if (profile && codegraph) wanted.push('explorer');
  if (profile && agentBrowser) wanted.push('browser');
  return wanted;
}

export function installAgents(projectRoot, opts = {}) {
  const created = [];
  const skipped = [];
  for (const name of wantedAgents(opts)) {
    const dir = join(projectRoot, '.opencode', 'agents');
    const dest = join(dir, `${name}.md`);
    if (existsSync(dest)) {
      if (!isBentoAgent(dest)) {
        console.error(`aviso: ${name}.md já existe e não é do bento; pulado.`);
        skipped.push(name);
      }
      continue;
    }
    mkdirSync(dir, { recursive: true });
    cpSync(join(PKG_ROOT, 'templates', 'agents', `${name}.md`), dest);
    created.push(name);
  }
  return { created, skipped };
}

export function removeAgents(projectRoot, names = AGENT_NAMES) {
  const removed = [];
  for (const name of names) {
    const dest = join(projectRoot, '.opencode', 'agents', `${name}.md`);
    if (existsSync(dest) && isBentoAgent(dest)) {
      rmSync(dest, { force: true });
      removed.push(`.opencode/agents/${name}.md`);
    }
  }
  return { removed };
}
```

- [ ] **Step 4: Rodar os testes para ver passar**

Run: `node --test test/agents.test.mjs`
Expected: PASS (11 testes).

- [ ] **Step 5: Rodar a suíte completa**

Run: `npm test`
Expected: todos passam.

- [ ] **Step 6: Commit**

```bash
git add lib/agents.mjs test/agents.test.mjs
git commit -m "feat: lib/agents.mjs (instala, pula e remove agents com marcador)"
```

---

### Task 4: `default_agent` no `lib/opencode-config.mjs`

**Files:**
- Modify: `lib/opencode-config.mjs` (adicionar constantes e funções ao fim)
- Modify: `test/opencode-config.test.mjs` (imports + testes novos)

**Interfaces:**
- Consumes: `configPath` (privado do módulo).
- Produces: `BENTO_DEFAULT_AGENT = 'flash'`, `setDefaultAgentIfAbsent(projectRoot, name = BENTO_DEFAULT_AGENT)` → `{ changed, path }` | `{ skipped: true, value }` | `null`; `removeDefaultAgentIf(projectRoot, name = BENTO_DEFAULT_AGENT)` → `{ removed, path }` | `null`. Consumidos pela Task 6.

- [ ] **Step 1: Escrever os testes que falham**

Atualizar o import em `test/opencode-config.test.mjs` para incluir as funções novas:

```js
import { addPlugin, addPonytailPlugin, addSuperpowersPlugin, removePlugin, removePonytailPlugin, removeSuperpowersPlugin, setDefaultAgentIfAbsent, removeDefaultAgentIf, BENTO_DEFAULT_AGENT, PONYTAIL_PLUGIN, SUPERPOWERS_PLUGIN } from '../lib/opencode-config.mjs';
```

Anexar ao fim do arquivo:

```js
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

test('default_agent: remove com json inválido — avisa e não altera', (t) => {
  const dir = tmp();
  writeFileSync(join(dir, 'opencode.json'), '{ "default_agent": }');
  const mock = t.mock.method(console, 'error', () => {});
  assert.equal(removeDefaultAgentIf(dir), null);
  assert.equal(mock.mock.callCount(), 1);
});
```

- [ ] **Step 2: Rodar os testes para ver falhar**

Run: `node --test test/opencode-config.test.mjs`
Expected: FAIL com `setDefaultAgentIfAbsent is not a function`.

- [ ] **Step 3: Implementar no fim de `lib/opencode-config.mjs`**

```js
export const BENTO_DEFAULT_AGENT = 'flash';

export function setDefaultAgentIfAbsent(projectRoot, name = BENTO_DEFAULT_AGENT) {
  const path = configPath(projectRoot);
  let raw = null;
  if (existsSync(path)) {
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      console.error(`aviso: não foi possível ler ${path} — default_agent pulado.`);
      return null;
    }
  }
  if (raw === null || raw.trim() === '') {
    writeFileSync(path, `{\n  "default_agent": "${name}"\n}\n`);
    return { changed: 'default_agent', path };
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    if (!path.endsWith('.jsonc')) {
      console.error(`aviso: opencode.json não é um objeto JSON válido — default_agent pulado.`);
      return null;
    }
    return setJsoncDefaultAgent(path, raw, name);
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    console.error(`aviso: opencode.json não é um objeto JSON — default_agent pulado.`);
    return null;
  }
  if (typeof obj.default_agent === 'string') {
    console.error(`aviso: default_agent já definido ("${obj.default_agent}"); preservado.`);
    return { skipped: true, value: obj.default_agent };
  }
  if (obj.default_agent !== undefined) {
    console.error(`aviso: "default_agent" em opencode.json não é uma string — default_agent pulado.`);
    return null;
  }
  obj.default_agent = name;
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
  return { changed: 'default_agent', path };
}

function setJsoncDefaultAgent(path, raw, name) {
  if (/"default_agent"\s*:/m.test(raw)) {
    const m = /"default_agent"\s*:\s*"([^"]*)"/m.exec(raw);
    const value = m ? m[1] : '';
    console.error(`aviso: default_agent já definido ("${value}"); preservado.`);
    return { skipped: true, value };
  }
  const brace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (brace === -1 || lastBrace <= brace) {
    console.error('aviso: opencode.json não parece um objeto JSON — default_agent pulado.');
    return null;
  }
  const middle = raw.slice(brace + 1, lastBrace);
  const updated = raw.slice(0, brace + 1) + `\n  "default_agent": "${name}"` + (middle.trim() ? ',' : '\n') + middle + raw.slice(lastBrace);
  writeFileSync(path, updated);
  return { changed: 'default_agent', path };
}

export function removeDefaultAgentIf(projectRoot, name = BENTO_DEFAULT_AGENT) {
  const path = configPath(projectRoot);
  if (!existsSync(path)) return null;
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.error(`aviso: não foi possível ler ${path} — default_agent ignorado.`);
    return null;
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    if (!path.endsWith('.jsonc')) {
      console.error(`aviso: opencode.json não é um objeto JSON válido — default_agent ignorado.`);
      return null;
    }
    return removeJsoncDefaultAgent(path, raw, name);
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return null;
  if (obj.default_agent !== name) return null;
  delete obj.default_agent;
  if (Object.keys(obj).length === 0) {
    if (path.endsWith('.jsonc')) {
      writeFileSync(path, '{}\n');
    } else {
      rmSync(path, { force: true });
    }
    return { removed: 'default_agent', path };
  }
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
  return { removed: 'default_agent', path };
}

function removeJsoncDefaultAgent(path, raw, name) {
  const m = /"default_agent"\s*:\s*"([^"]*)"/m.exec(raw);
  if (!m || m[1] !== name) return null;
  const start = m.index;
  const end = m.index + m[0].length;
  const after = raw.slice(end);
  const commaAfter = /^\s*,/.exec(after);
  let before = raw.slice(0, start);
  let rest = raw.slice(end);
  if (commaAfter) {
    rest = after.slice(commaAfter[0].length);
  } else {
    before = before.replace(/,\s*$/, '\n');
  }
  const out = before + rest;
  const withoutComments = out.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').replace(/[{}\s]/g, '');
  writeFileSync(path, withoutComments === '' ? '{}\n' : out);
  return { removed: 'default_agent', path };
}
```

- [ ] **Step 4: Rodar os testes para ver passar**

Run: `node --test test/opencode-config.test.mjs`
Expected: PASS (todos os antigos + 13 novos).

- [ ] **Step 5: Rodar a suíte completa**

Run: `npm test`
Expected: todos passam.

- [ ] **Step 6: Commit**

```bash
git add lib/opencode-config.mjs test/opencode-config.test.mjs
git commit -m "feat: default_agent no opencode-config (set condicional e remove)"
```

---

### Task 5: `install`/`uninstall` gerenciam skills vendadas e agents

**Files:**
- Modify: `lib/install.mjs`
- Modify: `test/install.test.mjs`

**Interfaces:**
- Consumes: `installVendoredSkills`/`removeVendoredSkills` (Task 1), `installAgents`/`removeAgents` (Task 3).
- Produces: `install(projectRoot, { noAgents, noAgentBrowser, noHooks, noSuperpowers, noProfile, noCodegraph })` → `{ dotBento, skillDir, vendoredSkills, agents }`; `uninstall(projectRoot)` → `{ removed }` com entradas `.opencode/agents/<nome>.md` e `.opencode/skills/<nome>`. Consumidos pela Task 6.

- [ ] **Step 1: Escrever os testes que falham**

Anexar ao fim de `test/install.test.mjs`:

```js
test('install: venda as 14 skills do superpowers (diretório completo)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-vendored-install-'));
  install(dir, {});
  const src = readFileSync(new URL('../skills/brainstorming/SKILL.md', import.meta.url), 'utf8');
  const dest = readFileSync(join(dir, '.opencode', 'skills', 'brainstorming', 'SKILL.md'), 'utf8');
  assert.equal(dest, src);
  assert.ok(existsSync(join(dir, '.opencode', 'skills', 'brainstorming', 'visual-companion.md')));
  assert.ok(existsSync(join(dir, '.opencode', 'skills', 'using-superpowers', 'references', 'pi-tools.md')));
});

test('install: preserva skill vendada divergente e avisa', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-vendored-install-'));
  mkdirSync(join(dir, '.opencode', 'skills', 'writing-plans'), { recursive: true });
  writeFileSync(join(dir, '.opencode', 'skills', 'writing-plans', 'SKILL.md'), '# meu\n');
  const mock = t.mock.method(console, 'error', () => {});
  install(dir, {});
  assert.equal(readFileSync(join(dir, '.opencode', 'skills', 'writing-plans', 'SKILL.md'), 'utf8'), '# meu\n');
  assert.ok(mock.mock.calls.some((c) => c.arguments[0].includes('conteúdo diferente')));
});

test('install: noSuperpowers não venda skills nem cria o agent superpowers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-vendored-install-'));
  install(dir, { noSuperpowers: true });
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'brainstorming')));
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'superpowers.md')));
  assert.ok(existsSync(join(dir, '.opencode', 'agents', 'flash.md')));
});

test('install: noProfile não cria agents do perfil; noCodegraph/noAgentBrowser pulam explorer/browser', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-agents-install-'));
  install(dir, { noProfile: true });
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'flash.md')));
  assert.ok(existsSync(join(dir, '.opencode', 'skills', 'brainstorming')));
  const dir2 = mkdtempSync(join(tmpdir(), 'bento-agents-install-'));
  install(dir2, { noCodegraph: true, noAgentBrowser: true });
  assert.ok(!existsSync(join(dir2, '.opencode', 'agents', 'explorer.md')));
  assert.ok(!existsSync(join(dir2, '.opencode', 'agents', 'browser.md')));
  assert.ok(existsSync(join(dir2, '.opencode', 'agents', 'flash.md')));
});

test('install: cria agents com marcador e não sobrescreve existente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-agents-install-'));
  mkdirSync(join(dir, '.opencode', 'agents'), { recursive: true });
  writeFileSync(join(dir, '.opencode', 'agents', 'flash.md'), '---\n# bento: agent v1\ndescription: meu\n---\nmeu corpo\n');
  install(dir, {});
  assert.ok(readFileSync(join(dir, '.opencode', 'agents', 'flash.md'), 'utf8').includes('meu corpo'));
  assert.ok(readFileSync(join(dir, '.opencode', 'agents', 'verify.md'), 'utf8').includes('# bento: agent'));
});

test('uninstall: remove skills vendadas idênticas e preserva divergentes', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-vendored-uninstall-'));
  install(dir, {});
  writeFileSync(join(dir, '.opencode', 'skills', 'writing-plans', 'SKILL.md'), '# modificada\n');
  const mock = t.mock.method(console, 'error', () => {});
  const { removed } = uninstall(dir);
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'brainstorming')));
  assert.ok(removed.includes('.opencode/skills/brainstorming'));
  assert.ok(existsSync(join(dir, '.opencode', 'skills', 'writing-plans')));
  assert.ok(!removed.includes('.opencode/skills/writing-plans'));
  assert.ok(mock.mock.calls.some((c) => c.arguments[0].includes('modificada')));
});

test('uninstall: remove agents com marcador e preserva agent do usuário', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-agents-uninstall-'));
  install(dir, {});
  writeFileSync(join(dir, '.opencode', 'agents', 'meu.md'), '---\ndescription: user\n---\n');
  const { removed } = uninstall(dir);
  assert.ok(removed.includes('.opencode/agents/flash.md'));
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'flash.md')));
  assert.ok(existsSync(join(dir, '.opencode', 'agents', 'meu.md')));
});
```

- [ ] **Step 2: Rodar os testes para ver falhar**

Run: `node --test test/install.test.mjs`
Expected: os 7 testes novos falham (skills/agents não copiados; `install` ignora opções novas).

- [ ] **Step 3: Implementar em `lib/install.mjs`**

No topo, adicionar imports:

```js
import { installAgents, removeAgents } from './agents.mjs';
import { installVendoredSkills, removeVendoredSkills } from './vendored-skills.mjs';
```

Trocar a assinatura de `install` e o bloco final:

```js
export function install(projectRoot, { noAgents = false, noAgentBrowser = false, noHooks = false, noSuperpowers = false, noProfile = false, noCodegraph = false } = {}) {
```

Logo antes do `return { dotBento, skillDir };` (depois do bloco do AGENTS.md), inserir:

```js
  const vendoredSkills = noSuperpowers
    ? { installed: [], skipped: [] }
    : installVendoredSkills(projectRoot, join(PKG_ROOT, 'skills'));

  const agents = installAgents(projectRoot, {
    profile: !noProfile,
    superpowers: !noSuperpowers,
    codegraph: !noCodegraph,
    agentBrowser: !noAgentBrowser,
  });

  return { dotBento, skillDir, vendoredSkills, agents };
```

Substituir o `return { dotBento, skillDir };` antigo por esse bloco (não deve sobrar return duplicado).

Em `uninstall`, mover a remoção de `.bento` para **depois** das skills vendadas (a referência de byte-compare vive em `.bento/skills`). O começo da função fica:

```js
export function uninstall(projectRoot) {
  const removed = [];

  const agentsResult = removeAgents(projectRoot);
  removed.push(...agentsResult.removed);

  const vendored = removeVendoredSkills(projectRoot, join(projectRoot, '.bento', 'skills'));
  removed.push(...vendored.removed);

  const dotBento = join(projectRoot, '.bento');
  if (existsSync(dotBento)) {
    rmSync(dotBento, { recursive: true, force: true });
    removed.push('.bento');
  }
```

O restante de `uninstall` permanece igual (small-prs, agent-browser, taste-skill, shim, .pr-limits, AGENTS.md).

- [ ] **Step 4: Rodar os testes para ver passar**

Run: `node --test test/install.test.mjs`
Expected: PASS (todos os antigos + 7 novos).

- [ ] **Step 5: Rodar a suíte completa**

Run: `npm test`
Expected: todos passam (o bin só muda na Task 6).

- [ ] **Step 6: Commit**

```bash
git add lib/install.mjs test/install.test.mjs
git commit -m "feat: install/uninstall gerenciam skills vendadas e agents"
```

---

### Task 6: `bin/bento.mjs` — flags novas, remoção do plugin e `default_agent`

**Files:**
- Modify: `bin/bento.mjs`
- Modify: `test/cli.test.mjs`

**Interfaces:**
- Consumes: `install()` novo (Task 5), `setDefaultAgentIfAbsent`/`removeDefaultAgentIf`/`BENTO_DEFAULT_AGENT` (Task 4), `removeSuperpowersPlugin` existente.
- Produces: CLI com `--no-profile`; install/update removem o plugin superpowers e setam `default_agent`; uninstall remove `default_agent` só quando o `flash.md` era do bento.

- [ ] **Step 1: Atualizar os testes de CLI (falham antes da implementação)**

Em `test/cli.test.mjs`, ajustar os testes existentes e adicionar os novos. Substituir os testes `'update: adiciona superpowers e ponytail ao opencode.json'`, `'update --no-superpowers: adiciona só ponytail'` e `'update --no-ponytail: adiciona só superpowers'` por:

```js
test('update: venda superpowers, cria agents, define default_agent e mantém ponytail', () => {
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
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.deepEqual(obj.plugin, [PONYTAIL_PLUGIN]);
  assert.equal(obj.default_agent, 'flash');
});

test('update: remove o plugin superpowers de instalações antigas', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ plugin: [SUPERPOWERS_PLUGIN] }, null, 2));
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-ponytail', '--no-codegraph', '--no-agent-browser'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('plugin removido'));
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.ok(!(obj.plugin ?? []).includes(SUPERPOWERS_PLUGIN));
});

test('update --no-superpowers: não venda skills, não cria agent superpowers e mantém ponytail', () => {
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
  assert.ok(r.stderr.includes('default_agent já definido'));
  const obj = JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf8'));
  assert.equal(obj.default_agent, 'build');
});

test('update --no-profile: não cria agents do perfil nem default_agent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-profile', '--no-ponytail', '--no-codegraph', '--no-agent-browser'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'flash.md')));
  assert.ok(existsSync(join(dir, '.opencode', 'agents', 'superpowers.md')));
  assert.ok(existsSync(join(dir, '.opencode', 'skills', 'brainstorming', 'SKILL.md')));
  assert.ok(!existsSync(join(dir, 'opencode.json')));
});
```

No teste `'update --no-superpowers --no-ponytail --no-codegraph --no-agent-browser: não toca opencode.json'`, adicionar `'--no-profile'` à lista de argumentos:

```js
  const r = spawnSync(process.execPath, [BIN, 'update', '--no-superpowers', '--no-ponytail', '--no-codegraph', '--no-agent-browser', '--no-profile'], { cwd: dir, encoding: 'utf8' });
```

Substituir `'uninstall: remove superpowers do opencode.json'` por:

```js
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
```

Nos testes `'update --no-codegraph: adiciona só agent-browser ao mcp'` e `'update --no-agent-browser: adiciona só codegraph ao mcp e não copia a skill'`, adicionar as asserções de agents:

```js
  // em --no-codegraph:
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'explorer.md')));
  assert.ok(existsSync(join(dir, '.opencode', 'agents', 'browser.md')));
  // em --no-agent-browser:
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'browser.md')));
  assert.ok(existsSync(join(dir, '.opencode', 'agents', 'explorer.md')));
```

- [ ] **Step 2: Rodar os testes para ver falhar**

Run: `node --test test/cli.test.mjs`
Expected: FAIL nos testes novos/atualizados (bin ainda adiciona o plugin superpowers e não conhece `--no-profile`/`default_agent`/agents).

- [ ] **Step 3: Implementar em `bin/bento.mjs`**

Trocar o import do opencode-config:

```js
import { addPonytailPlugin, removePonytailPlugin, removeSuperpowersPlugin, setDefaultAgentIfAbsent, removeDefaultAgentIf } from '../lib/opencode-config.mjs';
```

Adicionar a flag no início de `run()`:

```js
  const noProfile = args.includes('--no-profile');
```

No `case 'install'`, trocar a chamada de `install` e o bloco de superpowers:

```js
      const result = install(process.cwd(), { noAgents, noAgentBrowser, noHooks, noSuperpowers, noProfile, noCodegraph });
      console.log('bento instalado:');
      console.log(`  skill → ${result.skillDir}`);
      console.log(`  lib   → ${result.dotBento}`);
      if (result.vendoredSkills.installed.length > 0) {
        console.log(`  superpowers → ${result.vendoredSkills.installed.length} skills vendadas`);
      }
      if (result.agents.created.length > 0) {
        console.log(`  agents → ${result.agents.created.map((n) => `${n}.md`).join(', ')}`);
      }
      if (!noProfile) {
        const da = setDefaultAgentIfAbsent(process.cwd());
        if (da && da.changed) console.log(`  default_agent → flash (${da.path})`);
      }
      if (!noSuperpowers) {
        const sp = removeSuperpowersPlugin(process.cwd());
        if (sp) console.log(`  superpowers → plugin removido (${sp.path})`);
      }
```

Remover o bloco antigo `if (!noSuperpowers) { const sp = addSuperpowersPlugin(...) }` do install.

No `case 'update'`, trocar a chamada de `install` e aplicar as mesmas linhas do install (vendored/agents/default_agent/remoção do plugin), mantendo os blocos de hooks/ponytail/codegraph/agent-browser já existentes. O bloco novo fica:

```js
      const result = install(process.cwd(), { noAgents, noAgentBrowser, noHooks, noSuperpowers, noProfile, noCodegraph });
      if (result.vendoredSkills.installed.length > 0) {
        console.log(`  superpowers → ${result.vendoredSkills.installed.length} skills vendadas`);
      }
      if (result.agents.created.length > 0) {
        console.log(`  agents → ${result.agents.created.map((n) => `${n}.md`).join(', ')}`);
      }
      if (!noProfile) {
        const da = setDefaultAgentIfAbsent(process.cwd());
        if (da && da.changed) console.log(`  default_agent → flash (${da.path})`);
      }
      if (!noSuperpowers) {
        const sp = removeSuperpowersPlugin(process.cwd());
        if (sp) console.log(`  superpowers → plugin removido (${sp.path})`);
      }
```

E remover o bloco antigo `addSuperpowersPlugin` do update.

No `case 'uninstall'`, logo após `const { removed } = uninstall(process.cwd());`:

```js
      if (removed.includes('.opencode/agents/flash.md')) {
        const da = removeDefaultAgentIf(process.cwd());
        if (da) removed.push('default_agent');
      }
```

E atualizar o help do `default:`:

```
uso: bento install|update|uninstall|check|equivalence
  install          instala skill, scripts, config, hook pre-push, gh-stack, skills vendadas do superpowers, agents, ponytail, codegraph e agent-browser no projeto
                   (--no-agents pula AGENTS.md; --no-superpowers pula skills vendadas/agent superpowers (não mexe no plugin);
                    --no-profile pula os agents do bento e o default_agent; --no-ponytail pula ponytail;
                    --no-hooks pula o pre-push; --no-codegraph pula codegraph; --no-agent-browser pula agent-browser)
  update           re-instala mantendo .pr-limits.yaml (não toca gh-stack; não re-instala CLIs nem re-indexa codegraph)
  uninstall        remove tudo do bento (gh-stack, .bento, skills, agents, shim, config, pre-push, plugins, mcp, .codegraph, CLIs, seção AGENTS.md)
  check [base]     valida tamanho do diff (head = HEAD, base default = main)
  equivalence <base> <head> <camada1> [camada2 ...]
```

- [ ] **Step 4: Rodar os testes para ver passar**

Run: `node --test test/cli.test.mjs`
Expected: PASS (todos).

- [ ] **Step 5: Rodar a suíte completa**

Run: `npm test`
Expected: todos passam.

- [ ] **Step 6: Commit**

```bash
git add bin/bento.mjs test/cli.test.mjs
git commit -m "feat: CLI com --no-profile, remoção do plugin superpowers e default_agent"
```

---

### Task 7: Docs — seção do consumidor, README e AGENTS.md do repo

**Files:**
- Modify: `templates/agents-section.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/specs/2026-09-15-agentes-escopados-design.md` (alinha a arquitetura ao criado: `lib/vendored-skills.mjs`)

**Interfaces:**
- Consumes: tudo das tasks anteriores.
- Produces: documentação do usuário e rastreabilidade da venda.

- [ ] **Step 1: Adicionar o parágrafo de agents em `templates/agents-section.md`**

Anexar ao fim do arquivo:

```markdown
### Agents (bento)

- Troque com Tab: `flash` (enxuto, padrão para modelos rápidos) e `superpowers` (fluxo completo de skills para features).
- Delegue com `@explorer` (codegraph, leitura), `@verify` (verificação independente) e `@browser` (automação web).
- `.opencode/agents/*.md` são seus: edite `model`, `temperature` e permissões à vontade; `bento update` não sobrescreve.
```

- [ ] **Step 2: Atualizar o README**

- Linha 3 (resumo): trocar `os plugins superpowers e ponytail` por `o plugin ponytail, as skills vendadas do superpowers e agents escopados`.
- Na lista "Instala", substituir o bullet do superpowers por:

```markdown
- `.opencode/skills/` — 14 skills do superpowers vendadas (v6.1.1, MIT; pule com `--no-superpowers`)
- `.opencode/agents/` — agents `flash` (padrão), `superpowers`, `explorer`, `verify`, `browser` (pule com `--no-profile`; `explorer`/`browser` seguem `--no-codegraph`/`--no-agent-browser`)
- `default_agent: flash` no `opencode.json`/`.jsonc` — só se ausente (pule com `--no-profile`)
```

- Na lista "Remove", após o bullet de `.opencode/skills/agent-browser/`, adicionar:

```markdown
- `.opencode/skills/<skill vendada>/` — só se idêntica à cópia instalada (modificadas são preservadas)
- `.opencode/agents/*.md` — só agents com o marcador do bento (os seus são preservados)
- `default_agent` do `opencode.json`/`.jsonc` — só se for `flash` e o agent removido era do bento
```

- No bullet existente das entradas de plugin, ajustar para remover a menção de adição do superpowers (ele agora só é removido na migração): trocar `entradas do plugin superpowers e ponytail no opencode.json/.jsonc (arquivo removido se ficar vazio)` por `entradas dos plugins (inclui a remoção do plugin superpowers de instalações antigas) no opencode.json/.jsonc (arquivo removido se ficar vazio)`.
- Na seção "Fluxo small-prs", adicionar ao fim:

```markdown
Os agents escopados organizam o uso: `flash` (padrão enxuto), `superpowers` (skills completas), `explorer`, `verify` e `browser`. Troque com Tab; edite os `.md` em `.opencode/agents/` para ajustar modelo/temperatura.
```

- [ ] **Step 3: Atualizar o `AGENTS.md` do repo**

- Na seção CLI, trocar a linha de flags por:

```markdown
- Flags de install/update: `--no-agents`, `--no-superpowers` (pula skills vendadas + agent superpowers; não mexe no plugin), `--no-profile` (pula agents de perfil + `default_agent`), `--no-ponytail`, `--no-hooks`, `--no-codegraph`, `--no-agent-browser`.
```

- Na seção Arquitetura, adicionar/substituir os bullets:

```markdown
- `lib/vendored-skills.mjs` — `VENDORED_SKILLS` (14 do superpowers), cópia se ausente/idêntica, preserva divergente (`sameTree`), remoção só se idêntica ao `.bento/skills/`.
- `lib/agents.mjs` — instala `templates/agents/*.md` só se ausente (marcador `/^#\s*bento:\s*agent\b/m`), remove só o que tem o marcador.
- `skills/<nome>/` (14) — venda do superpowers v6.1.1 (commit `d884ae04edebef577e82ff7c4e143debd0bbec99`, MIT). Atualização manual: re-copiar do commit novo e atualizar este bullet.
- `templates/agents/` — fonte dos agents `flash`, `superpowers` (bootstrap adaptado, MIT), `explorer`, `verify`, `browser`.
```

- Na linha do `lib/opencode-config.mjs`, acrescentar ao fim: `; também gerencia a chave escalar `default_agent` (set condicional/remoção)`.

- [ ] **Step 4: Alinhar o spec**

Em `docs/superpowers/specs/2026-09-15-agentes-escopados-design.md`, no bullet de `lib/install.mjs`, trocar `constante VENDORED_SKILLS + cópia/remoção/byte-compare` por `orquestração das flags/condicionais`, e adicionar o bullet:

```markdown
- `lib/vendored-skills.mjs` (novo): `VENDORED_SKILLS`, cópia/remoção por árvore idêntica (`sameTree`).
```

- [ ] **Step 5: Rodar a suíte completa**

Run: `npm test`
Expected: todos passam.

- [ ] **Step 6: Commit**

```bash
git add templates/agents-section.md README.md AGENTS.md docs/superpowers/specs/2026-09-15-agentes-escopados-design.md
git commit -m "docs: agents escopados no README, AGENTS.md e seção do consumidor"
```

---

## Self-Review

- **Spec coverage:** vendas (Task 1) ✓; agent superpowers com bootstrap adaptado + atribuição (Task 2) ✓; agents flash/explorer/verify/browser com a matriz de permissões (Tasks 2/3) ✓; `default_agent` condicional (Task 4) ✓; install/update/uninstall com propriedade por marcador/tree-compare (Task 5) ✓; flags `--no-superpowers`/`--no-profile`/condicionais de MCP (Tasks 5/6) ✓; remoção do plugin superpowers (Task 6) ✓; docs (Task 7) ✓; não-objetivos (plugin próprio, commands, compactação) ficaram fora ✓.
- **Placeholder scan:** nenhum "TBD"/"TODO"; todo passo de código tem código concreto. O único passo com rede é o clone da venda (Task 1 Step 1, setup do repo, fora dos testes).
- **Type consistency:** `installVendoredSkills`/`removeVendoredSkills` (Task 1) usados na Task 5 com os mesmos nomes/retornos; `installAgents`/`removeAgents`/`isBentoAgent`/`AGENT_MARKER` (Task 3) usados nas Tasks 5/6; `setDefaultAgentIfAbsent`/`removeDefaultAgentIf`/`BENTO_DEFAULT_AGENT` (Task 4) usados na Task 6; `install()` retorna `{ dotBento, skillDir, vendoredSkills, agents }` (Task 5) consumido no bin (Task 6); entradas de `removed` (`.opencode/agents/flash.md`, `.opencode/skills/<nome>`) consistentes entre Tasks 5/6.
