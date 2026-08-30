# Taste-skill no bento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instalar a skill `design-taste-frontend` (taste-skill, upstream Leonxlnx/taste-skill) no projeto consumidor via `bento install`/`update`, vendada estaticamente, e removê-la no `uninstall`.

**Architecture:** Venda integral de `skills/taste-skill/SKILL.md` (cópia pinada do commit `ccbc15639c97057cbfcf32ecebc38ef716e4bb37`). O `install` copia a pasta para `.opencode/skills/taste-skill/` (mesmo padrão do small-prs em `lib/install.mjs`); o `uninstall` a remove. Nenhuma flag nova — instala sempre. O opencode invoca a skill pelo `name` do frontmatter (`design-taste-frontend`).

**Tech Stack:** Node puro (>= 18), ESM, zero deps runtime, `node:test`.

## Global Constraints

- Node puro (>= 18), ESM, zero deps runtime.
- TDD obrigatório (node:test): teste antes da implementação.
- Testes não podem depender de rede nem de `gh` instalado.
- Mensagens de CLI, docs e commits em PT-BR; conventional commits (feat:, fix:, docs:, test:).
- Spec: `docs/superpowers/specs/2026-08-30-taste-skill-design.md`.
- O SKILL.md vendado deve permanecer **intacto** (cópia exata do upstream, sem edições).

---

### Task 1: Vendar o SKILL.md e copiar no install

**Files:**
- Create: `skills/taste-skill/SKILL.md`
- Modify: `lib/install.mjs:45-47` (após o bloco do small-prs)
- Test: `test/install.test.mjs`

**Interfaces:**
- Consumes: `install(projectRoot, { noAgents })` existente em `lib/install.mjs` — retorna `{ dotBento, skillDir }`.
- Produces: diretório `skills/taste-skill/` no repo; no consumidor, `.opencode/skills/taste-skill/SKILL.md` idêntico ao vendado.

- [ ] **Step 1: Baixar o SKILL.md pinado do upstream**

```bash
mkdir -p skills/taste-skill && curl -fsSL \
  https://raw.githubusercontent.com/Leonxlnx/taste-skill/ccbc15639c97057cbfcf32ecebc38ef716e4bb37/skills/taste-skill/SKILL.md \
  -o skills/taste-skill/SKILL.md
```

Expected: arquivo criado com 1206 linhas. Confira com `wc -l skills/taste-skill/SKILL.md` (deve imprimir `1206`).

- [ ] **Step 2: Escrever o teste que falha**

Em `test/install.test.mjs`, adicionar após o teste `'install: copia skill, shim, .bento e preserva .pr-limits.yaml existente'`:

```js
test('install: copia a skill taste-skill para .opencode/skills/taste-skill', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-taste-'));
  install(dir, {});
  const vendada = readFileSync(new URL('../skills/taste-skill/SKILL.md', import.meta.url), 'utf8');
  const copiada = readFileSync(join(dir, '.opencode', 'skills', 'taste-skill', 'SKILL.md'), 'utf8');
  assert.equal(copiada, vendada);
});
```

- [ ] **Step 3: Rodar o teste para ver falhar**

Run: `node --test test/install.test.mjs`
Expected: o teste novo falha com `ENOENT` (arquivo `.opencode/skills/taste-skill/SKILL.md` não existe).

- [ ] **Step 4: Implementar a cópia no install**

Em `lib/install.mjs`, logo após o bloco que copia small-prs (linhas 45-47):

```js
  const tasteSkillDir = join(projectRoot, '.opencode', 'skills', 'taste-skill');
  mkdirSync(tasteSkillDir, { recursive: true });
  cpSync(join(PKG_ROOT, 'skills', 'taste-skill'), tasteSkillDir, { recursive: true });
```

- [ ] **Step 5: Rodar o teste para ver passar**

Run: `node --test test/install.test.mjs`
Expected: PASS — todos os testes do arquivo, incluindo o novo.

- [ ] **Step 6: Rodar a suíte completa**

Run: `npm test`
Expected: todos os testes passam (incluindo `test/cli.test.mjs`, `test/opencode-config.test.mjs` etc.).

- [ ] **Step 7: Commit**

```bash
git add skills/taste-skill/SKILL.md lib/install.mjs test/install.test.mjs
git commit -m "feat: taste-skill vendada e instalada em .opencode/skills (install)"
```

---

