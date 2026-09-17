# Self-review (review interno com 2 agentes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ao bento a skill `self-review` (gate de review antes de finalizar branch/PR, com 2 revisores de mandatos complementares, repro obrigatória para high/medium, validação cruzada e ledger local) e o agent `reviewer` (adversarial read-only), conforme o spec `docs/superpowers/specs/2026-09-17-self-review-design.md`.

**Architecture:** A skill `skills/self-review/SKILL.md` é o orquestrador (bento, não vendado) e é copiada para `.opencode/skills/self-review` por `lib/install.mjs`. O agent `reviewer` é mais um markdown em `templates/agents/` criado por `lib/agents.mjs` (só se ausente, por marcador no frontmatter) no grupo profile. R1 = `verify` (já existente, mandato de regressão), R2 = `reviewer` (novo, mandato adversarial). O gate entra no checklist do `flash`, na seção instalada do `AGENTS.md` e no Modo 4 do `small-prs`.

**Tech Stack:** Node >= 18 puro (node:test, node:assert/strict), ESM, zero deps runtime.

## Global Constraints

- Node >= 18, ESM, zero dependências runtime.
- TDD obrigatório: o teste falha antes da implementação; rodar com `node --test test/<arquivo>.test.mjs`.
- Testes não dependem de rede nem de `gh` instalado.
- Mensagens de CLI, avisos, docs e commits em PT-BR; conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).
- Skills vendadas do superpowers permanecem byte-idênticas (não editar).
- Marcador de propriedade de agent: `/^#\s*bento:\s*agent\b/m` dentro do frontmatter.
- Sem flags de CLI novas e sem arquivo de configuração novo.
- `self-review` é skill do bento: install/update sempre copiam; uninstall remove `.opencode/skills/self-review` (mesmo padrão de `small-prs`/`taste-skill`); o agent `reviewer` segue `--no-profile` e só é removido com o marcador.
- Nada de postar no GitHub; o ledger é local em `.superpowers/self-review/`.
- Comandos de teste usam `node --test <arquivo>` (nunca a suíte inteira dentro de review).

---

### Task 1: Agent `reviewer` + registro + allow no `flash`

**Files:**
- Create: `templates/agents/reviewer.md`
- Modify: `lib/agents.mjs`
- Modify: `templates/agents/flash.md`
- Test: `test/agents.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: agent `reviewer` instalável em `.opencode/agents/reviewer.md`; `AGENT_NAMES` com 6 nomes; `wantedAgents()` inclui `reviewer` no grupo `profile`. Consumido pelas Tasks 3 e 4.

- [ ] **Step 1: Atualizar os testes que falham**

Em `test/agents.test.mjs:17`, incluir `reviewer` na lista de templates:

```js
const TEMPLATES = ['flash', 'superpowers', 'explorer', 'verify', 'reviewer', 'browser'];
```

Depois do teste `browser:` (antes do teste de `AGENT_MARKER`), adicionar:

```js
test('reviewer: read-only adversarial, temp 0, MCPs negados', () => {
  const raw = template('reviewer');
  assert.ok(raw.includes('mode: subagent'));
  assert.ok(raw.includes('temperature: 0'));
  assert.ok(raw.includes('edit: deny'));
  assert.ok(raw.includes('task: deny'));
  assert.match(raw, /skill:\n\s+"\*": deny/);
  assert.ok(raw.includes('"node --test*": allow'));
  assert.ok(raw.includes('"npm test*": allow'));
  assert.ok(raw.includes('"codegraph_*": deny'));
  assert.ok(raw.includes('"agent-browser_*": deny'));
});
```

No teste `flash:` (linha ~33), adicionar ao final do bloco:

```js
  assert.ok(raw.includes('reviewer: allow'));
```

No teste `installAgents: cria os 5 por padrão, só se ausentes`, renomear para `cria os 6 por padrão` e trocar a asserção:

```js
  assert.deepEqual(r.created.sort(), ['browser', 'explorer', 'flash', 'reviewer', 'superpowers', 'verify']);
```

No teste `installAgents: flags pulam agents`, no bloco `dir2` (profile: false), adicionar:

```js
  assert.ok(!r2.created.includes('reviewer'));
```

No teste `removeAgents: remove só arquivos com marcador e devolve caminhos`, trocar:

```js
  assert.equal(removed.length, 5);
