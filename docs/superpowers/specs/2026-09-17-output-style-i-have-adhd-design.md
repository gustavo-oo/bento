# Spec — output style direto (i-have-adhd) no bento

Data: 2026-09-17

## Objetivo

O `bento install` passa a instalar um estilo de saída direto e enxuto, adaptado da skill [i-have-adhd](https://github.com/ayghri/i-have-adhd) (MIT), sempre ligado no projeto consumidor via chave `instructions` do opencode. Vale para respostas no chat e para artefatos lidos por humanos (PR body, commits, docs/specs/planos). `uninstall` remove; `--no-output-style` pula.

## Contexto

- Upstream: https://github.com/ayghri/i-have-adhd, commit `b15d0be58f55b33972ba3e39709e0e5208ef30cb` (16/09/2026), MIT. A skill canônica fica em `skills/i-have-adhd/SKILL.md`; o upstream também publica um resumo compacto (10 regras + exceções) para modo always-on no `INSTALL.md`.
- opencode: chave `instructions` em `opencode.json`/`opencode.jsonc` aceita lista de paths (relativos ao projeto) e é combinada com os `AGENTS.md` em toda sessão — mecanismo native de always-on, sem plugin rodando.
- opencode ignora campos desconhecidos do frontmatter (`disable-model-invocation` do upstream é inofensivo); a skill continua carregável pela tool `skill`.
- Decisões do brainstorming:
  1. Ativação: **sempre ligado por padrão**, com flag `--no-output-style` no install/update.
  2. Escopo: **chat + artefatos humanos** (PR body, commits, docs/specs/planos).
  3. Mecanismo: **`instructions` (always-on) + skill vendada** para consulta/invocação explícita.
  4. Idioma: **inglês** (verbatim do upstream onde possível; seção de artefatos escrita por nós em inglês).
- Regras do repo: zero deps runtime, Node >= 18, testes sem rede e sem `gh`.

## Comportamento

### Venda (repo bento)

- `skills/i-have-adhd/SKILL.md` — cópia integral e intacta do upstream (só o `SKILL.md`; `agents/`, hooks, plugin e command do upstream ficam fora). Atualização manual: re-copiar do commit novo e atualizar o bullet no AGENTS.md (mesmo padrão do taste-skill).
- `templates/instructions/i-have-adhd.md` — ruleset always-on em inglês: bloco compacto verbatim do upstream (abaixo) + seção "Human-readable artifacts" (nossa).

### install / update

- Copiar `skills/i-have-adhd` → `.opencode/skills/i-have-adhd/` (sobrescreve; padrão small-prs/taste-skill).
- Copiar `templates/instructions/i-have-adhd.md` → `.opencode/instructions/i-have-adhd.md` (sobrescreve).
- Adicionar `.opencode/instructions/i-have-adhd.md` à chave `instructions` do `opencode.json`/`.jsonc` (idempotente).
- `--no-output-style` pula os dois arquivos e a entrada na config; sem a flag, `update` propaga. A flag não revoga instalação anterior (remoção é via uninstall).
- Log: `instructions → .opencode/instructions/i-have-adhd.md`.

### uninstall

- Remover `.opencode/skills/i-have-adhd/` e `.opencode/instructions/i-have-adhd.md` (reportar em `removed`).
- Remover a entrada `.opencode/instructions/i-have-adhd.md` da chave `instructions` (a chave some se ficar vazia; o arquivo some se ficar `{}`, exceto `.jsonc`, que vira `{}`).

### Runtime (projeto consumidor)

- As regras valem para a sessão inteira; "stop adhd mode"/"normal mode" desligam na sessão (instrução no próprio arquivo), com confirmação em uma linha.

## Conteúdo de `templates/instructions/i-have-adhd.md`

Bloco 1 — verbatim do resumo always-on do upstream:

```markdown
## Output style

The reader has ADHD. Shape every response so it can be acted on:

1. Lead with the answer or next action: command, path, or snippet first.
2. Number multi-step work; one bounded action per step.
3. End with one next action doable in under two minutes.
4. Finish the current issue before raising a new one.
5. Restate progress each turn ("step 3 of 5 done").
6. Give time estimates in concrete units, never "a bit".
7. After a change, show what now works.
8. Errors: state location, cause, and fix. No drama.
9. Cap lists to 5 items.
10. No preamble, no recaps, no closers.

Exceptions: explain fully when asked to explain. Confirm before destructive actions.
After three failed fixes, stop and name the doubtful assumption. If the request is
ambiguous, ask one short question.
```

Bloco 2 — nosso:

```markdown
### Human-readable artifacts

Apply the same shape to anything a person will read: PR bodies, commit messages,
docs, specs, plans.

- PR body: first line = what changed and why; numbered test plan; risks/review focus
  before prose. No filler.
- Commit messages: conventional, imperative, one line; body only when it adds information.
- Docs/specs/plans: conclusion first; short sentences; concrete examples; headers for
  skimming; keep enough context to stand alone (unlike chat, a doc has no history).
- Comments: only when the code does not explain itself.
- Lists: max 5 per group, most relevant first; groups instead of a long list.

Stay on for the whole session. Turn off only when the user says "stop adhd mode" or
"normal mode"; confirm in one line, then use the default style.
```

## Arquitetura

- `skills/i-have-adhd/SKILL.md` — venda verbatim.
- `templates/instructions/i-have-adhd.md` — fonte do instructions.
- `lib/opencode-config.mjs` — generalizar os helpers de array do `plugin` para aceitar a chave (`plugin`, `instructions`), mantendo `addPlugin`/`removePlugin` com comportamento e API intactos; expor `addInstructionsEntry(projectRoot, entry)` / `removeInstructionsEntry(projectRoot, entry)`. Mesmas garantias atuais: roteia `.json`/`.jsonc` por existência, preserva comentários e vírgulas, idempotente (match exato para entradas de path; o plugin mantém match por prefixo, para pins), mesma semântica do plugin para coerção (string vira array; outros tipos: aviso e sem escrita), cria `opencode.json` se ausente (`{"instructions": ["…"]}`), remove chave/arquivo quando esvazia.
- `lib/install.mjs` — opção `noOutputStyle`; cópia dos dois artefatos; remoção no uninstall.
- `bin/bento.mjs` — parse de `--no-output-style` (install/update; o uninstall remove sempre, sem flag); chamadas de `addInstructionsEntry`/`removeInstructionsEntry` e log; usage atualizado.
- O loop existente que copia `skills/` para `.bento/skills/` já cobre a pasta nova (fonte de referência) — nada a mudar.

## Testes

`test/opencode-config.test.mjs` (node:test, repo fake, sem rede):

1. `addInstructionsEntry` em `opencode.json` sem a chave: cria `instructions: ["…"]`; com a chave: faz append; idempotente na segunda chamada (retorna `null`).
2. `removeInstructionsEntry`: remove só a nossa entrada, preserva as demais; remove a chave quando fica vazia (e o arquivo, se `{}`).
3. `.jsonc` com comentários: add/remove preservam comentários e vírgulas nas bordas do array (casos análogos aos do plugin).
4. `instructions` não-array: aviso e sem escrita.
5. Regressão: testes existentes de `plugin` continuam passando com os helpers generalizados.

`test/install.test.mjs`:

6. install cria `.opencode/skills/i-have-adhd/SKILL.md` (idêntico ao vendado) e `.opencode/instructions/i-have-adhd.md`.
7. update sobrescreve `SKILL.md` e o instructions alterados.
8. `--no-output-style` não cria nenhum dos dois.
9. uninstall remove os dois e reporta em `removed`.

`test/cli.test.mjs`:

10. `install` adiciona a entrada no config e loga; `uninstall` remove a entrada.

## Docs

- AGENTS.md: bullet de arquitetura da venda (`skills/i-have-adhd`, commit/MIT), `templates/instructions/`, flag `--no-output-style` na lista de flags e no bullet do `opencode-config.mjs` (chave `instructions`); README nas listas de instala/remove e descrição do CLI.

## Fora de escopo

- Plugin opencode e comando `/i-have-adhd` do upstream (o `instructions` cobre o always-on sem código de runtime).
- Tradução das regras para PT-BR (decidido: inglês).
- `agents/`, hooks e manifests de outras ferramentas do upstream.
- Toggle persistente por projeto além da flag de install (o off por sessão é instrução em texto).
