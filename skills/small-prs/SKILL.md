---
name: small-prs
description: Previne, valida, corrige e revisa PRs grandes no fluxo opencode (superpowers). Use ao planejar (roadmap de sessões + camadas do stack), ao executar planos (stack viva — gh stack add por task + check por camada; violação = parar), antes de abrir um PR (pr-split-verify), quando um diff avulso exceder os limites de .pr-limits.yaml (split em cadeia via gh-stack) e para revisão independente por camada (subagentes limpos).
---

# small-prs — prevenção, validação, correção e revisão de PRs grandes

## Modo 1 — Prevenção (sessões, roadmap e plano)

### Sessões (roadmap na spec)

Ao fazer brainstorming/spec, feche um roadmap de sessões antes de qualquer plano detalhado:

| # | sessão | entregável demonstrável | camadas estimadas | linhas/arquivos est. | depende de |
| - | ------ | ----------------------- | ----------------- | -------------------- | ---------- |

- 1 entregável demonstrável por sessão; sem entregável nomeável, não é sessão.
- Estimativa total da sessão > ~3× o limite do PR (default 400 → ~1200 linhas) → divida a sessão já no roadmap.
- Sessões dependentes só começam depois que as anteriores entregaram (merge); declare a ordem.
- Planejamento progressivo: o plano da sessão atual é detalhado em `docs/superpowers/plans/YYYY-MM-DD-<assunto>-s<N>.md`; sessões futuras ganham plano próprio quando começarem.
- Spec/roadmap + plano da sessão são commitados no trunk antes do stack (trunk protegido → docs na 1ª camada).

### Plano da sessão (stack)

Cada task do plano é uma camada de um stack gh-stack; declare a tabela:

| camada | branch | base | foco/arquivos previstos | aceite | título do PR | mensagem do commit |
| ------ | ------ | ---- | ----------------------- | ------ | ------------ | ------------------ |

- Branch no padrão `split/<slug>/<nn>-<nome>`; 1 acceptance criterion por camada.
- Testes viajam junto do código que validam; refactor separado de feature; migração junto do código que ela serve.
- Estime arquivos/linhas por camada: camada cuja estimativa já passa do limite é dividida **antes** de executar.
- Limite default: <=400 linhas de diff e <=10 arquivos por PR (ver .pr-limits.yaml).
- Declare dependências e ordem de entrega entre as camadas.

## Modo 1.5 — Execução em stack viva

Setup da sessão: confira o trunk (`git remote set-head origin <trunk>`; um origin/HEAD errado faz o stack mirar a branch errada) e rode `gh stack init <branch1>`.

Por task, nesta ordem:

1. `gh stack add <branchN>` (cria a camada sobre o topo e faz checkout; sem commit).
2. Implemente/teste/commite na camada (mensagem final = título do PR; vários commits ok — nada de squash interativo).
3. Rode `node scripts/pr-split-verify.mjs check <baseN> HEAD` (ou `bento check <baseN>`); base = camada anterior, trunk na 1ª.
4. Checkpoint: suíte de testes **completa** (não só a da task) + self-review curto do diff da camada.
5. **Violou → PARE**: mostre a tabela (camada, linhas, arquivos, limite) e aguarde decisão (subdividir a task, mudar escopo ou override de docs). Não inicie a próxima task.
6. Ok → registre o orçamento (linhas/arquivos vs limite) no relatório da task e, no fluxo subagent-driven-development, no ledger `.superpowers/sdd/progress.md`.

**Fix em camada inferior (política A):** a camada congela ao passar o checkpoint; novos commits nela só por correção. Fix na camada K: navegue até K (`gh stack bottom`/`down`), commite, **agrupe todos os fixes pendentes** e rode `gh stack rebase --upstack` UMA vez (rerere já ligado). Rebase com conflito difícil → `gh stack rebase --abort` e **pare e pergunte**. Pós-rebase: re-rode `check` nas camadas afetadas, a suíte no topo e verifique por conteúdo (`git show <topo>:<arquivo>` / `git merge-base --is-ancestor`), nunca por hash — rebase troca hashes.

Fim da sessão: Modo 4 (review por camada) → `gh stack submit --auto --open` → `gh pr edit` por PR → merge via `finishing-a-development-branch` (gate do usuário).

## Modo 2 — Validação (antes de abrir PR)

Antes de abrir qualquer PR (superpowers:finishing-a-development-branch):

1. Garanta que AS DUAS branches envolvidas (base e head) estão atualizadas com o remote: `git fetch origin <base> <head>`. Refs locais desatualizadas produzem diffs fantasmas (commits de outros PRs já mergeados aparecem como mudanças do seu PR).
2. Rode `node scripts/pr-split-verify.mjs check` (ou `bento check`).
3. Se exit 0: prossiga com gh-stack (`gh stack push`, `gh stack submit`; alias `gs` disponível via `gh stack alias`, opcional).
4. Se exit != 0 (PR GRANDE): NÃO abra o PR. Apresente o relatório e ofereça o split (Modo 3).

## Modo 3 — Correção (split retroativo)

Só execute após aprovação explícita do usuário:

