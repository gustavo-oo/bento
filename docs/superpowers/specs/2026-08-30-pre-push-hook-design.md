# Spec — pre-push hook no bento install/update/uninstall

Data: 2026-08-30

## Objetivo

O `bento install`/`update` passa a instalar também um hook git `pre-push` no projeto consumidor, que roda o `check` do small-prs antes de cada push e **aborta o push** se o diff `main...HEAD` exceder os limites de `.pr-limits.yaml`. `uninstall` remove a configuração. Flag `--no-hooks` pula tudo (espelha `--no-agents`/`--no-superpowers`/`--no-ponytail`).

## Contexto

- O opencode não tem hook de `git push` (só eventos de sessão/ferramenta via plugins); o pre-push é mecanismo do git, independente do agente.
- O hook é **fail-fast pessoal** (config `core.hooksPath` é local por clone, não viaja no repo) e pode ser burlado com `git push --no-verify` — conveniência, não segurança. Garantia de time continua sendo CI.
- Mecanismo escolhido: `git config --local core.hooksPath .bento/hooks` apontando para um hook **versionado** em `.bento/hooks/pre-push` (copiado de `templates/hooks/pre-push`). Abordagens alternativas descartadas: wrapper em `.git/hooks/pre-push` (não versionado, update/uninstall frágeis, inútil com husky).
- Zero deps runtime (regra do repo); testes sem rede e sem `gh`.

## Comportamento do hook

`templates/hooks/pre-push` (copiado para `.bento/hooks/pre-push` com `chmod 755`):

```sh
#!/bin/sh
# gerado pelo bento (templates/hooks/pre-push) — não edite; re-criado no update.
set -e
root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$root" || exit 0
git rev-parse --verify --quiet main >/dev/null 2>&1 || exit 0
[ -f scripts/pr-split-verify.mjs ] || exit 0
node scripts/pr-split-verify.mjs check
```

- Fora de repo git / sem `main` local / sem shim → `exit 0` (não bloqueia).
- Violação → o shim imprime `PR GRANDE:` + motivos no stderr e sai 1 → `set -e` propaga → git aborta o push.
- Dentro dos limites → `exit 0`.
- Roda em qualquer push (branch, camada de stack via gh-stack — cada uma validada contra `main...HEAD` — e tags, inofensivo).

## Comportamento

### install / update

- `install(projectRoot, { noAgents, noHooks })`: copia `templates/hooks/pre-push` → `.bento/hooks/pre-push` com `chmodSync(dest, 0o755)`. `noHooks: true` pula a cópia.
- `setupPrePushHook(cwd)` → `{ status: 'installed' }` ou `{ status: 'skipped', reason: 'no-git' | 'hooks-path' | 'manual-hooks' }`:
  1. `git rev-parse --git-dir` falha → skip `no-git` (aviso no stderr).
  2. `git config --get core.hooksPath` já existe e **não** aponta para o bento → skip `hooks-path` (aviso). "Aponta para o bento" = valor relativo normalizado `.bento/hooks` (aceita `./.bento/hooks` e trailing `/`) ou absoluto resolvendo para `<cwd>/.bento/hooks`.
  3. Existe arquivo não-`.sample` (excluindo `README*`) em `.git/hooks` → skip `manual-hooks` (aviso).
  4. Senão: `git config --local core.hooksPath .bento/hooks` → `installed`.
- Idempotente: update re-copia + re-configura; skip do usuário respeitado e reavaliado a cada update.
- Output do install/update lista `pre-push → core.hooksPath`; skip vira aviso no stderr com o motivo.

### uninstall

- `removePrePushHook(cwd)` → `{ removed: true } | null`: só executa `git config --local --unset core.hooksPath` se o valor atual aponta para o bento; senão `null` (não mexe no que não é seu).
- `.bento/hooks/pre-push` é removido junto com `.bento/` (já coberto pelo uninstall existente).
- Output do uninstall lista `pre-push (core.hooksPath)` quando removido.

## Arquitetura

- Novo `lib/hooks.mjs` com `setupPrePushHook`/`removePrePushHook` (funções puras, cwd parametrizável, git via `execFileSync`, padrão de `lib/diff.mjs`).
- Novo `templates/hooks/pre-push` (fonte do hook instalado).
- `lib/install.mjs`: `noHooks` na assinatura + cópia/chmod do hook.
- `bin/bento.mjs`: flag `--no-hooks`; install/update orquestram `setupPrePushHook`; uninstall orquestra `removePrePushHook`; help atualizado.
- `lib/opencode-config.mjs` e demais libs inalteradas.

## Testes

`test/hooks.test.mjs` (node:test, repos git fake, remote bare local — sem rede):

1. setup instala `core.hooksPath = .bento/hooks` num repo git fake.
2. setup idempotente (2ª execução → installed, config inalterada).
3. `core.hooksPath` existente (`.husky`) → skip `hooks-path`, config intacta.
4. `core.hooksPath` já apontando para o bento (`./.bento/hooks`) → installed, sem duplicar.
5. Hook manual não-`.sample` em `.git/hooks` → skip `manual-hooks`.
6. Só `.sample`s → installed.
7. Não-repo → skip `no-git`.
8. remove: valor do bento → unset; valor de outro → `null`; sem repo → `null`.
9. Integrado (hook real): repo fake + `git init --bare` como remote → commit acima do limite → `git push` falha (status ≠ 0, stderr com `PR GRANDE`); commit pequeno → push ok; repo sem `main` local (branch `feat`) → push não bloqueado.

`test/install.test.mjs`: install copia `.bento/hooks/pre-push` executável (mode 755, conteúdo chama `pr-split-verify.mjs check`); `noHooks: true` não copia.

`test/cli.test.mjs`: `update --no-hooks` não configura hooksPath; `uninstall` remove hooksPath do bento.

## Docs

README: Instalação/Desinstalação listam o pre-push + flag `--no-hooks`; nota de que a config `core.hooksPath` é local por clone (cada clone precisa de `bento install`) e que `git push --no-verify` burla (conveniência, não segurança). AGENTS.md: `lib/hooks.mjs` na seção Arquitetura.