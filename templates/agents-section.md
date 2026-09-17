## Bento (small-prs)

- Sessões: a spec fecha o roadmap (1 entregável demonstrável + estimativa; corte em ~3× o limite do PR); cada sessão tem plano próprio `docs/superpowers/plans/YYYY-MM-DD-<assunto>-s<N>.md`, commitado no trunk antes do stack.
- Stack viva: cada task vira camada via `gh stack add`; após a task rode `node scripts/pr-split-verify.mjs check <base> HEAD` (ou `bento check`) e pare se estourar; fix em camada inferior = commit na camada + `gh stack rebase --upstack` agrupado.
- Nunca abra um PR sem rodar `node scripts/pr-split-verify.mjs check` (ou `bento check`).
- Antes do check, atualize as duas branches envolvidas com o remote: `git fetch origin <base> <head>` (refs desatualizadas = diff fantasma).
- Diff acima de .pr-limits.yaml bloqueia o PR: ofereça o split antes.
- Splits em cadeia são entregues com gh-stack (`gh stack init/add/push/submit`).
- Equivalência do split é obrigatória: `node scripts/pr-split-verify.mjs equivalence <base> <head> <camada1> ...`.
- Antes de finalizar a branch/abrir PR, rode o gate `self-review`: 2 revisores (regressão + adversarial), repro para High/Medium e ledger em `.superpowers/self-review/`. Nada "residual" sem decisão explícita.
- O hook pre-push é stack-aware: valida cada branch contra a base do seu stack (ancestral mais próximo no mesmo push).

### Agents (bento)

- Troque com Tab: `flash` (enxuto, padrão), `superpowers` (fluxo completo de skills) e `orchestrator` (executa o roadmap de sessões e dispara subagents).
- Delegue com `@explorer` (codegraph, leitura), `@verify` (verificação/review independente), `@reviewer` (review adversarial) e `@browser` (automação web); `implementer` é o worker de implementação (nível 2, sem subagents).
- `.opencode/agents/*.md` são seus: edite `model`, `temperature` e permissões à vontade; `bento update` não sobrescreve.
