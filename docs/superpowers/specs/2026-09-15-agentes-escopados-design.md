# Spec — agents escopados e superpowers vendado

Data: 2026-09-15

## Objetivo

Trocar o plugin always-on do superpowers por uma arquitetura de **capacidades escopadas por agent**: as skills do superpowers passam a ser vendadas em `.opencode/skills/`, o bootstrap vira o prompt de um agent dedicado e exploração/browser/verificação ficam em subagentes próprios. Um agent principal enxuto (`flash`), pensado para modelos rápidos, passa a ser o default. O objetivo é dar scaffolding determinístico para modelos flash (menos decisões, menos contexto poluído, verificação explícita) sem depender de hooks de plugin.

Sub-projeto A de três. B (loop determinístico via plugin zero-dep) e C (contexto/continuidade) ficam para specs futuras.

## Contexto

- Pesquisa (2026-09): harness/scaffold muda resultado em até ~11–15pp no SWE-bench (arXiv 2605.23950, 2605.27922) e modelos fracos ganham proporcionalmente mais com scaffolding forte (AI4AI, arXiv 2608.12307: 0.488→0.912; ganhos vêm de descarregar raciocínio em código determinístico e enforcement de formato). Subagente em contexto limpo rende ganho mensurável (arXiv 2605.23950).
- opencode V1 (estável; `opencode-ai` 1.18.x com releases diárias) suporta tudo que este spec usa **via API documentada**:
  - agents em `.opencode/agents/*.md` com frontmatter `description` (obrigatório), `mode`, `model`, `temperature`, `permission`, `tools` (deprecado), `hidden`; o nome do arquivo vira o nome do agent.
  - `permission` por agent com globs: chaves fixas (`edit`, `bash`, `task`, `skill`, …) e padrões wildcard contra nome de tool — MCP incluso (`"codegraph_*": "deny"`). Última regra que casa vence. `permission.task` com `deny` remove o subagente do catálogo.
  - `default_agent` no `opencode.json` (opcional; deve ser um primary visível).
  - commands em `.opencode/commands/*.md`; plugins locais em `.opencode/plugins/` (não usados neste sub-projeto).
- V2 (`@opencode/cli` 2.0.x) tem ~1 semana de "estável" (2.0.0 em 11/09/2026) e muda o schema (`agents`/`plugins` plurais, API de transforms). Este spec mira V1 e evita qualquer hook semipúblico para facilitar migração.
- Plugin atual do superpowers (v6.1.1, MIT): injeta bootstrap em toda conversa via transform de mensagens e registra o diretório de skills. O bootstrap é o corpo de `using-superpowers/SKILL.md` + tool mapping para opencode. Venda a partir do commit `d884ae04edebef577e82ff7c4e143debd0bbec99`.
- Regras do repo: Node puro ≥18, ESM, zero deps runtime, TDD com `node:test`, testes sem rede/gh, mensagens PT-BR, `uninstall` só remove o que reconhece como seu.

## Não-objetivos

- Plugin próprio, feedback pós-edit, gate de conclusão, formatter/LSP, checks configuráveis (sub-projeto B).
- Compactação, handoff, arquivo de progresso (sub-projeto C).
- Comandos novos em `.opencode/commands/` (o diretório continua criado vazio).
- Alterar `build`/`plan`/`explore`/`general`/`scout` (built-ins ficam intactos).
- Sandbox/guardrails de bash.

## Visão geral

`install`/`update` passam a instalar:

1. **14 skills vendadas** do superpowers em `.opencode/skills/<nome>/`.
2. **5 agents** em `.opencode/agents/`: `flash` (primary), `superpowers` (primary), `explorer`, `verify`, `browser` (subagents).
3. **`default_agent: "flash"`** no config, se a chave estiver livre.
4. **Remoção da entrada do plugin `superpowers@…`** do config (deprecada; mantê-la duplicaria o bootstrap).

Nada de terceiros é referenciado; nenhum código de plugin é instalado.

## Agents

Criados **somente se ausentes** (nunca sobrescritos por install/update). Se existir arquivo de mesmo nome sem o marcador do bento → aviso e pula.

Marcador de propriedade: comentário YAML no frontmatter, detectado por `/^#\s*bento:\s*agent\b/m`:

