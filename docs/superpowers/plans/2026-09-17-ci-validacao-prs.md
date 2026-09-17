# CI de validação de PRs (bento) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um workflow de GitHub Actions no repo do bento que roda `npm test` em PRs e pushes na `main`, no Node 24.

**Architecture:** Um único arquivo novo `.github/workflows/ci.yml` com um job `test` (checkout → setup-node 24 → `npm test`). Sem passo de install (zero deps, sem lockfile). Docs atualizadas em `README.md` e `AGENTS.md`. Nenhuma mudança em `lib/`, `bin/`, `templates/` ou `skills/`.

**Tech Stack:** GitHub Actions (`actions/checkout@v7`, `actions/setup-node@v7`), Node 24, `node --test` (via `npm test`).

**Spec:** `docs/superpowers/specs/2026-09-17-ci-validacao-prs-design.md` (commit `30f7c9f`).

## Global Constraints

- Node puro (>= 18), ESM, zero deps runtime; não existe `package-lock.json` — não introduza passo de install.
- Docs e commits em PT-BR; conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).
- Escopo: só o repositório do bento. NÃO criar template de workflow para consumidores, NÃO rodar `bento check` no CI, NÃO adicionar matriz de Node (versão única: 24), NÃO configurar branch protection.
- Verificação do YAML: não há teste `node:test` para o arquivo (decisão da spec aprovada; testes do repo não podem depender de rede/`gh`). A verificação local é o sanity check com PyYAML (disponível na máquina) + `npm test` verde; a verificação real é a run do workflow no GitHub.
- Versões das actions: `actions/checkout@v7` e `actions/setup-node@v7`, com `package-manager-cache: false` (sem lockfile não há cache npm a fazer; o setup-node v7 liga o cache por padrão).

---

### Task 1: Workflow `.github/workflows/ci.yml`

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nada.
- Produces: workflow GitHub Actions chamado `CI`, job `test` — é o que a Task 3 verifica rodando.

- [ ] **Step 1: Criar o arquivo `.github/workflows/ci.yml`**

Conteúdo exato:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: '24'
          package-manager-cache: false
      - run: npm test
```

- [ ] **Step 2: Sanity check do YAML (sintaxe)**

Run: `python3 -c 'import yaml; yaml.safe_load(open(".github/workflows/ci.yml")); print("yaml ok")'`

Expected: `yaml ok` (sem exceção). Não use `sorted(d.keys())` para inspecionar: PyYAML (YAML 1.1) lê a chave `on` como booleano `True` e ordenar chaves mistas levanta `TypeError` — o load puro é o check correto.

- [ ] **Step 3: Conferir o conteúdo essencial**

Run:

```bash
grep -n "pull_request" .github/workflows/ci.yml
grep -n "branches: \[main\]" .github/workflows/ci.yml
grep -n "node-version: '24'" .github/workflows/ci.yml
grep -n "npm test" .github/workflows/ci.yml
grep -n "contents: read" .github/workflows/ci.yml
```

Expected: uma linha para cada padrão (sem saída vazia).

- [ ] **Step 4: Garantir que nada quebrou localmente**

Run: `npm test`

Expected: todos os testes passam (`pass N`, `fail 0`). Node local é v22; o workflow roda no 24 — os testes declaram suportar `>=18`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat: adiciona workflow de CI (npm test no Node 24)"
```

---

### Task 2: Documentar o CI no README e no AGENTS.md

**Files:**
- Modify: `README.md` (seção `## Desenvolvimento`, linhas 89-95)
- Modify: `AGENTS.md` (seção `## Commands`, após o bloco bash das linhas 7-11)

**Interfaces:**
- Consumes: `.github/workflows/ci.yml` da Task 1 (referenciado por caminho).
- Produces: nada de código.

- [ ] **Step 1: Editar `README.md`**

Trocar:

```markdown
## Desenvolvimento

```bash
npm test    # node --test test/*.test.mjs
```

Node >= 18, zero dependências runtime.
```

Por:

```markdown
## Desenvolvimento

```bash
npm test    # node --test test/*.test.mjs
```

O CI (`.github/workflows/ci.yml`) roda `npm test` no Node 24 em pull requests e pushes na `main`.

Node >= 18, zero dependências runtime.
```

