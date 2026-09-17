import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_NAMES = ['flash', 'superpowers', 'explorer', 'verify', 'reviewer', 'browser', 'orchestrator', 'implementer'];

export const AGENT_MARKER = /^#\s*bento:\s*agent\b/m;

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export function isBentoAgent(filePath) {
  try {
    const m = FRONTMATTER.exec(readFileSync(filePath, 'utf8'));
    return m !== null && AGENT_MARKER.test(m[1]);
  } catch {
    return false;
  }
}

export function hasBentoAgent(projectRoot, name) {
  return isBentoAgent(join(projectRoot, '.opencode', 'agents', `${name}.md`));
}

function wantedAgents({ profile = true, superpowers = true, codegraph = true, agentBrowser = true } = {}) {
  const wanted = [];
  if (profile) wanted.push('flash', 'verify', 'reviewer', 'orchestrator', 'implementer');
  if (superpowers) wanted.push('superpowers');
  if (profile && codegraph) wanted.push('explorer');
  if (profile && agentBrowser) wanted.push('browser');
  return wanted;
}

export function installAgents(projectRoot, opts = {}) {
  const created = [];
  const skipped = [];
  for (const name of wantedAgents(opts)) {
    const dir = join(projectRoot, '.opencode', 'agents');
    const dest = join(dir, `${name}.md`);
    if (existsSync(dest)) {
      if (!isBentoAgent(dest)) {
        console.error(`aviso: ${name}.md já existe e não é do bento; pulado.`);
        skipped.push(name);
      }
      continue;
    }
    mkdirSync(dir, { recursive: true });
    cpSync(join(PKG_ROOT, 'templates', 'agents', `${name}.md`), dest);
    created.push(name);
  }
  return { created, skipped };
}

export function removeAgents(projectRoot, names = AGENT_NAMES) {
  const removed = [];
  for (const name of names) {
    const dest = join(projectRoot, '.opencode', 'agents', `${name}.md`);
    if (existsSync(dest) && isBentoAgent(dest)) {
      rmSync(dest, { force: true });
      removed.push(`.opencode/agents/${name}.md`);
    }
  }
  return { removed };
}