```yaml
---
# bento: agent v1 — edite livremente
description: ...
mode: primary
permission: ...
---
```

### flash (primary)

Agent principal para modelos rápidos. Elementos obrigatórios do prompt (texto final em `templates/agents/flash.md`):

- Trabalhar em passos pequenos, uma tarefa por vez; usar `todowrite` para listas.
- Ler o arquivo antes de editar; seguir convenções existentes; não inventar API (consultar docs/skill de docs quando disponível).
- Verificação obrigatória com evidência: rodar os checks do projeto e colar a saída; nunca declarar "pronto" sem evidência.
- Fluxo de PR: consultar `.pr-limits.yaml` e usar a skill `small-prs` quando o diff crescer.
- Delegar: `@explorer` (codegraph, read-only), `@verify` (verificação independente), `@browser` (web).
- Perguntar quando ambíguo (`question`).

Sem `model` (herda o do usuário). Permissões na matriz abaixo.

### superpowers (primary)

Prompt = conteúdo do corpo de `using-superpowers/SKILL.md` da v6.1.1 (frontmatter removido) embrulhado no bloco `<EXTREMELY_IMPORTANT>`, com o tool mapping para opencode do plugin atual:

- `todowrite` para todos; `task` com `subagent_type: "general"` para subagentes; tool nativa `skill` para invocar skills; `read`/`apply_patch`/`bash`/`grep`/`glob`/`webfetch` como mapeado.
- Manter os avisos de "não recarregar using-superpowers" e a atribuição MIT no cabeçalho (comentário YAML: origem, versão, commit).
- Ajuste de redação: o texto fala em skills descobertas em `.opencode/skills/` (venda), não em plugin.

Sem `model`.

### explorer (subagent)

- Prompt: exploração read-only com codegraph; devolver síntese curta com `arquivo:linha`; não editar nada.
- `edit: deny`, `bash: deny`.

### verify (subagent)

- Prompt: verificador independente e anti-alucinação — citar `arquivo:linha` ou não reportar; rodar os comandos de verificação e colar a saída; veredito explícito de conformidade com spec e de qualidade; não alterar código.
- `temperature: 0`; `edit: deny`.

### browser (subagent)

- Prompt: usar as tools `agent-browser_*` e a skill `agent-browser`; devolver evidência (resultado, URL, screenshot); não editar arquivos do projeto.
- `edit: deny`.

## Permissões (matriz normativa)

| Permissão | flash | superpowers | explorer | verify | browser |
|---|---|---|---|---|---|
| `edit` | padrão | padrão | deny | deny | deny |
| `bash` | padrão | padrão | deny | `"*": ask` + allows¹ | `"*": deny`, `agent-browser *: allow` |
| `skill` | `"*": allow`, deny nas 14 do superpowers + `agent-browser` | padrão | `"*": deny` | `"*": deny` | `"*": deny`, `agent-browser: allow` |
| `task` | `"*": deny`, allow `explorer`/`verify`/`browser` | padrão | deny | deny | deny |
| `codegraph_*` | deny | deny | allow | deny | deny |
| `agent-browser_*` | deny | deny | deny | deny | allow |

¹ allows do `verify`: `git diff*`, `git log*`, `git status*`, `git show*`, `node --test*`, `npm test*`.

Notas:

- `flash` mantém `"*": allow` em `skill` primeiro para não esconder skills globais do usuário (find-docs etc.); small-prs e taste-skill continuam disponíveis.
- Deny list do `flash` (nome do frontmatter): brainstorming, dispatching-parallel-agents, executing-plans, finishing-a-development-branch, receiving-code-review, requesting-code-review, subagent-driven-development, systematic-debugging, test-driven-development, using-git-worktrees, using-superpowers, verification-before-completion, writing-plans, writing-skills, agent-browser.
- `superpowers` não restringe `skill`/`task` (o tool mapping exige `general`).
- `flash.md` referencia `explorer`/`verify`/`browser` em `permission.task` mesmo quando algum não foi criado (allow para nome inexistente é inofensivo).

## Skills vendadas

