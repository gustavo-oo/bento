# Spec — dogfooding do bento no próprio repositório

Data: 2026-09-17

## Objetivo

O repositório do bento passa a consumir o próprio bento: hook pre-push stack-aware, limites de PR, skills (small-prs, vendadas do superpowers, taste-skill/agent-browser e o que mais a fonte instalar no momento), agents escopados e MCP servers no checkout principal. Alterações na fonte (`lib/`, `bin/`, `templates/`, `skills/`, `templates/agents/`) são aplicadas ao dogfood com um comando (`npm run dogfood`; `npm run dogfood:setup` na primeira vez). Sem symlinks/self mode: a sincronia é por re-install.

## Contexto

- Decisões do brainstorming:
  1. Objetivo: usar o fluxo de verdade no desenvolvimento do bento; validar `install`/`update` é consequência.
  2. Sincronia: re-install via script npm (opção "copiar + re-rodar"), não self mode com symlinks.
  3. Versionamento: nada derivado vai para o git (`.bento/`, `.codegraph/`, `.opencode/`, `opencode.json`/`.jsonc` ignorados); versionados só `.pr-limits.yaml` e o shim.
  4. Shim: nova flag `--no-shim` no `install`/`update`; o shim do repo continua apontando para `../lib/validate.mjs` (vivo), em vez de ser sobrescrito pela versão `.bento` de consumidor.
  5. `AGENTS.md`: o `install` gerencia a seção `## Bento (small-prs)` (comportamento atual), commitada no repo.
  6. Sequenciamento: dogfood completo (com hook) só depois da stack-viva.
- Estado atual: o repo não tem `.bento/`, `.opencode/`, `opencode.json`, `.pr-limits.yaml` nem hook ativo (`core.hooksPath` vazio). Já existe `scripts/pr-split-verify.mjs` versionado apontando para `../lib/validate.mjs`, mas só com `check`/`equivalence`.
- Motivo do sequenciamento: o hook atual valida cada branch contra `main` fixo; o trabalho do repo é empilhado, então stacks legítimos estourariam o limite. A stack-viva (branch `feat/stack-viva`) entrega: `lib/stack.mjs` (base por ancestralidade entre os refs do push), `runCheckPush` em `lib/validate.mjs` e hook chamando `check-push <branch> <sha> …` uma vez por push.
- Dependência dura: esta spec assume a stack-viva no histórico (base da implementação). O shim versionado do repo ainda **não** suporta `check-push` na stack-viva — esta spec o atualiza.
- Limites: `evaluate` conta docs no total global; overrides só adicionam teto por glob (não isentam do global). O repo aceita o padrão 400/10 do template.

## Comportamento

### CLI: `--no-shim` (install/update)

- `lib/install.mjs`: opção `noShim` em `install(projectRoot, { … noShim })`; quando `true`, pula `mkdirSync(join(projectRoot, 'scripts'))` e a escrita de `scripts/pr-split-verify.mjs`.
- `bin/bento.mjs`: parse de `--no-shim` (install e update) e usage atualizado.
- `uninstall` não muda: a remoção do shim continua condicionada a conter o marcador `../.bento/lib/validate.mjs`; o shim vivo do repo (`../lib/validate.mjs`) é preservado de qualquer forma.
- Sem efeito nos demais artefatos (`lib/`, `bin/`, `templates/`, skills, agents, config, hook), que seguem normais.

### Repo dogfood

- `package.json`:
  - `"dogfood:setup": "node bin/bento.mjs install --no-shim"` — uma vez por clone (instala CLIs globais, gh-stack, hook e roda `codegraph init`).
  - `"dogfood": "node bin/bento.mjs update --no-shim"` — após qualquer mudança na fonte; não instala CLIs nem re-indexa codegraph.
- `.gitignore` ganha: `.bento/`, `.codegraph/`, `.opencode/`, `opencode.json`, `opencode.jsonc`.
- `scripts/pr-split-verify.mjs` (versionado, vivo) passa a espelhar o shim gerado, importando de `../lib/validate.mjs`:
  - `check [base]` e `equivalence <base> <head> <camada…>` como hoje;
  - `check-push <branch> <sha> …` novo, montando `refs` em pares e chamando `runCheckPush({ refs, cwd: process.cwd() })`;
  - usage com os três subcomandos; exit 2 sem subcomando válido.
