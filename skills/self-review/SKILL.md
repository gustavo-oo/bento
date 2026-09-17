---
name: self-review
description: Gate de review interno antes de finalizar branch/PR (ou sob demanda) — dois revisores com mandatos complementares (verify = regressão; reviewer = adversarial), repro obrigatória para High/Medium, validação cruzada, correções locais automáticas, decisões guiadas para Low/design e ledger local até o estado final.
---

# self-review — review interno com 2 agentes e correção por severidade

Use antes de `finishing-a-development-branch`/submit, ou quando o dev pedir "revisa o que fiz". O objetivo é pegar o que reviews internos estáticos deixam passar: falso negativo de bordas, auto-confirmação e achados rebaixados a "minor/residual".

## Atores

- **Agente primário (você)**: define a unidade, despacha, escreve o ledger, aplica fixes e decide com o dev.
- **R1 `@verify`**: mandato de regressão/correção — o diff cumpre o contrato e não quebra o existente.
- **R2 `@reviewer`**: mandato adversarial — bordas, inputs hostis, plataforma, riscos cross-cutting.

## 0. Unidade e preparação

1. Defina a unidade: task, camada da stack ou branch (default sob demanda: branch atual). Registre `base` e `head` com `git rev-parse`.
2. Cheque o tamanho: `node scripts/pr-split-verify.mjs check <base> <head>` (ou `bento check <base>`). Se violar `.pr-limits.yaml`, **pare**: a unidade precisa de split com a skill `small-prs` antes do review. Review de diff gigante é teatro.
3. Crie o diretório da unidade, fora do git:

```bash
slug=<slug-da-unidade>   # ex.: nome da branch ou da camada, com '/' -> '-'
dir=".superpowers/self-review/$slug"
mkdir -p "$dir"
printf '*\n' > "$dir/.gitignore"
```

4. Congele o pacote (única visão dos revisores):

```bash
base_sha=$(git merge-base <base> <head>)
head_sha=$(git rev-parse <head>)
{
  echo "# Unidade: $slug"; echo "# Base: $base_sha"; echo "# Head: $head_sha"; echo
  echo "## Commits"; git log --oneline "$base_sha..$head_sha"; echo
  echo "## Stat"; git diff --stat "$base_sha...$head_sha"; echo
  echo "## Diff"; git diff "$base_sha...$head_sha"
} > "$dir/package-$(git rev-parse --short "$base_sha")-$(git rev-parse --short "$head_sha").diff"
```

O pacote NÃO entra no seu contexto: passe apenas o caminho aos revisores.

5. Abra `$dir/ledger.md` com o cabeçalho (unidade, base/head, contrato: spec/brief/descrição do PR).

## 1. Rodada 1 — despache R1 e R2 em paralelo

Na mesma mensagem, um `task` para `verify` (R1) e um para `reviewer` (R2), cada um com este contrato (adapte o mandato):

> Leia o pacote `<caminho do package>` — é sua única visão do que mudou; o contexto dele basta. Se precisar de algo fora dele, nomeie o risco antes de olhar e diga o que checou no relatório. Contrato: <spec/brief/descrição>.
> Mandato: <R1: regressão/correção — o diff cumpre o contrato e nada quebra o existente> | <R2: adversarial — bordas, inputs hostis, ESM/CJS, plataforma, symlink/worktree, snapshot/cache, legado, interação entre arquivos>.
> Limites do projeto: `.pr-limits.yaml`. Read-only: não altere working tree, index, HEAD ou branches; pode rodar no máximo um teste focado.
> Para cada achado: `arquivo:linha`, severidade (High/Medium/Low), o que está errado, impacto e **repro** (trecho de teste focado que falha por comportamento) quando High/Medium. Sem repro, classifique Low.
> Formato final: veredito (aprovar | needs fixes), achados e confiança.

Os revisores são read-only: a repro chega como trecho no relatório; transcreva verbatim para `$dir/repro-<id>.test.mjs`, confirme o RED e só então despache a validação cruzada.

R1 e R2 não veem o relatório um do outro. Se `verify` e `reviewer` estiverem com `model` diferentes, a complementaridade é maior.

## 2. Merge e validação cruzada

- Deduplique por `arquivo:linha` + tipo; achado proposto pelos dois já está confirmado.
- High/Medium proposto por um revisor: despache **o outro** para validar executando a repro já materializada (teste focado, nunca a suíte inteira) e emitir `confirmed` ou `disputed`.
- Divergência de existência/severidade: rodada focada (os dois sobre a mesma repro). Persistindo, pergunte ao dev mostrando as duas evidências.

## 3. Ledger (fonte da verdade)

`$dir/ledger.md`, append-only por rodada:

```markdown
# Self-review — <unidade>
base: <sha> · head: <sha> · contrato: <ref>
## Rodada 1 (R1=verify <modelo>, R2=reviewer <modelo>)
| id | arquivo:linha | severidade | origem | evidência (repro) | validação | decisão | status | commit |
|----|---------------|-----------|--------|-------------------|-----------|---------|--------|--------|
| SR-1 | lib/x.mjs:12 | High | R2 | `node --test .../repro-SR-1.test.mjs` (falha) | R1 confirmed | auto (local) | fixed | abc1234 |
```

Status: `open` → `fixed` / `waived` / `discarded`. Nada é apagado; rebaixamento ou descarte registra quem validou e por quê.

## 4. Decisão

- **High/Medium confirmado e local/inequívoco** (não muda contrato público, schema/migração, dependências, nem arquivos fora do diff) → **auto-fix**.
- **High/Medium que mude design/contrato/escopo** → `question` ao dev com 2-3 opções de correção.
- **Low** → UMA `question` em lote (múltipla escolha por item): corrigir agora / adiar (justificar) / descartar (falso positivo validado).
- Proibido rebaixar por "pré-existente" (se o diff tocou, é do PR), por "estava no plano" ou sem evidência + validação.

## 5. Fix e re-review

- Fix com TDD: mova a repro para o diretório de testes do projeto, veja falhar (RED), corrija o mínimo (GREEN) e rode a suíte completa.
- Re-review focado do par: itens corrigidos + regressão, no mesmo formato da rodada 1.
- Teto de **3 rodadas** de re-review; ao exceder, pare e apresente o resumo com evidências ao dev.

## 6. Gate

- Condição de saída: nenhum item `open` e nenhum `disputed` sem decisão do dev.
- Resumo final ao dev: contagem por severidade, o que foi automático, o que o dev decidiu e o que foi descartado com validação.
- Só então siga para `finishing-a-development-branch`/submit.

## Regras

- Nunca poste no GitHub por conta própria; o ledger é local.
- Nunca edite skills vendadas do superpowers para "consertar" um achado.
- Nunca `git add -A`: os scratch em `.superpowers/self-review/` ficam fora do commit.
- Este gate roda quando acionado (fim de trabalho ou pedido do dev); não há hook automático.
