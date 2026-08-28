# Spec — ponytail plugin no bento install

Data: 2026-08-28

## Objetivo

O `bento install` passa a inicializar também o [ponytail](https://github.com/DietrichGebert/ponytail) no projeto consumidor, adicionando o plugin ao `opencode.json`. `update` e `uninstall` passam a gerenciar essa entrada também — mesmo padrão do superpowers.

## Contexto

- O ponytail é um plugin opencode publicado no npm como `@dietrichgebert/ponytail` (README oficial: adicionar ao array `plugin` do `opencode.json`; o plugin injeta o ruleset always-on e os comandos `/ponytail [lite|full|ultra|off]`, `/ponytail-review` etc.).
- O bento já gerencia um plugin no `opencode.json` (superpowers) via `lib/opencode-config.mjs`, com lógica delicada de jsonc (comentários, vírgulas) que passou por vários fixes recentes.
- Zero deps runtime (regra do repo), edição de JSON sem biblioteca.

## Comportamento

### install / update

- Sempre adiciona ponytail, exceto com flag `--no-ponytail` (espelha `--no-superpowers`).
- `addPonytailPlugin(projectRoot)` → delega para `addPlugin(projectRoot, PONYTAIL_PLUGIN)`:
  - Resolução do arquivo: prefere `opencode.json`; se ausente, `opencode.jsonc`; se nenhum existe, cria `opencode.json` com `{ "plugin": ["<PONYTAIL_PLUGIN>"] }`.
  - **Caminho JSON estrito** (`JSON.parse` ok): parse → garante `plugin` como array (string vira `[string]`) → adiciona a entrada se nenhuma entrada existente começar com o prefixo → grava com `JSON.stringify(obj, null, 2) + '\n'`. Outras chaves preservadas.
  - **Caminho jsonc** (parse falha — comentários): se há chave `"plugin": [...]` (array), splice textual da entrada antes do `]`; se a chave não existe, insere `"plugin": ["..."]` como primeira chave; se a chave existe mas não é array (ex.: string), avisa no stderr e pula (não altera). Nunca deleta arquivo jsonc.
  - Retorna `{ changed, path }`; `changed: null` se já presente (idempotente).
- Output do install lista `ponytail → opencode.json`.

### uninstall

- `removePonytailPlugin(projectRoot)` → delega para `removePlugin(projectRoot, PONYTAIL_PLUGIN)`:
  - Remove apenas entradas cujo valor começa com `PONYTAIL_PLUGIN`; outros plugins preservados.
  - Caminho estrito: se `plugin` ficar `[]`, remove a chave; se o objeto ficar `{}`, deleta o arquivo.
  - Caminho jsonc: remove a entrada com ajuste de vírgula; se o array ficar vazio, remove a chave; nunca deleta o arquivo.
  - Retorna `{ removed, path }`; `removed: null` se ausente.

### Erros

- Arquivo inválido (nem JSON nem jsonc válido): avisa no stderr e **continua** o install/uninstall (config quebrada do usuário não falha o bento).
- Caminho jsonc com `plugin` em forma não-array (ex.: string): avisa no stderr e pula (não altera o arquivo).
- Avisos citam o nome legível do plugin (`ponytail pulado`, `superpowers pulado`).

## Constantes

```js
export const SUPERPOWERS_PLUGIN = 'superpowers@git+https://github.com/obra/superpowers.git';
export const PONYTAIL_PLUGIN = '@dietrichgebert/ponytail';
```

Matche de presença/remoção por prefixo (`startsWith`).

## Arquitetura

- `lib/opencode-config.mjs` generalizado:
  - `addPlugin(projectRoot, pluginId)` / `removePlugin(projectRoot, pluginId)` — lógica parametrizada por plugin id (regex de entrada, mensagens de aviso). Nome legível nos avisos: se o id começa com `@` (escopo npm), a parte após o último `/` (`@dietrichgebert/ponytail` → `ponytail`); senão, a parte antes do primeiro `@` (`superpowers@git+…` → `superpowers`).
  - `addSuperpowersPlugin` / `removeSuperpowersPlugin` viram wrappers finos de `addPlugin`/`removePlugin` com `SUPERPOWERS_PLUGIN` (API pública preservada — testes existentes continuam válidos).
  - Novos `addPonytailPlugin` / `removePonytailPlugin` (wrappers com `PONYTAIL_PLUGIN`).
- `bin/bento.mjs`:
  - `install`/`update` chamam `addPonytailPlugin` (pulado com `--no-ponytail`).
  - `uninstall` chama `removePonytailPlugin` e reporta a remoção.
  - Help atualizado com a flag e menção ao ponytail.
- `lib/install.mjs` inalterado.

## Testes

`test/opencode-config.test.mjs` (node:test, diretório temporário, sem rede, sem `gh`):

1. Testes existentes do superpowers preservados (wrappers).
2. add ponytail em projeto sem config → cria `opencode.json` com o plugin.
3. add ponytail em config existente → preserva outras chaves e o plugin superpowers.
4. add ponytail idempotente → `changed: null` quando já presente.
5. jsonc com comentários → entrada ponytail adicionada/removida, comentários preservados.
6. uninstall ponytail remove só a entrada ponytail, mantém superpowers e outros plugins.
7. uninstall ponytail com `plugin` vazio → chave removida; arquivo `{}` → deletado.
8. add ponytail em jsonc com `plugin` como string → avisa e não altera o arquivo.

`test/cli.test.mjs`: `install --no-ponytail` não adiciona ponytail (e `uninstall` não o remove).

## Docs

README: seção Instalação lista ponytail + flag `--no-ponytail`; Desinstalação lista remoção do plugin do opencode.json.