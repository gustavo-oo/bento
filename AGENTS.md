# AGENTS.md — bento

Catálogo pessoal do fluxo opencode: skills, commands, scripts e configs.

## Commands

npm test            # node --test test/*.test.mjs

## Regras

- Node puro, zero deps runtime (Node >= 18).
- TDD obrigatório: teste antes da implementação (node:test).
- `lib/*.mjs` = lógica; `bin/bento.mjs` = CLI; `skills/<nome>/SKILL.md` = skills; `templates/` = configs default; `test/*.test.mjs` = testes.
- Testes não dependem de rede nem de `gh` instalado.
- Convenções de commit: conventional commits (feat:, fix:, docs:, test:).