- `.pr-limits.yaml` versionado com o conteúdo do template (400/10, sem overrides).
- `AGENTS.md`: seção gerada `## Bento (small-prs)` adicionada pelo `install` e commitada; a seção Commands ganha os scripts `dogfood*`.
- `opencode.json`, `.opencode/`, `.bento/` e `.codegraph/` são artefatos locais (ignorados no git), criados por `dogfood:setup`/`dogfood`.

## Fluxo (runtime do repo)

1. Clone/branch novo: `npm run dogfood:setup` uma vez; worktrees adicionais rodam `npm run dogfood` (o hook resolve `.bento/hooks` relativo ao worktree; sem isso o push sai sem validação).
2. Dia a dia: após mudar `lib/`, `templates/`, `skills/` ou agents, rodar `npm run dogfood`.
3. Push: `gh stack push`/`git push`; o hook valida cada branch contra a base do seu stack (ou `main`), abortando se estourar o `.pr-limits.yaml`. `git push --no-verify` burla (conveniência, não segurança).
4. Pré-requisito de ativação: `main` local sincronizado com `origin/main` (o hook usa `main` como fallback) e branches em pilha válida/devidamente rebasadas. Ativação num estado sujo bloqueia pushes — comportamento esperado, não bug.

## Arquitetura

- `lib/install.mjs` — opção `noShim` (guarda a criação do diretório `scripts/` e a escrita do shim).
- `bin/bento.mjs` — flag `--no-shim`, repasse aos dois comandos, usage.
- `scripts/pr-split-verify.mjs` — subcomando `check-push` (espelho do `SHIM` gerado em `lib/install.mjs`, com paths `../lib`).
- `package.json` — scripts `dogfood` e `dogfood:setup`.
- `.gitignore`, `.pr-limits.yaml`, `AGENTS.md`, `README.md` — artefatos e documentação do dogfood.

## Testes

Herméticos (node:test, temp dirs, sem rede/gh):

1. `test/install.test.mjs`: `install(dir, { noShim: true })` não cria `scripts/pr-split-verify.mjs`; com shim existente, `noShim: true` não o sobrescreve (sentinela de conteúdo); sem a flag, o shim é criado (cobertura existente).
2. `test/cli.test.mjs`: `update --no-shim` num repo fake com `scripts/pr-split-verify.mjs` sentinela → arquivo intacto; `update` sem a flag → shim do bento escrito (cobertura existente de shim).
3. `scripts/pr-split-verify.mjs` (shim do repo): smoke test hermético — sem args sai 2 e o usage cita `check-push`; `check-push` sem refs em cwd temp sai 0 (`runCheckPush` com lista vazia não toca git; `loadLimits` usa defaults).

Verificação manual (não vira teste, muta o repo):

1. `npm test` verde.
2. `npm run dogfood:setup` no checkout principal.
3. `git config core.hooksPath` = `.bento/hooks`; `.bento/VERSION` presente.
4. Hook manual: `printf 'refs/heads/<branch> <sha> refs/heads/<branch> <sha>\n' | .bento/hooks/pre-push`.
5. `node scripts/pr-split-verify.mjs check <base> <head>` por camada.
6. `git status --short` sem ruído derivado (só mudanças rastreadas esperadas: `AGENTS.md`, `.pr-limits.yaml`, shim/docs).

## Docs

- `README.md`: seção de dogfooding (scripts, artefatos ignorados, worktrees, pré-requisito de ativação) e `--no-shim` na lista de flags.
- `AGENTS.md`: `npm run dogfood*` na seção Commands; `--no-shim` na lista de flags; bullet do shim do repo / dogfood na arquitetura.
- Aviso documentado: `uninstall` no próprio repo remove arquivos rastreados (`.pr-limits.yaml`, seção do `AGENTS.md`) — recuperar com `git restore`.

## Fora de escopo

- Self mode com symlinks (`.bento/` linkado à fonte).
- Versionar `.bento/`, `.opencode/`, `opencode.json`.
- CI do repo (spec própria) e mudanças da stack-viva (fora desta slice).
- Rodar o dogfood em CI.