- [ ] **Step 2: Editar `AGENTS.md`**

Inserir, logo após o bloco bash da seção `## Commands` (depois da linha `node bin/bento.mjs check            # valida tamanho do diff main..HEAD` e antes de `## CLI (bin/bento.mjs)`), a linha:

```markdown
CI: `.github/workflows/ci.yml` roda `npm test` no Node 24 em PRs e push na `main` (GitHub Actions).
```

- [ ] **Step 3: Conferir as edições**

Run: `git diff --stat`

Expected: `README.md` e `AGENTS.md` aparecem com poucas linhas adicionadas (1-2 cada).

- [ ] **Step 4: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: registra o CI no README e AGENTS.md"
```

---

### Task 3: Verificação end-to-end no GitHub

**Files:**
- Nenhum arquivo novo (só conserta e commita se a run falhar).

**Interfaces:**
- Consumes: workflow da Task 1 e commits das Tasks 1-2.
- Produces: run verde do workflow `CI` para o SHA da branch; nenhum artefato de código.

- [ ] **Step 1: Rodar a suíte local de novo (pós-docs)**

Run: `npm test`

Expected: `fail 0`.

- [ ] **Step 2: Pushar a branch atual**

Run: `node bin/bento.mjs check; git rev-parse HEAD` (anote o SHA)

Run: `git push -u origin HEAD`

Expected: push aceito **se** o `check` acima sair 0. Estado atual conhecido: a branch `feat/output-style-i-have-adhd` acumula 14211 linhas/76 arquivos vs `main` (trabalho anterior), então o pre-push do bento vai abortar o push com `PR GRANDE` — isso é estado pré-existente da branch, não deste plano.

Se o push for bloqueado, escolha UMA opção, com sua human partner ciente:

1. **Branch dedicada (preferida):** `git switch -c ci-validacao main && git cherry-pick <shas das Tasks 1-2>` e empurre essa branch; o diff vs `main` fica pequeno e o hook passa.
2. **`git push --no-verify`:** o hook é conveniência, não segurança (a própria spec do pre-push registra isso); a run do CI no PR passa a ser a validação real do teste.

Não force push em branch compartilhada.

- [ ] **Step 3: Abrir/atualizar o PR para disparar o workflow**

Atenção: push em branch de feature NÃO dispara o workflow (os gatilhos são `pull_request` e `push` na `main`). A run de verificação vem do PR.

Run: `gh pr create --fill` (se ainda não houver PR para a branch; senão, o push já atualizou o PR existente)

Expected: PR aberto/atualizado; o evento `pull_request` dispara a run do `CI`.

- [ ] **Step 4: Verificar a run no PR**

Run: `gh pr checks`

Expected: check `test` com `pass`. Se estiver pendente, acompanhe:

Run: `gh run list --branch "$(git branch --show-current)" --limit 5`

Run: `gh run watch "$(gh run list --branch "$(git branch --show-current)" --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status`

Expected: exit 0 (run verde). Se falhar, ver o log:

Run: `gh run view "$(gh run list --branch "$(git branch --show-current)" --limit 1 --json databaseId --jq '.[0].databaseId')" --log-failed`

Observação: o gatilho `push` na `main` só roda depois do merge — não é verificável antes; a evidência dele é a run verde na `main` após o merge.

- [ ] **Step 5: Corrigir e commitar se algo falhar**

Se a run falhar por YAML/schema: corrigir `.github/workflows/ci.yml`, rodar de novo o Step 2 da Task 1 e commitar com `fix: corrige workflow de CI`.
Se falhar por teste: diagnosticar com `systematic-debugging` antes de mexer no workflow.

- [ ] **Step 6: Sem commit próprio**

Esta task não gera commit quando tudo passa — a evidência é a run verde no GitHub.

---

## Fora de escopo (não implementar)

- Branch protection/ruleset exigindo o check `test` (config manual de settings do GitHub, pós-merge).
- `bento check` no CI do bento.
- Workflow para projetos consumidores.
- Matriz de versões do Node e lint de workflow (actionlint).