```

por:

```js
  assert.equal(removed.length, 6);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/agents.test.mjs`
Expected: FAIL — `reviewer` não está em `TEMPLATES` (arquivo ausente) e `installAgents` não cria o agent.

- [ ] **Step 3: Criar `templates/agents/reviewer.md`**

```markdown
---
# bento: agent v1 — edite livremente
description: Revisor adversarial read-only — caça bordas, inputs hostis e riscos cross-cutting; exige repro com arquivo:linha.
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

# Revisor adversarial

Read-only e cético. Seu trabalho é quebrar a confiança no diff, não confirmá-lo:

1. Procure bordas e cenários hostis: inputs incomuns, ESM/CJS, semântica de plataforma (macOS/Linux, symlinks, worktrees), estados de erro, snapshot/cache, dados legados e interações entre arquivos tocados.
2. Todo achado cita `arquivo:linha` e diz o impacto; sem citação, não reporte.
3. High/Medium exigem repro: um teste focado que falha por comportamento. Sem repro, classifique como Low.
4. Separe o veredito em: riscos cross-cutting · bugs/incorreções · lacunas de teste.
5. Não edite nada. No máximo um teste focado; nunca a suíte inteira.
```

- [ ] **Step 4: Registrar o agent em `lib/agents.mjs`**

Trocar a linha 6:

```js
const AGENT_NAMES = ['flash', 'superpowers', 'explorer', 'verify', 'browser'];
```

por:

```js
const AGENT_NAMES = ['flash', 'superpowers', 'explorer', 'verify', 'reviewer', 'browser'];
```

E em `wantedAgents`, trocar:

```js
  if (profile) wanted.push('flash', 'verify');
```

por:

```js
  if (profile) wanted.push('flash', 'verify', 'reviewer');
```

- [ ] **Step 5: Liberar o `reviewer` no `task` do `flash`**

Em `templates/agents/flash.md`, no bloco `task:`, adicionar após `verify: allow`:

```yaml
    reviewer: allow
```

- [ ] **Step 6: Rodar e ver passar**

Run: `node --test test/agents.test.mjs`
Expected: PASS (todos os testes do arquivo).

- [ ] **Step 7: Commit**

```bash
git add templates/agents/reviewer.md lib/agents.mjs templates/agents/flash.md test/agents.test.mjs
git commit -m "feat: adiciona agent reviewer (adversarial read-only)"
```

---

### Task 2: Skill `self-review` (protocolo) + teste de conteúdo

**Files:**
- Create: `skills/self-review/SKILL.md`
- Test: `test/self-review.test.mjs`

**Interfaces:**
- Consumes: nada (o protocolo referencia `verify` e `reviewer`, criados na Task 1).
- Produces: `skills/self-review/SKILL.md` disponível para instalação (Task 3) e para o gate (Task 4).

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/self-review.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function skill(name) {
  return readFileSync(new URL(`../skills/${name}/SKILL.md`, import.meta.url), 'utf8');
}

test('self-review: documenta ledger, severidades, repro e gate', () => {
  const raw = skill('self-review');
  assert.match(raw, /^name: self-review$/m);
  assert.ok(raw.includes('.superpowers/self-review/'));
  assert.ok(raw.includes('High'));
  assert.ok(raw.includes('Medium'));
  assert.ok(raw.includes('Low'));
  assert.ok(raw.includes('repro'));
  assert.ok(raw.includes('small-prs'));
  assert.ok(raw.includes('verify'));
  assert.ok(raw.includes('reviewer'));
  assert.ok(raw.includes('finishing-a-development-branch'));
  assert.ok(raw.includes('3 rodadas'));
  assert.ok(raw.includes('local/inequívoco') || raw.includes('local/inequívoca'));
});

test('self-review: proíbe postar no GitHub e editar skills vendadas', () => {
  const raw = skill('self-review');
  assert.ok(raw.includes('GitHub'));
  assert.ok(raw.includes('vendadas'));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/self-review.test.mjs`
Expected: FAIL com `ENOENT` para `skills/self-review/SKILL.md`.

- [ ] **Step 3: Criar `skills/self-review/SKILL.md`**

