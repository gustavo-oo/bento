# Spec — CI do bento (validação de PRs)

Data: 2026-09-17

## Objetivo

Adicionar ao repositório do bento um workflow de GitHub Actions que roda `npm test` em pull requests e em pushes na `main`, no Node 24. É a validação server-side que complementa o pre-push local (burável com `--no-verify`) — a spec do pre-push já registrava que "garantia de time continua sendo CI".

## Contexto

- O repo é zero-dep (sem `package-lock.json`): não há passo de install a executar.
- Os testes são herméticos (sem rede e sem `gh`) por regra do repo; o runner `ubuntu-latest` tem `git` e `node` suficientes.
- Decisões do brainstorming: escopo é o próprio repo (não template para consumidores), só testes (sem `bento check`), uma única versão do Node (24 — active LTS em set/2026), gatilhos `pull_request` + `push` na `main`.
- Versões das actions confirmadas na doc atual: `actions/checkout@v7`, `actions/setup-node@v7`.

## Comportamento

Novo `.github/workflows/ci.yml`:

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

- Sem `npm ci`/`npm install`: zero deps e sem lockfile; `npm test` é `node --test test/*.test.mjs`.
- `package-manager-cache: false`: o setup-node v7 liga cache npm por padrão; sem lockfile não há o que cachear.
- `permissions: contents: read`: menor privilégio.
- `concurrency` com `cancel-in-progress`: run antigo do mesmo ref é cancelado quando chega um novo.
- Check único, chamado `test`, no Node 24 — sem matriz (decisão explícita).

## Fora de escopo

- Tornar o check obrigatório via branch protection/ruleset: ajuste manual nos settings do GitHub, pós-merge.
- `bento check` (limites de PR) no CI do repo.
- Workflow instalado em projetos consumidores.
- Lint/actionlint no repo.

## Arquitetura

- Único arquivo novo: `.github/workflows/ci.yml`. Nenhuma mudança em `lib/`, `bin/`, `templates/` ou `skills/` (não afeta o que é instalado em consumidores e não exige bump/estratégia de update).

## Testes

- Não há teste `node:test` para o YAML (regra de zero deps e sem rede).
- Verificação local: `npm test` continua verde; sanity check do YAML com o parser disponível no sistema (`python3 -c 'import yaml, sys; yaml.safe_load(open(sys.argv[1]))' .github/workflows/ci.yml`, se PyYAML existir), sem virar dependência do projeto.
- Verificação real: push e conferir o workflow verde no GitHub (PR e push na `main`).

## Docs

- `README.md` (seção Desenvolvimento): uma linha registrando que o CI roda `npm test` no Node 24 em PRs e pushes na `main`.
- `AGENTS.md` (seção Commands): menção ao CI e ao arquivo `.github/workflows/ci.yml`.