1. Crie branch de salvaguarda: `git branch backup/<branch-atual>`.
2. **Antes de agrupar, pergunte a política de arquivo ÚNICO grande** (ex: docs de 795 linhas): dividir o conteúdo em partes ou deixar intocado mesmo acima do limite? (Default do usuário: docs intocadas.) Nunca presuma.
3. Analise o diff (arquivos e dependências/imports) e agrupe em camadas coerentes: mesmo módulo, refactor != feature, CODEOWNERS se existir. Arquivo ambíguo -> pergunte ao usuário. **Testes de invariante GLOBAL** (que validam vários arquivos, ex: "nenhum componente embute cost"): vão com o ÚLTIMO grupo que satisfaz o invariante (ou com todos os arquivos que ele valida), nunca com o primeiro. Arquivo único grande permitido -> camada própria com o arquivo inteiro.
4. Apresente o plano de split (tabela: camada, arquivos, dependências) e aguarde aprovação.
5. Execute: `gh stack init <camada1> <camada2> ...` (lista COMPLETA em ordem — adota branches já existentes; NÃO use `gh stack add` para branches criadas antes do init); em cada camada aplique `git diff <base>..<origem> -- <paths> | git apply` e commite (1 commit limpo por camada). **`git add <arquivos do grupo>` — nunca `git add -A`** (pode engolir scratch/artefatos de validação). Antes de iniciar, garanta o trunk correto: `git remote set-head origin <trunk>` (ex: main) — um origin/HEAD errado faz o stack inteiro mirar a branch errada.
6. Se a camada B usa símbolo renomeado na A, inclua shim/alias retrocompatível na A.
7. Verifique: `node scripts/pr-split-verify.mjs equivalence <base> <head> <camada1> ...` — precisa exit 0. Se houve transformação de conteúdo permitida (arquivo dividido), a equivalência de árvore vai reportar DIVERGENTE apenas nesses paths: confirme que são só eles, verifique a preservação de conteúdo e trate como aprovado. **Rode equivalence/check de QUALQUER checkout que tenha o shim** (ex: a branch de trabalho) — as camadas criadas de `<base>` não contêm `scripts/` nem `.bento/`; os refs resolvem de qualquer checkout.
8. Rode lint, build, testes **e `check` por camada**; pare e reporte se falhar. (O `check` pega crescimento silencioso — fixes podem passar o teto.)
9. Nomeação das camadas: `split/<slug-da-feature>/<nn>-<nome-curto-semantico>` (ex: `split/rls-sensitive-columns/01-fundacao`, `02-hook-variacoes`).
10. Commit de cada camada: mensagem = título do PR, conventional e descritivo (ex: `feat(rls): restringe colunas sensíveis — migração e utils`).
11. **Fixes durante o Modo 4 em camada N: rebase em cascata das camadas N+1..topo sobre a camada corrigida** (fix local não propaga automaticamente — sem isso o mergeável fica sem o fix). Verifique por CONTEÚDO no topo da cadeia (rebase troca hashes: `git show <topo>:<arquivo>` — não confie em hashes antigos).
12. Entrega: `gh stack submit --auto --open` (sem draft — confirme no `--help`). Depois, para CADA PR do stack: `gh pr edit <n> --title "<título>" --body "<descrição>"` com corpo contendo: o que faz, por que, e foco da review (arquivos-chave/riscos). PRs órfãos de iterações anteriores (branch deletada/renomeada): feche com comentário apontando o substituto.
13. Se não for o autor do PR original, credite o autor nos novos PRs. Nunca force-push na branch original antes da aprovação final.

## Modo 4 — Revisão independente por camada (gate antes do submit)

Integra com superpowers: é a fase de review do `subagent-driven-development`/`requesting-code-review` aplicada à stack. Reutilize os contratos existentes (não duplique): `task-reviewer-prompt.md` (subagent-driven-development) para revisão por camada; o review final da stack é a skill `self-review` (2 revisores + validação cruzada + repro). O Modo 3 para na aprovação do usuário, mas a sequência natural é: Modo 3 passos 7-8 (equivalence + checks) → **Modo 4** → submit.

Para CADA camada da stack, ANTES do `gh stack submit`:

1. Setup de worktree por camada (reviewers são read-only, paralelos): `git worktree add <path-wt-N> <camadaN>` + `ln -s <clone>/node_modules <path-wt-N>/node_modules` (worktrees não compartilham node_modules).
2. Gere o pacote de review da camada (diff da camada contra a base dela, com contexto) e salve em arquivo — FORA do repo (ex: dir temporário).
3. Despache um subagente reviewer LIMPO (contexto zero da sessão — sem histórico do split) com:
   - o arquivo do diff (única fonte do que mudou),
   - os limites de `.pr-limits.yaml`,
   - o título/descrição do PR como contrato,
   - o worktree NOMEADO da camada (path absoluto),
   - **o baseline de lint pré-existentes por arquivo** (ex: "base tinha 5 no-explicit-any em X.ts — só os NOVOS são defeito"), para evitar falsos positivos de arquivos tocados de camadas anteriores,
   - a instrução de rodar os testes da camada E `bento check` da camada.
4. O reviewer emite DOIS vereditos (contrato task-reviewer): **spec compliance** ✅/❌ e **quality** Approved/Rejected, com findings por severidade Critical/Important/Minor.
5. Critical/Important → despache subagente fix LIMPO → re-review (mesmo ciclo do subagent-driven-development: fixer roda os testes de cobertura e reporta comando + saída). **Path ÚNICO de relatório** para fixer e reviewer (definido no dispatch — ex: `<dir-temp>/modo4/layerN-report.md`) para nunca se perderem.
6. Minor → registre no ledger da unidade do self-review (`.superpowers/self-review/<slug-da-stack>/ledger.md`); o gate final faz a triagem dos Low (Minor) com o dev.
7. **GATE: camada sem review aprovado NÃO entra no submit.**

Ao final de todas as camadas, rode a skill `self-review` no topo da cadeia (unidade = stack) e, além do review, **verifique a topologia**: para cada fix aprovado, confirme por conteúdo (não por hash — rebases trocam hashes) que está ANCESTRAL no topo da cadeia (`git merge-base --is-ancestor <fix> <topo>` ou `git show <topo>:<arquivo>`). Depois disso, siga para o `finishing-a-development-branch` (merge em cascata via `gh stack merge`).