```markdown
---
name: self-review
description: Gate de review interno antes de finalizar branch/PR (ou sob demanda) — dois revisores com mandatos complementares (verify = regressão; reviewer = adversarial), repro obrigatória para High/Medium, validação cruzada, correções locais automáticas, decisões guiadas para Low/design e ledger local até o estado final.
---

# self-review — review interno com 2 agentes e correção por severidade

Use antes de `finishing-a-development-branch`/submit, ou quando o dev pedir "revisa o que fiz". O objetivo é pegar o que reviews internos estáticos deixam passar: falso negativo de bordas, auto-confirmação e achados rebaixados a "minor/residual".

## Atores

- **Agente primário (você)**: define a unidade, despacha, escreve o ledger, aplica fixes e decide com o dev.
- **R1 `@verify`**: mandato de regressão/correção — o diff cumpre o contrato e não quebra o existente.
- **R2 `@reviewer`**: mandato adversarial — bordas, inputs hostis, plataforma, riscos cross-cutting.

## 0. Unidade e preparação

1. Defina a unidade: task, camada da stack ou branch (default sob demanda: branch atual). Registre `base` e `head` com `git rev-parse`.
2. Cheque o tamanho: `node scripts/pr-split-verify.mjs check <base> <head>` (ou `bento check <base>`). Se violar `.pr-limits.yaml`, **pare**: a unidade precisa de split com a skill `small-prs` antes do review. Review de diff gigante é teatro.
3. Crie o diretório da unidade, fora do git:

```bash
slug=<slug-da-unidade>   # ex.: nome da branch ou da camada, com '/' -> '-'
dir=".superpowers/self-review/$slug"
mkdir -p "$dir"
printf '*\n' > "$dir/.gitignore"
```

4. Congele o pacote (única visão dos revisores):

```bash
base_sha=$(git merge-base <base> <head>)
head_sha=$(git rev-parse <head>)
{
  echo "# Unidade: $slug"; echo "# Base: $base_sha"; echo "# Head: $head_sha"; echo
  echo "## Commits"; git log --oneline "$base_sha..$head_sha"; echo
  echo "## Stat"; git diff --stat "$base_sha...$head_sha"; echo
  echo "## Diff"; git diff "$base_sha...$head_sha"
} > "$dir/package-$(git rev-parse --short "$base_sha")-$(git rev-parse --short "$head_sha").diff"
```

O pacote NÃO entra no seu contexto: passe apenas o caminho aos revisores.

5. Abra `$dir/ledger.md` com o cabeçalho (unidade, base/head, contrato: spec/brief/descrição do PR).

## 1. Rodada 1 — despache R1 e R2 em paralelo

Na mesma mensagem, um `task` para `verify` (R1) e um para `reviewer` (R2), cada um com este contrato (adapte o mandato):

> Leia o pacote `<caminho do package>` — é sua única visão do que mudou; o contexto dele basta. Se precisar de algo fora dele, nomeie o risco antes de olhar e diga o que checou no relatório. Contrato: <spec/brief/descrição>.
> Mandato: <R1: regressão/correção — o diff cumpre o contrato e nada quebra o existente> | <R2: adversarial — bordas, inputs hostis, ESM/CJS, plataforma, symlink/worktree, snapshot/cache, legado, interação entre arquivos>.
> Limites do projeto: `.pr-limits.yaml`. Read-only: não altere working tree, index, HEAD ou branches; pode rodar no máximo um teste focado.
> Para cada achado: `arquivo:linha`, severidade (High/Medium/Low), o que está errado, impacto e **repro** (trecho de teste focado que falha por comportamento) quando High/Medium. Sem repro, classifique Low.
> Formato final: veredito (aprovar | needs fixes), achados e confiança.

Os revisores são read-only: a repro chega como trecho no relatório; transcreva verbatim para `$dir/repro-<id>.test.mjs`, confirme o RED e só então despache a validação cruzada.

R1 e R2 não veem o relatório um do outro. Se `verify` e `reviewer` estiverem com `model` diferentes, a complementaridade é maior.

## 2. Merge e validação cruzada

- Deduplique por `arquivo:linha` + tipo; achado proposto pelos dois já está confirmado.
- High/Medium proposto por um revisor: despache **o outro** para validar executando a repro já materializada (teste focado, nunca a suíte inteira) e emitir `confirmed` ou `disputed`.
- Divergência de existência/severidade: rodada focada (os dois sobre a mesma repro). Persistindo, pergunte ao dev mostrando as duas evidências.

## 3. Ledger (fonte da verdade)

`$dir/ledger.md`, append-only por rodada:

```markdown
# Self-review — <unidade>
base: <sha> · head: <sha> · contrato: <ref>
## Rodada 1 (R1=verify <modelo>, R2=reviewer <modelo>)
| id | arquivo:linha | severidade | origem | evidência (repro) | validação | decisão | status | commit |
|----|---------------|-----------|--------|-------------------|-----------|---------|--------|--------|
| SR-1 | lib/x.mjs:12 | High | R2 | `node --test .../repro-SR-1.test.mjs` (falha) | R1 confirmed | auto (local) | fixed | abc1234 |
```

Status: `open` → `fixed` / `waived` / `discarded`. Nada é apagado; rebaixamento ou descarte registra quem validou e por quê.

## 4. Decisão

- **High/Medium confirmado e local/inequívoco** (não muda contrato público, schema/migração, dependências, nem arquivos fora do diff) → **auto-fix**.
- **High/Medium que mude design/contrato/escopo** → `question` ao dev com 2-3 opções de correção.
- **Low** → UMA `question` em lote (múltipla escolha por item): corrigir agora / adiar (justificar) / descartar (falso positivo validado).
- Proibido rebaixar por "pré-existente" (se o diff tocou, é do PR), por "estava no plano" ou sem evidência + validação.

## 5. Fix e re-review

- Fix com TDD: mova a repro para o diretório de testes do projeto, veja falhar (RED), corrija o mínimo (GREEN) e rode a suíte completa.
- Re-review focado do par: itens corrigidos + regressão, no mesmo formato da rodada 1.
- Teto de **3 rodadas** de re-review; ao exceder, pare e apresente o resumo com evidências ao dev.

## 6. Gate

- Condição de saída: nenhum item `open` e nenhum `disputed` sem decisão do dev.
- Resumo final ao dev: contagem por severidade, o que foi automático, o que o dev decidiu e o que foi descartado com validação.
- Só então siga para `finishing-a-development-branch`/submit.

## Regras

- Nunca poste no GitHub por conta própria; o ledger é local.
- Nunca edite skills vendadas do superpowers para "consertar" um achado.
- Nunca `git add -A`: os scratch em `.superpowers/self-review/` ficam fora do commit.
- Este gate roda quando acionado (fim de trabalho ou pedido do dev); não há hook automático.
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/self-review.test.mjs`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add skills/self-review/SKILL.md test/self-review.test.mjs
git commit -m "feat: skill self-review (review interno com 2 agentes)"
```

---

### Task 3: Ciclo de vida — install copia e uninstall remove a skill; CLI cobre o agent

**Files:**
- Modify: `lib/install.mjs`
- Test: `test/install.test.mjs`, `test/cli.test.mjs`

**Interfaces:**
- Consumes: `skills/self-review/` (Task 2); `reviewer` (Task 1).
- Produces: install/update criam `.opencode/skills/self-review`; uninstall remove e registra `.opencode/skills/self-review` em `removed`.

- [ ] **Step 1: Escrever os testes que falham**

Em `test/install.test.mjs`, depois do teste `install: copia a skill taste-skill...`, adicionar:

```js
test('install: copia a skill self-review', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-'));
  install(dir, {});
  const src = readFileSync(new URL('../skills/self-review/SKILL.md', import.meta.url), 'utf8');
  assert.equal(readFileSync(join(dir, '.opencode', 'skills', 'self-review', 'SKILL.md'), 'utf8'), src);
});
```

Depois do teste `uninstall: remove a skill taste-skill`, adicionar:

```js
test('uninstall: remove a skill self-review', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-uninstall-'));
  install(dir, {});
  const { removed } = uninstall(dir);
  assert.ok(!existsSync(join(dir, '.opencode', 'skills', 'self-review')));
  assert.ok(removed.includes('.opencode/skills/self-review'));
});
```

Em `test/install.test.mjs`, no teste `install: noProfile não cria agents do perfil; noCodegraph/noAgentBrowser pulam explorer/browser`, adicionar:

```js
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'reviewer.md')));
```

Em `test/cli.test.mjs`, no teste `update: venda superpowers, cria agents, define default_agent e mantém ponytail`, adicionar:

```js
  assert.ok(existsSync(join(dir, '.opencode', 'agents', 'reviewer.md')));
