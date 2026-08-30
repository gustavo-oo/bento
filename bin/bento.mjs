#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runCheck, runEquivalence } from '../lib/validate.mjs';
import { install, uninstall } from '../lib/install.mjs';
import { addPonytailPlugin, addSuperpowersPlugin, removePonytailPlugin, removeSuperpowersPlugin } from '../lib/opencode-config.mjs';
import { addMcpServer, removeMcpServer, CODEGRAPH_MCP, AGENT_BROWSER_MCP } from '../lib/mcp-config.mjs';
import { ensureCodegraph, ensureAgentBrowser, initCodegraph, removeCodegraph, removeAgentBrowser } from '../lib/tools.mjs';

const [, , cmd, ...args] = process.argv;

function ensureGhStack() {
  try {
    const list = execFileSync('gh', ['extension', 'list'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (list.includes('gh-stack')) return true;
    execFileSync('gh', ['extension', 'install', 'github/gh-stack'], { stdio: 'inherit' });
    return true;
  } catch (err) {
    return false;
  }
}

function run() {
  const noAgents = args.includes('--no-agents');
  const noSuperpowers = args.includes('--no-superpowers');
  const noPonytail = args.includes('--no-ponytail');
  const noCodegraph = args.includes('--no-codegraph');
  const noAgentBrowser = args.includes('--no-agent-browser');
  switch (cmd) {
    case 'install': {
      if (!ensureGhStack()) {
        console.error('gh-stack indisponível: instale o GitHub CLI (gh) e tente de novo.');
        process.exitCode = 1;
        return;
      }
      const result = install(process.cwd(), { noAgents, noAgentBrowser });
      console.log('bento instalado:');
      console.log(`  skill → ${result.skillDir}`);
      console.log(`  lib   → ${result.dotBento}`);
      if (!noSuperpowers) {
        const sp = addSuperpowersPlugin(process.cwd());
        if (sp) console.log(`  superpowers → ${sp.path}`);
      }
      if (!noPonytail) {
        const pt = addPonytailPlugin(process.cwd());
        if (pt) console.log(`  ponytail → ${pt.path}`);
      }
      if (!noCodegraph) {
        ensureCodegraph();
        const cg = addMcpServer(process.cwd(), CODEGRAPH_MCP.name, CODEGRAPH_MCP.command);
        if (cg) console.log(`  codegraph → ${cg.path}`);
        if (initCodegraph(process.cwd())) console.log('  codegraph init → .codegraph/');
      }
      if (!noAgentBrowser) {
        ensureAgentBrowser();
        const ab = addMcpServer(process.cwd(), AGENT_BROWSER_MCP.name, AGENT_BROWSER_MCP.command);
        if (ab) console.log(`  agent-browser → ${ab.path}`);
      }
      return;
    }
    case 'update': {
      install(process.cwd(), { noAgents, noAgentBrowser });
      if (!noSuperpowers) {
        const sp = addSuperpowersPlugin(process.cwd());
        if (sp) console.log(`  superpowers → ${sp.path}`);
      }
      if (!noPonytail) {
        const pt = addPonytailPlugin(process.cwd());
        if (pt) console.log(`  ponytail → ${pt.path}`);
      }
      if (!noCodegraph) {
        const cg = addMcpServer(process.cwd(), CODEGRAPH_MCP.name, CODEGRAPH_MCP.command);
        if (cg) console.log(`  codegraph → ${cg.path}`);
      }
      if (!noAgentBrowser) {
        const ab = addMcpServer(process.cwd(), AGENT_BROWSER_MCP.name, AGENT_BROWSER_MCP.command);
        if (ab) console.log(`  agent-browser → ${ab.path}`);
      }
      console.log('bento atualizado.');
      return;
    }
    case 'uninstall': {
      try {
        execFileSync('gh', ['extension', 'remove', 'github/gh-stack'], { stdio: 'ignore' });
      } catch (err) {
        const detail = err.stderr?.trim() || err.message;
        console.error(`aviso: gh-stack não pôde ser removido (${detail})`);
      }
      const { removed } = uninstall(process.cwd());
      const sp = removeSuperpowersPlugin(process.cwd());
      const pt = removePonytailPlugin(process.cwd());
      const cg = removeMcpServer(process.cwd(), CODEGRAPH_MCP.name);
      const ab = removeMcpServer(process.cwd(), AGENT_BROWSER_MCP.name);
      const all = [...removed];
      if (sp) all.push(`superpowers (${sp.path})`);
      if (pt) all.push(`ponytail (${pt.path})`);
      if (cg) all.push(`codegraph (${cg.path})`);
      if (ab) all.push(`agent-browser (${ab.path})`);
      const cgIndex = join(process.cwd(), '.codegraph');
      if (existsSync(cgIndex)) {
        rmSync(cgIndex, { recursive: true, force: true });
        all.push('.codegraph');
      }
      removeCodegraph();
      removeAgentBrowser();
      if (all.length === 0) {
        console.log('bento: nada para remover.');
      } else {
        console.log('bento desinstalado:');
        for (const path of all) console.log(`  removido: ${path}`);
      }
      return;
    }
    case 'check':
      process.exitCode = runCheck({ base: args[0] ?? 'main', head: args[1] ?? 'HEAD', cwd: process.cwd() });
      return;
    case 'equivalence':
      process.exitCode = runEquivalence({ base: args[0], head: args[1], layers: args.slice(2), cwd: process.cwd() });
      return;
    default:
      console.error(`uso: bento install|update|uninstall|check|equivalence
  install          instala skill, scripts, config, gh-stack, superpowers, ponytail, codegraph e agent-browser no projeto
                   (--no-agents pula AGENTS.md; --no-superpowers pula superpowers; --no-ponytail pula ponytail;
                    --no-codegraph pula codegraph; --no-agent-browser pula agent-browser)
  update           re-instala mantendo .pr-limits.yaml (não toca gh-stack; não re-instala CLIs nem re-indexa codegraph)
  uninstall        remove tudo do bento (gh-stack, .bento, skill, shim, config, plugins, mcp, .codegraph, CLIs, seção AGENTS.md)
  check [base]     valida tamanho do diff (head = HEAD, base default = main)
  equivalence <base> <head> <camada1> [camada2 ...]
`);
      process.exitCode = 2;
  }
}

run();
