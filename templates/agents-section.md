## Bento (small-prs)

- Nunca abra um PR sem rodar `node scripts/pr-split-verify.mjs check` (ou `bento check`).
- Antes do check, atualize as duas branches envolvidas com o remote: `git fetch origin <base> <head>` (refs desatualizadas = diff fantasma).
- Diff acima de .pr-limits.yaml bloqueia o PR: ofereça o split antes.
- Splits em cadeia são entregues com gh-stack (`gh stack init/add/push/submit`).
- Equivalência do split é obrigatória: `node scripts/pr-split-verify.mjs equivalence <base> <head> <camada1> ...`.

### Agents (bento)

- Troque com Tab: `flash` (enxuto, padrão para modelos rápidos) e `superpowers` (fluxo completo de skills para features).
- Delegue com `@explorer` (codegraph, leitura), `@verify` (verificação independente) e `@browser` (automação web).
- `.opencode/agents/*.md` são seus: edite `model`, `temperature` e permissões à vontade; `bento update` não sobrescreve.