- Lista (14): as da seção Permissões sem `agent-browser`.
- Fonte no repo: `skills/<nome>/SKILL.md` (cópia fiel do upstream v6.1.1, commit `d884ae04`; frontmatter só `name`/`description`, compatível com opencode). Atribuição MIT e commit documentados no AGENTS.md do bento.
- `install`: copia para `.opencode/skills/<nome>/`. Se já existir arquivo de mesmo caminho com conteúdo **diferente** do nosso → aviso no stderr e preserva (nomes genéricos como `brainstorming` podem ser do usuário); se igual → no-op.
- `update`: mesma regra (sobrescreve quando igual; preserva quando difere).
- `uninstall`: remove o diretório somente se o conteúdo for byte-idêntico à cópia em `.bento/skills/<nome>/SKILL.md`; caso contrário aviso e preserva.
- `.bento/skills/` já recebe a cópia pelo fluxo atual de install (copia `skills/`), então não há fonte nova.

## Config: `default_agent`

Novas funções em `lib/opencode-config.mjs`, seguindo o padrão existente (prefere `opencode.json`; senão `.jsonc`; senão cria `opencode.json`; jsonc por edição textual preservando comentários/vírgulas; avisos no stderr, nunca falha).

- `setDefaultAgentIfAbsent(root, name)`:
  - json: chave ausente → define e escreve `{ changed: 'default_agent', path }`; chave presente → `{ skipped: true, value }`; config inválida → aviso + `null`.
  - jsonc: linha `"default_agent"` ausente → insere como primeira chave (`"default_agent": "flash",`) preservando comentários; presente → `{ skipped: true, value }`.
- `removeDefaultAgentIf(root, name)`:
  - só remove se `default_agent === name`; json que ficar `{}` é deletado (padrão do plugin); jsonc nunca é deletado (vira `{}` escrito).
  - valor diferente → `null`.

## Ciclo de vida

### install

Na ordem atual do CLI, acrescenta:

1. Superpowers (se habilitado): venda as 14 skills; cria `superpowers.md`.
2. Perfil de agents (se habilitado): cria `flash.md` e `verify.md`; cria `explorer.md` se codegraph habilitado; cria `browser.md` se agent-browser habilitado; `setDefaultAgentIfAbsent(root, 'flash')`.
3. Remove a entrada do plugin superpowers do config (se habilitado).

### update

Mesma coisa que install para estes itens (skills, agents, default_agent, remoção do plugin), sem CLIs globais/`codegraph init` (regra atual). Agents existentes nunca são sobrescritos.

### uninstall

1. Remove agents que tenham o marcador bento.
2. Remove skills vendadas byte-idênticas a `.bento/skills/<nome>/SKILL.md` (preserva divergentes com aviso).
3. `removeDefaultAgentIf(root, 'flash')` — chamado somente se o `flash.md` removido no passo 1 era nosso.
4. Plugin superpowers: remove como já faz hoje. Demais itens inalterados.

Idempotente; `bento: nada para remover.` quando aplicável.

## Flags

- `--no-superpowers` (semântica nova): não venda as 14 skills, não cria `superpowers.md` e **não remove** o plugin (não mexe em superpowers).
- `--no-profile` (nova): não cria `flash.md`/`explorer.md`/`verify.md`/`browser.md` nem define `default_agent`. O `superpowers.md` e as skills vendadas continuam regidos por `--no-superpowers`.
- `--no-codegraph` / `--no-agent-browser`: além do atual, pulam `explorer.md` / `browser.md` respectivamente.
- `--no-agents` (seção do AGENTS.md), `--no-hooks`, `--no-ponytail`: inalteradas.

## Propriedade e reconhecimento

| Artefato | Instalação | Reconhecimento p/ remover |
|---|---|---|
| agents | se ausente | marcador `# bento: agent` |
| skills vendadas | se ausente ou idêntica | byte-compare com `.bento/skills/<nome>/SKILL.md` |
| `default_agent` | se ausente | valor `flash` + `flash.md` nosso removido |
| plugin superpowers | — | prefixo da entrada (já existente) |

## Mensagens (avisos no stderr)

- `<agente>.md já existe e não é do bento; pulado.`
- `skill <nome> já existe com conteúdo diferente; preservada.`
- `default_agent já definido ("<valor>"); preservado.`
- Na remoção: mesmas frases na forma "não é do bento; preservado" / "conteúdo diferente; preservada".
- Config ilegível/inválida ao mexer em `default_agent`: aviso e segue.