```

Em `test/cli.test.mjs`, depois do teste `uninstall: remove o default_agent do bento...` (qualquer posição após o helper `makeRepo`), adicionar:

```js
test('uninstall: remove o agent reviewer', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-cli-'));
  spawnSync(process.execPath, [BIN, 'update'], { cwd: dir, encoding: 'utf8' });
  const r = spawnSync(process.execPath, [BIN, 'uninstall'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!existsSync(join(dir, '.opencode', 'agents', 'reviewer.md')));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/install.test.mjs test/cli.test.mjs`
Expected: FAIL — `.opencode/skills/self-review` não é criada/removida pelo install/uninstall.

- [ ] **Step 3: Copiar a skill no `install`**

Em `lib/install.mjs`, depois do bloco da `tasteSkillDir`, adicionar:

```js
  const selfReviewDir = join(projectRoot, '.opencode', 'skills', 'self-review');
  mkdirSync(selfReviewDir, { recursive: true });
  cpSync(join(PKG_ROOT, 'skills', 'self-review'), selfReviewDir, { recursive: true });
```

- [ ] **Step 4: Remover a skill no `uninstall`**

Em `lib/install.mjs`, dentro de `uninstall`, depois do bloco da `tasteSkillDir`:

```js
  const selfReviewDir = join(projectRoot, '.opencode', 'skills', 'self-review');
  if (existsSync(selfReviewDir)) {
    rmSync(selfReviewDir, { recursive: true, force: true });
    removed.push('.opencode/skills/self-review');
  }
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test test/install.test.mjs test/cli.test.mjs`
Expected: PASS (todos os testes dos dois arquivos).

- [ ] **Step 6: Commit**

```bash
git add lib/install.mjs test/install.test.mjs test/cli.test.mjs
git commit -m "feat: instala e remove a skill self-review no ciclo de vida"
```

---

### Task 4: Integração do gate (flash, AGENTS.md do consumidor, Modo 4) e docs

**Files:**
- Modify: `templates/agents/flash.md`
- Modify: `templates/agents-section.md`
- Modify: `skills/small-prs/SKILL.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Test: `test/agents.test.mjs`, `test/install.test.mjs`, `test/self-review.test.mjs`

**Interfaces:**
- Consumes: skill `self-review` (Task 2) e agent `reviewer` (Task 1).
- Produces: gate citado no checklist do `flash`, na seção do `AGENTS.md` instalada, no Modo 4 do `small-prs` e nos docs do repo.

- [ ] **Step 1: Escrever os testes que falham**

Em `test/agents.test.mjs`, depois do teste `flash:`:

```js
test('flash: inclui o gate de self-review no checklist', () => {
  const raw = template('flash');
  assert.ok(raw.includes('self-review'));
});
```

Em `test/install.test.mjs`, depois do teste `install: noAgents não cria AGENTS.md`:

```js
test('install: seção do AGENTS.md cita o gate de self-review', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bento-install-'));
  install(dir, {});
  const agents = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
  assert.ok(agents.includes('self-review'));
  assert.ok(agents.includes('@reviewer'));
});
```

Em `test/self-review.test.mjs`, adicionar:

```js
test('small-prs Modo 4 usa a skill self-review no whole-stack', () => {
  const raw = skill('small-prs');
  assert.ok(raw.includes('self-review'));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/agents.test.mjs test/install.test.mjs test/self-review.test.mjs`
Expected: FAIL — `flash.md`, `templates/agents-section.md` e `skills/small-prs/SKILL.md` ainda não citam `self-review`.

- [ ] **Step 3: Gate no checklist do `flash`**

Em `templates/agents/flash.md`, após o item 4 (`Antes de abrir PR, confira .pr-limits.yaml...`), inserir e renumerar os itens seguintes:

```markdown
5. Antes de concluir a branch/abrir PR, rode a skill `self-review` e só siga com o ledger sem pendências.
```

- [ ] **Step 4: Gate na seção instalada do `AGENTS.md`**

Em `templates/agents-section.md`, adicionar após a linha do `equivalence`:

```markdown
- Antes de finalizar a branch/abrir PR, rode o gate `self-review`: 2 revisores (regressão + adversarial), repro para High/Medium e ledger em `.superpowers/self-review/`. Nada "residual" sem decisão explícita.
```

E na lista de agents, trocar a linha de delegação por:

```markdown
- Delegue com `@explorer` (codegraph, leitura), `@verify` (verificação independente), `@reviewer` (review adversarial) e `@browser` (automação web).
```

- [ ] **Step 5: Modo 4 do `small-prs` usa a skill**

Em `skills/small-prs/SKILL.md`, na linha 48, trocar:

```markdown
Reutilize os contratos existentes (não duplique): `task-reviewer-prompt.md` (subagent-driven-development) para revisão por camada e `code-reviewer.md` (requesting-code-review) para o review final da stack.
```

por:

```markdown
Reutilize os contratos existentes (não duplique): `task-reviewer-prompt.md` (subagent-driven-development) para revisão por camada; o review final da stack é a skill `self-review` (2 revisores + validação cruzada + repro).
```

E no último parágrafo (linha 66), trocar o trecho:

```markdown
Ao final de todas as camadas, despache UM subagente de **whole-stack review** (contrato code-reviewer.md): lê a cadeia completa de diffs encadeados + o resultado da equivalence + os Minors acumulados no ledger → veredito final antes do merge. **Além de ler o diff, o whole-stack DEVE verificar a topologia**:
```

por:

```markdown
Ao final de todas as camadas, rode a skill `self-review` no topo da cadeia (unidade = stack) e, além do review, **verifique a topologia**:
```

- [ ] **Step 6: Docs do repo**

Em `README.md`:
- depois da linha 17 (`.opencode/skills/small-prs/SKILL.md`), adicionar:

```markdown
- `.opencode/skills/self-review/SKILL.md` — gate de review interno: 2 revisores (regressão + adversarial), repro para High/Medium e ledger local
```

- na linha 25 (agents), incluir `reviewer`:

```markdown
- `.opencode/agents/` — agents `flash` (padrão), `superpowers`, `explorer`, `verify`, `reviewer`, `browser` (pule com `--no-profile`; o agent `superpowers` segue `--no-superpowers`; `explorer`/`browser` seguem `--no-codegraph`/`--no-agent-browser`)
```

- na lista de desinstalação, depois da linha de `agent-browser` (linha 45), adicionar:

```markdown
- `.opencode/skills/self-review/` — skill do gate de review interno
```

Em `AGENTS.md`:
- na linha 16, incluir `self-review` na lista de skills criadas:

```markdown
... e criam as skills do bento (`.opencode/skills/small-prs`, `self-review`, `taste-skill` e, salvo flag, `agent-browser`) ...
```

- na seção Arquitetura, adicionar um bullet após o de `skills/agent-browser/SKILL.md`:

```markdown
- `skills/self-review/SKILL.md` — gate de review interno (skill bento, não vendada): 2 revisores com mandatos complementares (`verify` regressão + `reviewer` adversarial), repro obrigatória para High/Medium, validação cruzada, ledger local em `.superpowers/self-review/`, teto de 3 rodadas de re-review.
```

- no bullet de `templates/agents/`, incluir o `reviewer`:

```markdown
- `templates/agents/` — fonte dos agents `flash`, `superpowers` (bootstrap adaptado, MIT), `explorer`, `verify`, `reviewer` e `browser`.
```

- [ ] **Step 7: Rodar e ver passar**

Run: `node --test test/agents.test.mjs test/install.test.mjs test/self-review.test.mjs`
Expected: PASS.

- [ ] **Step 8: Suíte completa**

Run: `npm test`
Expected: PASS (todos os arquivos).

- [ ] **Step 9: Commit**

```bash
git add templates/agents/flash.md templates/agents-section.md skills/small-prs/SKILL.md README.md AGENTS.md test/agents.test.mjs test/install.test.mjs test/self-review.test.mjs
git commit -m "docs: integra o gate self-review (flash, AGENTS.md e small-prs Modo 4)"
```

---

## Self-Review

- **Cobertura do spec:** protocolo → Task 2; agent R2 → Task 1; install/uninstall/--no-profile → Tasks 1 e 3; gatilho no flash/AGENTS.md/Modo 4 → Task 4; docs → Task 4; testes listados no spec → Tasks 1–4. Sem lacunas.
- **Placeholders:** nenhum "TBD"; todo passo com conteúdo completo.
- **Consistência de nomes:** `self-review` (skill/diretório), `reviewer` (agent/template), `R1`/`R2`, `AGENT_NAMES`, `.superpowers/self-review/`, `High/Medium/Low` usados igualmente em todas as tasks.
