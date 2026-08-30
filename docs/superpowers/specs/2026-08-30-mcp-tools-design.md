# Spec — codegraph e agent-browser no bento install

Data: 2026-08-30

## Objetivo

O `bento install` passa a instalar também o [CodeGraph](https://github.com/colbymchenry/codegraph) e o [agent-browser](https://github.com/vercel-labs/agent-browser) no projeto consumidor: CLIs globais (best-effort), servidores MCP registrados no `opencode.json`, skill agent-browser copiada e indexação `codegraph init`. `update` e `uninstall` gerenciam tudo isso também — mesmo padrão de superpowers/ponytail.

## Contexto

- CodeGraph: CLI + MCP server. Para opencode, o agente lança `codegraph serve --mcp`; grafo por projeto em `.codegraph/` (via `codegraph init`), watcher com auto-sync.
- agent-browser: CLI Rust + MCP server (`agent-browser mcp`); skill (stub que aponta para `agent-browser skills get core`) já instalada globalmente em `~/.agents/skills/agent-browser/`.
- OpenCode registra MCP servers no config sob a chave `mcp`, como objeto chaveado por nome (≠ array `plugin`):

```json
{
  "mcp": {
    "codegraph": {
      "type": "local",
      "command": ["codegraph", "serve", "--mcp"],
      "enabled": true
    }
  }
}
```

- Zero deps runtime (regra do repo), edição de JSON sem biblioteca. Testes sem rede e sem `gh`.

## Comportamento

### install

- CLIs globais best-effort: `npm i -g @colbymchenry/codegraph` e `npm i -g agent-browser` + `agent-browser install` (Chrome). Falha → aviso no stderr, install continua.
- Wiring MCP: `addMcpServer` para `codegraph` e `agent-browser` no `opencode.json` (mesma resolução de arquivo do `opencode-config.mjs`: prefere `.json`, senão `.jsonc`, senão cria `.json`).
- `codegraph init` no projeto (best-effort, aviso na falha).
- Skill `agent-browser` copiada para `.opencode/skills/agent-browser/` (padrão small-prs).
- Flags `--no-codegraph` e `--no-agent-browser` pulam as respectivas partes. `--no-agent-browser` pula também a cópia da skill (a skill é do agent-browser).

### update

- Re-adiciona MCP + skill. **Não** re-instala CLIs globais nem re-roda `codegraph init`.

### uninstall

- Remove entradas MCP (`removeMcpServer`), skill `.opencode/skills/agent-browser/` e `.codegraph/` do projeto.
- Tenta `npm uninstall -g` dos dois CLIs; falha → aviso, uninstall continua.

### addMcpServer(projectRoot, name, command) → `{ changed: name, path }` | `null`

- **Caminho JSON estrito** (`JSON.parse` ok): parse → garante `mcp` como objeto (se string/array/não-objeto, avisa no stderr e pula) → `obj.mcp[name] = { type: 'local', command, enabled: true }`; outras chaves e outros MCP servers preservados. Idempotente: se `obj.mcp[name]` já existe, `null`. Cria `opencode.json` com o objeto completo se não existe.
- **Caminho jsonc** (parse falha — comentários):
  - Se chave `"mcp"` ausente → insere `"mcp": { ... }` como primeira chave (padrão do plugin).
  - Se `"mcp": { ... }` existe → splice textual da entrada antes do `}` do bloco (vírgula com ajuste de comentários, espelhando o padrão do array `plugin` do `opencode-config.mjs`).
  - Se `mcp` existe mas não é objeto (ex.: string) → avisa e pula (não altera).
  - Nunca deleta arquivo jsonc.
- Avisos no stderr, nunca falham o install.

### removeMcpServer(projectRoot, name) → `{ removed: name, path }` | `null`

- Remove apenas a chave `name` dentro de `mcp`; outros MCP servers preservados.
- Estrito: se `mcp` ficar `{}`, remove a chave `mcp`; se o objeto ficar `{}`, deleta o arquivo (jsonc vira `{}` escrito, nunca deletado).
- jsonc: remove a entrada com ajuste de vírgula; bloco vazio → remove a chave `mcp`; nunca deleta o arquivo.

## Constantes

```js
export const CODEGRAPH_MCP = { name: 'codegraph', command: ['codegraph', 'serve', '--mcp'] };
export const AGENT_BROWSER_MCP = { name: 'agent-browser', command: ['agent-browser', 'mcp'] };
```

## Arquitetura

- Novo `lib/mcp-config.mjs` com `addMcpServer`/`removeMcpServer` (funções puras, padrão de `lib/opencode-config.mjs` — a lógica de objeto chaveado não se mistura com a de array de strings).
- Novo `lib/tools.mjs` com operações best-effort de CLI: `ensureCodegraph`, `ensureAgentBrowser`, `initCodegraph(cwd)`, `removeCodegraph`, `removeAgentBrowser`. Comandos configuráveis via parâmetro opcional (para testes sem rede: binário fake inexistente → `false` + aviso).
- `skills/agent-browser/SKILL.md` vendada no repo (cópia do stub instalado globalmente, 55 linhas).
- `lib/install.mjs`: copiar `skills/agent-browser` → `.opencode/skills/agent-browser/` (install) e remover (uninstall), como small-prs.
- `bin/bento.mjs`: flags `--no-codegraph`/`--no-agent-browser`; install/update/uninstall orquestram tools + mcp + skill. Help atualizado.
- `lib/opencode-config.mjs` inalterado.

## Testes

`test/mcp-config.test.mjs` (node:test, diretório temporário, sem rede):

1. add cria `opencode.json` com o servidor quando não existe config.
2. add preserva outras chaves e outros MCP servers.
3. add idempotente → `null` quando o nome já existe.
4. jsonc com comentários → entrada adicionada/removida, comentários preservados.
5. jsonc sem `mcp` → insere a chave preservando comentários.
6. remove só a entrada do nome, mantém outros servers.
7. remove com `mcp` vazio → chave removida; arquivo `{}` → deletado (jsonc → `{}` escrito, não deletado).
8. `mcp` não-objeto (string) → avisa e não altera (add e remove).
9. arquivo inválido (sem chaves) → avisa e não altera.
10. `opencode.json` e `opencode.jsonc` ambos existem → edita o `.json`.

`test/tools.test.mjs`: falha de CLI (binário fake inexistente) → `false` + aviso no stderr (sem rede).

`test/cli.test.mjs`: `update` adiciona codegraph + agent-browser ao `mcp` do opencode.json; `--no-codegraph`/`--no-agent-browser` pulam; `uninstall` remove. `install` não é testado com CLIs (exige rede/gh — limitação documentada).

`test/install.test.mjs`: skill agent-browser copiada no install e removida no uninstall.

## Docs

README: seção Instalação lista codegraph + agent-browser + flags `--no-codegraph`/`--no-agent-browser`; Desinstalação lista remoção (MCP, skill, `.codegraph/`, CLIs best-effort).