# Spec — taste-skill no bento install/uninstall

Data: 2026-08-30

## Objetivo

O `bento install` passa a instalar também o [taste-skill](https://github.com/Leonxlnx/taste-skill) (skill `design-taste-frontend`, anti-slop para frontend) no projeto consumidor, vendada estaticamente no repo — mesmo padrão do small-prs. `update` re-copia a skill; `uninstall` a remove.

## Contexto

- taste-skill é um repo MIT com 13 skills; a principal fica em `skills/taste-skill/SKILL.md` (install name `design-taste-frontend`), 1206 linhas, autossuficiente (zero assets externos — referências a `*.md` são nomes de padrões citados no texto).
- Venda congelada: cópia do commit `ccbc15639c97057cbfcf32ecebc38ef716e4bb37` (24/08/2026). Atualização é manual: re-copiar o arquivo do upstream e registrar novo commit no AGENTS.md.
- O opencode identifica a skill pelo `name` do frontmatter (`design-taste-frontend`); a pasta em `.opencode/skills/` é livre — usamos `taste-skill` (nome do upstream).
- Regras do repo: zero deps runtime, testes sem rede e sem `gh`.

## Comportamento

### Venda (repo)

- `skills/taste-skill/SKILL.md` — cópia integral e intacta do upstream.
- AGENTS.md (do repo bento): registrar a origem da venda (URL, commit, data) na seção Arquitetura, para rastreabilidade da atualização manual.

### install

- Copiar `skills/taste-skill` → `.opencode/skills/taste-skill/` (padrão do small-prs em `lib/install.mjs`).
- O loop existente que copia `skills/` para `.bento/skills/` já cobre a pasta nova — nada a mudar.
- Sem flag nova: instala sempre, como small-prs.

### update

- Re-copia a skill (idempotente, sobrescreve) — nenhum código extra além do install.

### uninstall

- Remover `.opencode/skills/taste-skill/` (padrão do small-prs), incluindo na lista `removed`.

## Arquitetura

- `skills/taste-skill/SKILL.md` vendado.
- `lib/install.mjs`: no install, um `cpSync` extra para `.opencode/skills/taste-skill/`; no uninstall, um `rmSync` extra com `removed.push`.
- `bin/bento.mjs` inalterado (nenhuma flag nova).

## Testes

`test/install.test.mjs` (node:test, diretório temporário, sem rede):

1. install copia `skills/taste-skill` → `.opencode/skills/taste-skill/` com conteúdo idêntico ao vendado.
2. uninstall remove `.opencode/skills/taste-skill/` e reporta em `removed`.

## Docs

README: Instalação lista taste-skill; Desinstalação lista sua remoção.