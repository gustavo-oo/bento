# Spec — self-review (review interno com 2 agentes e correção por severidade)

## Objetivo

Adicionar ao fluxo do bento um gate de review interno que roda antes de finalizar branch/PR: dois revisores com mandatos complementares determinam existência e severidade dos achados, high/medium exigem repro, correções locais/inequívocas são automáticas, o resto é decidido com o dev, e tudo fica num ledger local até o estado final.

## Contexto

O PR #2 recebeu achados reais de Copilot/Codex que o processo interno não pegou (worktree hooks, ESM/CJS, JSONC com `]` em string, snapshot de vendas, `default_agent`). O ledger da sessão (`.superpowers/sdd/`) mostra por quê:

- revisores liam só o pacote de diff, sem executar cenários; o prompt do task-reviewer manda não re-rodar testes e não explorar além do diff;
- mesmo agente implementa, escreve os testes e revisa (os testes vinham prontos no brief e validavam as premissas do autor);
- defeitos reais foram rebaixados a "minor/residual" e adiados (corrupção jsonc reincidiu 2×);
- review final da branch foi um diff único de ~535 KB;
- nenhuma diversidade de revisor (mesma família de modelo).

Os assets atuais cobrem parte: `requesting-code-review`/`code-reviewer.md` (1 reviewer read-only), `receiving-code-review` (processar feedback), `subagent-driven-development` (review por task + final), `small-prs` Modo 4 (review por camada com worktree) e o agent `verify`. Falta: política de severidade, validação cruzada de existência, repro obrigatória e ledger de decisões.

## Não-objetivos

- Postar comentários no GitHub; o ledger é local.
- Editar skills vendadas do superpowers (seguem byte-idênticas).
- Arquivo de configuração novo ou flags de CLI novas.
- Modelo fixo nos agents (o consumidor edita `model`).
- Hook/slash command automático (gatilho é passo de processo nos templates; um command entra na v2).

## Decisões

1. **Auto-fix**: high/medium só quando a correção é local/inequívoca; se mudar design, contrato ou escopo, pergunta guiada ao dev.
2. **Gatilho**: gate final (antes de `finishing-a-development-branch`/submit) + sob demanda.
3. **Achados**: ledger local estruturado + resumo no chat; nunca toca no GitHub.
4. **Evidência**: repro obrigatória para high/medium, validada pelo revisor que não propôs o achado; low dispensa repro.

## Visão geral

Atores:
- **agente primário** (flash ou superpowers): orquestra a skill, escreve o ledger, aplica fixes, fala com o dev.
- **R1 — `verify`**: mandato de regressão/correção (o diff cumpre o contrato; não quebra o existente).
- **R2 — `reviewer`** (novo agent): mandato adversarial (bordas, inputs hostis, semântica de plataforma, riscos cross-cutting).

Unidade de review: a menor unidade entregável (task do SDD, camada do small-prs ou branch). Sob demanda, a unidade default é a branch atual (o dev pode indicar camada ou intervalo de commits). Se a unidade exceder `.pr-limits.yaml`, o gate não roda e orienta o split (`small-prs`) primeiro.

Estados do gate: `preparado → rodada 1 → merge/validação → decisão → fix → re-review → gate limpo` (ou escalação ao dev).

## Protocolo

### 1. Preparação

- Congelar base/head (`git rev-parse`), unidade e contrato (spec/brief/título-descrição do PR).
- Geração do pacote: `git diff --stat`, lista de commits e `git diff` completos para um arquivo em `.superpowers/self-review/<slug>/package-<base7>-<head7>.diff`. O pacote é a única visão dos revisores (contexto zero da sessão) e não entra no contexto do orquestrador.
- Testes de repro ficam como scratch no diretório da unidade (`.superpowers/self-review/<slug>/repro-<id>.test.mjs`); ao corrigir, a repro é promovida a teste de regressão no diretório de testes do projeto, e a de descartados é removida.
- Ler `.pr-limits.yaml` e recusar unidades acima do limite.
- Registrar no ledger a rodada, base/head e agentes/modelos usados.

### 2. Rodada 1 — dois revisores isolados

Despachar R1 e R2 em paralelo, cada um com o pacote, o contrato e `.pr-limits.yaml`. Cada achado tem:

- `arquivo:linha`, severidade, o que está errado e por que importa;
- **repro** para high/medium: teste focado que falha por comportamento (não por `ERR_MODULE_NOT_FOUND`), no formato `node --test <arquivo>` de preferência. O revisor é read-only: entrega a repro como trecho de teste no achado; o agente primário transcreve verbatim para `.superpowers/self-review/<slug>/repro-<id>.test.mjs` e confirma o RED antes da validação cruzada.

### 3. Merge e validação cruzada

- Deduplicar por local + tipo. Achado proposto pelos dois já está confirmado.
- Cada high/medium é validado pelo revisor que **não** o propôs, executando a repro já materializada (teste focado, nunca a suíte inteira).
- Concordância → `confirmed`. Divergência de existência/severidade → rodada focada: ambos revisam a repro e emitem veredito; persistindo, o dev decide com a evidência dos dois registrada no ledger.

### 4. Política de decisão

