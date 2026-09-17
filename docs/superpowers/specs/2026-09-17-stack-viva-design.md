# Spec — stack viva no ciclo de desenvolvimento (small-prs)

Data: 2026-09-17

## Objetivo

Eliminar o split retroativo (Modo 3) como caminho comum: o trabalho é dividido em **sessões bem escopadas** (cada uma com um entregável demonstrável), planejadas e executadas uma por vez, e dentro de cada sessão cada task nasce como camada própria de um stack gh-stack, validada com `check` antes da task seguinte. O diff nunca chega a ficar grande — ele já nasce separado. O `check`/small-prs vira a **garantia** para quando a estimativa errar um pouco ou uma task precisar ser maior para gerar entrega: violação interrompe a execução e aguarda decisão do usuário. O hook pre-push passa a ser stack-aware para não bloquear stacks legítimos.

## Contexto e decisões

- Fluxo atual: execução numa branch única; gate só no pre-push/PR; split retroativo (Modo 3) é o caminho caro em tokens (análise de dependências, `git apply` por camada, `equivalence`, debugging de divergência).
- Decisões tomadas no brainstorming:
  - Reforço por **processo do agente** (skill + templates), sem guard mecânico novo além do hook existente.
  - Em violação durante a execução: **parar e pedir decisão** (mesmo espírito do Modo 3, que exige aprovação).
  - `check` enxerga o andamento via **commit por task** (nenhuma mudança de semântica no `check` manual).
  - Reforço mora na skill `small-prs` + `templates/agents/` do bento; **nenhum patch em skill vendada** (mantém update do superpowers simples).
  - PRs entram no ar **só no fim** (`gh stack submit`); durante o dev só branches locais.
  - Fix em camada inferior: **política A** — fix na própria camada + um rebase agrupado.
  - **Sessões livres quanto a stacks** (uma sessão pode produzir 0, 1 ou N stacks); a proteção contra stack gigante vem do **escopo da sessão**, não da estrutura.
  - **Topologia de agents em 3 níveis (teto rígido)**: nível 1 **`orchestrator`** (primary) lê o roadmap e dispara, em ordem, um nível 2 **`session`** por sessão (contexto novo a cada sessão); o `session` invoca os nível 3 (`implementer` para implementação, `verify` para review, `explorer`/`browser` para apoio) e roda o stack. Nível 3 tem `task: deny` — sem quarto nível. Gates (violação, rebase difícil, merge) **sobem ao coordenador**, que pergunta ao usuário com `question` e retoma a sessão via `task_id` com a decisão.
  - Divisão em sessões: **roadmap fechado na spec** (brainstorming) e **plano por sessão** (writing-plans detalha só a sessão atual; a próxima ganha plano próprio ao começar).
  - Escopo da sessão: **1 entregável demonstrável + estimativa total de camadas/linhas**; heurística explícita — estimativa total da sessão acima de ~3× o limite do PR → dividir a sessão antes de planejar as tasks. Sem sintaxe nova no `.pr-limits.yaml`.
  - Papel do small-prs: **backstop** para estimativa levemente errada ou task legitimamente maior para entregar — não é o mecanismo primário de corte.
- gh-stack (github/gh-stack): `gh stack init [branches...]` adota branches existentes; `gh stack add <branch>` cria a camada no topo e faz checkout (não-interativo com nome explícito); `gh stack rebase` cascateia com `git rerere` ligado automaticamente; `gh stack submit --auto --open` cria os PRs; metadados locais em `.git/gh-stack`.
- Conflito com o hook atual: `gh stack push/submit` empurra todas as branches num `git push` só; o hook checa cada uma contra `main`, então a camada 2+ estouraria sempre. Solução: resolver a base de cada branch **por ancestralidade entre os refs do próprio push** — sem parsear `.git/gh-stack`, sem depender de `gh`, testável só com git.
- Regras do repo: Node puro (>= 18), ESM, zero deps runtime, TDD com node:test, testes sem rede e sem `gh`.