## Arquitetura

- `skills/<nome>/SKILL.md` ×14 (novos diretórios no repo).
- `templates/agents/{flash,superpowers,explorer,verify,browser}.md` (novos).
- `lib/agents.mjs` (novo): `installAgents(root, opts)`, `removeAgents(root)`, `AGENT_MARKER` e detecção; copy com aviso de conflito.
- `lib/opencode-config.mjs`: `setDefaultAgentIfAbsent` / `removeDefaultAgentIf`.
- `lib/install.mjs`: orquestração das flags/condicionais (codegraph/agent-browser); remoção do plugin superpowers no install/update.
- `lib/vendored-skills.mjs` (novo): `VENDORED_SKILLS`, cópia/remoção por árvore idêntica (`sameTree`).
- `lib/uninstall.mjs` (hoje dentro de install.mjs): passos novos na ordem acima.
- `bin/bento.mjs`: flags `--no-profile`; help atualizado.
- `templates/agents-section.md`: parágrafo sobre os agents, troca via Tab e quando usar cada um.

## Testes

TDD com `node:test`, diretórios temporários (repos fake), sem rede/gh.

`test/opencode-config.test.mjs`:

1. set cria config quando não existe.
2. set define quando ausente; preserva outras chaves.
3. set com chave presente → skip (não sobrescreve).
4. set em jsonc preserva comentários e vírgulas.
5. remove só quando valor casa; valor diferente → no-op.
6. remove em jsonc preserva comentários; `{}` escrito, arquivo não deletado.
7. config inválida → aviso e no-op.

`test/agents.test.mjs`:

1. cria os agents condicionados às flags (profile/superpowers/codegraph/agent-browser).
2. não sobrescreve existente com marcador no update.
3. existente sem marcador → aviso + pulado.
4. remove só com marcador; preserva sem marcador.
5. frontmatter dos 5 templates: `description`, `mode`, marcador e entradas da matriz presentes (regex; pega typo).

`test/install.test.mjs`:

1. skills vendadas copiadas; divergente preservada com aviso; idêntica sobrescrita.
2. `--no-superpowers` não copia skills nem cria `superpowers.md` nem mexe no plugin.
3. `--no-profile` não cria agents/default_agent mas ainda venda skills.
4. plugin superpowers removido no install/update quando presente.
5. `default_agent` setado se ausente; preservado com aviso se diferente.
6. uninstall: skills byte-idênticas removidas; `default_agent` removida só com `flash.md` nosso.

`test/cli.test.mjs`: flags novas e migração do plugin via `update`.

## Docs

- README: seção de agents (troca via Tab, `default_agent`), flags (`--no-profile`; nova semântica de `--no-superpowers`), nota de migração (update remove o plugin, adiciona skills/agents).
- AGENTS.md do bento: bullets — venda superpowers (v6.1.1, commit `d884ae04`, MIT, atualização manual), `lib/agents.mjs`, `templates/agents/`, flag `--no-profile`, semântica de `--no-superpowers`.
- `templates/agents-section.md`: parágrafo dos agents (afeta installs novos; seções existentes não são regravadas, regra atual).

## Riscos e limitações

- **Glob de `skill` usa o nome do frontmatter**: a taste-skill instalada se chama `design-taste-frontend` no frontmatter (diretório `taste-skill`). A deny list do `flash` não depende dela; validar na implementação se o nome do glob é o do frontmatter.
- **Prompts dos agents não evoluem em installs existentes** (nunca sobrescrevemos). Melhorias futuras chegam só a novos installs; documentado.
- **Seção `## Bento (small-prs)` existente não é atualizada** (regra atual do repo); consumidores antigos não recebem o parágrafo dos agents.
- **`verify` com `ask`** interrompe o fluxo para comandos fora da allowlist; usuário ajusta o md.
- **V1 × V2**: quando V2 virar padrão, revisar agents markdown, `permission` e `default_agent` (V2 usa `agents` plural e permissions como array ordenado).
- **Duplicação** das 14 skills em `.bento/skills/` e `.opencode/skills/` (já é o padrão do repo para small-prs/taste/agent-browser).