### Task 2: Remover a skill no uninstall

**Files:**
- Modify: `lib/install.mjs:91-95` (bloco do small-prs no `uninstall`)
- Test: `test/install.test.mjs`

**Interfaces:**
- Consumes: `uninstall(projectRoot)` existente — retorna `{ removed: string[] }`.
- Produces: `.opencode/skills/taste-skill/` removido no consumidor; `' .opencode/skills/taste-skill'` na lista `removed`.

- [ ] **Step 1: Escrever o teste que falha**

Em `test/install.test.mjs`, adicionar após o teste `'uninstall: remove tudo do install e preserva AGENTS.md'`:

```js
test('uninstall: remove a skill taste-skill', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-uninstall-taste-'));
  install(dir, {});
  const { removed } = uninstall(dir);
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'taste-skill')));
  assert.ok(removed.includes('.opencode/skills/taste-skill'));
});
```

- [ ] **Step 2: Rodar o teste para ver falhar**

Run: `node --test test/install.test.mjs`
Expected: o teste novo falha (pasta ainda existe e `removed` não contém a entrada).

- [ ] **Step 3: Implementar a remoção no uninstall**

Em `lib/install.mjs`, dentro de `uninstall`, logo após o bloco do small-prs (linhas 91-95):

```js
  const tasteSkillDir = join(projectRoot, '.opencode', 'skills', 'taste-skill');
  if (existsSync(tasteSkillDir)) {
    rmSync(tasteSkillDir, { recursive: true, force: true });
    removed.push('.opencode/skills/taste-skill');
  }
```

- [ ] **Step 4: Rodar o teste para ver passar**

Run: `node --test test/install.test.mjs`
Expected: PASS — todos os testes do arquivo.

- [ ] **Step 5: Rodar a suíte completa**

Run: `npm test`
Expected: todos os testes passam.

- [ ] **Step 6: Commit**

```bash
git add lib/install.mjs test/install.test.mjs
git commit -m "feat: uninstall remove a skill taste-skill"
```

---

### Task 3: Docs — origem da venda e README

**Files:**
- Modify: `AGENTS.md` (seção Arquitetura)
- Modify: `README.md:15-22` (lista "Instala") e `README.md:33-40` (lista "Remove")

**Interfaces:**
- Consumes: nada (docs puras).
- Produces: rastreabilidade da venda (URL + commit + data) e documentação do usuário.

- [ ] **Step 1: Registrar a origem da venda no AGENTS.md**

Na seção `## Arquitetura` do `AGENTS.md`, adicionar após o bullet do small-prs/agent-browser (bullet que lista `skills/`):

```markdown
- `skills/taste-skill/SKILL.md` — venda do upstream https://github.com/Leonxlnx/taste-skill (commit `ccbc15639c97057cbfcf32ecebc38ef716e4bb37`, 24/08/2026, MIT). Atualização manual: re-copiar do commit novo e atualizar este bullet.
```

- [ ] **Step 2: Atualizar o README (Instala)**

Em `README.md`, após o bullet de `.opencode/skills/small-prs/SKILL.md`:

```markdown
- `.opencode/skills/taste-skill/SKILL.md` — skill opencode de design anti-slop (design-taste-frontend)
```

- [ ] **Step 3: Atualizar o README (Remove)**

Em `README.md`, após o bullet de `.opencode/skills/small-prs/`:

```markdown
- `.opencode/skills/taste-skill/` — skill opencode de design
```

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md README.md
git commit -m "docs: origem da venda taste-skill e README (install/uninstall)"
```

---

## Self-Review

- **Spec coverage:** venda + AGENTS.md origem (Task 1/3) ✓; install copia (Task 1) ✓; uninstall remove + `removed` (Task 2) ✓; testes sem rede (Task 1/2 usam `mkdirSync` local, sem `curl` nos testes — o `curl` só aparece na Task 1 Step 1, que é setup do repo, não teste) ✓; README Instala/Desinstala (Task 3) ✓; `bin/bento.mjs` inalterado ✓ (nenhuma task o toca).
- **Placeholder scan:** nenhum "TBD"/"TODO"; todo passo de código tem código concreto.
- **Type consistency:** `install(dir, {})`/`uninstall(dir)`/`removed.includes(...)` idênticos aos usos existentes no arquivo de teste; `cpSync`/`rmSync` espelham os blocos do small-prs em `lib/install.mjs`.