## Fluxo

### Sessões e roadmap (spec)

O brainstorming/spec fecha um **roadmap de sessões** antes de qualquer plano detalhado:

| # | sessão | entregável demonstrável | camadas estimadas | linhas/arquivos est. | depende de |
| - | ------ | ----------------------- | ----------------- | -------------------- | ---------- |

- Toda sessão declara **1 entregável demonstrável** (o que fica funcionando/mostrável ao fim). Sem entregável nomeável, não é sessão.
- Heurística de corte: estimativa total da sessão > ~3× o limite do PR (default 400 → ~1200 linhas) → dividir a sessão já no roadmap.
- Estimativa é estimativa: imprevisto que estoure o limite de uma camada durante a execução cai no gate do Modo 1.5 (parar e perguntar), nunca em "continuo e resolvo no fim".
- Cada sessão é um plano próprio e roda como **subagent de sessão** (contexto novo): o dispatch passa **caminhos** (spec/roadmap, plano `-s<N>`, limites), nunca resumo de histórico. O coordenador guarda só os recibos (status, camadas, orçamento).
- Sessões com dependência só começam depois que as anteriores entregaram (merge); o roadmap declara a ordem.
- Plano da sessão vive em `docs/superpowers/plans/YYYY-MM-DD-<assunto>-s<N>.md` (mesmo diretório/estilo dos planos atuais).

### Planejamento (Modo 1 reforçado)

O plano da sessão declara explicitamente o stack, com uma tabela por camada:

| camada | branch | base | foco/arquivos previstos | aceite | título do PR | mensagem do commit |
| ------ | ------ | ---- | ----------------------- | ------ | ------------ | ------------------ |

- Branch no padrão `split/<slug>/<nn>-<nome>` (mesmo padrão do Modo 3).
- 1 acceptance criterion por camada; dependências e ordem de entrega explícitas.
- Estimativa declarada por camada (arquivos/linhas) — camada cuja estimativa já passa do limite é dividida **antes** de executar, não durante.
- Spec/roadmap + plano da sessão são commitados no trunk **antes** do `gh stack init` (fora do diff contado). Trunk protegido → docs vão na primeira camada. O plano de cada sessão futura é criado (e commitado) quando a sessão começa, não antes.

### Execução (novo Modo 1.5 — stack viva)

Setup: conferir o trunk (`git remote set-head origin <trunk>`; um origin/HEAD errado faz o stack mirar a branch errada) e `gh stack init <branch1>`.

Por task, nesta ordem:

1. `gh stack add <branchN>` (cria a camada sobre o topo e faz checkout; sem commit).
2. Implementa/testa/commita na camada (mensagem final = título do PR; se a task gerar vários commits, a camada mantém os commits — nada de squash interativo).
3. `bento check <baseN> HEAD` (base = camada anterior; trunk para a 1ª).
4. Checkpoint: suíte de testes **completa** (não só a da task) + self-review curto do diff da camada.
5. **Violou → PARA**: reporta a tabela (camada, linhas, arquivos, limite) e aguarda decisão (subdividir a task, mudar escopo ou override). Não inicia a próxima task.
6. Ok → registra o orçamento (linhas/arquivos vs limite) no relatório da task e, quando o fluxo for subagent-driven-development, no ledger `.superpowers/sdd/progress.md`.

**Fix em camada inferior (política A):** a camada congela ao passar o checkpoint; novos commits nela só por correção. Fix na camada K: navega até K (`gh stack bottom`/`down`), commita, **agrupa todos os fixes pendentes** e roda `gh stack rebase --upstack` uma vez (rerere já ligado). Rebase com conflito difícil → `gh stack rebase --abort` e **para e pergunta**. Pós-rebase: re-`check` nas camadas afetadas, testes no topo e verificação por conteúdo (`git show <topo>:<arquivo>` / `git merge-base --is-ancestor`, nunca por hash — rebase troca hashes).

