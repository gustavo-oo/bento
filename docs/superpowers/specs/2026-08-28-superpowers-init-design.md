# Spec — superpowers init no bento install

Data: 2026-08-28

## Objetivo

O `bento install` passa a inicializar também o [superpowers](https://github.com/obra/superpowers) no projeto consumidor, adicionando o plugin ao `opencode.json`. `update` e `uninstall` passam a gerenciar essa entrada também.

## Contexto

- O bento não tem comando `init`; os comandos são `install`, `update`, `uninstall`, `check`, `equivalence`. Superpowers entra como parte do `install` existente.
- "Inicializar superpowers" = adicionar `"superpowers@git+https://github.com/obra/superpowers.git"` ao array `plugin` do `opencode.json` do projeto (instalação oficial do superpowers para opencode — `.opencode/INSTALL.md` do pacote).
- Zero deps runtime (regra do repo), edição de JSON sem biblioteca.

## Comportamento

### install / update

- Sempre adiciona superpowers, exceto com flag `--no-superpowers` (espelha o `--no-agents` existente).
- `addSuperpowersPlugin(projectRoot)`:
  - Resolução do arquivo: prefere `opencode.json`; se ausente, `opencode.jsonc`; se nenhum existe, cria `opencode.json` com `{ "plugin": ["<SUPERPOWERS_PLUGIN>"] }`.
  - **Caminho JSON estrito** (`JSON.parse` ok): parse → garante `plugin` como array (string vira `[string]`) → adiciona a entrada se nenhuma entrada existente começar com o prefixo → grava com `JSON.stringify(obj, null, 2) + '\n'`. Outras chaves preservadas.
  - **Caminho jsonc** (parse falha — comentários): se há chave `"plugin": [...]` (array), splice textual da entrada antes do `]`; se a chave não existe, insere `"plugin": ["..."]` como primeira chave; se a chave existe mas não é array (ex.: string), avisa no stderr e pula (não altera). Nunca deleta arquivo jsonc.
  - Retorna `{ changed, path }`; `changed: null` se já presente (idempotente).
- Output do install lista `superpowers → opencode.json`.

### uninstall

- `removeSuperpowersPlugin(projectRoot)`:
  - Remove apenas entradas cujo valor começa com `SUPERPOWERS_PLUGIN` (cobre pin `#vX`, trailing `/`); outros plugins preservados.
  - Caminho estrito: se `plugin` ficar `[]`, remove a chave; se o objeto ficar `{}`, deleta o arquivo.
  - Caminho jsonc: remove a entrada com ajuste de vírgula; se o array ficar vazio, remove a chave; nunca deleta o arquivo.
  - Retorna `{ removed, path }`; `removed: null` se ausente.

### Erros

- Arquivo inválido (nem JSON nem jsonc válido): avisa no stderr e **continua** o install/uninstall (config quebrada do usuário não falha o bento).
- Caminho jsonc com `plugin` em forma não-array (ex.: string): avisa no stderr e pula (não altera o arquivo).

## Constante

```js
export const SUPERPOWERS_PLUGIN = 'superpowers@git+https://github.com/obra/superpowers.git';
```

Matche de presença/remoção por prefixo (`startsWith`).

## Arquitetura

- Novo módulo `lib/opencode-config.mjs` com `addSuperpowersPlugin` e `removeSuperpowersPlugin` (funções puras, padrão de `lib/install.mjs`).
- `bin/bento.mjs`:
  - `install`/`update` chamam `addSuperpowersPlugin` (pulado com `--no-superpowers`).
  - `uninstall` chama `removeSuperpowersPlugin` e reporta a remoção.
- `lib/install.mjs` inalterado.

## Testes

`test/opencode-config.test.mjs` (node:test, diretório temporário, sem rede, sem `gh`):

1. add em projeto sem config → cria `opencode.json` com o plugin.
2. add em config existente → preserva outras chaves.
3. add idempotente → `changed: null` quando já presente.
4. `plugin` como string → vira array.
5. Entrada com pin `#v5.0.3` → conta como presente (add idempotente) e é removida no uninstall.
6. jsonc com comentários → entrada adicionada/removida, comentários preservados.
7. uninstall remove só a entrada superpowers, mantém outros plugins.
8. uninstall com `plugin` vazio → chave removida; arquivo `{}` → deletado.
9. `opencode.json` e `opencode.jsonc` ambos existem → edita o `.json`.
10. Arquivo inválido → aviso sem lançar erro (install continua).
11. jsonc com `plugin` como string → avisa e não altera o arquivo.

## Docs

README: seção Instalação lista superpowers + flag `--no-superpowers`; Desinstalação lista remoção do plugin do opencode.json.