- **High/Medium confirmado + correção local/inequívoca** → auto-fix. "Local/inequívoco" = não muda contrato público, schema/migração, dependências, nem arquivos fora do diff da unidade; e existe repro que falha.
- **High/Medium que exija design/contrato/escopo** → pergunta guiada ao dev com as opções de correção.
- **Low** → uma única pergunta em lote (múltipla escolha por item): corrigir agora / adiar (exige justificativa) / descartar (falso positivo validado).

### 5. Fix e re-review

- Fix pelo agente primário com TDD: a repro vira teste que falha (RED) → correção mínima (GREEN) → suíte completa.
- A repro de um achado corrigido vira teste de regressão do projeto; a de descartados é removida.
- Re-review focado do par: itens corrigidos + regressão, no mesmo formato.
- Teto de 3 rodadas de re-review; ao exceder, escalar ao dev com resumo e evidências.

### 6. Gate

Só passar para `finishing-a-development-branch`/submit quando não houver item com `status: open` nem `validação: disputed` sem decisão do dev. O resumo final mostra: achados por severidade, o que foi automático, o que o dev decidiu e o que foi descartado com validação. Nada "residual" sem decisão explícita.

## Severidade

- **High/Critical**: bug real (corrupção, perda de dados, segurança, quebra funcional) ou regressão confirmada.
- **Medium/Important**: comportamento incorreto/frágil em cenário plausível, erro de contrato ou risco cross-cutting.
- **Low/Minor**: estilo, polimento, docs, otimização sem impacto comprovado.

Regras antirrebaixamento: "pré-existente" não rebaixa se o diff tocou; "estava no plano" não rebaixa; mudança de severidade exige evidência (repro) e validação do outro revisor, ou decisão do dev registrada.

## Ledger

- Caminho: `.superpowers/self-review/<slug-da-unidade>/ledger.md` (fora do git; o diretório da unidade recebe um `.gitignore` com `*`, mesmo padrão do `sdd-workspace`, para não sujar o `git status`).
- Cabeçalho: unidade, base/head, contrato referenciado, rodadas e agentes/modelos por rodada.
- Por achado: `id`, `arquivo:linha`, `severidade`, `origem` (R1/R2/ambos), `evidência` (teste + comando + saída), `validação` (`pending|confirmed|disputed` + revisor), `decisão`, `status` (`open|fixed|waived|discarded`), `commit` do fix.
- Append-only por rodada; rebaixamento/descarte sempre com justificativa e quem validou.
- O ledger é a fonte da verdade do loop; sobrevive a compactação de contexto e troca de sessão.

## Configuração e custo

- Defaults no próprio skill: teto de 3 rodadas, auto-fix local/inequívoco, low em lote.
- Complementaridade de papel sempre; de modelo quando `verify` e `reviewer` tiverem `model` diferentes (editável em `.opencode/agents/`).
- Todo dispatch/rodada é registrado no ledger.

## Integração

Novos:
- `skills/self-review/SKILL.md` — orquestrador do protocolo; copiado para `.opencode/skills/self-review` em install/update (como `small-prs`/`taste-skill`).
- `templates/agents/reviewer.md` — subagent read-only adversarial, temp 0, marcador bento, `edit: deny`, `task: deny`, `skill: "*": deny`, bash com allowlist de leitura (`git diff/log/status/show`) e testes (`node --test*`, `npm test*`), MCPs negados.

Alterados:
- `lib/agents.mjs` — `reviewer` em `AGENT_NAMES` e em `wantedAgents` no grupo profile (`--no-profile` pula).
- `templates/agents/flash.md` — `reviewer: allow` no `task` e passo do gate no checklist.
- `templates/agents-section.md` — bullets do gate no AGENTS.md do consumidor (rodar self-review antes de finalizar, ledger, proibido residual sem decisão).
- `skills/small-prs/SKILL.md` — o whole-stack review do Modo 4 passa a usar a skill `self-review`; o review por camada continua com o task-reviewer.
- `README.md` e `AGENTS.md` do bento — documentar skill, agent e gate.

Ciclo de vida:
- install/update copiam a skill; criam o agent (se ausente, por marcador); uninstall remove `.opencode/skills/self-review` (mesmo padrão de `small-prs`/`taste-skill`) e o agent só com marcador; `--no-profile` pula o agent.
- Sem flag nova.

## Testes (TDD no bento)

- `test/agents.test.mjs`: template do `reviewer` (marcador, `mode: subagent`, `temperature: 0`, permissões), `reviewer` no `installAgents` com profile e fora com `noProfile`, `flash` com `reviewer: allow`.
- `test/install.test.mjs`: install cria `.opencode/skills/self-review/SKILL.md` e `.opencode/agents/reviewer.md`; `noProfile` não cria o agent; uninstall remove ambos.
- `test/cli.test.mjs`: update cria o `reviewer`; uninstall remove.
- `test/self-review.test.mjs`: `skills/self-review/SKILL.md` contém o caminho do ledger, as três severidades e a regra de repro high/medium (barreira contra regressão de conteúdo do protocolo).

## Riscos e limitações

- Custo/tokens do par + validações: teto de rodadas e recusa de unidade grande controlam.
- Par com o mesmo modelo: mitigado por mandatos distintos e validação cruzada; diversidade de modelo é opt-in do consumidor.
- Sem hook automático: o gate depende do passo nos templates e do AGENTS.md; a skill avisa ao ser acionada com unidade grande.
- Ledger fora do git: intencional (artefato de sessão).
- Reviewer adversarial pode gerar falso positivo: validação cruzada + descarte aprovado pelo dev.