### Fim (Modo 2/4)

- Modo 4 inalterado: reviews por camada (worktrees, reviewers limpos) → `gh stack submit --auto --open` → `gh pr edit` por PR (título/corpo com foco de review) → merge via `finishing-a-development-branch`. Tudo isso roda **dentro do subagent de sessão**; o merge (decisão do usuário) é gate e sobe ao coordenador.
- `equivalence` deixa de ser passo do fluxo novo (nada é reescrito); continua existindo para o Modo 3 legado (branch já grande chegando de fora).

## Hook stack-aware

- `templates/hooks/pre-push` passa a coletar os pares `local_ref`/`local_sha` do stdin e chamar o shim **uma vez** com todos (`check-push <ref> <sha> ...`), em vez de um `check main <sha>` por ref.
- O shim resolve a base de cada branch por ancestralidade no conjunto empurrado: base = o ref do conjunto que é ancestral do branch e está mais próximo (menor distância de commits); sem ancestral no conjunto → `main` (comportamento atual). Cada branch é validado contra a própria base; exit 1 se qualquer uma violar.
- Sem stack (push comum de uma branch) → nenhum ancestral no conjunto → `main`, idêntico a hoje.
- Limitação documentada: push isolado de uma camada do meio (sem as de baixo no mesmo push) cai no fallback `main` e pode bloquear conservadoramente. O fluxo real (`gh stack push`/`submit`) empurra o stack inteiro, então não é afetado.
- A lógica de resolução vive em lib testável (novo `lib/stack.mjs` ou função em `lib/validate.mjs` — o plano decide); o template do hook continua fino.

## Skill, agents e topologia

- `skills/small-prs/SKILL.md`: descrição atualizada (citar execução/checkpoint por camada, para a skill ser invocada ao executar planos), Modo 1 com a spec de **sessões/roadmap** e do stack, e novo **Modo 1.5** com o loop, o gate "para e pergunta" e a política A. O papel de backstop fica explícito: o corte primário é o roadmap (entregável + heurística 3×); o `check` pega o que a estimativa errou.
- Novos templates em `templates/agents/` (mesmo mecanismo do `agents.mjs`: marcador `bento: agent`, instala só se ausente, uninstall remove só o que tem o marcador):
  - `orchestrator.md` (primary): lê o roadmap da spec e dispara um `session` por sessão, em ordem; guarda recibo por sessão (status, camadas, orçamento); é o **único** que usa `question` para gates. `permission.task` = `{"*": deny, "session": allow}`.
  - `session.md` (subagent): executa o Modo 1.5 (stack, `check` por camada, política A) e conduz o Modo 4, despachando nível 3. `permission.task` = `{"*": deny, "implementer": allow, "verify": allow, "explorer": allow, "browser": allow}` — **`general` fica fora** (seria o quarto nível); quando o texto do superpowers disser "general-purpose", despachar `implementer` (implementação) ou `verify` (review). `skill` liberado (small-prs, fluxo superpowers); `bash` liberado (stack/check/git).
  - `implementer.md` (subagent, nível 3): implementa/testa/commita a task; `permission.task: deny`, `edit`/`bash` liberados, `skill` liberado (TDD); instruído a não despachar subagents.
  - Nível 3 é todo terminal: `implementer` (novo) e os existentes `verify`, `explorer`, `browser` mantêm `task: deny` — é o que garante o teto mecanicamente.
- `templates/agents/verify.md` acumula o papel de reviewer por camada do Modo 4 (contrato spec compliance + quality); ganha allow de bash para os comandos de verificação do fluxo (testes/lint do projeto, `bento check`/shim `pr-split-verify.mjs check`), preservando `edit: deny`/`task: deny`.
- Gates não morrem no aninhamento: o `session` devolve `gate` + relatório, **não decide**; o coordenador pergunta ao usuário e retoma o mesmo `task_id` do `session` com a decisão (sem re-explorar contexto).
- `lib/agents.mjs`: `AGENT_NAMES` e `wantedAgents` incluem `orchestrator`/`session`/`implementer` no grupo `profile` (saem com `--no-profile`; install só se ausente; uninstall remove só com marcador).
- Fluxo atual de agents preservado: `flash` segue primary enxuto e `default_agent` continua `flash`; `superpowers` inalterado.
- `templates/agents/flash.md`: trocar o item "antes de abrir PR" por checkpoint por task/camada + sessão bem escopada (entregável + estimativa).
- `templates/agents-section.md`: bullets de sessões/roadmap, topologia em 3 níveis (`orchestrator`/`session`/`implementer`) e stack viva (`gh stack add` por task, `check` por camada antes de seguir, violação = parar).
- `lib/install.mjs`: shim `SHIM` atualizado com o subcomando `check-push`.

## Tokens

- **Evita** o custo caro do Modo 3: análise de dependências, `git apply` por camada, `equivalence` e debugging de divergência.
- **Evita** plano/contexto desperdiçado: roadmap raso + plano detalhado só da sessão atual (planejamento progressivo); coordenador carrega só recibos, cada `session` nasce em contexto novo e os gates retomam o mesmo `task_id` em vez de re-despachar.
- **Custo novo:** ~2–3 tool calls por task (`gh stack add`, `check`, registro), saída curta; zero push/CI incremental; um hop de sumarização por sessão (não por task).
- **Riscos e mitigação:** rebase em cascata só quando há fix em camada inferior — agrupar fixes e rebasear uma vez; detecção precoce (suíte completa + self-review no checkpoint) para pegar defeito quando há poucas camadas acima; Modo 4 e `gh pr edit` continuam 1× no fim, igual a hoje.

## Testes

Sessões/roadmap são texto de processo (skill + templates); o que é mecânico é o `check-push` do hook. Testes:

`test/stack.test.mjs` (novo; repo git fake, sem rede e sem gh):

1. Push do stack inteiro (main → L1 → L2 → L3, cada camada dentro do limite, L2+L1+L3 somados acima) → bases resolvidas (L1→main, L2→L1, L3→L2) e check passa.
2. Camada que estoura o próprio limite → check-push falha com `PR GRANDE`.
3. Push de branch única sem relação de ancestralidade → base `main`.
4. Push com ordem invertida nos argumentos → mesma resolução.
5. Repo sem `main` local → não bloqueia (comportamento atual).

`test/hooks.test.mjs` (integração com hook real e remote bare local):

6. Push do stack inteiro (branches empurradas juntas) → permitido quando cada camada está no limite.
7. Push do stack com uma camada acima do limite → abortado.

`test/install.test.mjs`: shim contém `check-push`; hook copiado chama `check-push`.

`test/agents.test.mjs` e `test/cli.test.mjs`: `orchestrator`/`session`/`implementer` instalados no grupo profile, pulados com `--no-profile`, uninstall remove só o que tem o marcador; arquivo do usuário com mesmo nome é preservado.

`test/cli.test.mjs`: `bento check <base> <head>` inalterado.

## Docs

- README: seção do fluxo (sessões/roadmap, stack viva, submit no fim), topologia em 3 níveis (`orchestrator`/`session`/`implementer`) e nota do hook stack-aware.
- AGENTS.md: bullet do fluxo sessões + stack viva + `lib/stack.mjs` (ou equivalente) e agents novos na Arquitetura.
- Help do `bento` inalterado (nenhum comando novo na CLI).

## Fora de escopo

- Guard mecânico adicional (pre-commit bloqueando), patches em skills vendadas, abertura incremental de PRs, mudança do Modo 3 legado, parser do `.git/gh-stack`.
- Risco conhecido: se o gh-stack empurrar via API em vez de `git push`, o hook não roda nesse caminho — sem teste possível (regra: sem `gh` nos testes); verificar manualmente na primeira execução real.
